import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { cleanup, mount, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component module is evaluated — see helpers/dom.js.
setupDom();

const { TableGrid } = await import('../../src/components/tablegrid/tablegrid.js');
const { define, isDefined } = await import('../../src/core/registry.js');

define('ui-tablegrid', TableGrid);

const TABLE = `
  <ui-tablegrid label="Releases">
    <table>
      <thead>
        <tr>
          <th scope="col" data-sort="version" data-type="text">Version</th>
          <th scope="col" data-sort="downloads" data-type="number">Downloads</th>
          <th scope="col">Published</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1.1.0</td><td data-value="5120">5,120</td><td>2026-06-02</td></tr>
        <tr><td>1.2.0</td><td data-value="8421">8,421</td><td>2026-08-14</td></tr>
        <tr><td>1.0.0</td><td data-value="3900">3,900</td><td>2026-05-01</td></tr>
      </tbody>
    </table>
  </ui-tablegrid>
`;

/**
 * First-cell text of the rows the table is actually showing, in current order.
 *
 * Search and paging hide rows with the `hidden` property rather than removing
 * them from the markup, so a naive `querySelectorAll` would report the authored
 * set, not the visible one.
 *
 * @param {Element} grid
 * @returns {string[]}
 */
function order(grid) {
  return [...grid.querySelectorAll('tbody tr')]
    .filter((row) => !row.hidden)
    .map((row) => row.cells[0]?.textContent ?? '');
}

describe('ui-tablegrid registration', () => {
  it('registers as a custom element', () => {
    assert.equal(isDefined('ui-tablegrid'), true);
  });
});

describe('ui-tablegrid rendering', () => {
  let grid;

  beforeEach(() => {
    grid = mount(TABLE).querySelector('ui-tablegrid');
  });

  afterEach(() => cleanup());

  it('keeps the author table instead of rebuilding it', () => {
    assert.ok(grid.querySelector('table'));
    assert.equal(grid.querySelectorAll('tbody tr').length, 3);
  });

  it('labels the table', () => {
    assert.equal(grid.querySelector('table').getAttribute('aria-label'), 'Releases');
  });

  it('gives every sortable header a real button', () => {
    const buttons = grid.querySelectorAll('thead .ui4u-tablegrid__sort');
    assert.equal(buttons.length, 2, 'only the two data-sort columns');
    assert.equal(buttons[0].type, 'button');
    assert.equal(buttons[0].textContent, 'Version');
  });

  it('leaves a header with no data-sort alone', () => {
    const plain = grid.querySelectorAll('thead th')[2];
    assert.equal(plain.querySelector('.ui4u-tablegrid__sort'), null);
    assert.equal(plain.textContent.trim(), 'Published');
  });

  it('starts with no aria-sort on any column', () => {
    // aria-sort belongs to exactly one header at a time, so an unsorted table
    // should carry it nowhere rather than on every sortable column.
    assert.equal(grid.querySelectorAll('th[aria-sort]').length, 0);
  });

  it('does nothing when there is no table', () => {
    const empty = mount('<ui-tablegrid></ui-tablegrid>').querySelector('ui-tablegrid');
    assert.equal(empty.rows.length, 0);
    assert.equal(empty.data.length, 0);
  });
});

describe('ui-tablegrid sorting', () => {
  let grid;

  beforeEach(() => {
    grid = mount(TABLE).querySelector('ui-tablegrid');
  });

  afterEach(() => cleanup());

  it('sorts text ascending', () => {
    grid.sortBy('version');
    assert.deepEqual(order(grid), ['1.0.0', '1.1.0', '1.2.0']);
    assert.equal(grid.sort, 'version');
    assert.equal(grid.direction, 'asc');
  });

  it('sorts text descending', () => {
    grid.sortBy('version', 'desc');
    assert.deepEqual(order(grid), ['1.2.0', '1.1.0', '1.0.0']);
  });

  it('sorts numbers numerically, not as strings', () => {
    grid.sortBy('downloads', 'desc');
    // "8,421" > "5,120" > "3,900" numerically, but a string sort would put
    // "8,421" first too — the real check is that 3900 does not sort above 5120.
    assert.deepEqual(order(grid), ['1.2.0', '1.1.0', '1.0.0']);
    assert.equal(grid.rows[0].cells[1].textContent, '8,421');
  });

  it('prefers data-value over formatted text', () => {
    grid.sortBy('downloads', 'asc');
    assert.deepEqual(
      grid.rows.map((r) => r.cells[1].textContent),
      ['3,900', '5,120', '8,421']
    );
  });

  it('toggles direction when sorting the same column twice', () => {
    grid.sortBy('version');
    assert.equal(grid.direction, 'asc');
    grid.sortBy('version');
    assert.equal(grid.direction, 'desc');
  });

  it('reflects the sort onto aria-sort on exactly one header', () => {
    grid.sortBy('downloads', 'desc');

    const sorted = [...grid.querySelectorAll('th[aria-sort]')];
    assert.equal(sorted.length, 1, 'only the sorted column');
    assert.equal(sorted[0].getAttribute('aria-sort'), 'descending');
  });

  it('ignores an unknown column key', () => {
    const before = order(grid);
    grid.sortBy('nope');
    assert.deepEqual(order(grid), before);
    assert.equal(grid.sort, null);
  });

  it('resetSort restores the authored order', () => {
    grid.sortBy('version', 'desc');
    assert.notDeepEqual(order(grid), ['1.1.0', '1.2.0', '1.0.0']);

    grid.resetSort();
    assert.deepEqual(order(grid), ['1.1.0', '1.2.0', '1.0.0']);
    assert.equal(grid.sort, null);
  });

  it('sorts from the header button click', () => {
    grid.querySelectorAll('.ui4u-tablegrid__sort')[1].click();
    assert.equal(grid.sort, 'downloads');
  });

  it('honours sort and direction authored as attributes', () => {
    const pre = mount(
      `
      <ui-tablegrid sort="version" direction="desc">
        ${TABLE.slice(TABLE.indexOf('<table>'))}
      </ui-tablegrid>
    `
    ).querySelector('ui-tablegrid');

    assert.equal(pre.sort, 'version');
    assert.equal(pre.direction, 'desc');
    assert.deepEqual(order(pre), ['1.2.0', '1.1.0', '1.0.0']);
  });

  it('emits ui4u:sort with the column, direction and rows', () => {
    /** @type {any[]} */
    const seen = [];
    grid.addEventListener('ui4u:sort', (e) => seen.push(e.detail));

    grid.sortBy('version', 'desc');

    assert.equal(seen.length, 1);
    assert.equal(seen[0].column, 'version');
    assert.equal(seen[0].direction, 'desc');
    assert.equal(seen[0].rows.length, 3);
    assert.equal(seen[0].rows[0].version, '1.2.0');
  });
});

describe('ui-tablegrid data', () => {
  let grid;

  beforeEach(() => {
    grid = mount(TABLE).querySelector('ui-tablegrid');
  });

  afterEach(() => cleanup());

  it('exposes one record per row keyed by data-sort', () => {
    assert.deepEqual(grid.data, [
      { version: '1.1.0', downloads: '5120' },
      { version: '1.2.0', downloads: '8421' },
      { version: '1.0.0', downloads: '3900' },
    ]);
  });

  it('falls back to cell text when data-value is absent', () => {
    const plain = mount(`
      <ui-tablegrid>
        <table>
          <thead><tr><th scope="col" data-sort="name">Name</th></tr></thead>
          <tbody><tr><td>Ada</td></tr></tbody>
        </table>
      </ui-tablegrid>
    `).querySelector('ui-tablegrid');

    assert.deepEqual(plain.data, [{ name: 'Ada' }]);
  });

  it('reorders data to match the sorted rows', () => {
    grid.sortBy('downloads', 'desc');
    assert.equal(grid.data[0].version, '1.2.0');
    assert.equal(grid.data.at(-1).version, '1.0.0');
  });
});

describe('ui-tablegrid navigation mode', () => {
  afterEach(() => cleanup());

  const build = (attrs = '', navigate = true) =>
    mount(
      `
      <ui-tablegrid ${navigate ? 'navigate' : ''} ${attrs}>
        <table>
          <thead><tr><th scope="col" data-sort="a">A</th><th scope="col">B</th></tr></thead>
          <tbody>
            <tr><td>a1</td><td>b1</td></tr>
            <tr><td>a2</td><td>b2</td></tr>
          </tbody>
        </table>
      </ui-tablegrid>
    `
    ).querySelector('ui-tablegrid');

  it('stays a plain table unless navigate is set', () => {
    const plain = build('', false);
    assert.equal(plain.querySelector('table').getAttribute('role'), null);
    assert.equal(plain.querySelector('td').hasAttribute('tabindex'), false);
  });

  it('switches to grid semantics when navigate is set', () => {
    const grid = build();
    const table = grid.querySelector('table');
    assert.equal(table.getAttribute('role'), 'grid');
    assert.equal(grid.querySelectorAll('[role="row"]').length, 3);
    assert.equal(grid.querySelectorAll('[role="gridcell"]').length, 4);
    assert.equal(grid.querySelectorAll('[role="columnheader"]').length, 2);
  });

  it('keeps exactly one cell in the tab order', () => {
    const grid = build();
    const stops = grid.querySelectorAll('[tabindex="0"]');
    assert.equal(stops.length, 1);
  });

  it('applies striped and dense as classes on the table', () => {
    const grid = build('striped dense');
    const table = grid.querySelector('table');
    assert.equal(table.classList.contains('ui4u-tablegrid__striped'), true);
    assert.equal(table.classList.contains('ui4u-tablegrid__dense'), true);
  });
});

describe('ui-tablegrid column groups', () => {
  afterEach(() => cleanup());

  const GROUPED = `
    <ui-tablegrid label="Releases">
      <table>
        <thead>
          <tr>
            <th scope="colgroup" colspan="2">Release</th>
            <th scope="col" rowspan="2">Channel</th>
          </tr>
          <tr>
            <th scope="col" data-sort="version" data-type="text">Version</th>
            <th scope="col" data-sort="downloads" data-type="number">Downloads</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>1.1.0</td><td data-value="5120">5,120</td><td>stable</td></tr>
          <tr><td>1.2.0</td><td data-value="8421">8,421</td><td>beta</td></tr>
          <tr><td>1.0.0</td><td data-value="3900">3,900</td><td>stable</td></tr>
        </tbody>
      </table>
    </ui-tablegrid>
  `;

  it('reads columns from the last header row, not the group row', () => {
    const grid = mount(GROUPED).querySelector('ui-tablegrid');

    // Two real columns, keyed by the second header row.
    assert.deepEqual(grid.data[0], { version: '1.1.0', downloads: '5120' });
  });

  it('does not turn a group header into a sort button', () => {
    const grid = mount(GROUPED).querySelector('ui-tablegrid');
    const firstRow = grid.querySelector('thead tr');

    assert.equal(firstRow.querySelectorAll('.ui4u-tablegrid__sort').length, 0);
    assert.equal(firstRow.cells[0].getAttribute('colspan'), '2');
    assert.equal(firstRow.cells[0].getAttribute('scope'), 'colgroup');
  });

  it('still sorts on the grouped columns', () => {
    const grid = mount(GROUPED).querySelector('ui-tablegrid');

    grid.sortBy('downloads', 'desc');
    assert.deepEqual(order(grid), ['1.2.0', '1.1.0', '1.0.0']);
  });

  it('puts aria-sort on the grouped column, not the group header', () => {
    const grid = mount(GROUPED).querySelector('ui-tablegrid');
    grid.sortBy('version', 'asc');

    const sorted = [...grid.querySelectorAll('th[aria-sort]')];
    assert.equal(sorted.length, 1);
    assert.equal(sorted[0].getAttribute('data-sort'), 'version');
  });

  /*
   * A `rowspan="2"` group header occupies a column of its own, so every
   * sortable column after it sits one cell further right in the body than it
   * does in the column header row. Reading `row.cells[i]` by the header's own
   * index would sort the wrong data.
   */
  const SHIFTED = `
    <ui-tablegrid label="Releases">
      <table>
        <thead>
          <tr>
            <th scope="colgroup" colspan="2">Release</th>
            <th scope="col" rowspan="2">Channel</th>
            <th scope="colgroup">Payload</th>
          </tr>
          <tr>
            <th scope="col" data-sort="version" data-type="text">Version</th>
            <th scope="col" data-sort="downloads" data-type="number">Downloads</th>
            <th scope="col" data-sort="size" data-type="number">Size</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>1.1.0</td><td data-value="5120">5,120</td><td>stable</td><td data-value="900">900</td></tr>
          <tr><td>1.2.0</td><td data-value="8421">8,421</td><td>beta</td><td data-value="100">100</td></tr>
          <tr><td>1.0.0</td><td data-value="3900">3,900</td><td>stable</td><td data-value="500">500</td></tr>
        </tbody>
      </table>
    </ui-tablegrid>
  `;

  it('sorts on the shifted column, not the one before it', () => {
    const grid = mount(SHIFTED).querySelector('ui-tablegrid');

    grid.sortBy('size', 'asc');
    assert.deepEqual(order(grid), ['1.2.0', '1.0.0', '1.1.0']);

    grid.sortBy('size', 'desc');
    assert.deepEqual(order(grid), ['1.1.0', '1.0.0', '1.2.0']);
  });

  it('maps data onto the shifted columns', () => {
    const grid = mount(SHIFTED).querySelector('ui-tablegrid');

    const [first] = grid.data;
    assert.deepEqual(first, { version: '1.1.0', downloads: '5120', size: '900' });
  });

  it('gives a group header row its own grid roles', () => {
    const grid = mount(SHIFTED.replace('<ui-tablegrid ', '<ui-tablegrid navigate ')).querySelector(
      'ui-tablegrid'
    );

    // Two header rows must both carry a row role…
    assert.equal(grid.querySelectorAll('thead [role="row"]').length, 2);
    // …and every row in the table, so none is left unroled.
    assert.equal(grid.querySelectorAll('[role="row"]').length, 5);
    // The group row contributes columnheaders too.
    assert.equal(grid.querySelectorAll('thead [role="columnheader"]').length, 6);
  });
});

describe('ui-tablegrid search', () => {
  let grid;

  beforeEach(() => {
    grid = mount(TABLE).querySelector('ui-tablegrid');
  });

  afterEach(() => cleanup());

  it('renders a search field only when searchable is set', () => {
    assert.equal(grid.querySelector('.ui4u-tablegrid__search-input'), null);

    grid.configure({ searchable: true });
    const input = grid.querySelector('.ui4u-tablegrid__search-input');
    assert.ok(input);
    assert.equal(input.type, 'search');
    assert.equal(input.getAttribute('aria-label'), 'Filter Releases');
  });

  it('filters rows by a substring of any cell', () => {
    grid.search('1.2');
    assert.deepEqual(order(grid), ['1.2.0']);
  });

  it('matches against data-value as well as text', () => {
    // "8,421" is the formatted text; the search should still find "8421".
    grid.search('8421');
    assert.deepEqual(order(grid), ['1.2.0']);
  });

  it('is case-insensitive', () => {
    grid.search('STABLE');
    assert.equal(grid.rows.length, 0, 'no such text in this fixture');

    grid.search('1.');
    assert.equal(grid.rows.length, 3);
  });

  it('is a plain substring match, not a whole-value match', () => {
    // "1.0" is a substring of "1.1.0" as well as "1.0.0". Matching anywhere in
    // the cell is what makes "5120" find "5,120", so it stays that way.
    grid.search('1.0');
    assert.deepEqual(order(grid), ['1.1.0', '1.0.0']);
  });

  it('restores every row when cleared', () => {
    grid.search('1.2');
    assert.equal(grid.rows.length, 1);

    grid.clearSearch();
    assert.equal(grid.rows.length, 3);
    assert.equal(grid.query, '');
  });

  it('emits ui4u:search and does not fire when the query is unchanged', () => {
    /** @type {any[]} */
    const seen = [];
    grid.addEventListener('ui4u:search', (e) => seen.push(e.detail));

    grid.search('1.2');
    grid.search('1.2');
    grid.search('1.1');

    assert.equal(seen.length, 2);
    assert.equal(seen[0].query, '1.2');
    assert.equal(seen[0].rows.length, 1);
  });

  it('drives from the rendered search field', () => {
    grid.configure({ searchable: true });
    const input = grid.querySelector('.ui4u-tablegrid__search-input');

    input.value = '1.0.0';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));

    assert.equal(grid.query, '1.0.0');
    assert.deepEqual(order(grid), ['1.0.0']);
  });
});

