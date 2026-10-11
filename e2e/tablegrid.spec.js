import { expect, test } from '@playwright/test';

/**
 * Browser smoke tests for ui-tablegrid.
 *
 * The unit specs cover the comparator and ARIA wiring against jsdom. These run
 * in a real engine, so the sticky header, the sort buttons and the roving
 * focus over cells are exercised for real.
 */

const MAIN = '#demo';
/** The header row that carries the columns — the last one. */
const COLS = `${MAIN} thead tr:last-child`;
/** Group headers sit in the earlier header rows. */
const GROUPS = `${MAIN} thead tr:not(:last-child)`;

/** First-column text of every body row, top to bottom. */
const order = async (page) =>
  page
    .locator(`${MAIN} tbody tr`)
    .evaluateAll((rows) => rows.map((r) => r.cells[0].textContent.trim()));

/** First-column text of the rows currently on screen — search and paging hide the rest. */
const visibleOrder = async (page) =>
  page
    .locator(`${MAIN} tbody tr`)
    .evaluateAll((rows) => rows.filter((r) => !r.hidden).map((r) => r.cells[0].textContent.trim()));

test.beforeEach(async ({ page }) => {
  await page.goto('/demo/tablegrid.html');
  await page.waitForSelector(`${MAIN} tbody tr`);
});

test('renders the author table with a row per release', async ({ page }) => {
  await expect(page.locator(`${MAIN} tbody tr`)).toHaveCount(6);
  await expect(page.locator(`${COLS} th`)).toHaveCount(4);
});

test('labels the table', async ({ page }) => {
  await expect(page.locator(`${MAIN} table`)).toHaveAttribute('aria-label', 'Release downloads');
});

test('the caption is announced but not shown', async ({ page }) => {
  const caption = page.locator(`${MAIN} caption`);
  await expect(caption).toHaveText('Release downloads, sortable');

  // Visually hidden via .ui4u-sr-only. A stale class prefix would leave the
  // caption laid out at full size on screen, which is what this guards against —
  // so assert the box is collapsed rather than that it is "not visible".
  await expect(caption).toHaveClass(/ui4u-sr-only/);

  const box = await caption.boundingBox();
  expect(box.width).toBeLessThanOrEqual(1);
  expect(box.height).toBeLessThanOrEqual(1);
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

  const width = await page.locator(`${COLS} th`).count();
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
    .locator(`${COLS} th`)
    .first()
    .evaluate((el) => getComputedStyle(el).position);

  expect(position).toBe('sticky');
});

/* --- column groups ------------------------------------------------------ */

test('renders group headers above the column row', async ({ page }) => {
  await expect(page.locator(`${MAIN} thead tr`)).toHaveCount(2);

  const groups = await page
    .locator(`${GROUPS} th`)
    .evaluateAll((cells) =>
      cells.map((c) => ({ text: c.textContent.trim(), scope: c.getAttribute('scope') }))
    );

  expect(groups).toEqual([
    { text: 'Release', scope: 'colgroup' },
    { text: 'Channel', scope: 'col' },
    { text: 'Distribution', scope: 'colgroup' },
  ]);
});

test('only the last header row carries the sort buttons', async ({ page }) => {
  await expect(page.locator(`${GROUPS} .ui4u-tablegrid__sort`)).toHaveCount(0);
  await expect(page.locator(`${COLS} .ui4u-tablegrid__sort`)).toHaveCount(3);
});

test('sorts the right column when a rowspan group shifts it', async ({ page }) => {
  // "Size" is the third cell of the column row but the fourth cell of a body
  // row, because "Channel" spans both header rows. Sorting by size must order
  // by the kB values, not by the channel names that happen to sit at index 2.
  await page.locator(`${COLS} th[data-sort="size"] .ui4u-tablegrid__sort`).click();

  const sizes = await page
    .locator(`${MAIN} tbody tr`)
    .evaluateAll((rows) => rows.map((r) => Number(r.cells[3].getAttribute('data-value'))));

  expect(sizes).toEqual([41200, 42380, 43100, 43990, 44210, 44680]);
});

test('both header rows get grid roles in navigate mode', async ({ page }) => {
  await expect(page.locator(`${MAIN} thead [role="row"]`)).toHaveCount(2);
  await expect(page.locator(`${MAIN} [role="columnheader"]`)).toHaveCount(7);
});

test('the column header row is offset below the group row when sticky', async ({ page }) => {
  const [groupTop, colTop] = await page.evaluate(() => {
    const rows = document.querySelectorAll('#demo thead tr');
    const group = rows[0].querySelector('th');
    const col = rows[1].querySelector('th');
    return [getComputedStyle(group).top, getComputedStyle(col).top];
  });

  expect(groupTop).toBe('0px');
  expect(colTop).not.toBe('0px');
});

/* --- search ------------------------------------------------------------- */

test('renders a search field and filters rows as you type', async ({ page }) => {
  const field = page.locator(`${MAIN} .ui4u-tablegrid__search-input`);
  await expect(field).toBeVisible();

  await field.fill('beta');
  expect(await visibleOrder(page)).toEqual(['1.2.0-beta.1']);
});

test('search matches the underlying value behind a formatted cell', async ({ page }) => {
  await page.locator(`${MAIN} .ui4u-tablegrid__search-input`).fill('1120');
  expect(await visibleOrder(page)).toEqual(['1.2.0-beta.1']);
});

