import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, describe, it } from 'node:test';

import { cleanup, mount, press, setupDom } from '../helpers/dom.js';

setupDom();

/**
 * jsdom has no layout engine, so every rect is 0x0 and size maths would be
 * untestable. Resolve declared widths instead: `240px` -> 240, `16rem` -> 256.
 */
const REM = 16;
const originalRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function stub() {
  const width = this.style?.width ?? '';
  const height = this.style?.height ?? '';
  const parse = (value) => {
    const match = /^(-?[\d.]+)(px|rem)?$/.exec(value.trim());
    if (!match) return 0;
    return Number.parseFloat(match[1]) * (match[2] === 'rem' ? REM : 1);
  };
  return {
    width: parse(width),
    height: parse(height),
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    x: 0,
    y: 0,
  };
};

const { Layout, Panel } = await import('../../src/components/layout/layout.js');
const { define, isDefined } = await import('../../src/core/registry.js');

define('ui-layout', Layout);
define('ui-panel', Panel);

after(() => {
  Element.prototype.getBoundingClientRect = originalRect;
});

const FULL = `
  <ui-layout>
    <ui-panel slot="top" label="Header" size="40" min="20" max="120" resizable>Header</ui-panel>
    <ui-panel slot="left" label="Sidebar" size="240" min="160" max="400" resizable collapsible>Nav</ui-panel>
    <ui-panel slot="center" label="Workspace">Main</ui-panel>
    <ui-panel slot="right" label="Inspector" size="200" min="120" max="320" resizable>Aside</ui-panel>
    <ui-panel slot="bottom" label="Status" size="60" resizable>Status</ui-panel>
  </ui-layout>
`;

/** @returns {HTMLElement[]} every separator in the layout */
function splittersOf(layout) {
  return [...layout.querySelectorAll('[role="separator"]')];
}

/** @param {HTMLElement} layout @param {'column'|'row'} axis */
function splittersOn(layout, axis) {
  return [...layout.querySelectorAll(`:scope > .ui4u-layout__splitter--${axis}`)];
}

describe('ui-layout registration', () => {
  it('registers both custom elements', () => {
    assert.equal(isDefined('ui-layout'), true);
    assert.equal(isDefined('ui-panel'), true);
  });
});

describe('ui-layout grid generation', () => {
  afterEach(() => cleanup());

  it('places every panel into its named grid area', () => {
    const layout = mount(FULL).querySelector('ui-layout');

    assert.equal(layout.querySelector('ui-panel[slot="top"]').style.gridArea, 'top');
    assert.equal(layout.querySelector('ui-panel[slot="left"]').style.gridArea, 'left');
    assert.equal(layout.querySelector('ui-panel[slot="center"]').style.gridArea, 'center');
    assert.equal(layout.querySelector('ui-panel[slot="bottom"]').style.gridArea, 'bottom');
  });

  it('emits a five-row template when every slot is present', () => {
    const layout = mount(FULL).querySelector('ui-layout');
    const areas = layout.style.gridTemplateAreas;

    // top | gutter | middle | gutter | bottom
    assert.equal(areas.split('"').length - 1, 10, 'five quoted rows');
    assert.match(areas, /"top top top top top"/);
    assert.match(areas, /"sp-t sp-t sp-t sp-t sp-t"/);
    assert.match(areas, /"left sp-l center sp-r right"/);
    assert.match(areas, /"sp-b sp-b sp-b sp-b sp-b"/);
    assert.match(areas, /"bottom bottom bottom bottom bottom"/);
  });

  it('sizes the flexible middle track with 1fr', () => {
    const layout = mount(FULL).querySelector('ui-layout');
    assert.match(layout.style.gridTemplateColumns, /minmax\(0, 1fr\)/);
    assert.match(layout.style.gridTemplateRows, /minmax\(0, 1fr\)/);
  });

  it('omits splitters and tracks for absent slots', () => {
    const layout = mount(`
      <ui-layout>
        <ui-panel slot="center">Only the middle</ui-panel>
      </ui-layout>
    `).querySelector('ui-layout');

    assert.equal(splittersOf(layout).length, 0);
    assert.equal(layout.style.gridTemplateColumns, 'minmax(0, 1fr)');
    assert.equal(layout.style.gridTemplateAreas, '"center"');
  });

  it('builds a template for left + right without a center panel', () => {
    const layout = mount(`
      <ui-layout>
        <ui-panel slot="left" size="200">L</ui-panel>
        <ui-panel slot="right" size="200">R</ui-panel>
      </ui-layout>
    `).querySelector('ui-layout');

    assert.equal(splittersOf(layout).length, 1);
    assert.match(layout.style.gridTemplateAreas, /"left sp-l center sp-r right"/);
  });

  it('labels the layout region and every panel', () => {
    const layout = mount(FULL).querySelector('ui-layout');

    assert.equal(layout.getAttribute('role'), 'region');
    assert.ok(layout.getAttribute('aria-label'));
    assert.equal(
      layout.querySelector('ui-panel[slot="left"]').getAttribute('aria-label'),
      'Sidebar'
    );
  });

  it('does nothing when there are no panels', () => {
    const layout = mount('<ui-layout></ui-layout>').querySelector('ui-layout');
    assert.equal(splittersOf(layout).length, 0);
    assert.equal(layout.style.gridTemplateAreas, '');
  });
});

