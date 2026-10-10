import { expect, test } from '@playwright/test';

const MAIN = '.page';
const GRID = '#demo-grid';
const FIXED = '#fixed-grid';

/**
 * Counts the tracks in the first row by grouping children by their `top`.
 * jsdom has no layout engine, so this is where the geometry assertions live.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 * @returns {Promise<number>}
 */
async function columnCount(page, selector) {
  return page.evaluate((sel) => {
    const grid = document.querySelector(sel);
    const cards = /** @type {HTMLElement[]} */ ([...grid.children]);
    if (cards.length === 0) return 0;

    const first = cards[0].getBoundingClientRect().top;
    return cards.filter((card) => Math.abs(card.getBoundingClientRect().top - first) < 1).length;
  }, selector);
}

/** @param {import('@playwright/test').Page} page @param {string} selector */
async function gapOf(page, selector) {
  return page.evaluate((sel) => {
    const grid = /** @type {HTMLElement} */ (document.querySelector(sel));
    return Number.parseFloat(getComputedStyle(grid).rowGap);
  }, selector);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/grid.html');
});

test('renders the cards as a fluid grid', async ({ page }) => {
  await expect(page.locator(`${GRID} > .demo-card`)).toHaveCount(12);
  await expect(page.locator(GRID)).toHaveAttribute('data-mode', 'fluid');
});

test('a narrow viewport collapses to a single column', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 900 });

  expect(await columnCount(page, GRID)).toBe(1);
});

test('a wider viewport flows the same markup into more columns', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 900 });
  const narrow = await columnCount(page, GRID);

  await page.setViewportSize({ width: 1440, height: 900 });
  const wide = await columnCount(page, GRID);

  expect(narrow).toBe(1);
  expect(wide).toBeGreaterThan(narrow);
  expect(wide).toBeGreaterThanOrEqual(3);
});

test('the column mode picker switches between fluid and a fixed count', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.locator('#opt-columns [role="tab"]', { hasText: /^3$/ }).click();
  await expect(page.locator(GRID)).toHaveAttribute('data-mode', 'fixed');
  expect(await columnCount(page, GRID)).toBe(3);

  // Going back to fluid restores the authored minimum rather than the count.
  await page.locator('#opt-columns [role="tab"]', { hasText: 'fluid' }).click();
  await expect(page.locator(GRID)).toHaveAttribute('data-mode', 'fluid');
});

test('a fixed columns count holds at every width', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 900 });
  expect(await columnCount(page, FIXED)).toBe(3);

  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await columnCount(page, FIXED)).toBe(3);
  await expect(page.locator(FIXED)).toHaveAttribute('data-mode', 'fixed');
});

test('the gap picker changes the resolved spacing', async ({ page }) => {
  const md = await gapOf(page, GRID);

  await page.locator('#opt-gap [role="tab"]', { hasText: /^xl$/ }).click();
  const xl = await gapOf(page, GRID);

  expect(xl).toBeGreaterThan(md);
  // 3rem, the --ui4u-space-8 token.
  expect(Math.round(xl)).toBe(48);

  await page.locator('#opt-gap [role="tab"]', { hasText: /^xs$/ }).click();
  expect(await gapOf(page, GRID)).toBeLessThan(md);
});

test('columns wins over min when both are authored', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.locator('#opt-columns [role="tab"]', { hasText: /^2$/ }).click();
  // The minimum is still on the element; the count is what the template uses.
  await expect(page.locator(GRID)).toHaveAttribute('min', '16rem');

  expect(await columnCount(page, GRID)).toBe(2);
});

test('the label toggle adds and removes the region role', async ({ page }) => {
  await expect(page.locator(GRID)).toHaveAttribute('role', 'region');

  await page.locator('#toggle-label').click();
  await expect(page.locator(GRID)).not.toHaveAttribute('role', 'region');

  await page.locator('#toggle-label').click();
  await expect(page.locator(GRID)).toHaveAttribute('aria-label', 'Component cards');
});

test('the grid imposes no roles on its content', async ({ page }) => {
  const roles = await page.evaluate(() => {
    const grid = document.querySelector('#demo-grid');
    return [...grid.children].map((child) => child.getAttribute('role'));
  });

  expect(roles.every((role) => role === null)).toBe(true);
});

test('the demo contains no raw select elements', async ({ page }) => {
  await expect(page.locator('select')).toHaveCount(0);
});

/**
 * `<script>` content is raw text: HTML entities are not decoded, so writing
 * `=&gt;` inside an inline module throws `Unexpected token '&'` and silently
 * stops every import below it — the page looks fine but the component never
 * upgrades. Assert the absence of script errors rather than trusting the
 * rendered output.
 */
test('the demo page runs its scripts without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/demo/grid.html', { waitUntil: 'networkidle' });
  await expect(page.locator(`${MAIN} ${GRID} > .demo-card`)).toHaveCount(12);

  expect(errors).toEqual([]);
});

test('the Source samples live inside a collapsed ui-disclosure', async ({ page }) => {
  const source = page.locator('ui-disclosure[summary="Source"]');
  const trigger = source.getByRole('button');

  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(source.locator('[data-highlight]')).toHaveCount(3);
  expect(await source.locator('span[class^="tok-"]').count()).toBeGreaterThan(0);
});