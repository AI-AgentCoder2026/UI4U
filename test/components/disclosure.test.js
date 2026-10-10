import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { cleanup, collectChanges, click, mount, press, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component module is evaluated — see helpers/dom.js.
setupDom();

const { Disclosure } = await import('../../src/components/disclosure/disclosure.js');
const { define, isDefined } = await import('../../src/core/registry.js');

define('ui-disclosure', Disclosure);

/** @returns {HTMLButtonElement|null} */
function triggerOf(el) {
  return el.querySelector('.ui4u-disclosure__summary');
}

/** @returns {HTMLElement|null} */
function contentOf(el) {
  return el.querySelector('.ui4u-disclosure__content');
}

const SAMPLE = `
  <ui-disclosure summary="Source">
    <p id="payload">Original markup</p>
  </ui-disclosure>
`;

describe('ui-disclosure registration', () => {
  it('registers as a custom element', () => {
    assert.equal(isDefined('ui-disclosure'), true);
  });
});

describe('ui-disclosure rendering', () => {
  let host;
  let disclosure;

  beforeEach(() => {
    host = mount(SAMPLE);
    disclosure = host.querySelector('ui-disclosure');
  });

  afterEach(() => cleanup());

  it('builds a real button as the trigger', () => {
    const trigger = triggerOf(disclosure);
    assert.equal(trigger.tagName, 'BUTTON');
    assert.equal(trigger.type, 'button');
    assert.equal(trigger.textContent, 'Source');
  });

  it('wires aria-controls and aria-expanded between trigger and region', () => {
    const trigger = triggerOf(disclosure);
    const content = contentOf(disclosure);

    assert.equal(trigger.getAttribute('aria-controls'), content.id);
    assert.equal(content.getAttribute('aria-labelledby'), trigger.id);
    assert.equal(content.getAttribute('role'), 'region');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  });

  it('starts collapsed and hides the content region', () => {
    assert.equal(disclosure.expanded, false);
    assert.equal(contentOf(disclosure).hidden, true);
  });

  it('moves the authored markup into the content region', () => {
    const payload = disclosure.querySelector('#payload');
    assert.ok(payload, 'author content survives the build');
    assert.equal(contentOf(disclosure).contains(payload), true);
    assert.equal(payload.textContent, 'Original markup');
  });

  it('falls back to a default summary when none is given', () => {
    const bare = mount('<ui-disclosure><p>content</p></ui-disclosure>');
    assert.equal(triggerOf(bare.querySelector('ui-disclosure')).textContent, 'Show more');
  });

  it('renders summary text as text, never as markup', () => {
    const risky = mount('<ui-disclosure summary="&lt;img src=x onerror=alert(1)&gt;"></ui-disclosure>');
    const label = risky.querySelector('.ui4u-disclosure__label');
    assert.equal(label.querySelector('img'), null);
    assert.equal(label.textContent, '<img src=x onerror=alert(1)>');
  });
});

describe('ui-disclosure toggling', () => {
  let host;
  let disclosure;

  beforeEach(() => {
    host = mount(SAMPLE);
    disclosure = host.querySelector('ui-disclosure');
  });

  afterEach(() => cleanup());

  it('opens and closes on trigger click', () => {
    click(triggerOf(disclosure));
    assert.equal(disclosure.expanded, true);
    assert.equal(triggerOf(disclosure).getAttribute('aria-expanded'), 'true');
    assert.equal(contentOf(disclosure).hidden, false);

    click(triggerOf(disclosure));
    assert.equal(disclosure.expanded, false);
    assert.equal(contentOf(disclosure).hidden, true);
  });

  it('toggles exactly once per click', () => {
    // A duplicated handler would cancel itself out and never open.
    click(triggerOf(disclosure));
    assert.equal(disclosure.expanded, true);
  });

  it('opens with the keyboard, since the trigger is a native button', () => {
    const trigger = triggerOf(disclosure);
    trigger.focus();
    trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(disclosure.expanded, true);
  });

  it('exposes open(), close() and toggle()', () => {
    disclosure.open();
    assert.equal(disclosure.expanded, true);

    disclosure.close();
    assert.equal(disclosure.expanded, false);

    disclosure.toggle();
    assert.equal(disclosure.expanded, true);
  });

  it('supports the expanded property', () => {
    disclosure.expanded = true;
    assert.equal(disclosure.expanded, true);
    assert.equal(contentOf(disclosure).hidden, false);

    disclosure.expanded = false;
    assert.equal(disclosure.expanded, false);
  });

  it('emits ui4u:change with the new state', () => {
    const changes = collectChanges(disclosure);

    disclosure.open();
    disclosure.close();

    assert.deepEqual(changes, [{ open: true }, { open: false }]);
  });

  it('does not emit when the state does not change', () => {
    const changes = collectChanges(disclosure);
    disclosure.close();
    assert.equal(changes.length, 0);
  });
});

describe('ui-disclosure attributes', () => {
  afterEach(() => cleanup());

  it('honours the open attribute on upgrade', () => {
    const host = mount(`
      <ui-disclosure summary="Advanced" open>
        <p>content</p>
      </ui-disclosure>
    `);
    const disclosure = host.querySelector('ui-disclosure');

    assert.equal(disclosure.expanded, true);
    assert.equal(contentOf(disclosure).hidden, false);
    assert.equal(triggerOf(disclosure).getAttribute('aria-expanded'), 'true');
  });

  it('reflects the open attribute in both directions', () => {
    const host = mount(SAMPLE);
    const disclosure = host.querySelector('ui-disclosure');

    disclosure.setAttribute('open', '');
    assert.equal(disclosure.expanded, true);

    disclosure.open();
    assert.equal(disclosure.hasAttribute('open'), true);

    disclosure.close();
    assert.equal(disclosure.hasAttribute('open'), false);
  });

  it('updates the trigger when summary changes', () => {
    const host = mount(SAMPLE);
    const disclosure = host.querySelector('ui-disclosure');

    disclosure.setAttribute('summary', 'Advanced options');
    assert.equal(triggerOf(disclosure).textContent, 'Advanced options');
  });

  it('applies configure() and returns the element', () => {
    const host = mount(SAMPLE);
    const disclosure = host.querySelector('ui-disclosure');

    const result = disclosure.configure({ summary: 'Renamed', variant: 'solid', open: true });

    assert.equal(result, disclosure);
    assert.equal(disclosure.summary, 'Renamed');
    assert.equal(disclosure.variant, 'solid');
    assert.equal(disclosure.expanded, true);
    assert.equal(disclosure.dataset.variant, 'solid');
  });

  it('falls back to safe defaults for an unknown variant', () => {
    const host = mount(SAMPLE);
    const disclosure = host.querySelector('ui-disclosure');

    disclosure.setAttribute('variant', 'nonsense');
    assert.equal(disclosure.variant, 'glass');
  });
});

describe('ui-disclosure teardown', () => {
  let host;
  let disclosure;

  beforeEach(() => {
    host = mount(SAMPLE);
    disclosure = host.querySelector('ui-disclosure');
  });

  afterEach(() => cleanup());

  it('restores the authored markup on disconnect', () => {
    disclosure.remove();

    assert.equal(triggerOf(disclosure), null, 'generated trigger removed');
    assert.equal(contentOf(disclosure), null, 'generated content removed');

    const payload = disclosure.querySelector('#payload');
    assert.ok(payload, 'author content put back');
    assert.equal(payload.textContent, 'Original markup');
    assert.equal(payload.parentElement, disclosure, 'restored as a direct child');
  });

  it('rebuilds on reconnect', () => {
    disclosure.remove();
    document.body.appendChild(disclosure);

    const trigger = triggerOf(disclosure);
    assert.ok(trigger, 'trigger rebuilt');
    assert.equal(trigger.textContent, 'Source');
    assert.equal(disclosure.querySelector('#payload').parentElement, contentOf(disclosure));
  });

  it('toggles again after a reconnect', () => {
    disclosure.remove();
    document.body.appendChild(disclosure);

    click(triggerOf(disclosure));
    assert.equal(disclosure.expanded, true);
  });

  it('handles an empty disclosure', () => {
    const host = mount('<ui-disclosure summary="Empty"></ui-disclosure>');
    const el = host.querySelector('ui-disclosure');

    assert.equal(triggerOf(el).textContent, 'Empty');
    el.open();
    assert.equal(el.expanded, true);
  });
});

describe('ui-disclosure keyboard reachability', () => {
  afterEach(() => cleanup());

  it('is focusable as a button and ignores unrelated keys', () => {
    const host = mount(SAMPLE);
    const disclosure = host.querySelector('ui-disclosure');
    const trigger = triggerOf(disclosure);

    trigger.focus();
    assert.equal(document.activeElement, trigger);

    press(trigger, 'a');
    assert.equal(disclosure.expanded, false, 'a letter key must not toggle');
  });
});