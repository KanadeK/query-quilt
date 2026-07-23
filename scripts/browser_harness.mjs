import { chromium } from '@playwright/test';
import { startDistributionServer, stopDistributionServer } from './serve_dist.mjs';

export async function openWorkbenchSession({
  port,
  viewport = { width: 1440, height: 960 },
  serviceWorkers = 'block',
}) {
  const server = await startDistributionServer(port);
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      colorScheme: 'light',
      deviceScaleFactor: 1,
      serviceWorkers,
      viewport,
    });
    const page = await context.newPage();
    const errors = [];
    const externalRequests = [];

    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      const requestUrl = new globalThis.URL(request.url());
      if (requestUrl.hostname !== '127.0.0.1' && requestUrl.hostname !== 'localhost') {
        externalRequests.push(request.url());
      }
    });

    return {
      browser,
      browserVersion: browser.version(),
      errors,
      externalRequests,
      origin: `http://127.0.0.1:${port}`,
      page,
      server,
    };
  } catch (error) {
    await browser?.close();
    await stopDistributionServer(server);
    throw error;
  }
}

export async function closeWorkbenchSession(session) {
  await session.browser.close();
  await stopDistributionServer(session.server);
}

export async function waitForWorkbench(page, origin) {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      globalThis.document
        .querySelector('[data-testid="runtime-status"]')
        ?.textContent?.includes('DuckDB local'),
    undefined,
    { timeout: 45_000 },
  );
  await page.waitForFunction(
    () =>
      globalThis.document
        .querySelector('[data-testid="result-hash"]')
        ?.getAttribute('data-result-hash')?.length === 64,
    undefined,
    { timeout: 45_000 },
  );
}

export async function selectSampleWorkflow(page, workflowId) {
  const hash = page.locator('[data-testid="result-hash"]');
  const previousHash = await hash.getAttribute('data-result-hash');
  await page.getByLabel('Sample workflow').selectOption(workflowId);
  await page.waitForFunction(
    (previous) => {
      const candidate = globalThis.document
        .querySelector('[data-testid="result-hash"]')
        ?.getAttribute('data-result-hash');
      return Boolean(candidate && candidate.length === 64 && candidate !== previous);
    },
    previousHash,
    { timeout: 45_000 },
  );
  await page.getByRole('button', { name: 'Run workflow' }).waitFor({ state: 'visible' });
}

export async function extractVisibleResult(page) {
  const headers = await page.locator('[data-testid="result-table"] thead th').evaluateAll((cells) =>
    cells.map((cell) => ({
      name: cell.querySelector('span')?.textContent?.trim() ?? '',
      type: cell.querySelector('small')?.textContent?.trim() ?? '',
    })),
  );
  const rows = await page
    .locator('[data-testid="result-table"] tbody tr')
    .evaluateAll((tableRows) =>
      tableRows.map((row) =>
        Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? ''),
      ),
    );
  const resultHash =
    (await page.locator('[data-testid="result-hash"]').getAttribute('data-result-hash')) ?? '';

  return {
    columns: headers,
    resultHash,
    rows: rows.map((values) =>
      Object.fromEntries(headers.map((header, index) => [header.name, values[index] ?? ''])),
    ),
  };
}

export function assertCleanBrowserSession(session) {
  if (session.errors.length > 0) {
    throw new Error(`Browser page errors:\n${session.errors.join('\n')}`);
  }
  if (session.externalRequests.length > 0) {
    throw new Error(`Unexpected external requests:\n${session.externalRequests.join('\n')}`);
  }
}
