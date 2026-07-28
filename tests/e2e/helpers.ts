import { expect, type Locator, type Page } from '@playwright/test';

export interface BrowserProbe {
  pageErrors: string[];
  externalRequests: string[];
}

export function observeBrowser(page: Page): BrowserProbe {
  const pageErrors: string[] = [];
  const externalRequests: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      externalRequests.push(request.url());
    }
  });

  return { pageErrors, externalRequests };
}

export async function openWorkbench(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('runtime-status')).toContainText('DuckDB local', {
    timeout: 45_000,
  });
  await expect(page.getByTestId('result-hash')).not.toHaveText('pending');
  await expect(page.getByRole('button', { name: 'Run workflow' })).toBeEnabled();
}

export async function resultHash(hash: Locator): Promise<string> {
  await expect(hash).toHaveAttribute('data-result-hash', /^[a-f0-9]{64}$/, {
    timeout: 45_000,
  });
  const value = await hash.getAttribute('data-result-hash');
  expect(value).toMatch(/^[a-f0-9]{64}$/);
  return value ?? '';
}

export async function expectDifferentHash(hash: Locator, previous: string) {
  await expect
    .poll(async () => {
      const candidate = await hash.getAttribute('data-result-hash');
      return candidate !== previous ? candidate : '';
    })
    .toMatch(/^[a-f0-9]{64}$/);
  return resultHash(hash);
}
