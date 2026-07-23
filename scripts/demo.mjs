import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertCleanBrowserSession,
  closeWorkbenchSession,
  extractVisibleResult,
  openWorkbenchSession,
  waitForWorkbench,
} from './browser_harness.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(repositoryRoot, 'artifacts', 'demo');
const outputPath = path.join(outputDirectory, 'northern-revenue-by-category.json');
console.log('Starting the production Query Quilt demo...');
const session = await openWorkbenchSession({ port: 4183 });

try {
  console.log('Waiting for local DuckDB and the bundled workflow...');
  await waitForWorkbench(session.page, session.origin);
  console.log('Reading the actual result, SQL, and step telemetry...');
  const result = await extractVisibleResult(session.page);
  const workflowName = await session.page.getByLabel('Workflow name').inputValue();
  const equivalentSql =
    (await session.page.locator('.sql-inspector pre code').textContent())?.trim() ?? '';
  const steps = await session.page.locator('.step-card').evaluateAll((cards) =>
    cards.map((card) => ({
      kind: card.querySelector('.step-kind')?.textContent?.trim() ?? '',
      label: card.querySelector('.step-copy strong')?.textContent?.trim() ?? '',
      rows: card.querySelector('.row-flow')?.textContent?.trim() ?? '',
    })),
  );
  const artifact = {
    engine: 'DuckDB-WASM',
    privacy: 'local browser execution; no external requests observed',
    workflow: workflowName,
    steps,
    equivalentSql,
    ...result,
  };

  assertCleanBrowserSession(session);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(artifact, null, 2));
  console.log(`\nWrote ${path.relative(repositoryRoot, outputPath)}.`);
} finally {
  await closeWorkbenchSession(session);
}
