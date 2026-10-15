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

/**
 * The Version column of the visible rows.
 *
 * Read by content rather than by index: with the selection column on, the
 * checkbox cell sits at index 0 and pushes every data column along.
 */
const visibleVersions = async (page) =>
  page.locator(`${MAIN} tbody tr`).evaluateAll((rows) =>
    rows
      .filter((r) => !r.hidden)
      .map((r) => {
        const cell = [...r.cells].find((c) => !c.classList.contains('ui4u-tablegrid__select-cell'));
        return cell.textContent.trim();
      })
  );

/** The Downloads value of the visible rows, as a number. */
const visibleDownloads = async (page) =>
  page.locator(`${MAIN} tbody tr`).evaluateAll((rows) =>
    rows
      .filter((r) => !r.hidden)
      .map((r) => {
        const cell = [...r.cells].find(
          (c) =>
            !c.classList.contains('ui4u-tablegrid__select-cell') && c.hasAttribute('data-value')
        );
        return Number(cell.getAttribute('data-value'));
      })
  );

/** The Size value of the visible rows, as a number. Identified by its "kB" text. */
const visibleSizes = async (page) =>
  page.locator(`${MAIN} tbody tr`).evaluateAll((rows) =>
    rows
      .filter((r) => !r.hidden)
      .map((r) => {
        const cell = [...r.cells].find((c) => c.textContent.includes('kB'));
        return Number(cell.getAttribute('data-value'));
      })
  );

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

test('toggling the mode leaves no leftover chrome behind', async ({ page }) => {
  // Changing `navigate` tears the component down and rebuilds it. Only the
  // toolbar wrapper must come off with it — leaving an empty one behind stacked
  // a new gap on every toggle and pushed the table down the page.
  for (let i = 0; i < 3; i += 1) {
    await page.locator('#opt-navigate [role="tab"]', { hasText: 'table' }).click();
    await page.locator('#opt-navigate [role="tab"]', { hasText: 'grid' }).click();
  }

  await expect(page.locator(`${MAIN} .ui4u-tablegrid__toolbar`)).toHaveCount(1);
  await expect(page.locator(`${MAIN} .ui4u-tablegrid__search-input`)).toHaveCount(1);
  await expect(page.locator(`${MAIN} .ui4u-tablegrid__pager`)).toHaveCount(0);
  await expect(page.locator(`${MAIN} .ui4u-tablegrid__sort`)).toHaveCount(3);

  // The empty wrappers had height from `margin-bottom`; a real one does not
  // collapse to nothing, so assert exactly one non-zero box.
  const boxes = await page
    .locator(`${MAIN} .ui4u-tablegrid__toolbar`)
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height));

  expect(boxes.filter((h) => h > 0).length).toBe(1);
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

  // The name of this test used to be aspirational: nothing matched and the
  // table was simply blank. It now says so, and says which kind of nothing.
  const status = page.locator(`${MAIN} .ui4u-tablegrid__status`);
  await expect(status).toBeVisible();
  await expect(status).toContainText('Nothing matches');
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

/* --- async states --------------------------------------------------------- */

