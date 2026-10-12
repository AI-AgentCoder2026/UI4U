import { expect, test } from '@playwright/test';

/**
 * Smoke tests for the demo index.
 *
 * The catalogue is a `ui-tablegrid` with a `ui-toolbar` above it — the index
 * demonstrates the library rather than sitting outside it. These assert the
 * pieces a reader actually uses: every demo reachable, sorted, filtered, paged.
 */

const CATALOGUE = '#catalogue';
const GRID = `${CATALOGUE} tbody tr:not([hidden])`;

const DEMOS = [
  'ui-tabs',
  'ui-disclosure',
  'ui-button',
  'ui-tooltip',
  'ui-layout',
  'ui-popup',
  'ui-input',
  'ui-tablegrid',
  'ui-form',
  'ui-sidebar',
  'ui-checkbox',
  'ui-radio',
  'ui-dropdown',
  'ui-toolbar',
  'ui-button-group',
];

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/index.html');
  await page.waitForSelector(`${CATALOGUE} tbody tr`);
});

test('every demo card link points at a page that responds', async ({ page }) => {
  const broken = await page.locator('.demo-card').evaluateAll(async (links) => {
    /** @type {Array<{ href: string, status: number }>} */
    const results = [];

    for (const link of links) {
      const href = link.getAttribute('href') ?? '';
      // The ends of the list are inert placeholders, not links.
      if (!href || href === '#') continue;
      // The repository link leaves the site; fetch() cannot follow it cross-origin.
      if (href.startsWith('http')) continue;

      const response = await fetch(new URL(href, location.href));
      results.push({ href, status: response.status });
    }

    return results.filter((r) => r.status !== 200);
  });

  expect(broken).toEqual([]);
});

test('the catalogue is built from UI4U components', async ({ page }) => {
  // The point of the exercise: the demo site is a demonstration of the library.
  await expect(page.locator(CATALOGUE)).toHaveJSProperty('localName', 'ui-tablegrid');
  await expect(page.locator(`${CATALOGUE} > ui-toolbar`)).toHaveCount(1);
  await expect(page.locator(`${CATALOGUE} ui-input`)).toHaveCount(1);
  await expect(page.locator(`${CATALOGUE} ui-dropdown`)).toHaveCount(1);

  const themeToggle = page.locator('ui-button[data-theme-toggle]');
  await expect(themeToggle).toHaveCount(1);
  await expect(themeToggle).toBeVisible();
});

test('lists every component, with a named link in each row', async ({ page }) => {
  const names = await page
    .locator(`${CATALOGUE} tbody td:first-child`)
    .evaluateAll((cells) => cells.map((c) => c.textContent.trim()));

  expect(names).toHaveLength(DEMOS.length);
  expect([...names].sort()).toEqual([...DEMOS].sort());

  const links = await page
    .locator(`${CATALOGUE} ui-button[href]`)
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href') ?? ''));

  expect(links).toHaveLength(DEMOS.length);
  expect(links.every((href) => href.endsWith('.html'))).toBe(true);
});

test('a demo link actually navigates', async ({ page }) => {
  await page.locator(`${CATALOGUE} ui-button`, { hasText: 'View demo' }).first().click();

  await expect(page).toHaveURL(/tabs\.html$/);
  await expect(page.locator('h1 code')).toHaveText('ui-tabs');
});

test('sorts a column by clicking its header', async ({ page }) => {
  await page.locator(`${CATALOGUE} th[data-sort="name"] .ui4u-tablegrid__sort`).click();

  await expect(page.locator(`${CATALOGUE} th[data-sort="name"]`)).toHaveAttribute(
    'aria-sort',
    'ascending'
  );
  await expect(page.locator('#catalogue-log')).toContainText('Sorted by name (asc)');

  // Exactly one column is sorted at a time.
  await expect(page.locator(`${CATALOGUE} th[aria-sort]`)).toHaveCount(1);
});

test('filters rows from the toolbar field', async ({ page }) => {
  // `dropdown` names exactly one row. A term like `table` matches two, because
  // the toolbar's own description mentions "a table grid" — the filter is a
  // substring match over every column, as documented.
  await page.locator(`${CATALOGUE} ui-input .ui4u-input__native`).fill('dropdown');
  await expect(page.locator(GRID)).toHaveCount(1);
  await expect(page.locator(GRID).first()).toContainText('ui-dropdown');
});

test('filters rows by kind from the toolbar dropdown', async ({ page }) => {
  await page.locator(`${CATALOGUE} ui-dropdown .ui4u-dropdown__trigger`).click();
  await page.locator('.ui4u-dropdown__panel [role="option"]', { hasText: 'Forms' }).click();

  // Five components are form controls.
  await expect(page.locator(GRID)).toHaveCount(5);
  const kinds = await page
    .locator(`${CATALOGUE} tbody tr:not([hidden]) td:nth-child(2)`)
    .evaluateAll((cells) => [...new Set(cells.map((c) => c.textContent.trim()))]);
  expect(kinds).toEqual(['Forms']);
});

test('pages through the catalogue', async ({ page }) => {
  // Eight per page over fifteen components.
  await expect(page.locator(GRID)).toHaveCount(8);
  await expect(page.locator(`${CATALOGUE} .ui4u-tablegrid__page-status`)).toHaveText(
    'Page 1 of 2 · 15 rows'
  );

  await page.locator(`${CATALOGUE} .ui4u-tablegrid__page-btn`, { hasText: 'Next' }).click();
  await expect(page.locator(GRID)).toHaveCount(7);
  await expect(page.locator('#catalogue-log')).toContainText('Page 2 of 2');
});

test('the page runs without script errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/demo/index.html', { waitUntil: 'networkidle' });
  await page.locator(`${CATALOGUE} ui-input .ui4u-input__native`).fill('form');

  expect(errors).toEqual([]);
});