describe('ui-layout splitters', () => {
  let layout;
  let splitters;

  beforeEach(() => {
    layout = mount(FULL).querySelector('ui-layout');
    splitters = splittersOf(layout);
  });

  afterEach(() => cleanup());

  it('creates one separator per gap on both axes', () => {
    // left | center | right -> two column separators
    assert.equal(splittersOn(layout, 'column').length, 2);
    // top | center | bottom -> two row separators
    assert.equal(splittersOn(layout, 'row').length, 2);
    assert.equal(splitters.length, 4);
  });

  it('makes every separator a focusable, correctly-oriented element', () => {
    for (const splitter of splitters) {
      assert.equal(splitter.tagName, 'DIV');
      assert.equal(splitter.tabIndex, 0);
      assert.ok(splitter.getAttribute('aria-label'));
      assert.ok(splitter.getAttribute('aria-valuenow'));
    }

    for (const splitter of splittersOn(layout, 'column')) {
      assert.equal(splitter.getAttribute('aria-orientation'), 'vertical');
    }
    for (const splitter of splittersOn(layout, 'row')) {
      assert.equal(splitter.getAttribute('aria-orientation'), 'horizontal');
    }
  });

  it('positions each separator in the gutter between its regions', () => {
    assert.deepEqual(
      splittersOn(layout, 'column').map((s) => s.style.gridArea),
      ['sp-l', 'sp-r']
    );
    assert.deepEqual(
      splittersOn(layout, 'row').map((s) => s.style.gridArea),
      ['sp-t', 'sp-b']
    );
  });

  it('exposes the current size through aria-valuenow', () => {
    assert.equal(splittersOn(layout, 'column')[0].getAttribute('aria-valuenow'), '240');
    assert.equal(splittersOn(layout, 'row')[0].getAttribute('aria-valuenow'), '40');
  });
});

describe('ui-layout row separators', () => {
  let layout;

  beforeEach(() => {
    layout = mount(FULL).querySelector('ui-layout');
  });

  afterEach(() => cleanup());

  const topHeight = () => layout.panel('top').current;
  const bottomHeight = () => layout.panel('bottom').current;

  it('grows the top panel with ArrowDown', () => {
    const before = topHeight();
    press(splittersOn(layout, 'row')[0], 'ArrowDown');
    assert.equal(topHeight(), before + 16);
  });

  it('shrinks the top panel with ArrowUp', () => {
    const before = topHeight();
    press(splittersOn(layout, 'row')[0], 'ArrowUp');
    assert.equal(topHeight(), before - 16);
  });

  it('ignores the horizontal arrows on a row separator', () => {
    const before = topHeight();
    press(splittersOn(layout, 'row')[0], 'ArrowRight');
    assert.equal(topHeight(), before, 'a row handle must not respond to ArrowRight');
  });

  it('ignores the vertical arrows on a column separator', () => {
    const before = layout.panel('left').current;
    press(splittersOn(layout, 'column')[0], 'ArrowDown');
    assert.equal(layout.panel('left').current, before);
  });

  it('shrinks the bottom panel as its separator moves down', () => {
    const before = bottomHeight();
    press(splittersOn(layout, 'row')[1], 'ArrowDown');
    assert.equal(bottomHeight(), before - 16);
  });

  it('clamps the top panel at its bounds', () => {
    const host = mount(`
      <ui-layout>
        <ui-panel slot="top" label="Header" size="40" min="20" max="120" resizable>H</ui-panel>
        <ui-panel slot="center">C</ui-panel>
        <ui-panel slot="bottom" label="Status" size="40" resizable>B</ui-panel>
      </ui-layout>
    `).querySelector('ui-layout');

    for (let i = 0; i < 30; i += 1) press(splittersOn(host, 'row')[0], 'ArrowDown');
    assert.equal(host.panel('top').current, 120);

    for (let i = 0; i < 30; i += 1) press(splittersOn(host, 'row')[0], 'ArrowUp');
    assert.equal(host.panel('top').current, 20);
  });
});