test.describe('loading, empty and error', () => {
  const status = (page) => page.locator(`${MAIN} .ui4u-tablegrid__status`);

  test('shows a loading row, marks the table busy, and inert the toolbar', async ({ page }) => {
    await page.locator('#opt-state [role="tab"]', { hasText: 'Loading' }).click();

    await expect(status(page)).toHaveText('Loading');
    await expect(status(page)).toHaveAttribute('data-state', 'loading');
    await expect(page.locator(`${MAIN} table`)).toHaveAttribute('aria-busy', 'true');

    // Nothing looks actionable while there is nothing to act on.
    await expect(page.locator(`${MAIN} .ui4u-tablegrid__sort`).first()).toBeDisabled();
    await expect(page.locator(`${MAIN} tbody tr:not([hidden])`)).toHaveCount(1); // the status row
  });

  test('says something different when a search matched nothing', async ({ page }) => {
    await page.locator('.ui4u-tablegrid__search-input').fill('zzzz-nothing');

    await expect(status(page)).toHaveAttribute('data-state', 'empty');
    // "No rows" would invite creating one; this invites changing the search.
    await expect(status(page)).toContainText('Nothing matches');

    await page.locator('.ui4u-tablegrid__search-input').fill('');
    await expect(status(page)).toHaveCount(0);
  });

  test('an error is announced, and clears when the data arrives', async ({ page }) => {
    await page.locator('#opt-state [role="tab"]', { hasText: 'Error' }).click();

    await expect(status(page)).toHaveAttribute('data-state', 'error');
    await expect(status(page)).toHaveText('Could not reach the release API');
    // A failure interrupts; arriving data does not.
    await expect(status(page)).toHaveAttribute('role', 'alert');

    await page.locator('#opt-state [role="tab"]', { hasText: 'Loaded' }).click();
    await expect(status(page)).toHaveCount(0);
    await expect(page.locator(`${MAIN} table`)).not.toHaveAttribute('aria-busy', 'true');
  });

  test('the status row is never mistaken for data', async ({ page }) => {
    const before = await page.locator(`${MAIN} tbody tr:not([hidden])`).count();

    await page.locator('#opt-state [role="tab"]', { hasText: 'Loading' }).click();
    await page.locator('#opt-state [role="tab"]', { hasText: 'Loaded' }).click();
    await page.waitForTimeout(100);

    // The MutationObserver watches the body for new rows; the status row lives
    // there too, and must not have been adopted into the dataset.
    await expect(page.locator(`${MAIN} tbody tr:not([hidden])`)).toHaveCount(before);
  });
});

/* --- selection ----------------------------------------------------------- */

test.describe('selection', () => {
  const pick = async (page, label) => {
    await page.locator('#opt-select [role="tab"]', { hasText: label }).click();
  };
  const rows = (page) => page.locator(`${MAIN} tbody tr:not([hidden])`);
  const boxes = (page) => page.locator(`${MAIN} tbody .ui4u-tablegrid__select-cell input`);

  test('turns the checkbox column on and off', async ({ page }) => {
    await expect(page.locator(`${MAIN} .ui4u-tablegrid__select-head`)).toHaveCount(0);

    await pick(page, 'single');
    await expect(page.locator(`${MAIN} .ui4u-tablegrid__select-head`)).toHaveCount(1);
    await expect(boxes(page)).toHaveCount(6);

    await pick(page, 'off');
    await expect(page.locator(`${MAIN} .ui4u-tablegrid__select-head`)).toHaveCount(0);
    await expect(boxes(page)).toHaveCount(0);
  });

  test('selects one row at a time by default', async ({ page }) => {
    await pick(page, 'single');

    await rows(page).nth(0).locator('td').nth(1).click();
    await expect(rows(page).nth(0)).toHaveAttribute('aria-selected', 'true');

    await rows(page).nth(2).locator('td').nth(1).click();
    await expect(rows(page).nth(2)).toHaveAttribute('aria-selected', 'true');
    await expect(rows(page).nth(0)).toHaveAttribute('aria-selected', 'false');
  });

  test('keeps several rows with Ctrl and a range with Shift', async ({ page }) => {
    await pick(page, 'multi');
    const selected = page.locator(`${MAIN} tbody tr[aria-selected="true"]`);

    await rows(page).nth(0).locator('td').nth(1).click();
    await expect(selected).toHaveCount(1);

    // Ctrl adds without dropping what was already chosen.
    await rows(page)
      .nth(2)
      .locator('td')
      .nth(1)
      .click({ modifiers: ['Control'] });
    await expect(selected).toHaveCount(2);

    // Shift extends from the last anchor, and — like a file list — a range
    // replaces the selection rather than piling onto it.
    await rows(page)
      .nth(4)
      .locator('td')
      .nth(1)
      .click({ modifiers: ['Shift'] });
    await expect(selected).toHaveCount(3);
  });

  test('the header checkbox selects everything and shows partial state', async ({ page }) => {
    await pick(page, 'multi');
    const master = page.locator(`${MAIN} .ui4u-tablegrid__select-head input`);

    await boxes(page).nth(0).check();
    await expect(master).toBeChecked({ checked: false });

    await master.check();
    await expect(page.locator(`${MAIN} tbody tr[aria-selected="true"]`)).toHaveCount(6);

    await master.uncheck();
    await expect(page.locator(`${MAIN} tbody tr[aria-selected="true"]`)).toHaveCount(0);
  });

  test('selecting a row reports the count to the demo log', async ({ page }) => {
    await pick(page, 'multi');
    await rows(page).nth(0).locator('td').nth(1).click();
    await rows(page)
      .nth(1)
      .locator('td')
      .nth(1)
      .click({ modifiers: ['Control'] });

    await expect(page.locator('#log')).toHaveText('state → 2 selected');
  });

  test('sorting still reads the right column with the checkbox column present', async ({
    page,
  }) => {
    await pick(page, 'multi');
    await page.locator(`${COLS} th[data-sort="size"] .ui4u-tablegrid__sort`).click();

    expect(await visibleSizes(page)).toEqual([41200, 42380, 43100, 43990, 44210, 44680]);
  });
});

