import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { startStaticServer, stopDistributionServer } from './serve_dist.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distributionRoot = path.join(repositoryRoot, 'dist');
const expectedDemoHash = '221e8503e1a7f022362748ef6d666992c5aa3d9b52e82beb25f83cf7d7460bc2';
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'query-quilt-pages-'));
const resolvedTemporaryBase = path.resolve(tmpdir());
const resolvedTemporaryRoot = path.resolve(temporaryRoot);

if (
  path.dirname(resolvedTemporaryRoot) !== resolvedTemporaryBase ||
  !path.basename(resolvedTemporaryRoot).startsWith('query-quilt-pages-')
) {
  throw new Error(`Refusing to use unexpected temporary directory: ${temporaryRoot}`);
}

let server;
let browser;
try {
  const mountedRoot = path.join(temporaryRoot, 'query-quilt');
  await mkdir(mountedRoot);
  await cp(distributionRoot, mountedRoot, { recursive: true });
  server = await startStaticServer(temporaryRoot, 0, 'query-quilt/index.html');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine the Pages smoke-test port.');
  }

  browser = await chromium.launch({ headless: true });
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

  await page.goto(`http://127.0.0.1:${address.port}/query-quilt/`, {
    waitUntil: 'domcontentloaded',
  });
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
    throw new Error(`Pages build page errors:\n${errors.join('\n')}`);
  }
  if (externalRequests.length > 0) {
    throw new Error(`Pages build made external requests:\n${externalRequests.join('\n')}`);
  }
  console.log('Pages subpath smoke test passed with the expected DuckDB result hash.');
} finally {
  await browser?.close();
  if (server) {
    await stopDistributionServer(server);
  }
  await rm(temporaryRoot, { force: true, recursive: true });
}
