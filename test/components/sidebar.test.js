import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { cleanup, click, mount, press, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component module is evaluated â€” see helpers/dom.js.
setupDom();

const { Sidebar, SidebarItem } = await import('../../src/components/sidebar/sidebar.js');
const { define, isDefined } = await import('../../src/core/registry.js');

define('ui-sidebar', Sidebar);
define('ui-sidebar-item', SidebarItem);

/** @returns {HTMLElement[]} the rendered link/button controls, in order */
function controlsOf(sidebar) {
  return [...sidebar.querySelectorAll('.ui4u-sidebar__link')];
}

/** @returns {HTMLButtonElement} the collapse toggle */
function toggleOf(sidebar) {
  return sidebar.querySelector('.ui4u-sidebar__toggle');
}

/**
 * jsdom does not fire real `focusin` on `.focus()` in every configuration, so
 * the tests dispatch it explicitly the way a browser would.
 *
 * @param {Element} target
 */
function focusIn(target) {
  target.dispatchEvent(new Event('focusin', { bubbles: true, cancelable: false }));
}

const THREE_ITEMS = `
  <ui-sidebar expanded label="Main">
    <ui-sidebar-item label="Overview" icon="â—ˆ" active></ui-sidebar-item>
    <ui-sidebar-item label="Components" icon="â—«" href="#components"></ui-sidebar-item>
    <ui-sidebar-item label="Settings" icon="âš™"></ui-sidebar-item>
  </ui-sidebar>
`;

describe('ui-sidebar registration', () => {
  it('registers both custom elements', () => {
    assert.equal(isDefined('ui-sidebar'), true);
    assert.equal(isDefined('ui-sidebar-item'), true);
  });
});

describe('ui-sidebar landmark', () => {
  let host;
  let sidebar;

  beforeEach(() => {
    host = mount(THREE_ITEMS);
    sidebar = host.querySelector('ui-sidebar');
  });

  afterEach(() => cleanup());

  it('is a labelled navigation landmark', () => {
    assert.equal(sidebar.getAttribute('role'), 'navigation');
    assert.equal(sidebar.getAttribute('aria-label'), 'Main');
  });

  it('drops the label when it is cleared', () => {
    sidebar.removeAttribute('label');
    assert.equal(sidebar.hasAttribute('aria-label'), false);
  });

  it('renders one control per item, in order', () => {
    const controls = controlsOf(sidebar);
    assert.equal(controls.length, 3);
    assert.deepEqual(
      controls.map((c) => c.textContent),
      ['â—ˆOverview', 'â—«Components', 'âš™Settings']
    );
  });

  it('renders an anchor for an href item and a button otherwise', () => {
    const controls = controlsOf(sidebar);

    assert.equal(controls[1].tagName, 'A');
    assert.equal(controls[1].getAttribute('href'), '#components');

    assert.equal(controls[0].tagName, 'BUTTON');
    assert.equal(controls[0].getAttribute('type'), 'button');
    assert.equal(controls[0].hasAttribute('href'), false);
  });

  it('gives every control a title so a rail strip is never a bare glyph', () => {
    assert.deepEqual(
      controlsOf(sidebar).map((c) => c.getAttribute('title')),
      ['Overview', 'Components', 'Settings']
    );
  });
});

describe('ui-sidebar toggle', () => {
  let host;
  let sidebar;

  beforeEach(() => {
    host = mount(THREE_ITEMS);
    sidebar = host.querySelector('ui-sidebar');
  });

  afterEach(() => cleanup());

  it('is a real button with aria-expanded and a stateful name', () => {
    const toggle = toggleOf(sidebar);

    assert.equal(toggle.tagName, 'BUTTON');
    assert.equal(toggle.getAttribute('type'), 'button');
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(toggle.getAttribute('aria-label'), 'Collapse navigation');
  });

  it('flips aria-expanded and the accessible name on click', () => {
    const toggle = toggleOf(sidebar);

    click(toggle);
    assert.equal(sidebar.expanded, false);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(toggle.getAttribute('aria-label'), 'Expand navigation');

    click(toggle);
    assert.equal(sidebar.expanded, true);
    assert.equal(toggle.getAttribute('aria-label'), 'Collapse navigation');
  });

  it('exposes open(), close() and toggle() returning the element', () => {
    assert.equal(sidebar.close(), sidebar);
    assert.equal(sidebar.expanded, false);
    assert.equal(sidebar.open(), sidebar);
    assert.equal(sidebar.expanded, true);
    sidebar.toggle();
    assert.equal(sidebar.expanded, false);
    sidebar.toggle();
    assert.equal(sidebar.expanded, true);
  });

  it('marks the collapsed state in dataset.rail', () => {
    assert.equal(sidebar.dataset.rail, 'false');
    sidebar.close();
    assert.equal(sidebar.dataset.rail, 'true');
    assert.equal(sidebar.dataset.expanded, 'false');
  });
});

describe('ui-sidebar active item', () => {
  let host;
  let sidebar;
  let controls;

  beforeEach(() => {
    host = mount(THREE_ITEMS);
    sidebar = host.querySelector('ui-sidebar');
    controls = controlsOf(sidebar);
  });

  afterEach(() => cleanup());

  it('marks the authored active item with aria-current="page"', () => {
    assert.equal(controls[0].getAttribute('aria-current'), 'page');
    assert.equal(controls[1].hasAttribute('aria-current'), false);
    assert.equal(sidebar.activeIndex, 0);
  });

  it('honours an authored active index', () => {
    const other = mount(`
      <ui-sidebar expanded label="Main">
        <ui-sidebar-item label="One"></ui-sidebar-item>
        <ui-sidebar-item label="Two" active></ui-sidebar-item>
        <ui-sidebar-item label="Three"></ui-sidebar-item>
      </ui-sidebar>
    `);
    const nav = other.querySelector('ui-sidebar');

    assert.equal(nav.activeIndex, 1);
    assert.equal(controlsOf(nav)[1].getAttribute('aria-current'), 'page');
  });

  it('defaults to the first item when none is authored active', () => {
    const other = mount(
      '<ui-sidebar expanded label="Main"><ui-sidebar-item label="One"></ui-sidebar-item></ui-sidebar>'
    );
    assert.equal(other.querySelector('ui-sidebar').activeIndex, 0);
  });

  it('moves aria-current on activation', () => {
    click(controls[2]);

    assert.equal(sidebar.activeIndex, 2);
    assert.equal(controls[2].getAttribute('aria-current'), 'page');
    assert.equal(controls[0].hasAttribute('aria-current'), false);
    assert.equal(sidebar.activeItem.getAttribute('label'), 'Settings');
  });
});

describe('ui-sidebar roving tab order', () => {
  let host;
  let sidebar;
  let controls;

  beforeEach(() => {
    host = mount(THREE_ITEMS);
    sidebar = host.querySelector('ui-sidebar');
    controls = controlsOf(sidebar);
  });

  afterEach(() => cleanup());

  it('keeps exactly one item in the tab order', () => {
    assert.deepEqual(
      controls.map((c) => c.tabIndex),
      [0, -1, -1]
    );
    assert.equal(controls.filter((c) => c.tabIndex === 0).length, 1);
  });

  it('moves the tab stop with the active item', () => {
    click(controls[1]);
    assert.deepEqual(
      controls.map((c) => c.tabIndex),
      [-1, 0, -1]
    );
  });

  it('reflects the active item back onto the light-DOM attribute', () => {
    click(controls[1]);
    const items = [...sidebar.querySelectorAll('ui-sidebar-item')];

    assert.equal(items[1].hasAttribute('active'), true);
    assert.equal(items[0].hasAttribute('active'), false);
  });
});

describe('ui-sidebar keyboard navigation', () => {
  let host;
  let sidebar;
  let controls;

  beforeEach(() => {
    host = mount(THREE_ITEMS);
    sidebar = host.querySelector('ui-sidebar');
    controls = controlsOf(sidebar);
  });

  afterEach(() => cleanup());

  it('uses ArrowDown/ArrowUp by default (side="left")', () => {
    press(controls[0], 'ArrowDown');
    assert.equal(document.activeElement, controls[1]);

    press(controls[1], 'ArrowUp');
    assert.equal(document.activeElement, controls[0]);
  });

  it('wraps around at both ends', () => {
    press(controls[2], 'ArrowDown');
    assert.equal(document.activeElement, controls[0]);

    press(controls[0], 'ArrowUp');
    assert.equal(document.activeElement, controls[2]);
  });

  it('jumps to the ends with Home and End', () => {
    press(controls[0], 'End');
    assert.equal(document.activeElement, controls[2]);

    press(controls[2], 'Home');
    assert.equal(document.activeElement, controls[0]);
  });

  it('moves focus without activating on arrow keys', () => {
    press(controls[0], 'ArrowDown');
    assert.equal(sidebar.activeIndex, 0, 'activation is unchanged');
  });

  it('activates on Enter and on Space', () => {
    press(controls[1], 'Enter');
    assert.equal(sidebar.activeIndex, 1);

    press(controls[2], ' ');
    assert.equal(sidebar.activeIndex, 2);
  });

  it('ignores the vertical axis when side="right"', () => {
    sidebar.side = 'right';
    assert.equal(sidebar.side, 'right');
    assert.equal(sidebar.dataset.side, 'right');

    controls[0].focus();
    press(controls[0], 'ArrowDown');
    assert.equal(document.activeElement, controls[0], 'ArrowDown is not a right-side key');
  });

  it('uses ArrowLeft/ArrowRight when side="right"', () => {
    sidebar.side = 'right';

    press(controls[0], 'ArrowRight');
    assert.equal(document.activeElement, controls[1]);

    press(controls[1], 'ArrowLeft');
    assert.equal(document.activeElement, controls[0]);
  });

  it('ignores unrelated keys', () => {
    press(controls[0], 'a');
    assert.equal(document.activeElement, document.body);
    assert.equal(sidebar.activeIndex, 0);
  });
});

describe('ui-sidebar events', () => {
  afterEach(() => cleanup());

  it('emits ui4u:change with expanded and rail', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');
    /** @type {any[]} */
    const changes = [];
    sidebar.addEventListener('ui4u:change', (event) => changes.push(event.detail));

    sidebar.close();
    assert.deepEqual(changes, [{ expanded: false, rail: true }]);

    sidebar.open();
    assert.deepEqual(changes[1], { expanded: true, rail: false });
  });

  it('does not emit when the state is unchanged', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');
    /** @type {any[]} */
    const changes = [];
    sidebar.addEventListener('ui4u:change', (event) => changes.push(event.detail));

    sidebar.open();
    assert.deepEqual(changes, []);
  });

  it('emits ui4u:navigate with item, index and href on click', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');
    /** @type {any[]} */
    const seen = [];
    sidebar.addEventListener('ui4u:navigate', (event) => seen.push(event.detail));

    click(controlsOf(sidebar)[1]);

    assert.equal(seen.length, 1);
    assert.equal(seen[0].index, 1);
    assert.equal(seen[0].href, '#components');
    assert.equal(seen[0].item.getAttribute('label'), 'Components');
  });

  it('reports an empty href for a command item', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');
    /** @type {any[]} */
    const seen = [];
    sidebar.addEventListener('ui4u:navigate', (event) => seen.push(event.detail));

    click(controlsOf(sidebar)[2]);

    assert.equal(seen[0].href, '');
    assert.equal(seen[0].index, 2);
  });
});