/* --- copy ---------------------------------------------------------------- */

test.describe('copy', () => {
  test('the button is disabled until something is selected, then copies', async ({
    page,
    browserName,
  }) => {
    if (browserName !== 'chromium') test.skip(true, 'clipboard permissions are Chromium-only');

    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5173' });

    await page.locator('#opt-select [role="tab"]', { hasText: 'multi' }).click();
    await page.locator('#opt-copy [role="tab"]', { hasText: 'on' }).click();

    const copy = page.locator(`${MAIN} .ui4u-tablegrid__copy`);
    await expect(copy).toBeDisabled();

    await page.locator(`${MAIN} tbody .ui4u-tablegrid__select-cell input`).nth(0).check();
    await expect(copy).toBeEnabled();
    await copy.click();

    await expect(page.locator('#log')).toHaveText(/ui4u:copy → 1 rows on the clipboard/);

    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text.split(/\r?\n/).filter(Boolean)).toEqual([
      'Version\tDownloads\tSize\tPublished',
      '1.0.0\t3900\t41200\t2026-05-01',
    ]);
  });

  test('copy is off until it is asked for', async ({ page }) => {
    await expect(page.locator(`${MAIN} .ui4u-tablegrid__copy`)).toHaveCount(0);
    await page.locator('#opt-copy [role="tab"]', { hasText: 'on' }).click();
    await expect(page.locator(`${MAIN} .ui4u-tablegrid__copy`)).toHaveCount(1);
  });
});

/* --- advanced search ----------------------------------------------------- */

