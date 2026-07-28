import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import AdmZip from 'adm-zip';
import packageManifest from '../package.json' with { type: 'json' };
import { startStaticServer, stopDistributionServer } from './serve_dist.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distributionRoot = path.join(repositoryRoot, 'dist');
const releaseRoot = path.join(repositoryRoot, 'dist-release');
const fixedArchiveTime = new Date('2026-01-01T00:00:00.000Z');
const expectedDemoHash = '221e8503e1a7f022362748ef6d666992c5aa3d9b52e82beb25f83cf7d7460bc2';
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function assertReleaseRoot() {
  if (
    path.dirname(releaseRoot) !== repositoryRoot ||
    path.basename(releaseRoot) !== 'dist-release'
  ) {
    throw new Error(`Refusing to manage unexpected release directory: ${releaseRoot}`);
  }
}

async function collectFiles(root, relativeDirectory = '') {
  const directory = path.join(root, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

function archivePath(value) {
  return value.split(path.sep).join('/');
}

function assertSafeEntry(entryName) {
  const normalized = entryName.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    segments.includes('..') ||
    segments.includes('.')
  ) {
    throw new Error(`Unsafe archive entry: ${entryName}`);
  }
}

function assertAllowedReleaseEntry(entryName) {
  const normalized = entryName.toLowerCase().replaceAll('\\', '/');
  const segments = normalized.split('/');
  const extension = path.posix.extname(normalized);
  if (
    segments.some((segment) => segment === '.git' || segment === 'node_modules') ||
    segments.some((segment) => segment === '.env' || segment.startsWith('.env.')) ||
    ['.db', '.duckdb', '.log', '.map'].includes(extension)
  ) {
    throw new Error(`Forbidden release entry: ${entryName}`);
  }
}

async function addFile(zip, sourcePath, entryName) {
  assertSafeEntry(entryName);
  assertAllowedReleaseEntry(entryName);
  zip.addFile(entryName, await readFile(sourcePath));
  const entry = zip.getEntry(entryName);
  if (!entry) {
    throw new Error(`Unable to add ${entryName} to the archive.`);
  }
  entry.header.time = fixedArchiveTime;
}

async function writeStaticArchive(outputPath) {
  const indexPath = path.join(distributionRoot, 'index.html');
  await stat(indexPath);
  const zip = new AdmZip();
  const files = (await collectFiles(distributionRoot)).filter(
    (fileName) => path.extname(fileName).toLowerCase() !== '.map',
  );

  for (const fileName of files) {
    await addFile(zip, path.join(distributionRoot, fileName), archivePath(fileName));
  }
  await addFile(zip, path.join(repositoryRoot, 'LICENSE'), 'LICENSE');
  await addFile(zip, path.join(repositoryRoot, 'README.md'), 'README.md');
  zip.writeZip(outputPath);
}

async function writeWorkflowArchive(outputPath) {
  const zip = new AdmZip();
  const examplesRoot = path.join(repositoryRoot, 'examples');
  for (const fileName of await collectFiles(examplesRoot)) {
    await addFile(
      zip,
      path.join(examplesRoot, fileName),
      archivePath(path.join('examples', fileName)),
    );
  }
  await addFile(zip, path.join(repositoryRoot, 'LICENSE'), 'LICENSE');
  zip.writeZip(outputPath);
}

function inspectArchive(archivePathValue) {
  const zip = new AdmZip(archivePathValue);
  const entries = zip.getEntries();
  if (entries.length === 0) {
    throw new Error(`${path.basename(archivePathValue)} is empty.`);
  }
  for (const entry of entries) {
    assertSafeEntry(entry.entryName);
    assertAllowedReleaseEntry(entry.entryName);
  }
  return zip;
}

async function smokeStaticArchive(extractedRoot) {
  const requiredFiles = ['index.html', 'manifest.webmanifest', 'sw.js'];
  for (const fileName of requiredFiles) {
    await stat(path.join(extractedRoot, fileName));
  }
  const files = await collectFiles(extractedRoot);
  if (!files.some((fileName) => fileName.endsWith('.wasm'))) {
    throw new Error('The static archive is missing the DuckDB WASM module.');
  }
  if (!files.some((fileName) => fileName.includes('duckdb-browser-mvp.worker-'))) {
    throw new Error('The static archive is missing the DuckDB browser worker.');
  }

  const server = await startStaticServer(extractedRoot, 0);
  const address = server.address();
  if (!address || typeof address === 'string') {
    await stopDistributionServer(server);
    throw new Error('Unable to determine the package smoke-test port.');
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    const externalRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      const url = new globalThis.URL(request.url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
        externalRequests.push(request.url());
      }
    });

    await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () =>
        globalThis.document
          .querySelector('[data-testid="runtime-status"]')
          ?.textContent?.includes('DuckDB local'),
      undefined,
      { timeout: 45_000 },
    );
    await page.waitForFunction(
      (expectedHash) =>
        globalThis.document
          .querySelector('[data-testid="result-hash"]')
          ?.getAttribute('data-result-hash') === expectedHash,
      expectedDemoHash,
      { timeout: 45_000 },
    );

    if (errors.length > 0) {
      throw new Error(`Packaged application page errors:\n${errors.join('\n')}`);
    }
    if (externalRequests.length > 0) {
      throw new Error(
        `Packaged application made external requests:\n${externalRequests.join('\n')}`,
      );
    }
  } finally {
    await browser.close();
    await stopDistributionServer(server);
  }
}