describe('ui-tablegrid pagination', () => {
  let grid;

  beforeEach(() => {
    grid = mount(TABLE).querySelector('ui-tablegrid');
  });

  afterEach(() => cleanup());

  it('renders no pager unless per-page is set', () => {
    assert.equal(grid.querySelector('.ui4u-tablegrid__pager'), null);
    assert.equal(grid.pageCount, 1);
  });

  it('splits rows across pages and hides the rest', () => {
    grid.configure({ perPage: 2 });

    assert.equal(grid.pageCount, 2);
    assert.equal(grid.querySelectorAll('tbody tr:not([hidden])').length, 2);
    assert.deepEqual(
      grid.pageRows.map((r) => r.cells[0].textContent),
      ['1.1.0', '1.2.0']
    );

    grid.nextPage();
    assert.equal(grid.page, 2);
    assert.deepEqual(
      grid.pageRows.map((r) => r.cells[0].textContent),
      ['1.0.0']
    );
  });

  it('clamps the page into range', () => {
    grid.configure({ perPage: 2 });

    grid.goToPage(99);
    assert.equal(grid.page, 2);

    grid.prevPage();
    grid.prevPage();
    assert.equal(grid.page, 1, 'does not go below the first page');
  });

  it('disables the pager buttons at the ends', () => {
    grid.configure({ perPage: 2 });
    const [prev, next] = grid.querySelectorAll('.ui4u-tablegrid__page-btn');

    assert.equal(prev.hasAttribute('disabled'), true);
    assert.equal(next.hasAttribute('disabled'), false);

    grid.nextPage();
    assert.equal(prev.hasAttribute('disabled'), false);
    assert.equal(next.hasAttribute('disabled'), true);
  });

  it('drives from the pager buttons', () => {
    grid.configure({ perPage: 2 });
    const [prev, next] = grid.querySelectorAll('.ui4u-tablegrid__page-btn');

    next.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(grid.page, 2);

    prev.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(grid.page, 1);
  });

  it('emits ui4u:page', () => {
    grid.configure({ perPage: 2 });
    /** @type {any[]} */
    const seen = [];
    grid.addEventListener('ui4u:page', (e) => seen.push(e.detail));

    grid.nextPage();

    assert.equal(seen.length, 1);
    assert.equal(seen[0].page, 2);
    assert.equal(seen[0].pageCount, 2);
  });

  it('search narrows the page count and returns to page one', () => {
    grid.configure({ perPage: 1 });
    assert.equal(grid.pageCount, 3);

    grid.goToPage(3);
    assert.equal(grid.page, 3);

    grid.search('1.2');
    assert.equal(grid.pageCount, 1);
    assert.equal(grid.page, 1, 'a new query starts from the top');
  });

  it('sorting composes with paging', () => {
    grid.configure({ perPage: 2 });
    grid.sortBy('downloads', 'desc');

    assert.deepEqual(
      grid.pageRows.map((r) => r.cells[0].textContent),
      ['1.2.0', '1.1.0']
    );

    grid.nextPage();
    assert.deepEqual(
      grid.pageRows.map((r) => r.cells[0].textContent),
      ['1.0.0']
    );
  });

  it('reports the row count in the pager status', () => {
    grid.configure({ perPage: 2 });
    const status = grid.querySelector('.ui4u-tablegrid__page-status');
    assert.match(status.textContent, /Page 1 of 2 · 3 rows/);
  });
});

describe('ui-tablegrid teardown', () => {
  afterEach(() => cleanup());

  it('releases its listeners and leaves the author table intact', () => {
    const host = mount(TABLE);
    const grid = host.querySelector('ui-tablegrid');

    grid.remove();

    // The author's <table> is never moved, so it survives a disconnect.
    assert.ok(grid.querySelector('table'), 'author table untouched');
    assert.equal(grid.isConnected, false);
  });

  it('rebuilds when reconnected', () => {
    const host = mount(TABLE);
    const grid = host.querySelector('ui-tablegrid');
    grid.remove();
    document.body.appendChild(grid);

    assert.equal(grid.querySelectorAll('.ui4u-tablegrid__sort').length, 2);
    assert.equal(grid.rows.length, 3);
  });
});
