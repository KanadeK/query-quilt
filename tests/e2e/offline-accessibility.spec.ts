import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectDifferentHash, observeBrowser, openWorkbench, resultHash } from './helpers';

test.describe('online browser checks', () => {
  test.use({ serviceWorkers: 'block' });

  test('persists a modified workflow in IndexedDB and restores it after reload', async ({
    page,
  }) => {
    const probe = observeBrowser(page);
    await openWorkbench(page);

    await page.getByRole('button', { name: 'Add step' }).click();
    await expect(page.getByTestId('step-count')).toHaveText('5 steps');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('status-message')).toContainText('saved in this browser');

    await page.reload();
    await openWorkbench(page);
    const saved = page.getByRole('combobox', { name: 'Saved in browser' });
    await expect(saved.locator('option[value="regional-category-sales"]')).toHaveText(
      'Northern revenue by category',
    );
    await saved.selectOption('regional-category-sales');
    await expect(page.getByTestId('step-count')).toHaveText('5 steps');
    expect(probe.pageErrors).toEqual([]);
  });

  test('has no serious accessibility violations and fits a phone viewport', async ({ page }) => {
    const probe = observeBrowser(page);
    await openWorkbench(page);

    const accessibility = await new AxeBuilder({ page }).analyze();
    const blocking = accessibility.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );
    expect(blocking).toEqual([]);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: 'Run workflow' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Local datasets' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

    await page.keyboard.press('Tab');
    const focusVisible = await page.evaluate(
      () => document.activeElement !== null && document.activeElement !== document.body,
    );
    expect(focusVisible).toBe(true);
    expect(probe.pageErrors).toEqual([]);
  });
});

test('reloads and runs all bundled samples with the network disabled', async ({
  context,
  page,
}) => {
  const probe = observeBrowser(page);
  await openWorkbench(page);

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload();
    await openWorkbench(page);
  }
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('runtime-status')).toContainText('DuckDB local', {
      timeout: 30_000,
    });
    const hash = page.getByTestId('result-hash');
    let previousHash = await resultHash(hash);
    const samples = [
      'customer-segment-value',
      'inventory-reorder',
      'product-performance',
      'high-value-orders',
    ];
    const sampleSelect = page.getByRole('combobox', { name: 'Sample workflow' });
    for (const sample of samples) {
      await sampleSelect.selectOption(sample);
      previousHash = await expectDifferentHash(hash, previousHash);
    }
  } finally {
    await context.setOffline(false);
  }

  expect(probe.pageErrors).toEqual([]);
  expect(probe.externalRequests).toEqual([]);
});
