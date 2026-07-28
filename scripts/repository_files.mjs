import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const binaryExtensions = new Set([
  '.7z',
  '.avif',
  '.gif',
  '.gz',
  '.ico',
  '.jpeg',
  '.jpg',
  '.parquet',
  '.pdf',
  '.png',
  '.tar',
  '.wasm',
  '.webp',
  '.zip',
]);

export function repositoryFiles() {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  return output.toString('utf8').split('\0').filter(Boolean).sort();
}

export async function readRepositoryText(fileName) {
  if (binaryExtensions.has(path.extname(fileName).toLowerCase())) {
    return null;
  }
  const buffer = await readFile(fileName);
  if (buffer.subarray(0, 8_192).includes(0)) {
    return null;
  }
  return buffer.toString('utf8');
}
