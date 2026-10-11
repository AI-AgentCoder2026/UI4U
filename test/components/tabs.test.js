import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { cleanup, collectChanges, click, mount, press, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component module is evaluated — see helpers/dom.js.
setupDom();

const { Tab, Tabs } = await import('../../src/components/tabs/tabs.js');
const { define, isDefined } = await import('../../src/core/registry.js');

define('ui-tabs', Tabs);
define('ui-tab', Tab);

/** @returns {HTMLButtonElement[]} the rendered tab buttons */
function buttonsOf(tabs) {
  return [...tabs.querySelectorAll('[role="tab"]')];
}

/** @returns {HTMLElement[]} the panel elements, visible or not */
function panelsOf(tabs) {
  return [...tabs.querySelectorAll('[role="tabpanel"]')];
}

const THREE_TABS = `
  <ui-tabs label="Sections">
    <ui-tab label="Overview">Overview panel</ui-tab>
    <ui-tab label="Activity">Activity panel</ui-tab>
    <ui-tab label="Settings">Settings panel</ui-tab>
  </ui-tabs>
`;

describe('ui-tabs registration', () => {
  it('registers both custom elements', () => {
    assert.equal(isDefined('ui-tabs'), true);
    assert.equal(isDefined('ui-tab'), true);
  });
});

describe('ui-tabs rendering', () => {
  let host;
  let tabs;

  beforeEach(() => {
    host = mount(THREE_TABS);
    tabs = host.querySelector('ui-tabs');
  });

  afterEach(() => cleanup());

  it('builds a tablist with the configured accessible name', () => {
    const list = tabs.querySelector('[role="tablist"]');
    assert.ok(list, 'tablist is rendered');
    assert.equal(list.getAttribute('aria-label'), 'Sections');
    assert.equal(list.getAttribute('aria-orientation'), 'horizontal');
  });

  it('renders one tab button per panel, in order', () => {
    const buttons = buttonsOf(tabs);
    assert.equal(buttons.length, 3);
    assert.deepEqual(
      buttons.map((b) => b.textContent),
      ['Overview', 'Activity', 'Settings']
    );
  });

  it('gives every tab and panel a unique id', () => {
    const buttons = buttonsOf(tabs);
    const panels = panelsOf(tabs);
    const ids = [...buttons, ...panels].map((n) => n.id);

    assert.ok(ids.every(Boolean), 'all nodes have ids');
    assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  });

  it('wires aria-controls and aria-labelledby in both directions', () => {
    const buttons = buttonsOf(tabs);
    const panels = panelsOf(tabs);

    buttons.forEach((button, i) => {
      assert.equal(button.getAttribute('aria-controls'), panels[i].id);
      assert.equal(panels[i].getAttribute('aria-labelledby'), button.id);
    });
  });

  it('activates the first panel by default and hides the rest', () => {
    const buttons = buttonsOf(tabs);
    const panels = panelsOf(tabs);

    assert.equal(buttons[0].getAttribute('aria-selected'), 'true');
    assert.deepEqual(
      buttons.map((b) => b.getAttribute('aria-selected')),
      ['true', 'false', 'false']
    );
    assert.equal(panels[0].hidden, false);
    assert.equal(panels[1].hidden, true);
    assert.equal(panels[2].hidden, true);
  });

  it('keeps a single tab stop via roving tabindex', () => {
    const buttons = buttonsOf(tabs);

    assert.deepEqual(
      buttons.map((b) => b.tabIndex),
      [0, -1, -1]
    );
  });
});

describe('ui-tabs active state', () => {
  afterEach(() => cleanup());

  it('honours the active attribute on upgrade', () => {
    const host = mount(`
      <ui-tabs active="1">
        <ui-tab label="One">1</ui-tab>
        <ui-tab label="Two">2</ui-tab>
        <ui-tab label="Three">3</ui-tab>
      </ui-tabs>
    `);
    const tabs = host.querySelector('ui-tabs');
    const buttons = buttonsOf(tabs);

    assert.equal(tabs.active, 1);
    assert.equal(buttons[1].getAttribute('aria-selected'), 'true');
    assert.equal(buttons[0].getAttribute('aria-selected'), 'false');
  });

  it('clamps an out-of-range active index', () => {
    const host = mount(`
      <ui-tabs active="99">
        <ui-tab label="One">1</ui-tab>
        <ui-tab label="Two">2</ui-tab>
      </ui-tabs>
    `);
    assert.equal(host.querySelector('ui-tabs').active, 1);
  });

  it('reflects the active index back to the attribute', () => {
    const host = mount(THREE_TABS);
    const tabs = host.querySelector('ui-tabs');

    assert.equal(tabs.hasAttribute('active'), false, 'no attribute unless one was authored');

    tabs.setAttribute('active', '2');
    assert.equal(tabs.active, 2);

    tabs.active = 0;
    assert.equal(tabs.getAttribute('active'), '0');
  });

  it('exposes activeTab', () => {
    const host = mount(THREE_TABS);
    const tabs = host.querySelector('ui-tabs');

    tabs.active = 2;
    assert.equal(tabs.activeTab.getAttribute('label'), 'Settings');
  });
});

describe('ui-tabs change events', () => {
  afterEach(() => cleanup());

  it('emits ui4u:change with index, label and tab on click', () => {
    const host = mount(THREE_TABS);
    const tabs = host.querySelector('ui-tabs');
    const changes = collectChanges(tabs);

    click(buttonsOf(tabs)[2]);

    assert.equal(changes.length, 1);
    assert.equal(changes[0].index, 2);
    assert.equal(changes[0].label, 'Settings');
    assert.equal(changes[0].tab, panelsOf(tabs)[2]);
  });

  it('does not emit when the already-active tab is clicked', () => {
    const host = mount(THREE_TABS);
    const tabs = host.querySelector('ui-tabs');
    const changes = collectChanges(tabs);

    click(buttonsOf(tabs)[0]);

    assert.equal(changes.length, 0);
  });

  it('does not emit for a programmatic set to the same index', () => {
    const host = mount(THREE_TABS);
    const tabs = host.querySelector('ui-tabs');
    const changes = collectChanges(tabs);

    tabs.active = 0;

    assert.equal(changes.length, 0);
  });
});

describe('ui-tabs keyboard navigation (automatic activation)', () => {
  let host;
  let tabs;
  let buttons;

  beforeEach(() => {
    host = mount(THREE_TABS);
    tabs = host.querySelector('ui-tabs');
    buttons = buttonsOf(tabs);
  });

  afterEach(() => cleanup());

  it('moves to the next tab with ArrowRight and activates it', () => {
    press(buttons[0], 'ArrowRight');

    assert.equal(tabs.active, 1);
    assert.equal(buttons[1].getAttribute('aria-selected'), 'true');
    assert.equal(document.activeElement, buttons[1], 'focus follows selection');
  });

  it('moves to the previous tab with ArrowLeft', () => {
    tabs.active = 2;
    press(buttons[2], 'ArrowLeft');

    assert.equal(tabs.active, 1);
  });

  it('wraps around at the end', () => {
    tabs.active = 2;
    press(buttons[2], 'ArrowRight');

    assert.equal(tabs.active, 0, 'wraps to the first tab');
  });

  it('wraps around at the start', () => {
    tabs.active = 0;
    press(buttons[0], 'ArrowLeft');

    assert.equal(tabs.active, 2, 'wraps to the last tab');
  });

  it('jumps to the first tab with Home and the last with End', () => {
    tabs.active = 1;
    press(buttons[1], 'End');
    assert.equal(tabs.active, 2);

    press(buttons[2], 'Home');
    assert.equal(tabs.active, 0);
  });

  it('ignores up/down arrows in horizontal orientation', () => {
    tabs.active = 0;
    press(buttons[0], 'ArrowDown');

    assert.equal(tabs.active, 0, 'ArrowDown is not a horizontal tab key');
  });

  it('ignores unrelated keys', () => {
    tabs.active = 1;
    press(buttons[1], 'a');

    assert.equal(tabs.active, 1);
  });

  it('updates roving tabindex after keyboard movement', () => {
    assert.deepEqual(
      buttons.map((b) => b.tabIndex),
      [0, -1, -1]
    );
  });
});

describe('ui-tabs keyboard navigation (vertical)', () => {
  afterEach(() => cleanup());

  it('uses ArrowDown/ArrowUp and sets aria-orientation', () => {
    const host = mount(`
      <ui-tabs orientation="vertical" label="Vertical">
        <ui-tab label="One">1</ui-tab>
        <ui-tab label="Two">2</ui-tab>
        <ui-tab label="Three">3</ui-tab>
      </ui-tabs>
    `);
    const tabs = host.querySelector('ui-tabs');
    const buttons = buttonsOf(tabs);

    assert.equal(tabs.orientation, 'vertical');
    assert.equal(
      tabs.querySelector('[role="tablist"]').getAttribute('aria-orientation'),
      'vertical'
    );

    press(buttons[0], 'ArrowDown');
    assert.equal(tabs.active, 1);

    press(buttons[1], 'ArrowUp');
    assert.equal(tabs.active, 0);
  });

  it('ignores left/right arrows in vertical orientation', () => {
    const host = mount(`
      <ui-tabs orientation="vertical">
        <ui-tab label="One">1</ui-tab>
        <ui-tab label="Two">2</ui-tab>
      </ui-tabs>
    `);
    const tabs = host.querySelector('ui-tabs');

    press(buttonsOf(tabs)[0], 'ArrowRight');
    assert.equal(tabs.active, 0);
  });
});

describe('ui-tabs manual activation', () => {
  let host;
  let tabs;
  let buttons;

  beforeEach(() => {
    host = mount(`
      <ui-tabs activation="manual" label="Manual">
        <ui-tab label="One">1</ui-tab>
        <ui-tab label="Two">2</ui-tab>
        <ui-tab label="Three">3</ui-tab>
      </ui-tabs>
    `);
    tabs = host.querySelector('ui-tabs');
    buttons = buttonsOf(tabs);
  });

  afterEach(() => cleanup());

  it('moves focus without activating on arrow keys', () => {
    tabs.active = 0;

    press(buttons[0], 'ArrowRight');

    assert.equal(tabs.active, 0, 'panel did not change');
    assert.equal(document.activeElement, buttons[1], 'focus still moved');
  });

  it('activates the focused tab on Enter', () => {
    buttons[1].focus();
    press(buttons[1], 'Enter');

    assert.equal(tabs.active, 1);
  });

  it('activates the focused tab on Space', () => {
    tabs.active = 0;
    buttons[2].focus();
    press(buttons[2], ' ');

    assert.equal(tabs.active, 2);
  });
});

describe('ui-tabs configure()', () => {
  afterEach(() => cleanup());

  it('applies every option and returns the element', () => {
    const host = mount(THREE_TABS);
    const tabs = host.querySelector('ui-tabs');

    const result = tabs.configure({
      active: 1,
      orientation: 'vertical',
      activation: 'manual',
      variant: 'underline',
      label: 'Renamed',
    });

    assert.equal(result, tabs);
    assert.equal(tabs.active, 1);
    assert.equal(tabs.orientation, 'vertical');
    assert.equal(tabs.activation, 'manual');
    assert.equal(tabs.variant, 'underline');
    assert.equal(tabs.dataset.variant, 'underline');
    assert.equal(tabs.querySelector('[role="tablist"]').getAttribute('aria-label'), 'Renamed');
  });

  it('falls back to safe defaults for unknown values', () => {
    const host = mount(THREE_TABS);
    const tabs = host.querySelector('ui-tabs');

    tabs.setAttribute('variant', 'nonsense');
    tabs.setAttribute('activation', 'nonsense');
    tabs.setAttribute('orientation', 'nonsense');

    assert.equal(tabs.variant, 'glass');
    assert.equal(tabs.activation, 'automatic');
    assert.equal(tabs.orientation, 'horizontal');
  });
});

describe('ui-tabs traversal helpers', () => {
  afterEach(() => cleanup());

  it('next() and previous() wrap around', () => {
    const host = mount(THREE_TABS);
    const tabs = host.querySelector('ui-tabs');

    tabs.next();
    assert.equal(tabs.active, 1);

    tabs.previous();
    assert.equal(tabs.active, 0);

    tabs.previous();
    assert.equal(tabs.active, 2, 'previous wraps backwards');
  });
});

describe('ui-tabs teardown', () => {
  afterEach(() => cleanup());

  it('removes generated markup and restores panels on disconnect', () => {
    const host = mount(THREE_TABS);
    const tabs = host.querySelector('ui-tabs');
    const panels = [...host.querySelectorAll('ui-tab')];

    assert.ok(tabs.querySelector('[role="tablist"]'), 'tablist exists while connected');

    tabs.remove();

    assert.equal(tabs.querySelector('[role="tablist"]'), null, 'tablist removed');
    for (const panel of panels) {
      assert.equal(panel.hasAttribute('role'), false, 'role cleared');
      assert.equal(panel.hidden, false, 'panel shown again');
    }
  });

  it('rebuilds correctly when reconnected', () => {
    const host = mount(THREE_TABS);
    const tabs = host.querySelector('ui-tabs');

    tabs.remove();
    document.body.appendChild(tabs);

    const buttons = buttonsOf(tabs);
    assert.equal(buttons.length, 3, 'tablist rebuilt with one button per panel');
    assert.equal(buttons[0].getAttribute('aria-selected'), 'true');
  });

  it('does nothing when there are no ui-tab children', () => {
    const host = mount('<ui-tabs label="Empty"></ui-tabs>');
    const tabs = host.querySelector('ui-tabs');

    assert.equal(tabs.querySelector('[role="tablist"]'), null);
    assert.equal(tabs.active, 0);
  });
});
