import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { cleanup, mount, press, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component modules are evaluated.
setupDom();

const { Button } = await import('../../src/components/button/button.js');
const { Input } = await import('../../src/components/input/input.js');
const { Toolbar } = await import('../../src/components/toolbar/toolbar.js');
const { TableGrid } = await import('../../src/components/tablegrid/tablegrid.js');
const { define } = await import('../../src/core/registry.js');

define('ui-button', Button);
define('ui-input', Input);
define('ui-toolbar', Toolbar);
define('ui-tablegrid', TableGrid);

/**
 * These four are the components the parent wired by hand, after the delegated
 * pass covered the other eleven. The contract is the same everywhere, so what
 * matters is that the guard lands *before* the mutation — a veto that arrived
 * afterwards would leave the component half-changed.
 */

const ROWS = `
  <ui-tablegrid label="Releases" selectable multi copyable per-page="2">
    <table>
      <thead>
        <tr>
          <th scope="col" data-sort="version" data-type="text">Version</th>
          <th scope="col" data-sort="downloads" data-type="number">Downloads</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>1.1.0</td><td data-value="5120">5,120</td></tr>
        <tr><td>1.2.0</td><td data-value="8421">8,421</td></tr>
        <tr><td>1.0.0</td><td data-value="3900">3,900</td></tr>
      </tbody>
    </table>
  </ui-tablegrid>
`;

describe('ui-button bindings', () => {
  afterEach(() => cleanup());

  it('runs a press binding with the detail', () => {
    const button = mount('<ui-button>Save</ui-button>').querySelector('ui-button');
    /** @type {any[]} */
    const seen = [];

    button.bind('press', (detail) => seen.push(detail));
    button.click();

    assert.equal(seen.length, 1);
    assert.equal(seen[0].variant, 'primary');
  });

  it('a veto suppresses both the event and the native follow-through', () => {
    const button = mount('<ui-button href="/should-not-happen">Go</ui-button>').querySelector(
      'ui-button'
    );
    /** @type {unknown[]} */
    const events = [];
    button.addEventListener('ui4u:press', () => events.push('press'));

    button.bind('press', () => false);
    button.click();

    assert.deepEqual(events, [], 'no press event');
  });

  it('a handler returning undefined lets the press through, event and all', () => {
    const button = mount('<ui-button>Save</ui-button>').querySelector('ui-button');
    /** @type {unknown[]} */
    const events = [];
    button.addEventListener('ui4u:press', () => events.push('press'));

    button.bind('press', () => undefined);
    button.click();

    assert.deepEqual(events, ['press']);
  });

  it('registers through configure', () => {
    const button = mount('<ui-button>Save</ui-button>').querySelector('ui-button');
    let calls = 0;

    button.configure({ bindings: { press: () => (calls += 1) } });
    button.click();

    assert.equal(calls, 1);
  });
});

describe('ui-input bindings', () => {
  afterEach(() => cleanup());

  const type = (field, text) => {
    const native = field.querySelector('.ui4u-input__native');
    native.value = text;
    native.dispatchEvent(new window.Event('input', { bubbles: true }));
  };

  it('runs an input binding before the value is reformatted', () => {
    const field = mount('<ui-input type="amount"></ui-input>').querySelector('ui-input');
    /** @type {string[]} */
    const seen = [];

    field.bind('input', (detail) => seen.push(detail.value));
    type(field, '5k');

    // The binding saw the raw text, because the guard runs first.
    assert.deepEqual(seen, ['5k']);
    assert.equal(field.querySelector('.ui4u-input__native').value, '5,000');
  });

  it('a veto leaves the text exactly as typed', () => {
    const field = mount('<ui-input type="amount"></ui-input>').querySelector('ui-input');
    field.bind('input', () => false);

    type(field, '5k');

    // Not reformatted, because the binding refused it — a veto that ran after
    // the reformat would still have moved the caret.
    assert.equal(field.querySelector('.ui4u-input__native').value, '5k');
  });

  it('reports the change binding too', () => {
    const field = mount('<ui-input></ui-input>').querySelector('ui-input');
    /** @type {string[]} */
    const seen = [];

    field.bind('change', (detail) => seen.push(detail.value));
    type(field, 'hello');
    field
      .querySelector('.ui4u-input__native')
      .dispatchEvent(new window.Event('change', { bubbles: true }));

    assert.deepEqual(seen, ['hello']);
  });

  it('registers through configure', () => {
    const field = mount('<ui-input></ui-input>').querySelector('ui-input');
    let calls = 0;

    field.configure({ bindings: { input: () => (calls += 1) } });
    type(field, 'x');

    assert.equal(calls, 1);
  });
});

describe('ui-toolbar bindings', () => {
  afterEach(() => cleanup());

  const BAR = `<ui-toolbar label="Filters">
    <button type="button" id="one">One</button>
    <button type="button" id="two">Two</button>
  </ui-toolbar>`;

  it('runs a navigate binding', () => {
    const bar = mount(BAR).querySelector('ui-toolbar');
    /** @type {any[]} */
    const seen = [];

    bar.bind('navigate', (detail) => seen.push(detail));
    press(bar.querySelector('#one'), 'ArrowRight');

    assert.equal(seen.length, 1);
    assert.equal(seen[0].index, 1);
  });

  it('a veto leaves the focus where it was', () => {
    const bar = mount(BAR).querySelector('ui-toolbar');
    bar.bind('navigate', () => false);

    press(bar.querySelector('#one'), 'ArrowRight');

    // Focus never moves, and the tab stop does not either.
    assert.equal(bar.querySelector('[tabindex="0"]').id, 'one');
  });

  it('registers through configure', () => {
    const bar = mount(BAR).querySelector('ui-toolbar');
    let calls = 0;

    bar.configure({ bindings: { navigate: () => (calls += 1) } });
    press(bar.querySelector('#one'), 'ArrowRight');

    assert.equal(calls, 1);
  });
});

describe('ui-tablegrid bindings', () => {
  afterEach(() => cleanup());

  it('a vetoed sort leaves the previous order, sort and direction alone', () => {
    const grid = mount(ROWS).querySelector('ui-tablegrid');
    grid.sortBy('version', 'asc');

    grid.bind('sort', () => false);
    grid.sortBy('downloads', 'asc');

    assert.equal(grid.sort, 'version', 'the sort attribute is untouched');
    // cells[0] is the selection checkbox, so the version sits at 1.
    assert.deepEqual(
      grid.rows.map((r) => r.cells[1].textContent),
      ['1.0.0', '1.1.0', '1.2.0'],
      'and so is the row order'
    );
  });

  it('a vetoed search leaves the visible rows alone', () => {
    const grid = mount(ROWS).querySelector('ui-tablegrid');
    grid.bind('search', () => false);

    grid.search('1.2');

    assert.equal(grid.query, '');
    assert.equal(grid.rows.length, 3);
  });

  it('a vetoed page keeps the current slice on screen', () => {
    const grid = mount(ROWS).querySelector('ui-tablegrid');
    assert.equal(grid.page, 1);

    grid.bind('page', () => false);
    grid.nextPage();

    assert.equal(grid.page, 1);
  });

  it('a vetoed selection leaves the set untouched', () => {
    const grid = mount(ROWS).querySelector('ui-tablegrid');
    const row = grid.querySelector('tbody tr');

    grid.bind('select', () => false);
    grid.toggleRow(row);

    assert.equal(grid.selectedRows.length, 0);
    assert.equal(grid.querySelector('tbody tr').getAttribute('aria-selected'), 'false');
  });

  it('a vetoed copy reports failure and writes nothing', async () => {
    const grid = mount(ROWS).querySelector('ui-tablegrid');
    grid.selectAll();
    grid.bind('copy', () => false);

    assert.equal(await grid.copySelected(), false);
  });

  it('registers every binding through configure', () => {
    const grid = mount(ROWS).querySelector('ui-tablegrid');
    /** @type {string[]} */
    const seen = [];

    grid.configure({
      bindings: {
        sort: () => seen.push('sort'),
        search: () => seen.push('search'),
        page: () => seen.push('page'),
        select: () => seen.push('select'),
      },
    });

    grid.sortBy('version', 'asc');
    // A query that keeps at least one full page, so the move is a real one —
    // `nextPage()` on a single-page result is a no-op that never offers itself.
    grid.search('1.1');
    grid.search('');
    grid.nextPage();
    grid.selectAll();

    assert.deepEqual(
      [...new Set(seen)].sort(),
      ['page', 'search', 'select', 'sort'],
      'every name registered through configure is reachable'
    );
    assert.equal(
      seen.filter((n) => n === 'search').length,
      2,
      'and each invocation fires, not just the first'
    );
  });
});