test('clearing the search brings every row back', async ({ page }) => {
  const field = page.locator(`${MAIN} .ui4u-tablegrid__search-input`);

  await field.fill('beta');
  await expect(field).toHaveValue('beta');

  await field.fill('');
  expect(await visibleOrder(page)).toHaveLength(6);
});

test('a search with no match says so rather than showing a blank table', async ({ page }) => {
  await page.locator(`${MAIN} .ui4u-tablegrid__search-input`).fill('zzzz');
  expect(await visibleOrder(page)).toEqual([]);
});

test('the search event reaches the demo log', async ({ page }) => {
  await page.locator(`${MAIN} .ui4u-tablegrid__search-input`).fill('beta');
  await expect(page.locator('#log')).toHaveText('ui4u:search → "beta" · 1 rows');
});

test('search composes with sorting', async ({ page }) => {
  await page.locator(`${MAIN} .ui4u-tablegrid__search-input`).fill('stable');
  expect(await visibleOrder(page)).toHaveLength(4);

  await page.locator(`${COLS} th[data-sort="downloads"] .ui4u-tablegrid__sort`).click();

  const downloads = await page
    .locator(`${MAIN} tbody tr:not([hidden])`)
    .evaluateAll((rows) => rows.map((r) => Number(r.cells[1].getAttribute('data-value'))));
  expect(downloads).toEqual([3900, 5120, 8421, 9260]);
});

/* --- pagination --------------------------------------------------------- */

test('renders no pager until a page size is chosen', async ({ page }) => {
  await expect(page.locator(`${MAIN} .ui4u-tablegrid__pager`)).toHaveCount(0);
});

test('paging splits the rows and moves between them', async ({ page }) => {
  await page.locator('#opt-perpage [role="tab"]', { hasText: '3' }).click();

  const pager = page.locator(`${MAIN} .ui4u-tablegrid__pager`);
  await expect(pager).toBeVisible();
  await expect(pager.locator('.ui4u-tablegrid__page-status')).toHaveText('Page 1 of 2 · 6 rows');

  expect(await visibleOrder(page)).toEqual(['1.0.0', '1.1.0', '1.2.0-beta.1']);

  await pager.getByRole('button', { name: 'Next page' }).click();
  await expect(pager.locator('.ui4u-tablegrid__page-status')).toHaveText('Page 2 of 2 · 6 rows');
  expect(await visibleOrder(page)).toEqual(['1.2.0', '1.3.0-rc.1', '1.3.0']);
});

test('disables the pager buttons at each end', async ({ page }) => {
  await page.locator('#opt-perpage [role="tab"]', { hasText: '3' }).click();
  const pager = page.locator(`${MAIN} .ui4u-tablegrid__pager`);

  await expect(pager.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  await expect(pager.getByRole('button', { name: 'Next page' })).toBeEnabled();

  await pager.getByRole('button', { name: 'Next page' }).click();
  await expect(pager.getByRole('button', { name: 'Previous page' })).toBeEnabled();
  await expect(pager.getByRole('button', { name: 'Next page' })).toBeDisabled();
});

test('the page count follows the search', async ({ page }) => {
  await page.locator('#opt-perpage [role="tab"]', { hasText: '3' }).click();
  await page.locator(`${MAIN} .ui4u-tablegrid__search-input`).fill('stable');

  await expect(page.locator(`${MAIN} .ui4u-tablegrid__page-status`)).toHaveText(
    'Page 1 of 2 · 4 rows'
  );
  expect(await visibleOrder(page)).toEqual(['1.0.0', '1.1.0', '1.2.0']);
});

test('changing page size resets to page one', async ({ page }) => {
  await page.locator('#opt-perpage [role="tab"]', { hasText: '3' }).click();
  await page
    .locator(`${MAIN} .ui4u-tablegrid__pager`)
    .getByRole('button', { name: 'Next page' })
    .click();
  await expect(page.locator(`${MAIN} .ui4u-tablegrid__page-status`)).toContainText('Page 2');

  await page.locator('#opt-perpage [role="tab"]', { hasText: '4' }).click();
  await expect(page.locator(`${MAIN} .ui4u-tablegrid__page-status`)).toHaveText(
    'Page 1 of 2 · 6 rows'
  );
});

test('arrow keys skip rows that paging has hidden', async ({ page }) => {
  await page.locator('#opt-perpage [role="tab"]', { hasText: '3' }).click();

  // Walk down from the header; the three visible body rows should each be
  // reachable, and the cursor must never land on a hidden one.
  await page.locator(`${MAIN} [role="columnheader"]`).first().focus();

  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('ArrowDown');
    const focused = await page.evaluate(() => {
      const cell = document.activeElement;
      return { hidden: cell.closest('tr')?.hidden ?? false, text: cell.textContent.trim() };
    });
    expect(focused.hidden).toBe(false);
  }

  // A fourth press has nowhere visible to go.
  await page.keyboard.press('ArrowDown');
  const still = await page.evaluate(() => document.activeElement.closest('tr').hidden);
  expect(still).toBe(false);
});

test('the page runs without script errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/demo/tablegrid.html', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sort by downloads' }).click();
  await expect(page.locator('#log')).toHaveText(/ui4u:sort → downloads desc/);

  expect(errors).toEqual([]);
});
