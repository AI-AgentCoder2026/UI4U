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

/** Single-select fixture: a third column that no sort key points at. */
const SINGLE = `
  <ui-tablegrid label="Releases" selectable copyable>
    <table>
      <thead>
        <tr>
          <th scope="col" data-sort="version" data-type="text">Version</th>
          <th scope="col" data-sort="downloads" data-type="number">Downloads</th>
          <th scope="col" data-sort="channel">Channel</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1.1.0</td><td data-value="5120">5,120</td><td>stable</td></tr>
        <tr><td>1.2.0</td><td data-value="8421">8,421</td><td>stable</td></tr>
        <tr><td>1.0.0</td><td data-value="3900">3,900</td><td>stable</td></tr>
      </tbody>
    </table>
  </ui-tablegrid>
`;

/** Multi-select fixture: the middle row differs, so ranges are observable. */
const MULTI = `
  <ui-tablegrid label="Releases" selectable multi>
    <table>
      <thead>
        <tr>
          <th scope="col" data-sort="version" data-type="text">Version</th>
          <th scope="col" data-sort="downloads" data-type="number">Downloads</th>
          <th scope="col" data-sort="channel">Channel</th>
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

/**
 * Advanced-search fixture: a text field, a numeric one, and a plain one.
 *
 * The `640` row matters — it is shorter than the filter values it is compared
 * against, so a string comparison and a numeric one disagree about it.
 */
const ADVANCED = `
  <ui-tablegrid label="Releases" advanced-search>
    <table>
      <thead>
        <tr>
          <th scope="col" data-sort="version" data-type="text">Version</th>
          <th scope="col" data-sort="downloads" data-type="number">Downloads</th>
          <th scope="col" data-sort="channel">Channel</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1.1.0</td><td data-value="5120">5,120</td><td>stable</td></tr>
        <tr><td>1.2.0</td><td data-value="8421">8,421</td><td>beta</td></tr>
        <tr><td>1.0.0</td><td data-value="3900">3,900</td><td>stable</td></tr>
        <tr><td>1.3.0</td><td data-value="640">640</td><td>rc</td></tr>
      </tbody>
    </table>
  </ui-tablegrid>
`;

/**
 * Group headers *and* the selection column at once.
 *
 * The two shifting mechanisms overlap here: the checkbox column adds one, the
 * `rowspan` group header adds another from a different direction. Between them
 * they are what a naive `row.cells[i]` read gets wrong.
 */
const GROUPED_SELECTABLE = `
  <ui-tablegrid label="Releases" selectable copyable>
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

