import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { cleanup, collectChanges, mount, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component module is evaluated — see helpers/dom.js.
setupDom();

const { ALIGN_VALUES, DEFAULT_GAP, DEFAULT_MIN, GAP_TOKENS, Grid, resolveGap } = await import(
  '../../src/components/grid/grid.js'
);
const { define, isDefined } = await import('../../src/core/registry.js');

define('ui-grid', Grid);

const SAMPLE = `
  <ui-grid id="g" min="18rem" gap="md">
    <article id="a">one</article>
    <article id="b">two</article>
    <article id="c">three</article>
  </ui-grid>
`;

/** @returns {HTMLElement} */
function sample() {
  return /** @type {HTMLElement} */ (mount(SAMPLE).querySelector('#g'));
}

/** @param {HTMLElement} grid @param {string} name @returns {string} */
function prop(grid, name) {
  return grid.style.getPropertyValue(name);
}

describe('ui-grid registration', () => {
  it('registers as a custom element', () => {
    assert.equal(isDefined('ui-grid'), true);
  });
});

describe('ui-grid options', () => {
  afterEach(() => cleanup());

  it('exposes a getter for every option', () => {
    const grid = sample();
    grid.configure({
      columns: 3,
      min: '20rem',
      gap: 'lg',
      align: 'center',
      justify: 'end',
      dense: true,
    });

    assert.equal(grid.columns, 3);
    assert.equal(grid.min, '20rem');
    assert.equal(grid.gap, 'lg');
    assert.equal(grid.align, 'center');
    assert.equal(grid.justify, 'end');
    assert.equal(grid.dense, true);
  });

  it('returns this from configure()', () => {
    const grid = sample();
    assert.equal(grid.configure({ gap: 'sm' }), grid);
  });

  it('configure() only touches the options it is given', () => {
    const grid = sample();

    grid.configure({ gap: 'xl' });

    assert.equal(grid.gap, 'xl');
    assert.equal(grid.min, '18rem', 'an omitted option keeps its value');
    assert.equal(grid.columns, 0);
  });

  it('defaults columns to 0 and min to an empty string', () => {
    const host = mount('<ui-grid id="bare"><p>x</p></ui-grid>');
    const grid = /** @type {HTMLElement} */ (host.querySelector('#bare'));

    assert.equal(grid.columns, 0);
    assert.equal(grid.min, '');
    assert.equal(grid.dense, false);
    assert.equal(grid.align, 'stretch');
    assert.equal(grid.justify, 'stretch');
  });

  it('ignores a non-numeric or negative columns value', () => {
    const grid = sample();

    grid.setAttribute('columns', 'many');
    assert.equal(grid.columns, 0);

    grid.setAttribute('columns', '-2');
    assert.equal(grid.columns, 0);

    grid.setAttribute('columns', '3.7');
    assert.equal(grid.columns, 3, 'a fractional count is floored to whole tracks');
  });

  it('rejects a min that is not a plain CSS length', () => {
    const grid = sample();

    grid.setAttribute('min', 'calc(100% - 2rem)');
    assert.equal(grid.min, '');

    grid.setAttribute('min', '18rem');
    assert.equal(grid.min, '18rem');
  });

  it('falls back to safe defaults for unknown align and justify values', () => {
    const grid = sample();

    grid.setAttribute('align', 'nonsense');
    grid.setAttribute('justify', 'nonsense');

    assert.equal(grid.align, 'stretch');
    assert.equal(grid.justify, 'stretch');
    assert.deepEqual(ALIGN_VALUES, ['start', 'center', 'end', 'stretch']);
  });

  it('clears columns and min when configure() is given null', () => {
    const grid = sample();

    grid.configure({ columns: 3 });
    assert.equal(grid.mode, 'fixed');

    grid.configure({ columns: null });
    assert.equal(grid.hasAttribute('columns'), false);
    assert.equal(grid.mode, 'fluid');
  });
});

describe('ui-grid gap scale', () => {
  afterEach(() => cleanup());

  it('resolves every token name to its spacing token', () => {
    const grid = sample();

    for (const [name, token] of Object.entries(GAP_TOKENS)) {
      grid.setAttribute('gap', name);
      assert.equal(grid.gap, name);
      assert.equal(grid.gapValue, token);
      assert.equal(prop(grid, '--ui4u-grid-gap'), token);
    }
  });

  it('maps each step onto a spacing token, never a literal length', () => {
    assert.deepEqual(GAP_TOKENS, {
      xs: 'var(--ui4u-space-2)',
      sm: 'var(--ui4u-space-3)',
      md: 'var(--ui4u-space-4)',
      lg: 'var(--ui4u-space-6)',
      xl: 'var(--ui4u-space-8)',
    });

    for (const token of Object.values(GAP_TOKENS)) {
      assert.match(token, /^var\(--ui4u-space-\d\)$/);
    }
  });

  it('defaults to md', () => {
    const host = mount('<ui-grid id="g"><p>x</p></ui-grid>');
    const grid = /** @type {HTMLElement} */ (host.querySelector('#g'));

    assert.equal(DEFAULT_GAP, 'md');
    assert.equal(grid.gap, 'md');
    assert.equal(grid.gapValue, 'var(--ui4u-space-4)');
    assert.equal(prop(grid, '--ui4u-grid-gap'), 'var(--ui4u-space-4)');
  });

  it('falls back to md for an unknown step name', () => {
    const grid = sample();

    grid.setAttribute('gap', 'enormous');

    assert.equal(grid.gap, 'md');
    assert.equal(prop(grid, '--ui4u-grid-gap'), 'var(--ui4u-space-4)');
  });

  it('is case-insensitive and trims whitespace', () => {
    const grid = sample();

    grid.setAttribute('gap', '  LG  ');

    assert.equal(grid.gap, 'lg');
  });

  it('resolveGap() is usable on its own', () => {
    assert.equal(resolveGap('sm'), 'sm');
    assert.equal(resolveGap(''), 'md');
    assert.equal(resolveGap('huge'), 'md');
  });
});

describe('ui-grid modes', () => {
  afterEach(() => cleanup());

  it('is fluid by default and emits only the minimum track size', () => {
    const grid = sample();

    assert.equal(grid.mode, 'fluid');
    assert.equal(prop(grid, '--ui4u-grid-min'), '18rem');
    assert.equal(prop(grid, '--ui4u-grid-columns'), '', 'a fluid grid emits no column count');
    assert.equal(grid.dataset.mode, 'fluid');
  });

  it('falls back to the default minimum when min is absent', () => {
    const host = mount('<ui-grid id="g"><p>x</p></ui-grid>');
    const grid = /** @type {HTMLElement} */ (host.querySelector('#g'));

    assert.equal(prop(grid, '--ui4u-grid-min'), DEFAULT_MIN);
  });

  it('is fixed when columns is authored and emits the column count', () => {
    const grid = sample();

    grid.setAttribute('columns', '3');

    assert.equal(grid.mode, 'fixed');
    assert.equal(prop(grid, '--ui4u-grid-columns'), '3');
    assert.equal(prop(grid, '--ui4u-grid-min'), '', 'a fixed grid emits no minimum');
    assert.equal(grid.dataset.mode, 'fixed');
  });

  it('columns wins when both columns and min are authored', () => {
    const grid = sample();

    // The sample already carries min="18rem".
    grid.setAttribute('columns', '4');

    assert.equal(grid.mode, 'fixed');
    assert.equal(prop(grid, '--ui4u-grid-columns'), '4');
    assert.equal(prop(grid, '--ui4u-grid-min'), '');
    assert.equal(grid.min, '18rem', 'the attribute survives — only the mode changed');
  });

  it('always emits the alignment and gap properties', () => {
    const grid = sample();
    grid.configure({ columns: 2, align: 'center', justify: 'start' });

    assert.equal(prop(grid, '--ui4u-grid-align'), 'center');
    assert.equal(prop(grid, '--ui4u-grid-justify'), 'start');
    assert.equal(prop(grid, '--ui4u-grid-gap'), 'var(--ui4u-space-4)');
  });

  it('switches back to fluid when columns is removed', () => {
    const grid = sample();

    grid.setAttribute('columns', '3');
    grid.removeAttribute('columns');

    assert.equal(grid.mode, 'fluid');
    assert.equal(prop(grid, '--ui4u-grid-columns'), '');
    assert.equal(prop(grid, '--ui4u-grid-min'), '18rem');
  });

  it('reports a resolved snapshot of its options', () => {
    const grid = sample();
    grid.configure({ columns: 2, gap: 'lg' });

    assert.deepEqual(grid.snapshot(), {
      mode: 'fixed',
      columns: 2,
      min: '',
      gap: 'lg',
      align: 'stretch',
      justify: 'stretch',
      dense: false,
    });
  });

  it('emits ui4u:change when an option changes', () => {
    const grid = sample();
    const changes = collectChanges(grid);

    grid.setAttribute('gap', 'xl');

    assert.equal(changes.length, 1);
    assert.equal(changes[0].gap, 'xl');
    assert.equal(changes[0].mode, 'fluid');
  });
});

describe('ui-grid light DOM passthrough', () => {
  afterEach(() => cleanup());

  it('leaves its children as direct, untouched children', () => {
    const grid = sample();

    assert.equal(grid.children.length, 3);
    for (const id of ['#a', '#b', '#c']) {
      const child = grid.querySelector(id);
      assert.ok(child, `${id} survives`);
      assert.equal(child.parentElement, grid, `${id} is never re-parented`);
    }
    assert.equal(grid.querySelector('#a').textContent, 'one');
  });

  it('adds no wrapper element around the content', () => {
    const grid = sample();
    assert.equal(grid.firstElementChild.id, 'a');
    assert.equal(grid.lastElementChild.id, 'c');
  });

  it('imposes no roles or aria attributes on the content', () => {
    const grid = sample();

    for (const child of grid.children) {
      assert.equal(child.getAttribute('role'), null);
      assert.equal(child.getAttribute('aria-label'), null);
    }
  });

  it('is empty and happy without children', () => {
    const host = mount('<ui-grid id="g" columns="2"></ui-grid>');
    const grid = /** @type {HTMLElement} */ (host.querySelector('#g'));

    assert.equal(grid.children.length, 0);
    assert.equal(grid.mode, 'fixed');
  });
});

describe('ui-grid labelling', () => {
  afterEach(() => cleanup());

  it('stays an unroled container when no label is supplied', () => {
    const grid = sample();

    assert.equal(grid.label, '');
    assert.equal(grid.hasAttribute('role'), false);
    assert.equal(grid.hasAttribute('aria-label'), false);
  });

  it('becomes a labelled region when a label is supplied', () => {
    const host = mount('<ui-grid id="g" label="Feature cards"><p>x</p></ui-grid>');
    const grid = /** @type {HTMLElement} */ (host.querySelector('#g'));

    assert.equal(grid.getAttribute('role'), 'region');
    assert.equal(grid.getAttribute('aria-label'), 'Feature cards');
  });

  it('drops the region again when the label is removed', () => {
    const host = mount('<ui-grid id="g" label="Cards"><p>x</p></ui-grid>');
    const grid = /** @type {HTMLElement} */ (host.querySelector('#g'));

    grid.removeAttribute('label');

    assert.equal(grid.hasAttribute('role'), false);
    assert.equal(grid.hasAttribute('aria-label'), false);
  });

  it('never clobbers a role the author set themselves', () => {
    const host = mount('<ui-grid id="g" role="list" label="Cards"><p>x</p></ui-grid>');
    const grid = /** @type {HTMLElement} */ (host.querySelector('#g'));

    assert.equal(grid.getAttribute('role'), 'list');
    assert.equal(grid.getAttribute('aria-label'), 'Cards');
  });
});

describe('ui-grid teardown', () => {
  afterEach(() => cleanup());

  it('re-applies cleanly after a reconnect', () => {
    const grid = sample();

    grid.remove();
    document.body.appendChild(grid);

    assert.equal(grid.dataset.mode, 'fluid');
    assert.equal(prop(grid, '--ui4u-grid-min'), '18rem');
    assert.equal(grid.children.length, 3, 'the content was never disturbed');
  });
});