test.describe('advanced search', () => {
  test('renders the builder only when asked for', async ({ page }) => {
    await expect(page.locator(`${MAIN} .ui4u-tablegrid__filters`)).toHaveCount(0);

    await page.locator('#opt-search [role="tab"]', { hasText: 'advanced' }).click();
    await expect(page.locator(`${MAIN} .ui4u-tablegrid__filters`)).toHaveCount(1);
    // Advanced implies the quick field too.
    await expect(page.locator(`${MAIN} .ui4u-tablegrid__search-input`)).toHaveCount(1);
  });

  test('adds a criterion and filters rows as the value is typed', async ({ page }) => {
    await page.locator('#opt-search [role="tab"]', { hasText: 'advanced' }).click();
    await page.locator(`${MAIN} .ui4u-tablegrid__filter-add`).click();

    await page.locator(`${MAIN} .ui4u-tablegrid__filter-field`).selectOption('downloads');
    await page.locator(`${MAIN} .ui4u-tablegrid__filter-op`).selectOption('gte');
    await page.locator(`${MAIN} .ui4u-tablegrid__filter-value`).fill('5000');

    expect(await visibleDownloads(page)).toEqual([5120, 8421, 9260]);
  });

  test('compares a numeric column numerically', async ({ page }) => {
    await page.locator('#opt-search [role="tab"]', { hasText: 'advanced' }).click();
    await page.locator(`${MAIN} .ui4u-tablegrid__filter-add`).click();

    await page.locator(`${MAIN} .ui4u-tablegrid__filter-field`).selectOption('downloads');
    await page.locator(`${MAIN} .ui4u-tablegrid__filter-op`).selectOption('lt');
    await page.locator(`${MAIN} .ui4u-tablegrid__filter-value`).fill('1200');

    // 640 and 1,120 are both under 1200. As text, "640" would sort after it.
    expect(await visibleDownloads(page)).toEqual([1120, 640]);
  });

  test('combines two criteria and removes one', async ({ page }) => {
    await page.locator('#opt-search [role="tab"]', { hasText: 'advanced' }).click();
    await page.locator(`${MAIN} .ui4u-tablegrid__filter-add`).click();

    const field = page.locator(`${MAIN} .ui4u-tablegrid__filter-field`).first();
    const op = page.locator(`${MAIN} .ui4u-tablegrid__filter-op`).first();
    const value = page.locator(`${MAIN} .ui4u-tablegrid__filter-value`).first();

    await field.selectOption('version');
    await op.selectOption('starts-with');
    await value.fill('1.2');

    await page.locator(`${MAIN} .ui4u-tablegrid__filter-add`).click();
    await page.locator(`${MAIN} .ui4u-tablegrid__filter-field`).nth(1).selectOption('downloads');
    await page.locator(`${MAIN} .ui4u-tablegrid__filter-op`).nth(1).selectOption('gte');
    await page.locator(`${MAIN} .ui4u-tablegrid__filter-value`).nth(1).fill('8000');

    expect(await visibleDownloads(page)).toEqual([8421]);

    await page.locator(`${MAIN} .ui4u-tablegrid__filter-remove`).first().click();
    expect(await visibleVersions(page)).toEqual(['1.2.0', '1.3.0']);
  });

  test('an empty criterion does not hide any rows', async ({ page }) => {
    await page.locator('#opt-search [role="tab"]', { hasText: 'advanced' }).click();
    await page.locator(`${MAIN} .ui4u-tablegrid__filter-add`).click();

    await expect(page.locator(`${MAIN} tbody tr:not([hidden])`)).toHaveCount(6);
  });
});

test('the page runs without script errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/demo/tablegrid.html', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sort by downloads' }).click();
  await expect(page.locator('#log')).toHaveText(/ui4u:sort → downloads desc/);

  expect(errors).toEqual([]);
});

/* --- multi-column sort --------------------------------------------------- */