/** The same shape without the checkbox column, for searching a headerless column. */
const GROUPED_SEARCHABLE = `
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
    .map((row) => {
      // The selection checkbox is the first cell when `selectable` is on, so
      // the first *data* cell is what identifies the row.
      const cell = [...row.cells].find((c) => !c.classList.contains('ui4u-tablegrid__select-cell'));
      return cell?.textContent ?? '';
    });
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

  it('leaves no chrome behind across repeated rebuilds', () => {
    // Every rebuild-triggering attribute has to undo its own DOM. Missing one
    // stacks a stray element each time, which is invisible until it is dozens
    // of pixels of gap.
    const grid = mount(SINGLE).querySelector('ui-tablegrid');
    grid.configure({ searchable: true, advancedSearch: true, perPage: 2 });

    for (let i = 0; i < 3; i += 1) {
      grid.toggleAttribute('navigate');
      grid.toggleAttribute('navigate');
    }

    assert.equal(grid.querySelectorAll('.ui4u-tablegrid__toolbar').length, 1);
    assert.equal(grid.querySelectorAll('.ui4u-tablegrid__copy').length, 1);
    assert.equal(grid.querySelectorAll('.ui4u-tablegrid__filters').length, 1);
    assert.equal(grid.querySelectorAll('.ui4u-tablegrid__pager').length, 1);
    assert.equal(grid.querySelectorAll('.ui4u-tablegrid__select-cell').length, 3);
    assert.equal(grid.querySelectorAll('.ui4u-tablegrid__select-head').length, 1);
    assert.equal(grid.querySelectorAll('.ui4u-tablegrid__sort').length, 3);
  });
});

/* --- selection ----------------------------------------------------------- */

describe('ui-tablegrid selection', () => {
  let grid;

  beforeEach(() => {
    grid = mount(SINGLE).querySelector('ui-tablegrid');
  });

  afterEach(() => cleanup());

  /** @returns {HTMLInputElement[]} the per-row checkboxes */
  const boxes = () => [...grid.querySelectorAll('.ui4u-tablegrid__select-cell input')];

  /** A click on a row's data area — not on its checkbox cell. */
  const clickRow = (row, init = {}) => {
    const cell = [...row.cells].find((c) => !c.classList.contains('ui4u-tablegrid__select-cell'));
    cell.dispatchEvent(new window.MouseEvent('click', { bubbles: true, ...init }));
  };

  it('renders a checkbox per row and one in the header', () => {
    assert.equal(boxes().length, 3);
    assert.equal(grid.querySelectorAll('.ui4u-tablegrid__select-head input').length, 1);
    assert.equal(boxes()[0].type, 'checkbox');
  });

  it('spans the header checkbox over every header row', () => {
    // SINGLE has one header row; the grouped fixture is where it must reach two.
    assert.equal(grid.querySelector('.ui4u-tablegrid__select-head').rowSpan, 1);

    const grouped = mount(GROUPED_SELECTABLE).querySelector('ui-tablegrid');
    assert.equal(grouped.querySelector('.ui4u-tablegrid__select-head').rowSpan, 2);
  });

  it('is off entirely unless selectable is set', () => {
    const plain = mount(TABLE).querySelector('ui-tablegrid');
    assert.equal(plain.querySelector('.ui4u-tablegrid__select-head'), null);
    assert.equal(plain.hasSelection, false);
  });

  it('selects a single row on click and replaces the previous one', () => {
    const rows = grid.querySelectorAll('tbody tr');

    clickRow(rows[0]);
    assert.equal(grid.isSelected(rows[0]), true);
    assert.equal(grid.selectedRows.length, 1);

    clickRow(rows[2]);
    assert.equal(grid.selectedRows.length, 1);
    assert.equal(grid.isSelected(rows[0]), false);
    assert.equal(grid.isSelected(rows[2]), true);
  });

  it('marks selected rows with aria-selected', () => {
    const row = grid.querySelector('tbody tr');
    clickRow(row);
    assert.equal(row.getAttribute('aria-selected'), 'true');
  });

  it('keeps the checkbox and the row state in step', () => {
    const row = grid.querySelector('tbody tr');
    clickRow(row);
    assert.equal(boxes()[0].checked, true);

    clickRow(row);
    assert.equal(boxes()[0].checked, false);
    assert.equal(row.getAttribute('aria-selected'), 'false');
  });

  it('clears and selects everything through the API', () => {
    grid.selectAll();
    assert.equal(grid.selectedRows.length, 3);
    assert.equal(grid.hasSelection, true);

    grid.clearSelection();
    assert.equal(grid.selectedRows.length, 0);
    assert.equal(grid.hasSelection, false);
  });

  it('drives from the header checkbox and shows the indeterminate state', () => {
    const master = grid.querySelector('.ui4u-tablegrid__select-head input');

    grid.selectRow(grid.querySelector('tbody tr'));
    assert.equal(master.checked, false);
    assert.equal(master.indeterminate, true, 'one of three is "some"');

    master.checked = true;
    master.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(grid.selectedRows.length, 3);
    assert.equal(master.indeterminate, false);
  });

  it('selects only the rows that survive a search', () => {
    grid.search('1.2');
    grid.selectAll();
    assert.equal(grid.selectedRows.length, 1);
  });

  it('does not change the author row count', () => {
    assert.equal(grid.querySelectorAll('tbody tr').length, 3);
  });

  it('emits ui4u:select with the count and records', () => {
    /** @type {any[]} */
    const seen = [];
    grid.addEventListener('ui4u:select', (e) => seen.push(e.detail));

    grid.selectRow(grid.querySelector('tbody tr'));
    grid.selectAll();

    assert.deepEqual(
      seen.map((d) => d.count),
      [1, 3]
    );
    assert.equal(seen[1].data.length, 3);
    assert.equal(seen[1].rows.length, 3);
  });

  it('stays quiet when selection is turned off', () => {
    const plain = mount(TABLE).querySelector('ui-tablegrid');
    let fired = 0;
    plain.addEventListener('ui4u:select', () => (fired += 1));

    plain.selectRow(plain.querySelector('tbody tr'));
    plain.selectAll();
    assert.equal(fired, 0);
  });
});

describe('ui-tablegrid multi-select', () => {
  let grid;

  beforeEach(() => {
    grid = mount(MULTI).querySelector('ui-tablegrid');
  });

  afterEach(() => cleanup());

  const rows = () => [...grid.querySelectorAll('tbody tr')];

  const clickRow = (row, init = {}) => {
    const cell = [...row.cells].find((c) => !c.classList.contains('ui4u-tablegrid__select-cell'));
    cell.dispatchEvent(new window.MouseEvent('click', { bubbles: true, ...init }));
  };

  it('keeps earlier rows when a later one is Ctrl-clicked', () => {
    clickRow(rows()[0]);
    clickRow(rows()[2], { ctrlKey: true });

    assert.equal(grid.selectedRows.length, 2);
  });

  it('extends from the anchor on Shift-click', () => {
    clickRow(rows()[0]);
    clickRow(rows()[2], { shiftKey: true });

    assert.equal(grid.selectedRows.length, 3);
  });

  it('selects a backwards range too', () => {
    clickRow(rows()[2]);
    clickRow(rows()[0], { shiftKey: true });

    assert.equal(grid.selectedRows.length, 3);
  });

  it('replaces rather than accumulates on a plain click', () => {
    clickRow(rows()[0]);
    clickRow(rows()[1]);

    assert.equal(grid.selectedRows.length, 1);
    assert.equal(grid.isSelected(rows()[1]), true);
  });

  it('reports selected rows in sort order, not click order', () => {
    const all = rows();
    clickRow(all[2]);
    clickRow(all[0], { ctrlKey: true });

    grid.sortBy('version', 'asc');

    // Map each selected row to its position in the table's visible order.
    const position = new Map(all.map((row, i) => [row, i]));
    const labels = grid.selectedRows.map((row) => {
      const cell = [...row.cells].find((c) => !c.classList.contains('ui4u-tablegrid__select-cell'));
      return `${cell.textContent}@${position.get(row)}`;
    });

    assert.deepEqual(labels, ['1.0.0@2', '1.1.0@0']);
  });
});

/* --- copy ---------------------------------------------------------------- */

describe('ui-tablegrid copy', () => {
  let grid;
  /** @type {Array<{ text: string, copied: boolean }>} */
  let copied;

  beforeEach(() => {
    grid = mount(SINGLE).querySelector('ui-tablegrid');
    copied = [];
    grid.addEventListener('ui4u:copy', (e) => copied.push(e.detail));
  });

  afterEach(() => cleanup());

  it('renders a disabled copy button until something is selected', () => {
    const button = grid.querySelector('.ui4u-tablegrid__copy');
    assert.ok(button);
    assert.equal(button.disabled, true);

    grid.selectRow(grid.querySelector('tbody tr'));
    assert.equal(button.disabled, false);
  });

  it('copies tab-separated text with a header row', async () => {
    grid.selectRow(grid.querySelector('tbody tr'));

    assert.equal(
      grid.selectedText,
      ['Version\tDownloads\tChannel', '1.1.0\t5120\tstable'].join('\n')
    );
  });

  it('copies the real value, not the formatted one', () => {
    grid.selectAll();
    assert.ok(grid.selectedText.includes('8421'), 'data-value beats "8,421"');
  });

  it('exposes the selection as records', () => {
    grid.selectAll();
    assert.deepEqual(grid.selectedData[1], {
      version: '1.2.0',
      downloads: '8421',
      channel: 'stable',
    });
  });

  it('emits ui4u:copy with the payload', async () => {
    grid.selectAll();
    await grid.copySelected();

    assert.equal(copied.length, 1);
    assert.equal(copied[0].rows.length, 3);
    assert.ok(copied[0].text.includes('Version'));
  });

  it('reports failure instead of copying nothing when nothing is selected', async () => {
    assert.equal(await grid.copySelected(), false);
    assert.equal(copied.length, 1);
    assert.equal(copied[0].copied, false);
  });

  it('has nothing to copy with no selection', () => {
    assert.equal(grid.selectedText, '');
  });

  it('copies nothing when copyable is off', () => {
    const plain = mount(TABLE).querySelector('ui-tablegrid');
    assert.equal(plain.querySelector('.ui4u-tablegrid__copy'), null);
  });
});

/* --- advanced search ----------------------------------------------------- */

describe('ui-tablegrid advanced search', () => {
  let grid;

  beforeEach(() => {
    grid = mount(ADVANCED).querySelector('ui-tablegrid');
  });

  afterEach(() => cleanup());

  it('renders one row per criterion plus an add button', () => {
    grid.setFilters([{ field: 'channel', operator: 'equals', value: 'beta' }]);

    assert.equal(grid.querySelectorAll('.ui4u-tablegrid__filter').length, 1);
    assert.ok(grid.querySelector('.ui4u-tablegrid__filter-add'));
  });

  it('filters on one field', () => {
    grid.setFilters([{ field: 'channel', operator: 'equals', value: 'beta' }]);
    assert.deepEqual(order(grid), ['1.2.0']);
  });

  it('filters on any column', () => {
    grid.setFilters([{ field: '*', operator: 'contains', value: '1.0' }]);
    assert.deepEqual(order(grid), ['1.1.0', '1.0.0']);
  });

  it('combines criteria with AND', () => {
    grid.setFilters([
      { field: 'channel', operator: 'equals', value: 'stable' },
      { field: 'downloads', operator: 'gt', value: '4000' },
    ]);
    assert.deepEqual(order(grid), ['1.1.0'], 'stable AND over 4000 is only 1.1.0');
  });

  it('compares a numeric column numerically, not as text', () => {
    grid.setFilters([{ field: 'downloads', operator: 'lt', value: '1200' }]);
    // 640 is under 1200. As text, "640" > "1200" because '6' sorts after '1',
    // so this is the assertion that pins the comparison to numbers.
    assert.deepEqual(order(grid), ['1.3.0']);
  });

  it('supports the range operators', () => {
    grid.setFilters([{ field: 'downloads', operator: 'gte', value: '8000' }]);
    assert.deepEqual(order(grid), ['1.2.0']);

    grid.setFilters([{ field: 'downloads', operator: 'lte', value: '4000' }]);
    assert.deepEqual(order(grid), ['1.0.0', '1.3.0']);
  });

  it('supports the string operators', () => {
    grid.setFilters([{ field: 'version', operator: 'starts-with', value: '1.1' }]);
    assert.deepEqual(order(grid), ['1.1.0']);

    grid.setFilters([{ field: 'version', operator: 'ends-with', value: '2.0' }]);
    assert.deepEqual(order(grid), ['1.2.0']);

    grid.setFilters([{ field: 'channel', operator: 'not-contains', value: 'sta' }]);
    assert.deepEqual(order(grid), ['1.2.0', '1.3.0']);
  });

  it('ignores a criterion with no value', () => {
    // "Add filter" produces an empty row; it must not empty the table with it.
    grid.setFilters([{ field: 'channel', operator: 'equals', value: '' }]);
    assert.equal(grid.filters.length, 1, 'the draft row is kept');
    assert.equal(grid.rows.length, 4);
  });

  it('adds and removes one criterion at a time', () => {
    grid.setFilters([{ field: 'channel', operator: 'equals', value: 'beta' }]);
    grid.addFilter({ field: 'version', operator: 'starts-with', value: '1.2' });
    assert.equal(grid.filters.length, 2);
    assert.deepEqual(order(grid), ['1.2.0']);

    grid.removeFilter(0);
    assert.equal(grid.filters.length, 1);
    assert.deepEqual(order(grid), ['1.2.0'], 'only the version criterion is left');

    grid.clearFilters();
    assert.equal(grid.rows.length, 4);
  });

  it('resets to the first page when a criterion changes', () => {
    grid.configure({ perPage: 1 });
    grid.nextPage();
    assert.equal(grid.page, 2);

    grid.setFilters([{ field: 'channel', operator: 'equals', value: 'stable' }]);
    assert.equal(grid.page, 1);
  });

  it('drives from the rendered controls', () => {
    grid
      .querySelector('.ui4u-tablegrid__filter-add')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const field = grid.querySelector('.ui4u-tablegrid__filter-field');
    const operator = grid.querySelector('.ui4u-tablegrid__filter-op');
    const value = grid.querySelector('.ui4u-tablegrid__filter-value');

    field.value = 'channel';
    field.dispatchEvent(new window.Event('change', { bubbles: true }));
    operator.value = 'equals';
    operator.dispatchEvent(new window.Event('change', { bubbles: true }));
    value.value = 'stable';
    value.dispatchEvent(new window.Event('input', { bubbles: true }));

    assert.deepEqual(order(grid), ['1.1.0', '1.0.0']);
  });

  it('offers every sortable field plus any-column', () => {
    // The row only exists once there is a criterion to show it on.
    grid.addFilter({ field: '*', operator: 'contains', value: 'x' });

    const options = [...grid.querySelectorAll('.ui4u-tablegrid__filter-field option')].map(
      (o) => o.value
    );

    assert.deepEqual(options, ['*', 'version', 'downloads', 'channel']);
  });

  it('has no filter bar unless advanced-search is set', () => {
    const plain = mount(TABLE).querySelector('ui-tablegrid');
    assert.equal(plain.querySelector('.ui4u-tablegrid__filters'), null);
  });

  it('reaches a column that has no header cell of its own', () => {
    // `Channel` lives entirely in the group row under a `rowspan`, so it has no
    // cell in the column header row. It is still a visible column, so the quick
    // filter and "Any column" both have to reach it.
    const grid = mount(GROUPED_SEARCHABLE).querySelector('ui-tablegrid');

    grid.search('beta');
    assert.deepEqual(order(grid), ['1.2.0']);

    grid.clearSearch();
    grid.setFilters([{ field: '*', operator: 'equals', value: 'beta' }]);
    assert.deepEqual(order(grid), ['1.2.0']);
  });

  it('reaches that column with the selection column present too', () => {
    const grid = mount(GROUPED_SELECTABLE).querySelector('ui-tablegrid');

    grid.search('beta');
    assert.deepEqual(order(grid), ['1.2.0']);

    grid.setFilters([{ field: '*', operator: 'equals', value: 'beta' }]);
    assert.deepEqual(order(grid), ['1.2.0']);
  });

  it('ignores a malformed filters attribute rather than throwing', () => {
    const broken = mount(TABLE.replace('label="Releases"', 'filters="{oops"'));
    assert.equal(broken.querySelector('ui-tablegrid').rows.length, 3);
  });
});

/* --- configurability ----------------------------------------------------- */

describe('ui-tablegrid configuration', () => {
  afterEach(() => cleanup());

  it('turns every feature on and off through configure()', () => {
    const grid = mount(TABLE).querySelector('ui-tablegrid');

    grid.configure({
      searchable: true,
      advancedSearch: true,
      selectable: true,
      multi: true,
      copyable: true,
      perPage: 2,
      striped: true,
      dense: true,
    });

    assert.ok(grid.querySelector('.ui4u-tablegrid__search-input'));
    assert.ok(grid.querySelector('.ui4u-tablegrid__filters'));
    assert.ok(grid.querySelector('.ui4u-tablegrid__select-head'));
    assert.ok(grid.querySelector('.ui4u-tablegrid__copy'));
    assert.ok(grid.querySelector('.ui4u-tablegrid__pager'));

    grid.configure({
      searchable: false,
      advancedSearch: false,
      selectable: false,
      copyable: false,
    });
    assert.equal(grid.querySelector('.ui4u-tablegrid__search-input'), null);
    assert.equal(grid.querySelector('.ui4u-tablegrid__filters'), null);
    assert.equal(grid.querySelector('.ui4u-tablegrid__select-head'), null);
    assert.equal(grid.querySelector('.ui4u-tablegrid__copy'), null);
  });

  it('honours a custom search placeholder', () => {
    const grid = mount(TABLE).querySelector('ui-tablegrid');
    grid.configure({ searchable: true, searchPlaceholder: 'Find a release' });

    assert.equal(grid.querySelector('.ui4u-tablegrid__search-input').placeholder, 'Find a release');
  });

  it('honours a custom copy label', () => {
    const grid = mount(TABLE).querySelector('ui-tablegrid');
    grid.configure({ copyable: true });
    grid.setAttribute('copy-label', 'Copy rows');

    assert.equal(grid.copyLabel, 'Copy rows');
  });

  it('hides the header checkbox when select-all is off', () => {
    const grid = mount(TABLE).querySelector('ui-tablegrid');
    grid.configure({ selectable: true, selectAllHeader: false });

    const head = grid.querySelector('.ui4u-tablegrid__select-head');
    assert.equal(head.hasAttribute('hidden'), true);
  });

  it('reads filters from the attribute as JSON', () => {
    const html = TABLE.replace(
      'label="Releases"',
      'filters=\' [{"field":"downloads","operator":"gte","value":"8000"}] \''
    );
    const grid = mount(html).querySelector('ui-tablegrid');

    assert.deepEqual(grid.filters, [{ field: 'downloads', operator: 'gte', value: '8000' }]);
    assert.deepEqual(order(grid), ['1.2.0']);
  });

  it('keeps sorting correct once the selection column shifts everything', () => {
    const grid = mount(GROUPED_SELECTABLE).querySelector('ui-tablegrid');

    // The checkbox column pushes every body column right by one, and the group
    // row's rowspan pushes some of them further. Sorting must still land on the
    // right data.
    grid.sortBy('downloads', 'asc');
    assert.deepEqual(order(grid), ['1.0.0', '1.1.0', '1.2.0']);

    // Sizes are 900 / 100 / 500, so descending is 1.1.0, 1.0.0, 1.2.0.
    grid.sortBy('size', 'desc');
    assert.deepEqual(order(grid), ['1.1.0', '1.0.0', '1.2.0']);
  });

  it('still reads data correctly with the selection column present', () => {
    const grid = mount(GROUPED_SELECTABLE).querySelector('ui-tablegrid');
    // `Channel` lives in the group row with a rowspan, so it is not one of the
    // header row's columns and carries no data-sort key.
    assert.deepEqual(grid.data[0], {
      version: '1.1.0',
      downloads: '5120',
      size: '900',
    });
  });

  it('filters correctly with the selection column present', () => {
    const grid = mount(GROUPED_SELECTABLE).querySelector('ui-tablegrid');
    grid.setFilters([{ field: 'size', operator: 'gt', value: '700' }]);
    assert.deepEqual(order(grid), ['1.1.0']);
  });
});

/* --- rows added after connect -------------------------------------------- */

describe('ui-tablegrid dynamic rows', () => {
  afterEach(() => cleanup());

  const EMPTY = `
    <ui-tablegrid label="Releases" per-page="2">
      <table>
        <thead>
          <tr>
            <th scope="col" data-sort="version" data-type="text">Version</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </ui-tablegrid>
  `;

  it('picks up rows appended after it connected', async () => {
    const grid = mount(EMPTY).querySelector('ui-tablegrid');
    const body = grid.querySelector('tbody');

    for (const version of ['1.0.0', '1.1.0', '1.2.0']) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.textContent = version;
      row.appendChild(cell);
      body.appendChild(row);
    }

    // The observer runs on a microtask, so let it settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(grid.rows.length, 3);
    assert.deepEqual(
      grid.rows.map((r) => r.cells[0].textContent),
      ['1.0.0', '1.1.0', '1.2.0']
    );
  });

  it('picks up rows appended after it connected, when there is no observer', async () => {
    // jsdom has no MutationObserver, so the component cannot self-heal there.
    // What matters without one is that a rebuild still sees the rows.
    const grid = mount(EMPTY).querySelector('ui-tablegrid');
    const body = grid.querySelector('tbody');

    for (const version of ['1.0.0', '1.1.0']) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.textContent = version;
      row.appendChild(cell);
      body.appendChild(row);
    }

    grid.toggleAttribute('navigate');
    grid.toggleAttribute('navigate');

    assert.equal(grid.rows.length, 2);
  });

  it('forgets rows that were removed', async () => {
    const grid = mount(EMPTY).querySelector('ui-tablegrid');
    const body = grid.querySelector('tbody');

    for (const version of ['1.0.0', '1.1.0', '1.2.0']) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.textContent = version;
      row.appendChild(cell);
      body.appendChild(row);
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(grid.rows.length, 3);

    body.lastElementChild.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(grid.rows.length, 2);
  });
});
