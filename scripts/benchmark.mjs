import { cpus, freemem, platform, release, totalmem } from 'node:os';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  assertCleanBrowserSession,
  closeWorkbenchSession,
  openWorkbenchSession,
  selectSampleWorkflow,
  waitForWorkbench,
} from './browser_harness.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(repositoryRoot, 'artifacts');
const outputPath = path.join(outputDirectory, 'benchmark.json');
const workflowIds = [
  'customer-segment-value',
  'inventory-reorder',
  'product-performance',
  'high-value-orders',
  'regional-category-sales',
];
const repetitions = 5;

function round(value) {
  return Math.round(value * 10) / 10;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

async function datasetMetadata(fileName) {
  const filePath = path.join(repositoryRoot, 'examples', 'data', fileName);
  const text = await readFile(filePath, 'utf8');
  const file = await stat(filePath);
  return {
    file: fileName,
    rows: Math.max(0, text.trim().split(/\r?\n/).length - 1),
    bytes: file.size,
  };
}

const session = await openWorkbenchSession({ port: 4184 });

try {
  const coldStartedAt = performance.now();
  await waitForWorkbench(session.page, session.origin);
  const coldStartMs = performance.now() - coldStartedAt;
  const observations = new Map(workflowIds.map((id) => [id, []]));
  const finalState = new Map();

  for (let roundIndex = 0; roundIndex < repetitions; roundIndex += 1) {
    for (const workflowId of workflowIds) {
      const startedAt = performance.now();
      await selectSampleWorkflow(session.page, workflowId);
      observations.get(workflowId).push(performance.now() - startedAt);
      finalState.set(workflowId, {
        outputRows: Number(
          await session.page.locator('[data-testid="result-metrics"] strong').first().textContent(),
        ),
        resultHash:
          (await session.page
            .locator('[data-testid="result-hash"]')
            .getAttribute('data-result-hash')) ?? '',
      });
    }
  }

  assertCleanBrowserSession(session);
  const cpuList = cpus();
  const benchmark = {
    measuredAt: new Date().toISOString(),
    runtime: {
      os: `${platform()} ${release()}`,
      architecture: process.arch,
      cpu: cpuList[0]?.model.trim() ?? 'unknown',
      logicalCores: cpuList.length,
      totalMemoryGiB: round(totalmem() / 1024 ** 3),
      freeMemoryGiBAtMeasurement: round(freemem() / 1024 ** 3),
      node: process.version,
      chromium: session.browserVersion,
      mode: 'headless Chromium, production Vite build, DuckDB-WASM MVP bundle',
    },
    datasets: await Promise.all(
      ['sales.csv', 'inventory.csv', 'customers.csv'].map(datasetMetadata),
    ),
    methodology: {
      repetitions,
      coldStartDefinition:
        'navigation start until DuckDB is ready and the first result hash exists',
      workflowDefinition:
        'sample selection until a new 64-character result hash is committed to the UI',
      network: 'localhost only; service workers blocked for repeatability',
    },
    coldStartMs: round(coldStartMs),
    workflows: Object.fromEntries(
      workflowIds.map((workflowId) => {
        const values = observations.get(workflowId);
        return [
          workflowId,
          {
            minMs: round(Math.min(...values)),
            medianMs: round(percentile(values, 0.5)),
            p95Ms: round(percentile(values, 0.95)),
            ...finalState.get(workflowId),
          },
        ];
      }),
    ),
  };

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(benchmark, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(benchmark, null, 2));
  console.log(`\nWrote ${path.relative(repositoryRoot, outputPath)}.`);
} finally {
  await closeWorkbenchSession(session);
}