describe('ui-layout keyboard resizing', () => {
  let layout;
  let leftSplitter;
  let rightSplitter;

  beforeEach(() => {
    layout = mount(FULL).querySelector('ui-layout');
    [leftSplitter, rightSplitter] = splittersOn(layout, 'column');
  });

  afterEach(() => cleanup());

  /** Track size currently rendered for a slot. */
  const widthOf = (slot) => layout.sizeOf(slot);

  it('grows the left panel with ArrowRight', () => {
    const before = widthOf('left');
    press(leftSplitter, 'ArrowRight');
    assert.equal(widthOf('left'), before + 16);
  });

  it('shrinks the left panel with ArrowLeft', () => {
    const before = widthOf('left');
    press(leftSplitter, 'ArrowLeft');
    assert.equal(widthOf('left'), before - 16);
  });

  it('respects a custom step', () => {
    const host = mount(FULL);
    const scoped = host.querySelector('ui-layout');
    scoped.setAttribute('step', '40');

    const before = scoped.sizeOf('left');
    press(splittersOf(scoped)[0], 'ArrowRight');

    assert.equal(scoped.sizeOf('left'), before + 40);
  });

  it('never grows past the panel maximum', () => {
    for (let i = 0; i < 40; i += 1) press(leftSplitter, 'ArrowRight');
    assert.equal(widthOf('left'), 400);
  });

  it('never shrinks past the panel minimum', () => {
    for (let i = 0; i < 40; i += 1) press(leftSplitter, 'ArrowLeft');
    assert.equal(widthOf('left'), 160);
  });

  it('leaves a panel on the far side of the middle alone', () => {
    // The left splitter sits between `left` and `center`; `right` is sized by
    // its own splitter, so the middle absorbs the change.
    const before = widthOf('right');
    press(leftSplitter, 'ArrowRight');
    assert.equal(widthOf('right'), before);
  });

  it('grows the right panel when the right splitter moves left', () => {
    const before = widthOf('right');
    press(rightSplitter, 'ArrowLeft');
    assert.equal(widthOf('right'), before + 16);
  });

  it('Home collapses the left panel to its minimum', () => {
    press(leftSplitter, 'Home');
    assert.equal(widthOf('left'), 160);
  });

  it('End expands the left panel to its maximum', () => {
    press(leftSplitter, 'End');
    assert.equal(widthOf('left'), 400);
  });

  it('ignores unrelated keys', () => {
    const before = widthOf('left');
    press(leftSplitter, 'a');
    assert.equal(widthOf('left'), before);
  });

  it('ignores a panel that is not resizable', () => {
    const host = mount(`
      <ui-layout>
        <ui-panel slot="left" size="200" min="100" max="300">L</ui-panel>
        <ui-panel slot="center">C</ui-panel>
      </ui-layout>
    `);
    const scoped = host.querySelector('ui-layout');
    press(splittersOf(scoped)[0], 'ArrowRight');
    assert.equal(scoped.sizeOf('left'), 200);
  });
});

/**
 * Collects events of a specific type. `collectChanges` is hard-wired to
 * `ui4u:change`, which is not what the layout emits.
 *
 * @param {EventTarget} target
 * @param {string} type
 * @returns {any[]} live array, appended in order
 */
function collect(target, type) {
  /** @type {any[]} */
  const seen = [];
  target.addEventListener(type, (event) => seen.push(event.detail));
  return seen;
}

describe('ui-layout events', () => {
  afterEach(() => cleanup());

  it('emits ui4u:resize with the slot and new size', () => {
    const layout = mount(FULL).querySelector('ui-layout');
    const resizes = collect(layout, 'ui4u:resize');

    press(splittersOf(layout)[0], 'ArrowRight');

    assert.equal(resizes.length, 1);
    assert.equal(resizes[0].slot, 'left');
    assert.equal(typeof resizes[0].size, 'number');
  });

  it('does not emit when a resize is clamped away', () => {
    const layout = mount(FULL).querySelector('ui-layout');
    const splitter = splittersOf(layout)[0];

    for (let i = 0; i < 40; i += 1) press(splitter, 'End');
    const resizes = collect(layout, 'ui4u:resize');

    // Already at the maximum: pressing End again changes nothing.
    press(splitter, 'End');
    assert.equal(resizes.length, 0);
  });
});

