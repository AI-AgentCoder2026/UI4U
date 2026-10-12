/**
 * Demo screenshots for the docs.
 *
 * Ad-hoc capture, not part of the build or the test run:
 *
 * ```sh
 * node scripts/dev.mjs &          # serve demo/ on :5173
 * node scripts/shot.mjs           # writes docs/screenshots/
 * ```
 *
 * Pass a page name to shoot just that one, e.g. `node scripts/shot.mjs tablegrid`.
 */
import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:5173';
const OUT = new URL('../docs/screenshots/', import.meta.url);

/** @type {Array<[string, { width: number, height: number }]>} */
const PAGES = [
  ['index', devices['Desktop Chrome'].viewport],
  ['tabs', devices['Desktop Chrome'].viewport],
  ['disclosure', devices['Desktop Chrome'].viewport],
  ['button', devices['Desktop Chrome'].viewport],
  ['tooltip', devices['Desktop Chrome'].viewport],
  ['popup', devices['Desktop Chrome'].viewport],
  ['input', devices['Desktop Chrome'].viewport],
  ['form', devices['Desktop Chrome'].viewport],
  ['sidebar', devices['Desktop Chrome'].viewport],
  ['layout', devices['Desktop Chrome'].viewport],
  ['tablegrid', devices['Desktop Chrome'].viewport],
  ['checkbox', devices['Desktop Chrome'].viewport],
  ['radio', devices['Desktop Chrome'].viewport],
  ['dropdown', devices['Desktop Chrome'].viewport],
  ['toolbar', devices['Desktop Chrome'].viewport],
  ['button-group', devices['Desktop Chrome'].viewport],
  ['card', devices['Desktop Chrome'].viewport],
];

const only = process.argv[2];
const targets = only ? PAGES.filter(([name]) => name === only) : PAGES;
if (targets.length === 0) {
  throw new Error(`No screenshot defined for "${only}". Try: ${PAGES.map(([n]) => n).join(', ')}`);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const [name, viewport] of targets) {
  const page = await browser.newPage({ viewport, colorScheme: 'dark' });
  await page.goto(`${BASE}/demo/${name}.html`, { waitUntil: 'networkidle' });
  // Let the custom elements upgrade and any entrance transition settle.
  await page.waitForTimeout(400);

  // The table grid demo shows selection and the filter builder off by
  // default; turn them on so the screenshot shows the component at its most.
  if (name === 'tablegrid') {
    const grid = page.locator('#demo');
    await page.locator('#opt-select [role="tab"]', { hasText: 'multi' }).click();
    await page.locator('#opt-search [role="tab"]', { hasText: 'advanced' }).click();
    await page.locator('#opt-copy [role="tab"]', { hasText: 'on' }).click();

    const boxes = grid.locator('tbody .ui4u-tablegrid__select-cell input');
    await boxes.nth(1).check();
    await boxes.nth(3).check();

    await page.locator('.ui4u-tablegrid__filter-add').click();
    await page.locator('.ui4u-tablegrid__filter-field').selectOption('downloads');
    await page.locator('.ui4u-tablegrid__filter-op').selectOption('gte');
    await page.locator('.ui4u-tablegrid__filter-value').fill('4000');
    await page.waitForTimeout(300);
  }

  // `window` lives in the browser; this runs under Node, so the eslint browser
  // globals have to be named where they are used.
  await page.evaluate(() => globalThis.scrollTo(0, 0));

  // The table grid has a tall control area above it; shooting the component
  // itself keeps the docs image about the table rather than the pickers.
  const target = name === 'tablegrid' ? page.locator('#demo') : page;
  await target.screenshot({ path: fileURLToPath(new URL(`${name}-desktop-dark.png`, OUT)) });
  await page.close();
  console.log(`captured ${name}`);
}

await browser.close();
