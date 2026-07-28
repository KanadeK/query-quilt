import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { applyFixedArchiveMetadata } from './package_release.mjs';

const expectedPlatform = 0x0314;

function archiveFingerprint() {
  const archive = new AdmZip();
  archive.addFile('fixture.txt', Buffer.from('query-quilt\n', 'utf8'));
  const entry = archive.getEntry('fixture.txt');
  if (!entry) {
    throw new Error('Unable to create the archive determinism fixture.');
  }
  applyFixedArchiveMetadata(entry);
  if (entry.header.made !== expectedPlatform) {
    throw new Error(
      `Archive platform is 0x${entry.header.made.toString(16)}; expected 0x${expectedPlatform.toString(16)}.`,
    );
  }
  return createHash('sha256').update(archive.toBuffer()).digest('hex');
}

if (process.argv[2] === '--fingerprint') {
  process.stdout.write(`${archiveFingerprint()}\n`);
} else {
  const scriptPath = fileURLToPath(import.meta.url);
  const fingerprints = ['UTC', 'Asia/Shanghai'].map((timezone) => {
    const result = spawnSync(process.execPath, [scriptPath, '--fingerprint'], {
      encoding: 'utf8',
      env: { ...process.env, TZ: timezone },
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(
        `Archive fingerprint failed in ${timezone}:\n${result.stderr || result.stdout}`,
      );
    }
    return { timezone, sha256: result.stdout.trim() };
  });

  if (new Set(fingerprints.map(({ sha256 }) => sha256)).size !== 1) {
    throw new Error(
      `Archive metadata changes across timezones:\n${fingerprints
        .map(({ timezone, sha256 }) => `  ${timezone}: ${sha256}`)
        .join('\n')}`,
    );
  }

  console.log(
    `Archive metadata is byte-identical in ${fingerprints.map(({ timezone }) => timezone).join(' and ')}.`,
  );
}
