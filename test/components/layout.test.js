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
  return { width: parse(width), height: parse(height), top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 };
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
    <ui-panel slot="top" label="Header" size="40">Header</ui-panel>
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

    assert.equal(areas.split('"').length - 1, 6, 'three quoted rows');
    assert.match(areas, /"top top top top top"/);
    assert.match(areas, /"left sp-l center sp-r right"/);
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
    assert.equal(layout.querySelector('ui-panel[slot="left"]').getAttribute('aria-label'), 'Sidebar');
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

  it('creates one focusable separator between the three horizontal panels', () => {
    assert.equal(splitters.length, 2);

    for (const splitter of splitters) {
      assert.equal(splitter.tagName, 'DIV');
      assert.equal(splitter.tabIndex, 0);
      assert.equal(splitter.getAttribute('aria-orientation'), 'vertical');
      assert.ok(splitter.getAttribute('aria-label'));
      assert.ok(splitter.getAttribute('aria-valuenow'));
    }
  });

  it('positions each separator in the gutter between its panels', () => {
    assert.equal(splitters[0].style.gridArea, 'sp-l');
    assert.equal(splitters[1].style.gridArea, 'sp-r');
  });

  it('exposes the current size through aria-valuenow', () => {

    assert.equal(splitters[0].getAttribute('aria-valuenow'), String(layout.sizeOf('left')));
  });
});

describe('ui-layout keyboard resizing', () => {
  let layout;
  let leftSplitter;
  let rightSplitter;

  beforeEach(() => {
    layout = mount(FULL).querySelector('ui-layout');
    [leftSplitter, rightSplitter] = splittersOf(layout);
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
    assert.equal(widthOf(layout, 'left'), 240, 'restored to the authored size, not the dragged one');
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

describe('ui-panel', () => {
  afterEach(() => cleanup());

  it('defaults the slot to center', () => {
    const panel = mount('<ui-panel>No slot</ui-panel>').querySelector('ui-panel');
    assert.equal(panel.slot, 'center');
  });
});