describe('ui-sidebar rail mode', () => {
  afterEach(() => cleanup());

  it('collapses to rail mode when closed', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');

    sidebar.close();

    assert.equal(sidebar.dataset.rail, 'true');
    assert.equal(toggleOf(sidebar).getAttribute('aria-expanded'), 'false');
  });

  it('expands when focus enters the collapsed strip', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');
    const controls = controlsOf(sidebar);

    sidebar.close();
    assert.equal(sidebar.expanded, false);

    focusIn(controls[1]);

    assert.equal(sidebar.expanded, true, 'the rail expanded on focus');
    assert.equal(sidebar.dataset.rail, 'false');
  });

  it('keeps every item nameable while collapsed', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');

    sidebar.close();

    for (const control of controlsOf(sidebar)) {
      assert.ok(control.getAttribute('title'), 'a collapsed item still exposes its label');
    }
  });
});

describe('ui-sidebar configure()', () => {
  afterEach(() => cleanup());

  it('applies every option and returns the element', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');

    const result = sidebar.configure({
      expanded: false,
      side: 'right',
      width: '18rem',
      rail: '5rem',
    });

    assert.equal(result, sidebar);
    assert.equal(sidebar.expanded, false);
    assert.equal(sidebar.side, 'right');
    assert.equal(sidebar.width, '18rem');
    assert.equal(sidebar.rail, '5rem');
    assert.equal(sidebar.style.getPropertyValue('--ui4u-sidebar-width'), '18rem');
    assert.equal(sidebar.style.getPropertyValue('--ui4u-sidebar-rail'), '5rem');
  });

  it('falls back to safe defaults for unknown values', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');

    sidebar.setAttribute('side', 'nonsense');
    assert.equal(sidebar.side, 'left');
    assert.equal(sidebar.dataset.side, 'left');
  });
});