describe('ui-layout collapse', () => {
  afterEach(() => cleanup());

  const widthOf = (scoped, slot) => scoped.sizeOf(slot);

  it('Enter collapses a collapsible panel to zero', () => {
    const layout = mount(FULL).querySelector('ui-layout');
    press(splittersOf(layout)[0], 'Enter');
    assert.equal(widthOf(layout, 'left'), 0);
  });

  it('Enter restores the panel to its original size', () => {
    const layout = mount(FULL).querySelector('ui-layout');
    const splitter = splittersOf(layout)[0];

    press(splitter, 'ArrowRight');
    const resized = widthOf(layout, 'left');

    press(splitter, 'Enter');
    assert.equal(widthOf(layout, 'left'), 0);

    press(splitter, 'Enter');
    assert.equal(
      widthOf(layout, 'left'),
      240,
      'restored to the authored size, not the dragged one'
    );
    assert.notEqual(resized, 240);
  });

  it('emits ui4u:collapse with the new state', () => {
    const layout = mount(FULL).querySelector('ui-layout');
    const collapses = collect(layout, 'ui4u:collapse');

    press(splittersOf(layout)[0], 'Enter');

    assert.equal(collapses.length, 1);
    assert.equal(collapses[0].slot, 'left');
    assert.equal(collapses[0].collapsed, true);
  });

  it('ignores Enter for a panel that is not collapsible', () => {
    const layout = mount(FULL).querySelector('ui-layout');
    const before = widthOf(layout, 'right');

    press(splittersOf(layout)[1], 'Enter');
    assert.equal(widthOf(layout, 'right'), before);
  });
});

describe('ui-layout teardown', () => {
  afterEach(() => cleanup());

  it('removes splitters and clears inline grid styles on disconnect', () => {
    const layout = mount(FULL).querySelector('ui-layout');
    layout.remove();

    assert.equal(layout.querySelectorAll('[role="separator"]').length, 0);
    assert.equal(layout.style.gridTemplateAreas, '');
    assert.equal(layout.style.gridTemplateColumns, '');
    assert.equal(layout.style.gridTemplateRows, '');
  });

  it('keeps the authored panels intact', () => {
    const host = mount(FULL);
    const layout = host.querySelector('ui-layout');
    layout.remove();

    assert.equal(layout.querySelectorAll('ui-panel').length, 5);
  });
});

describe('ui-layout options', () => {
  afterEach(() => cleanup());

  it('re-renders the grid when the gutter changes', () => {
    const layout = mount(FULL).querySelector('ui-layout');
    assert.match(layout.style.gridTemplateColumns, /var\(--ui4u-layout-splitter-size\)/);

    layout.configure({ gutter: '18px' });
    assert.match(layout.style.gridTemplateColumns, /18px/);

    layout.configure({ gutter: '' });
    assert.match(layout.style.gridTemplateColumns, /var\(--ui4u-layout-splitter-size\)/);
  });

  it('uses the configured keyboard step', () => {
    const layout = mount(FULL).querySelector('ui-layout');
    assert.equal(layout.step, 16);

    layout.configure({ step: 40 });
    assert.equal(layout.step, 40);
  });

  it('falls back to a safe step for nonsense values', () => {
    const layout = mount(FULL).querySelector('ui-layout');
    layout.setAttribute('step', '0');
    assert.equal(layout.step, 1);
  });

  it('reset() restores authored sizes and un-collapses panels', () => {
    const layout = mount(FULL).querySelector('ui-layout');

    layout.setSlotSize('left', 400);
    assert.equal(layout.sizeOf('left'), 400);

    layout.setSlotCollapsed('left', true);
    assert.equal(layout.sizeOf('left'), 0);

    layout.reset();
    assert.equal(layout.sizeOf('left'), 240, 'back to the authored size');
    assert.equal(layout.panel('left').collapsed, false);
  });
});

