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
  await page.screenshot({ path: fileURLToPath(new URL(`${name}-desktop-dark.png`, OUT)) });
  await page.close();
  console.log(`captured ${name}`);
}

await browser.close();