describe('ui-sidebar narrow drawer', () => {
  afterEach(() => cleanup());

  it('is not a drawer by default in jsdom (matchMedia matches: false)', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');

    assert.equal(sidebar.narrow, false);
    assert.equal(sidebar.dataset.drawer, 'false');
  });

  it('honours the data-narrow override', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');

    sidebar.narrow = true;

    assert.equal(sidebar.narrow, true);
    assert.equal(sidebar.dataset.drawer, 'true');
  });

  it('portals the backdrop to the body, outside the host', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');
    const backdrop = document.querySelector('.ui4u-sidebar__backdrop');

    assert.ok(backdrop, 'backdrop rendered');
    assert.equal(sidebar.contains(backdrop), false, 'backdrop is not a descendant of the host');
    assert.equal(backdrop.parentNode, document.body);
  });

  it('keeps focus inside the drawer while it is open', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    sidebar.narrow = true;
    sidebar.close();
    sidebar.open();

    const panel = sidebar.querySelector('.ui4u-sidebar__panel');
    assert.equal(panel.contains(document.activeElement), true, 'focus starts inside the drawer');

    // Focus wandering in from outside is pulled back into the trapped root.
    focusIn(outside);
    outside.focus();
    const again = new Event('focusin', { bubbles: true });
    Object.defineProperty(again, 'target', { value: outside });
    document.dispatchEvent(again);

    assert.equal(panel.contains(document.activeElement), true, 'focus cannot escape the drawer');
  });

  it('does not trap focus when the drawer is closed', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    sidebar.narrow = true;
    sidebar.close();

    const event = new Event('focusin', { bubbles: true });
    Object.defineProperty(event, 'target', { value: outside });
    document.dispatchEvent(event);

    assert.notEqual(document.activeElement, outside, 'focus was not yanked anywhere');
  });

  it('closes the open drawer on Escape', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');

    sidebar.narrow = true;
    sidebar.open();
    assert.equal(sidebar.expanded, true);

    press(toggleOf(sidebar), 'Escape');
    assert.equal(sidebar.expanded, false);
    assert.equal(document.activeElement, toggleOf(sidebar));
  });

  it('leaves Escape alone when the sidebar is not a drawer', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');

    sidebar.open();
    press(toggleOf(sidebar), 'Escape');

    assert.equal(sidebar.expanded, true, 'a non-modal sidebar does not steal Escape');
  });

  it('starts closed when the drawer is the initial layout', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');
    sidebar.setAttribute('data-narrow', 'true');
    sidebar.remove();
    document.body.appendChild(sidebar);

    // `expanded` describes the docked sidebar; an off-canvas drawer must be
    // opened deliberately, or the page loads behind a sheet it never asked for.
    assert.equal(sidebar.expanded, false);
    assert.equal(sidebar.dataset.drawer, 'true');
    assert.equal(
      sidebar.querySelector('.ui4u-sidebar__panel').contains(document.activeElement),
      false,
      'upgrade did not steal focus'
    );
  });

  it('restores focus to the toggle when the drawer closes', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');
    const toggle = toggleOf(sidebar);

    sidebar.narrow = true;
    sidebar.open();
    assert.equal(document.activeElement !== toggle, true, 'focus moved into the drawer');

    sidebar.close();

    assert.equal(document.activeElement, toggle);
  });
});