describe('ui-layout nesting', () => {
  afterEach(() => cleanup());

  const NESTED = `
    <ui-layout id="outer">
      <ui-panel slot="top" label="Header" size="40">Header</ui-panel>

      <ui-layout slot="left" label="Explorer" size="260" min="180" resizable>
        <ui-panel slot="left" label="Explorer rail" size="90" resizable>Rail</ui-panel>
        <ui-panel slot="center" label="Explorer body">Explorer body</ui-panel>
        <ui-panel slot="bottom" label="Explorer filters" size="40">Filters</ui-panel>
      </ui-layout>

      <ui-panel slot="center" label="Editor">Editor</ui-panel>
      <ui-panel slot="bottom" label="Status" size="48">Status</ui-panel>
    </ui-layout>
  `;

  it('accepts a nested layout in a slot, not just a panel', () => {
    const host = mount(NESTED);
    const outer = host.querySelector('#outer');
    const inner = outer.querySelector('ui-layout');

    assert.equal(inner.style.gridArea, 'left', 'the nested layout takes the slot');
    assert.ok(outer.slots.includes('left'));
    assert.equal(outer.slots.includes('top'), true);
    assert.equal(outer.slots.includes('bottom'), true);
  });

  it('gives the nested layout its own labelled region', () => {
    const outer = mount(NESTED).querySelector('#outer');
    const inner = outer.querySelector('ui-layout');

    assert.equal(inner.getAttribute('role'), 'region');
    assert.equal(inner.getAttribute('aria-label'), 'Explorer');
  });

  it('gives the nested layout its own separators', () => {
    const host = mount(NESTED);
    const inner = host.querySelector('#outer ui-layout');

    // rail + body -> one column separator; body + filters -> one row separator,
    // both independent of the outer layout's.
    assert.equal(splittersOn(inner, 'column').length, 1);
    assert.equal(splittersOn(inner, 'row').length, 1);
  });

  it('resizes the outer layout and the nested layout independently', () => {
    const host = mount(NESTED);
    const outer = host.querySelector('#outer');
    const inner = outer.querySelector('ui-layout');

    const outerSplitter = outer.querySelector(':scope > [role="separator"]');
    const innerSplitter = inner.querySelector('[role="separator"]');

    const nestedBefore = inner.sizeOf('left');

    outerSplitter.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    );

    assert.equal(outer.sizeOf('left'), 276, 'outer slot grew');
    assert.equal(inner.sizeOf('left'), nestedBefore, 'inner rail untouched');

    innerSplitter.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    );

    assert.equal(inner.sizeOf('left'), nestedBefore + 16, 'inner rail grew on its own');
    assert.equal(outer.sizeOf('left'), 276, 'outer slot unaffected by the inner resize');
  });

  it('reports which layout emitted a resize, since events bubble', () => {
    const host = mount(NESTED);
    const outer = host.querySelector('#outer');
    const inner = outer.querySelector('ui-layout');

    /** @type {any[]} */
    const seen = [];
    outer.addEventListener('ui4u:resize', (event) => seen.push(event.detail));

    inner
      .querySelector('[role="separator"]')
      .dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
      );

    // The listener on `outer` also sees the inner event, because it bubbles.
    assert.equal(seen.length, 1);
    assert.equal(seen[0].layout, inner, 'detail identifies the emitting layout');
  });

  it('leaves an unsized slot fluid until something gives it a size', () => {
    const host = mount(`
      <ui-layout>
        <ui-layout slot="left" label="Nested"><ui-panel slot="center">A</ui-panel></ui-layout>
        <ui-panel slot="center">B</ui-panel>
      </ui-layout>
    `);
    const outer = host.querySelector('ui-layout');
    assert.match(outer.style.gridTemplateColumns, /auto/);
  });

  it('defaults an invalid slot to center', () => {
    const host = mount(`
      <ui-layout>
        <ui-panel slot="nowhere">ignored</ui-panel>
        <ui-panel slot="center">centre</ui-panel>
      </ui-layout>
    `);
    const outer = host.querySelector('ui-layout');
    assert.deepEqual(outer.slots, ['center']);
  });

  it('restores nested layouts on disconnect without detaching them', () => {
    const host = mount(NESTED);
    const outer = host.querySelector('#outer');
    const inner = outer.querySelector('ui-layout');

    outer.remove();

    assert.equal(
      outer.querySelectorAll(':scope > [role="separator"]').length,
      0,
      'outer separators gone'
    );
    assert.equal(outer.querySelectorAll(':scope > ui-panel').length, 3, 'outer panels kept');
    assert.ok(inner.isConnected === false);
    assert.equal(
      inner.querySelectorAll(':scope > ui-panel').length,
      3,
      'nested panels still intact'
    );
  });
});

describe('ui-panel', () => {
  afterEach(() => cleanup());

  it('defaults the slot to center', () => {
    const panel = mount('<ui-panel>No slot</ui-panel>').querySelector('ui-panel');
    assert.equal(panel.slot, 'center');
  });
});

