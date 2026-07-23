import { spawnSync } from 'node:child_process';

const npmCli = process.env.npm_execpath;
const tasks = ['lint', 'format:check', 'typecheck', 'test', 'build'];

if (!npmCli) {
  console.error('Run this verifier through `npm run verify` so the locked npm CLI is available.');
  process.exit(1);
}

for (const task of tasks) {
  const result = spawnSync(process.execPath, [npmCli, 'run', task], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`Unable to start npm run ${task}:`, result.error);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