describe('ui-sidebar teardown', () => {
  afterEach(() => cleanup());

  it('removes generated markup and restores the items on disconnect', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');
    const items = [...host.querySelectorAll('ui-sidebar-item')];

    assert.equal(controlsOf(sidebar).length, 3, 'controls exist while connected');

    sidebar.remove();

    assert.equal(controlsOf(sidebar).length, 0, 'controls removed');
    assert.equal(sidebar.querySelector('.ui4u-sidebar__toggle'), null, 'toggle removed');
    assert.equal(sidebar.hasAttribute('role'), false, 'role cleared');
    for (const item of items) {
      assert.equal(item.parentNode, sidebar, 'author markup restored');
      assert.equal(item.firstChild, null, 'generated control detached');
    }
    assert.equal(document.querySelector('.ui4u-sidebar__backdrop'), null, 'backdrop unported');
  });

  it('rebuilds correctly when reconnected', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');

    sidebar.remove();
    document.body.appendChild(sidebar);

    const controls = controlsOf(sidebar);
    assert.equal(controls.length, 3, 'rebuilt with one control per item');
    assert.equal(controls[0].getAttribute('aria-current'), 'page');
    assert.equal(sidebar.getAttribute('role'), 'navigation');
  });

  it('stops responding to events after disconnect', () => {
    const host = mount(THREE_ITEMS);
    const sidebar = host.querySelector('ui-sidebar');
    const toggle = toggleOf(sidebar);
    /** @type {any[]} */
    const changes = [];
    sidebar.addEventListener('ui4u:change', (event) => changes.push(event.detail));

    sidebar.remove();
    click(toggle);

    assert.deepEqual(changes, []);
  });

  it('does nothing when there are no ui-sidebar-item children', () => {
    const host = mount('<ui-sidebar expanded label="Empty"></ui-sidebar>');
    const sidebar = host.querySelector('ui-sidebar');

    assert.equal(sidebar.querySelector('.ui4u-sidebar__panel'), null);
    assert.equal(sidebar.activeIndex, 0);
  });
});
