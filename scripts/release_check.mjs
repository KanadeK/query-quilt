import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import packageManifest from '../package.json' with { type: 'json' };

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedVersion = packageManifest.version;
const requiredSubjects = [
  'chore: initialize repository and quality gates',
  'feat: implement domain core',
  'feat: add adapters and sample data',
  'feat: deliver usable interface',
  'test: add integration and end-to-end coverage',
  'docs: complete bilingual documentation and demos',
  'ci: add build test package and release workflows',
  'release: prepare v0.1.0',
];

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  }).trim();
}

function assertCleanTree(stage) {
  const status = git(['status', '--porcelain=v1', '--untracked-files=all']);
  if (status) {
    throw new Error(`${stage}: the Git worktree is not clean:\n${status}`);
  }
}

function runNpm(argumentsList) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error('Run this gate through `npm run release-check`.');
  }
  const result = spawnSync(process.execPath, [npmCli, ...argumentsList], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`npm ${argumentsList.join(' ')} exited with ${result.status ?? 'no status'}.`);
  }
}

function parseExpectedIdentity() {
  const match = /^(.*?)\s+<([^<>]+)>$/.exec(packageManifest.author);
  if (!match) {
    throw new Error('package.json author must be in `Name <email>` form.');
  }
  return `${match[1]} <${match[2]}>`;
}

async function assertVersionConsistency() {
  const lock = JSON.parse(await readFile(path.join(repositoryRoot, 'package-lock.json'), 'utf8'));
  const versionSource = await readFile(path.join(repositoryRoot, 'src', 'version.ts'), 'utf8');
  const readme = await readFile(path.join(repositoryRoot, 'README.md'), 'utf8');
  const chineseReadme = await readFile(path.join(repositoryRoot, 'README.zh-CN.md'), 'utf8');
  const changelog = await readFile(path.join(repositoryRoot, 'CHANGELOG.md'), 'utf8');

  const versions = {
    'package.json': packageManifest.version,
    'package-lock.json': lock.version,
    'package-lock root package': lock.packages?.['']?.version,
    'src/version.ts': /version:\s*'([^']+)'/.exec(versionSource)?.[1],
  };
  for (const [location, version] of Object.entries(versions)) {
    if (version !== expectedVersion) {
      throw new Error(`${location} says ${String(version)}; expected ${expectedVersion}.`);
    }
  }
  if (!readme.includes(`Current release: **v${expectedVersion}**`)) {
    throw new Error('README.md does not declare the current release.');
  }
  if (!chineseReadme.includes(`当前版本：**v${expectedVersion}**`)) {
    throw new Error('README.zh-CN.md does not declare the current release.');
  }
  const escapedVersion = expectedVersion.replaceAll('.', '\\.');
  const releaseHeading = new RegExp(`^## \\[v${escapedVersion}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm');
  if (!releaseHeading.test(changelog) || /^## Unreleased$/m.test(changelog)) {
    throw new Error(
      `CHANGELOG.md must have a dated v${expectedVersion} section and no Unreleased section.`,
    );
  }
}

function assertCommitIdentityAndMilestones() {
  const expectedIdentity = parseExpectedIdentity();
  const identities = git(['log', '--format=%an <%ae>%x00%cn <%ce>'])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split('\0'));
  if (identities.length === 0) {
    throw new Error('No commits are available for author verification.');
  }
  for (const [author, committer] of identities) {
    if (author !== expectedIdentity || committer !== expectedIdentity) {
      throw new Error(
        `Unexpected commit identity: author=${author}, committer=${committer}, expected=${expectedIdentity}.`,
      );
    }
  }

  const messages = git(['log', '--format=%B%x00']);
  if (/co-authored-by\s*:/i.test(messages)) {
    throw new Error('A commit contains a prohibited co-author trailer.');
  }

  const subjects = git(['log', '--reverse', '--format=%s']).split(/\r?\n/).filter(Boolean);
  let cursor = 0;
  for (const subject of subjects) {
    if (subject === requiredSubjects[cursor]) {
      cursor += 1;
    }
  }
  if (cursor !== requiredSubjects.length) {
    throw new Error(
      `The required milestone commit sequence is incomplete at ${requiredSubjects[cursor]}.`,
    );
  }
}

async function assertCoverage() {
  const summary = JSON.parse(
    await readFile(path.join(repositoryRoot, 'coverage', 'coverage-summary.json'), 'utf8'),
  );
  const lineCoverage = summary.total?.lines?.pct;
  if (typeof lineCoverage !== 'number' || lineCoverage < 80) {
    throw new Error(`Core line coverage is ${String(lineCoverage)}%; expected at least 80%.`);
  }
  return lineCoverage;
}

async function fileHash(filePath) {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

async function assertReleaseArtifacts() {
  const releaseRoot = path.join(repositoryRoot, 'dist-release');
  const archiveNames = [
    `${packageManifest.name}-v${expectedVersion}-static.zip`,
    `${packageManifest.name}-v${expectedVersion}-workflows.zip`,
  ];
  const checksumPath = path.join(releaseRoot, 'SHA256SUMS.txt');
  await stat(checksumPath);
  const expectedLines = [];
  for (const archiveName of archiveNames) {
    const archivePath = path.join(releaseRoot, archiveName);
    const file = await stat(archivePath);
    if (file.size === 0) {
      throw new Error(`${archiveName} is empty.`);
    }
    expectedLines.push(`${await fileHash(archivePath)}  ${archiveName}`);
  }
  const actual = await readFile(checksumPath, 'utf8');
  if (actual !== `${expectedLines.join('\n')}\n`) {
    throw new Error('Release asset checksums do not match SHA256SUMS.txt.');
  }
  return expectedLines;
}

async function main() {
  console.log(`Running the Query Quilt v${expectedVersion} release gate...`);
  assertCleanTree('Before release checks');
  await assertVersionConsistency();
  assertCommitIdentityAndMilestones();

  runNpm(['audit', '--audit-level=high']);
  runNpm(['run', 'security:scan']);
  runNpm(['run', 'verify']);
  const lineCoverage = await assertCoverage();
  runNpm(['run', 'package']);
  const checksums = await assertReleaseArtifacts();

  assertCleanTree('After release checks');
  console.log(`Release gate passed with ${lineCoverage}% core line coverage.`);
  for (const checksum of checksums) {
    console.log(`  ${checksum}`);
  }
}

await main();
