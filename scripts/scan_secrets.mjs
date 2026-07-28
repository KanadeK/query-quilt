import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRepositoryText, repositoryFiles } from './repository_files.mjs';

const patterns = [
  {
    name: 'private key',
    expression: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  },
  { name: 'GitHub token', expression: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'GitHub fine-grained token', expression: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/ },
  { name: 'AWS access key', expression: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  {
    name: 'credential assignment',
    expression:
      /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["'][^"'\r\n]{12,}["']/i,
  },
  {
    name: 'URL credentials',
    expression: /\bhttps?:\/\/[^/\s:@]+:[^@\s/]+@[^/\s]+/i,
  },
];

function lineNumber(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

export async function scanSecrets() {
  const findings = [];
  const files = repositoryFiles();

  for (const fileName of files) {
    if (path.basename(fileName).toLowerCase().startsWith('.env')) {
      findings.push({ fileName, line: 1, name: 'tracked environment file' });
      continue;
    }
    const text = await readRepositoryText(fileName);
    if (text === null) {
      continue;
    }
    for (const pattern of patterns) {
      const match = pattern.expression.exec(text);
      if (match?.index !== undefined) {
        findings.push({
          fileName,
          line: lineNumber(text, match.index),
          name: pattern.name,
        });
      }
    }
  }

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.fileName}:${finding.line}: possible ${finding.name}`);
    }
    throw new Error(`Secret scan found ${findings.length} possible leak(s).`);
  }

  console.log(`Secret scan passed across ${files.length} repository files.`);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) {
  await scanSecrets();
}
