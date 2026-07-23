import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { observeBrowser, openWorkbench } from './helpers';

const fixture = (name: string) => path.join(process.cwd(), 'tests', 'fixtures', name);

test.use({ serviceWorkers: 'block' });

test('imports local data and workflow files, then exports four real artifacts', async ({
  page,
}) => {
  const probe = observeBrowser(page);
  await openWorkbench(page);

  const datasetInput = page.locator('input[type="file"][accept*=".csv"][accept*=".parquet"]');
  await datasetInput.setInputFiles(fixture('mini-orders.csv'));
  await expect(page.getByTestId('status-message')).toContainText(
    'available locally as mini_orders',
  );
  await expect(page.getByText('mini_orders', { exact: true })).toBeVisible();

  const workflowInput = page.locator('input[type="file"][accept*=".json"]');
  await workflowInput.setInputFiles(fixture('mini-orders.workflow.json'));
  await expect(page.getByRole('textbox', { name: 'Workflow name' })).toHaveValue('Mini order path');
  await expect(page.getByTestId('result-metrics')).toContainText('3 rows');
  await expect(page.getByTestId('result-table')).toContainText('M-003');
  await expect(page.getByTestId('result-table')).not.toContainText('M-002');

  const exports = page.getByLabel('Export results');

  const sqlDownloadPromise = page.waitForEvent('download');
  await exports.getByRole('button', { name: 'SQL' }).click();
  const sqlDownload = await sqlDownloadPromise;
  expect(sqlDownload.suggestedFilename()).toBe('mini-order-path.sql');
  const sqlPath = await sqlDownload.path();
  expect(sqlPath).not.toBeNull();
  expect(await readFile(sqlPath ?? '', 'utf8')).toContain('FROM "mini_orders"');

  const workflowDownloadPromise = page.waitForEvent('download');
  await exports.getByRole('button', { name: 'Workflow' }).click();
  const workflowDownload = await workflowDownloadPromise;
  expect(workflowDownload.suggestedFilename()).toBe('mini-order-path.workflow.json');
  const downloadedWorkflowPath = await workflowDownload.path();
  const downloadedWorkflow = JSON.parse(await readFile(downloadedWorkflowPath ?? '', 'utf8')) as {
    id: string;
    steps: unknown[];
  };
  expect(downloadedWorkflow.id).toBe('mini-order-path');
  expect(downloadedWorkflow.steps).toHaveLength(4);

  const csvDownloadPromise = page.waitForEvent('download');
  await exports.getByRole('button', { name: 'CSV' }).click();
  const csvDownload = await csvDownloadPromise;
  expect(csvDownload.suggestedFilename()).toBe('mini-order-path.results.csv');
  const csvPath = await csvDownload.path();
  const csv = await readFile(csvPath ?? '', 'utf8');
  expect(csv).toContain('order_id,region,amount,tax');
  expect(csv).toContain('M-003,North,230,23.0');
  expect(csv).not.toContain('M-002');

  const pngDownloadPromise = page.waitForEvent('download');
  await exports.getByRole('button', { name: 'PNG' }).click();
  const pngDownload = await pngDownloadPromise;
  expect(pngDownload.suggestedFilename()).toBe('mini-order-path.chart.png');
  const pngPath = await pngDownload.path();
  const png = await readFile(pngPath ?? '');
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.byteLength).toBeGreaterThan(1_000);

  expect(probe.pageErrors).toEqual([]);
  expect(probe.externalRequests).toEqual([]);
});

test('rejects malformed Parquet and workflow files without losing the last result', async ({
  page,
}) => {
  const probe = observeBrowser(page);
  await openWorkbench(page);
  const originalHash = await page.getByTestId('result-hash').getAttribute('data-result-hash');

  const datasetInput = page.locator('input[type="file"][accept*=".csv"][accept*=".parquet"]');
  await datasetInput.setInputFiles({
    name: 'broken.parquet',
    mimeType: 'application/vnd.apache.parquet',
    buffer: Buffer.from('PAR1broken-content'),
  });
  await expect(page.getByTestId('status-message')).toContainText('valid Parquet header and footer');

  const workflowInput = page.locator('input[type="file"][accept*=".json"]');
  await workflowInput.setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ definitely not JSON'),
  });
  await expect(page.getByTestId('status-message')).toContainText(/JSON|property|token/i);
  await expect(page.getByTestId('result-hash')).toHaveAttribute(
    'data-result-hash',
    originalHash ?? '',
  );
  expect(probe.pageErrors).toEqual([]);
});
