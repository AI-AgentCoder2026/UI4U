import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-tablegrid.
 *
 * The unit specs cover the comparator and ARIA wiring against jsdom. These run
 * in a real engine, so the sticky header, the sort buttons and the roving
 * focus over cells are exercised for real.
 */

const MAIN = '#demo';

/** First-column text of every body row, top to bottom. */
const order = async (page) =>
  page
    .locator(`${MAIN} tbody tr`)
    .evaluateAll((rows) => rows.map((r) => r.cells[0].textContent.trim()));

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/tablegrid.html');
  await page.waitForSelector(`${MAIN} tbody tr`);
});

test('renders the author table with a row per release', async ({ page }) => {
  await expect(page.locator(`${MAIN} tbody tr`)).toHaveCount(6);
  await expect(page.locator(`${MAIN} thead th`)).toHaveCount(5);
});

test('labels the table', async ({ page }) => {
  await expect(page.locator(`${MAIN} table`)).toHaveAttribute('aria-label', 'Release downloads');
});

test('sorts by clicking a header button', async ({ page }) => {
  await page.locator(`${MAIN} th[data-sort="downloads"] .ui4u-tablegrid__sort`).click();

  const values = await page
    .locator(`${MAIN} tbody tr`)
    .evaluateAll((rows) => rows.map((r) => r.cells[0].textContent.trim()));
  expect(values).toEqual(['1.3.0-rc.1', '1.2.0-beta.1', '1.0.0', '1.1.0', '1.2.0', '1.3.0']);
});

test('sorts numerically using data-value, not the formatted text', async ({ page }) => {
  await page.getByRole('button', { name: 'Sort by downloads' }).click();

  const downloads = await page
    .locator(`${MAIN} tbody tr`)
    .evaluateAll((rows) => rows.map((r) => Number(r.cells[1].getAttribute('data-value'))));

  // 9,260 → 6,400 → 3,900 … A string sort would put "1,120" ahead of "3900".
  expect(downloads).toEqual([9260, 8421, 5120, 3900, 1120, 640]);
});

test('marks exactly one header with aria-sort', async ({ page }) => {
  await page.getByRole('button', { name: 'Sort by version' }).click();

  const sorted = await page
    .locator(`${MAIN} thead th[aria-sort]`)
    .evaluateAll((cells) => cells.map((c) => c.getAttribute('aria-sort')));

  expect(sorted).toEqual(['ascending']);
});

test('toggles back to descending on a second click', async ({ page }) => {
  const header = page.locator(`${MAIN} th[data-sort="version"]`);

  await header.locator('.ui4u-tablegrid__sort').click();
  await expect(header).toHaveAttribute('aria-sort', 'ascending');

  await header.locator('.ui4u-tablegrid__sort').click();
  await expect(header).toHaveAttribute('aria-sort', 'descending');
});

test('reset restores the authored row order', async ({ page }) => {
  const before = await order(page);

  await page.getByRole('button', { name: 'Sort by version' }).click();
  expect(await order(page)).not.toEqual(before);

  await page.getByRole('button', { name: 'Reset sort' }).click();
  expect(await order(page)).toEqual(before);
});

test('sorts from the keyboard', async ({ page }) => {
  const header = page.locator(`${MAIN} th[data-sort="version"] .ui4u-tablegrid__sort`);

  await header.focus();
  await expect(header).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.locator(`${MAIN} th[data-sort="version"]`)).toHaveAttribute(
    'aria-sort',
    'ascending'
  );
});

test('the mode picker switches between table and grid semantics', async ({ page }) => {
  await expect(page.locator(`${MAIN} table`)).toHaveAttribute('role', 'grid');

  await page.locator('#opt-navigate [role="tab"]', { hasText: 'table' }).click();
  await expect(page.locator(`${MAIN} table`)).not.toHaveAttribute('role', 'grid');

  await page.locator('#opt-navigate [role="tab"]', { hasText: 'grid' }).click();
  await expect(page.locator(`${MAIN} table`)).toHaveAttribute('role', 'grid');
});

test('arrow keys move focus across cells in navigate mode', async ({ page }) => {
  const firstCell = page.locator(`${MAIN} [role="gridcell"]`).first();
  await firstCell.focus();

  await page.keyboard.press('ArrowRight');
  await expect(page.locator(`${MAIN} tbody tr`).first().locator('td').nth(1)).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(page.locator(`${MAIN} tbody tr`).nth(1).locator('td').nth(1)).toBeFocused();

  await page.keyboard.press('ArrowUp');
  await expect(page.locator(`${MAIN} tbody tr`).first().locator('td').nth(1)).toBeFocused();
});

test('End jumps to the last cell in the row', async ({ page }) => {
  await page.locator(`${MAIN} [role="gridcell"]`).first().focus();
  await page.keyboard.press('End');

  const width = await page.locator(`${MAIN} thead tr td, ${MAIN} thead tr th`).count();
  await expect(
    page
      .locator(`${MAIN} tbody tr`)
      .first()
      .locator('td')
      .nth(width - 1)
  ).toBeFocused();
});

test('keeps a single cell in the tab order', async ({ page }) => {
  await expect(page.locator(MAIN + ' [tabindex="0"]')).toHaveCount(1);
});

test('the sticky header stays put while the table scrolls', async ({ page }) => {
  const position = await page
    .locator(`${MAIN} thead th`)
    .first()
    .evaluate((el) => getComputedStyle(el).position);

  expect(position).toBe('sticky');
});

test('the page runs without script errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/demo/tablegrid.html', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sort by downloads' }).click();
  await expect(page.locator('#log')).toHaveText(/ui4u:sort → downloads desc/);

  expect(errors).toEqual([]);
});