describe('ui-layout bindings', () => {
  let layout;

  beforeEach(() => {
    layout = mount(FULL).querySelector('ui-layout');
  });

  afterEach(() => cleanup());

  const leftWidth = () => layout.sizeOf('left');

  it('runs a resize binding with the size the panel would actually take', () => {
    /** @type {any[]} */
    const seen = [];
    layout.bind('resize', (detail) => seen.push(detail));

    layout.setSlotSize('left', 300);

    assert.equal(seen.length, 1);
    assert.equal(seen[0].slot, 'left');
    assert.equal(seen[0].size, 300);
    assert.equal(seen[0].min, 160, 'the limits travel with the detail');
    assert.equal(seen[0].max, 400);
    assert.equal(seen[0].layout, layout);
    assert.equal(leftWidth(), 300, 'and the default still ran');
  });

  it('a binding returning false leaves the panel at its old size', () => {
    const before = leftWidth();
    /** @type {unknown[]} */
    const events = [];
    layout.addEventListener('ui4u:resize', () => events.push('resize'));
    layout.bind('resize', () => false);

    layout.setSlotSize('left', 320);

    assert.equal(leftWidth(), before, 'the track did not move');
    assert.equal(layout.panel('left').current, before);
    assert.deepEqual(events, [], 'and a vetoed resize is never announced');
  });

  it('a binding calling preventDefault vetoes in exactly the same way', () => {
    const before = leftWidth();
    layout.bind('resize', (_detail, event) => event.preventDefault());

    layout.setSlotSize('left', 320);

    assert.equal(leftWidth(), before);
  });

  it('guards the shared path, so a keyboard resize is vetoed too', () => {
    const before = leftWidth();
    layout.bind('resize', () => false);

    press(splittersOn(layout, 'column')[0], 'ArrowRight');

    assert.equal(leftWidth(), before, 'the separator moved nothing');
  });

  it('clamps before offering the binding, so a veto sees the real target size', () => {
    /** @type {unknown[]} */
    const seen = [];
    layout.bind('resize', (detail) => seen.push(detail.size));

    layout.setSlotSize('left', 5000);

    assert.deepEqual(seen, [400], 'offered the clamped max, not the raw request');
  });

  it('a binding returning undefined lets the resize through, and ui4u:resize still fires', () => {
    /** @type {any[]} */
    const events = [];
    layout.addEventListener('ui4u:resize', (event) => events.push(event.detail));
    layout.bind('resize', () => undefined);

    layout.setSlotSize('left', 280);

    assert.equal(leftWidth(), 280);
    assert.equal(events.length, 1);
    assert.equal(events[0].slot, 'left');
  });

  it('runs a collapse binding, and a veto leaves the panel in the tree', () => {
    /** @type {any[]} */
    const seen = [];
    layout.bind('collapse', (detail) => seen.push(detail));

    layout.setSlotCollapsed('left', true);

    assert.deepEqual(seen, [{ slot: 'left', collapsed: true, layout }]);
    assert.equal(layout.panel('left').collapsed, true);
  });

  it('a vetoed collapse leaves the panel on screen', () => {
    /** @type {unknown[]} */
    const events = [];
    layout.addEventListener('ui4u:collapse', () => events.push('collapse'));
    layout.bind('collapse', () => false);

    layout.setSlotCollapsed('left', true);

    assert.equal(layout.panel('left').collapsed, false, 'still expanded');
    assert.equal(leftWidth(), 240, 'and still at its size');
    assert.deepEqual(events, []);
  });

  it('a collapse binding calling preventDefault vetoes too', () => {
    layout.bind('collapse', (_detail, event) => event.preventDefault());

    layout.setSlotCollapsed('left', true);

    assert.equal(layout.panel('left').collapsed, false);
  });

  it('leaves reset() unguarded — restoring the authored size is not a resize', () => {
    layout.setSlotSize('left', 300);
    layout.bind('resize', () => false);

    layout.reset();

    assert.equal(leftWidth(), 240, 'back to the authored size, veto or not');
  });

  it('configure({ bindings }) registers bindings', () => {
    /** @type {unknown[]} */
    const seen = [];
    layout.configure({
      bindings: {
        resize: (detail) => seen.push(detail.size),
        collapse: (detail) => seen.push(detail.collapsed),
      },
    });

    layout.setSlotSize('left', 260);
    layout.setSlotCollapsed('left', true);

    assert.deepEqual(seen, [260, true]);
  });
});
