import { expect, test } from '@playwright/test';
import { expectDifferentHash, observeBrowser, openWorkbench, resultHash } from './helpers';

test.use({ serviceWorkers: 'block' });

test('runs all bundled samples while the chart stays mounted', async ({ page }) => {
  const probe = observeBrowser(page);
  await openWorkbench(page);

  const hash = page.getByTestId('result-hash');
  let previousHash = await resultHash(hash);
  await expect(page.getByTestId('result-metrics')).toContainText('3 rows');

  await page.getByRole('button', { name: 'Chart' }).click();
  await expect(page.locator('.chart-canvas canvas')).toBeVisible();

  const sampleSelect = page.getByRole('combobox', { name: 'Sample workflow' });
  const workflows = [
    {
      id: 'customer-segment-value',
      name: 'Customer segment value',
      steps: 4,
    },
    {
      id: 'inventory-reorder',
      name: 'Inventory reorder queue',
      steps: 4,
    },
    { id: 'product-performance', name: 'Product performance', steps: 3 },
    {
      id: 'high-value-orders',
      name: 'High-value order review',
      steps: 4,
    },
  ] as const;

  for (const workflow of workflows) {
    await sampleSelect.selectOption(workflow.id);
    await expect(page.getByRole('textbox', { name: 'Workflow name' })).toHaveValue(workflow.name);
    await expect(page.getByTestId('step-count')).toHaveText(`${workflow.steps} steps`);
    previousHash = await expectDifferentHash(hash, previousHash);
    await expect(page.locator('.chart-canvas canvas')).toBeVisible();
  }

  expect(probe.pageErrors).toEqual([]);
  expect(probe.externalRequests).toEqual([]);
});

test('undo, redo, and keyboard history restore the exact result hash', async ({ page }) => {
  const probe = observeBrowser(page);
  await openWorkbench(page);

  const hash = page.getByTestId('result-hash');
  const originalHash = await resultHash(hash);
  const filterToggle = page.getByRole('checkbox', {
    name: 'Enable Keep northern orders',
  });
  await filterToggle.uncheck();
  const changedHash = await expectDifferentHash(hash, originalHash);
  await expect(page.getByRole('combobox', { name: 'Sample workflow' })).toHaveValue('');

  await page.getByRole('button', { name: 'Undo workflow change' }).click();
  await expect.poll(() => hash.getAttribute('data-result-hash')).toBe(originalHash);

  await page.getByRole('button', { name: 'Redo workflow change' }).click();
  await expect.poll(() => hash.getAttribute('data-result-hash')).toBe(changedHash);

  await page.getByRole('button', { name: 'Run workflow' }).focus();
  await page.keyboard.press('Control+z');
  await expect.poll(() => hash.getAttribute('data-result-hash')).toBe(originalHash);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => hash.getAttribute('data-result-hash')).toBe(changedHash);

  expect(probe.pageErrors).toEqual([]);
});

test('adds and edits a real derived step', async ({ page }) => {
  const probe = observeBrowser(page);
  await openWorkbench(page);

  const hash = page.getByTestId('result-hash');
  const originalHash = await resultHash(hash);
  await page.getByRole('combobox', { name: 'New step type' }).selectOption('derive');
  await page.getByRole('button', { name: 'Add step' }).click();
  await expect(page.getByTestId('step-count')).toHaveText('5 steps');

  await page.getByRole('textbox', { name: 'New column' }).fill('adjusted_revenue');
  await page.getByRole('textbox', { name: 'SQL expression' }).fill('revenue * 1.1');
  await page.getByRole('button', { name: 'Apply step' }).click();

  await expectDifferentHash(hash, originalHash);
  await expect(page.getByTestId('result-table')).toContainText('adjusted_revenue');
  await expect(page.getByRole('combobox', { name: 'Sample workflow' })).toHaveValue('');
  expect(probe.pageErrors).toEqual([]);
});