test.describe('multi-column sort', () => {
  test('shift-click adds a second key and a third click removes it', async ({ page }) => {
    const head = (key) => page.locator(`${COLS} th[data-sort="${key}"]`);
    const versions = () =>
      page
        .locator(`${MAIN} tbody tr:not([hidden])`)
        .evaluateAll((rows) => rows.map((r) => r.cells[0].textContent.trim()));

    await head('version').locator('.ui4u-tablegrid__sort').click();
    expect(await head('version').getAttribute('aria-sort')).toBe('ascending');

    await head('downloads')
      .locator('.ui4u-tablegrid__sort')
      .click({ modifiers: ['Shift'] });

    // `aria-sort` stays on exactly one header; the second key gets a visible
    // priority badge instead, because the order is meaningless otherwise.
    expect(await page.locator(`${COLS} th[aria-sort]`)).toHaveCount(1);
    expect(await head('downloads').getAttribute('data-sort-rank')).toBe('2');
    expect(await head('downloads').locator('.ui4u-tablegrid__sort-rank')).toHaveText('2');

    expect(await versions()).toHaveLength(await page.locator(`${MAIN} tbody tr`).count());

    // Shift-click again drops it.
    await head('downloads')
      .locator('.ui4u-tablegrid__sort')
      .click({ modifiers: ['Shift'] });

    await expect(head('downloads')).not.toHaveAttribute('data-sort-rank', '2');
    expect(await page.locator(`${COLS} th[aria-sort]`)).toHaveCount(1);
  });

  test('a plain click replaces the list rather than extending it', async ({ page }) => {
    const head = (key) => page.locator(`${COLS} th[data-sort="${key}"]`);

    await head('version').locator('.ui4u-tablegrid__sort').click();
    await head('downloads')
      .locator('.ui4u-tablegrid__sort')
      .click({ modifiers: ['Shift'] });
    await head('downloads').locator('.ui4u-tablegrid__sort').click();

    // `downloads` is primary now, and nothing else is sorted.
    expect(await head('downloads')).toHaveAttribute('aria-sort', 'ascending');
    await expect(page.locator(`${COLS} th[data-sort-rank]`)).toHaveCount(0);
  });

  test('a veto leaves both keys alone', async ({ page }) => {
    await page.evaluate(() => {
      // Refuse only the *second* key, so the first one still lands and the
      // test can see that the refusal left everything else untouched.
      document.getElementById('demo').bind('sort', ({ columns }) => columns.length < 2);
    });

    const head = (key) => page.locator(`${COLS} th[data-sort="${key}"]`);
    await head('version').locator('.ui4u-tablegrid__sort').click();
    await head('downloads')
      .locator('.ui4u-tablegrid__sort')
      .click({ modifiers: ['Shift'] });

    // Only the first click got through; the second was refused before it
    // touched anything.
    expect(await page.locator(`${COLS} th[aria-sort]`)).toHaveCount(1);
    await expect(head('downloads')).not.toHaveAttribute('data-sort-rank', '2');
  });
});

/* --- data source ---------------------------------------------------------- */

test.describe('data source', () => {
  const remote = (page) => page.locator('#opt-source [role="tab"]', { hasText: 'remote' });
  const status = (page) => page.locator(`${MAIN} .ui4u-tablegrid__status`);
  const pageStatus = (page) => page.locator(`${MAIN} .ui4u-tablegrid__page-status`);

  /** Picks a page size, which is what makes the pager exist at all. */
  const usePages = (page) => page.locator('#opt-perpage [role="tab"]', { hasText: /^3$/ }).click();

  test('asks the source for the rows instead of reading its own markup', async ({ page }) => {
    await usePages(page);
    await remote(page).click();

    // The loading state is real: the demo's stand-in source waits, and a grid
    // that faked it would show a status row for no reason.
    await expect(status(page)).toHaveAttribute('data-state', 'loading');
    await expect(status(page)).not.toBeVisible({ timeout: 3000 });
    await expect(pageStatus(page)).toBeVisible();

    // Server paging: the pager counts what the source reports, not the rows it
    // happens to be holding.
    await expect(pageStatus(page)).toHaveText('Page 1 of 2 · 6 rows');
    await expect(page.locator(`${MAIN} tbody tr:not([hidden])`)).toHaveCount(3);
  });

  test('sorting goes through the source and comes back in its order', async ({ page }) => {
    await usePages(page);
    await remote(page).click();
    await expect(status(page)).not.toBeVisible({ timeout: 3000 });

    await page.locator(`${MAIN} th[data-sort="version"] .ui4u-tablegrid__sort`).click();
    await page.waitForTimeout(700);

    const versions = await page
      .locator(`${MAIN} tbody tr:not([hidden]) td:first-child`)
      .evaluateAll((cells) => cells.map((c) => c.textContent.trim()));
    expect(versions).toEqual([...versions].sort().reverse());
  });

  test('switches back to the authored rows', async ({ page }) => {
    await remote(page).click();
    await expect(status(page)).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator(`${MAIN}`)).toHaveAttribute('data-remote', 'true');

    await page.locator('#opt-source [role="tab"]', { hasText: 'local' }).click();

    await expect(page.locator(`${MAIN}`)).not.toHaveAttribute('data-remote', 'true');
    // The markup the author wrote is back, not the last page of the source.
    await expect(page.locator(`${MAIN} tbody tr`)).toHaveCount(6);
    await expect(status(page)).toHaveCount(0);
  });
});