async function smokeWorkflowArchive(extractedRoot) {
  const workflowsRoot = path.join(extractedRoot, 'examples', 'workflows');
  const dataRoot = path.join(extractedRoot, 'examples', 'data');
  const workflowFiles = (await collectFiles(workflowsRoot)).filter((fileName) =>
    fileName.endsWith('.json'),
  );
  const dataFiles = (await collectFiles(dataRoot)).filter((fileName) => fileName.endsWith('.csv'));
  if (workflowFiles.length !== 5 || dataFiles.length !== 3) {
    throw new Error(
      `Workflow archive expected 5 workflows and 3 tables; found ${workflowFiles.length} and ${dataFiles.length}.`,
    );
  }

  const identifiers = new Set();
  for (const fileName of workflowFiles) {
    const workflow = JSON.parse(await readFile(path.join(workflowsRoot, fileName), 'utf8'));
    if (
      typeof workflow.id !== 'string' ||
      typeof workflow.sourceTable !== 'string' ||
      !Array.isArray(workflow.steps) ||
      workflow.steps.length === 0 ||
      identifiers.has(workflow.id)
    ) {
      throw new Error(`Invalid packaged workflow: ${fileName}`);
    }
    identifiers.add(workflow.id);
  }
  await stat(path.join(extractedRoot, 'examples', 'README.md'));
  await stat(path.join(extractedRoot, 'LICENSE'));
}

async function sha256(filePath) {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

async function verifyChecksums(checksumPath, archivePaths) {
  const expectedLines = await Promise.all(
    archivePaths.map(async (filePath) => `${await sha256(filePath)}  ${path.basename(filePath)}`),
  );
  const actual = await readFile(checksumPath, 'utf8');
  if (actual !== `${expectedLines.join('\n')}\n`) {
    throw new Error('SHA256SUMS.txt does not match the generated archives.');
  }
  return expectedLines;
}

export async function packageRelease() {
  if (!versionPattern.test(packageManifest.version)) {
    throw new Error(`Invalid release version: ${packageManifest.version}`);
  }
  assertReleaseRoot();
  await rm(releaseRoot, { force: true, recursive: true });
  await mkdir(releaseRoot, { recursive: true });

  const staticArchive = path.join(
    releaseRoot,
    `${packageManifest.name}-v${packageManifest.version}-static.zip`,
  );
  const workflowArchive = path.join(
    releaseRoot,
    `${packageManifest.name}-v${packageManifest.version}-workflows.zip`,
  );
  const checksumPath = path.join(releaseRoot, 'SHA256SUMS.txt');

  await writeStaticArchive(staticArchive);
  await writeWorkflowArchive(workflowArchive);
  const staticZip = inspectArchive(staticArchive);
  const workflowZip = inspectArchive(workflowArchive);

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'query-quilt-package-'));
  const resolvedTemporaryBase = path.resolve(tmpdir());
  const resolvedTemporaryRoot = path.resolve(temporaryRoot);
  if (
    path.dirname(resolvedTemporaryRoot) !== resolvedTemporaryBase ||
    !path.basename(resolvedTemporaryRoot).startsWith('query-quilt-package-')
  ) {
    throw new Error(`Refusing to use unexpected temporary directory: ${temporaryRoot}`);
  }

  try {
    const staticExtracted = path.join(temporaryRoot, 'static');
    const workflowExtracted = path.join(temporaryRoot, 'workflows');
    await mkdir(staticExtracted);
    await mkdir(workflowExtracted);
    staticZip.extractAllTo(staticExtracted, true);
    workflowZip.extractAllTo(workflowExtracted, true);
    await smokeStaticArchive(staticExtracted);
    await smokeWorkflowArchive(workflowExtracted);
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }

  const archivePaths = [staticArchive, workflowArchive];
  const checksumLines = await Promise.all(
    archivePaths.map(async (filePath) => `${await sha256(filePath)}  ${path.basename(filePath)}`),
  );
  await writeFile(checksumPath, `${checksumLines.join('\n')}\n`, 'utf8');
  await verifyChecksums(checksumPath, archivePaths);

  console.log(`Packaged and smoke-tested Query Quilt v${packageManifest.version}:`);
  for (const line of checksumLines) {
    console.log(`  ${line}`);
  }
  console.log(`  ${path.relative(repositoryRoot, checksumPath)}`);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) {
  await packageRelease();
}
