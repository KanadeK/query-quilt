import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRepositoryText, repositoryFiles } from './repository_files.mjs';

const ignoredDependencyMetadata = new Set(['package-lock.json']);
const ignoredRoadmap = new Set(['docs/ROADMAP.md']);
const markers = [
  'TO' + 'DO',
  'FIX' + 'ME',
  'Not' + 'Implemented',
  'place' + 'holder',
  'coming' + ' soon',
  'lorem' + ' ipsum',
];

export async function scanUnfinishedMarkers() {
  const findings = [];
  const files = repositoryFiles();

  for (const fileName of files) {
    if (ignoredDependencyMetadata.has(fileName) || ignoredRoadmap.has(fileName)) {
      continue;
    }
    const text = await readRepositoryText(fileName);
    if (text === null) {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      for (const marker of markers) {
        if (line.toLocaleLowerCase('en-US').includes(marker.toLocaleLowerCase('en-US'))) {
          findings.push({ fileName, line: index + 1, marker });
        }
      }
    }
  }

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.fileName}:${finding.line}: unfinished marker ${finding.marker}`);
    }
    throw new Error(`Unfinished-marker scan found ${findings.length} issue(s).`);
  }

  console.log(`Unfinished-marker scan passed across ${files.length} repository files.`);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) {
  await scanUnfinishedMarkers();
}
