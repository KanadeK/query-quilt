import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertCleanBrowserSession,
  closeWorkbenchSession,
  openWorkbenchSession,
  selectSampleWorkflow,
  waitForWorkbench,
} from './browser_harness.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(repositoryRoot, 'docs', 'assets');
const outputPath = path.join(outputDirectory, 'query-quilt-workbench.png');
const session = await openWorkbenchSession({
  port: 4182,
  viewport: { width: 1600, height: 1000 },
});

try {
  await waitForWorkbench(session.page, session.origin);
  await selectSampleWorkflow(session.page, 'customer-segment-value');
  await session.page.getByRole('button', { name: 'Chart' }).click();
  await session.page.locator('.chart-canvas canvas').waitFor({
    state: 'visible',
    timeout: 15_000,
  });
  await mkdir(outputDirectory, { recursive: true });
  await session.page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: outputPath,
  });
  assertCleanBrowserSession(session);
  const file = await stat(outputPath);
  console.log(`Captured ${path.relative(repositoryRoot, outputPath)} (${file.size} bytes).`);
} finally {
  await closeWorkbenchSession(session);
}
