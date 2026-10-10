import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { cleanup, click, mount, press, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component module is evaluated — see helpers/dom.js.
setupDom();

const { Button } = await import('../../src/components/button/button.js');
const { define, isDefined } = await import('../../src/core/registry.js');

define('ui-button', Button);

/** @returns {HTMLElement} the native control the component rendered */
function controlOf(button) {
  return button.querySelector('.ui4u-button__control');
}

/** @returns {HTMLElement|null} the polite live region */
function statusOf(button) {
  return button.querySelector('.ui4u-button__status');
}

/**
 * Collects `ui4u:press` payloads emitted by a button.
 *
 * @param {EventTarget} target
 * @returns {Array<{ variant: string, size: string, href: string }>} live array
 */
function collectPresses(target) {
  /** @type {Array<{ variant: string, size: string, href: string }>} */
  const seen = [];
  target.addEventListener('ui4u:press', (event) => seen.push(event.detail));
  return seen;
}

describe('ui-button registration', () => {
  it('registers the custom element', () => {
    assert.equal(isDefined('ui-button'), true);
  });
});

describe('ui-button rendering', () => {
  let host;
  let button;

  beforeEach(() => {
    host = mount('<ui-button>Save</ui-button>');
    button = host.querySelector('ui-button');
  });

  afterEach(() => cleanup());

  it('renders a native button by default', () => {
    const control = controlOf(button);

    assert.equal(control.localName, 'button');
    assert.equal(control.getAttribute('type'), 'button');
    assert.equal(button.querySelector('div'), null, 'never a div with a click handler');
  });

  it('renders an anchor when href is set', () => {
    const linked = mount('<ui-button href="/docs">Docs</ui-button>').querySelector('ui-button');
    const control = controlOf(linked);

    assert.equal(control.localName, 'a');
    assert.equal(control.getAttribute('href'), '/docs');
    assert.equal(linked.querySelector('button'), null);
  });

  it('swaps the native element when href is added or removed', () => {
    button.href = '/docs';
    assert.equal(controlOf(button).localName, 'a');
    assert.equal(controlOf(button).getAttribute('href'), '/docs');

    button.href = '';
    assert.equal(controlOf(button).localName, 'button');
  });

  it('moves the authored label into the control', () => {
    assert.equal(controlOf(button).textContent, 'Save');
  });

  it('exposes variant and size defaults on the host', () => {
    assert.equal(button.dataset.variant, 'primary');
    assert.equal(button.dataset.size, 'md');
  });

  it('keeps a unique id per generated node', () => {
    const first = mount('<ui-button>One</ui-button>').querySelector('ui-button');
    const second = mount('<ui-button>Two</ui-button>').querySelector('ui-button');

    assert.ok(controlOf(first).id);
    assert.ok(statusOf(first).id);
    assert.notEqual(controlOf(first).id, controlOf(second).id);
  });
});

describe('ui-button option resolution', () => {
  afterEach(() => cleanup());

  it('resolves every documented variant and size', () => {
    const button = mount('<ui-button>Save</ui-button>').querySelector('ui-button');

    for (const variant of ['primary', 'secondary', 'ghost', 'danger', 'subtle']) {
      button.setAttribute('variant', variant);
      assert.equal(button.variant, variant);
      assert.equal(button.dataset.variant, variant);
    }

    for (const size of ['sm', 'md', 'lg']) {
      button.setAttribute('size', size);
      assert.equal(button.size, size);
      assert.equal(button.dataset.size, size);
    }
  });

  it('falls back to primary and md for unknown values', () => {
    const button = mount('<ui-button>Save</ui-button>').querySelector('ui-button');

    button.setAttribute('variant', 'nonsense');
    button.setAttribute('size', 'nonsense');
    button.setAttribute('type', 'nonsense');

    assert.equal(button.variant, 'primary');
    assert.equal(button.size, 'md');
    assert.equal(button.type, 'button');
    assert.equal(button.dataset.variant, 'primary', 'the hook falls back too');
    assert.equal(controlOf(button).getAttribute('type'), 'button');
  });

  it('applies the native type only to a button control', () => {
    const button = mount('<ui-button type="submit">Save</ui-button>').querySelector('ui-button');

    assert.equal(button.type, 'submit');
    assert.equal(controlOf(button).getAttribute('type'), 'submit');

    // Anchor mode has no button type; the control must not gain one.
    button.href = '/docs';
    assert.equal(controlOf(button).getAttribute('type'), null);

    button.type = 'reset';
    assert.equal(controlOf(button).getAttribute('type'), null);
  });
});

describe('ui-button configure()', () => {
  afterEach(() => cleanup());

  it('applies every option and returns the element', () => {
    const button = mount('<ui-button>Save</ui-button>').querySelector('ui-button');

    const result = button.configure({
      variant: 'danger',
      size: 'lg',
      type: 'submit',
      disabled: true,
      loading: true,
      href: '/save',
    });

    assert.equal(result, button);
    assert.equal(button.variant, 'danger');
    assert.equal(button.size, 'lg');
    assert.equal(button.type, 'submit');
    assert.equal(button.disabled, true);
    assert.equal(button.loading, true);
    assert.equal(button.href, '/save');
    assert.equal(controlOf(button).localName, 'a');
  });

  it('leaves untouched options alone', () => {
    const button = mount('<ui-button variant="ghost" size="lg">Save</ui-button>').querySelector(
      'ui-button'
    );

    button.configure({ size: 'sm' });

    assert.equal(button.size, 'sm');
    assert.equal(button.variant, 'ghost');
  });

  it('clears href when set to an empty value', () => {
    const button = mount('<ui-button href="/docs">Docs</ui-button>').querySelector('ui-button');

    button.configure({ href: '' });

    assert.equal(button.href, '');
    assert.equal(button.hasAttribute('href'), false);
    assert.equal(controlOf(button).localName, 'button');
  });
});

describe('ui-button activation', () => {
  afterEach(() => cleanup());

  it('emits ui4u:press once per click', () => {
    const button = mount('<ui-button>Save</ui-button>').querySelector('ui-button');
    const presses = collectPresses(button);

    click(controlOf(button));

    assert.equal(presses.length, 1);
    assert.equal(presses[0].variant, 'primary');
    assert.equal(presses[0].size, 'md');
    assert.equal(presses[0].href, '');
    assert.equal(presses[0].control, controlOf(button));
  });

  it('still fires the native click on the inner control', () => {
    const button = mount('<ui-button>Save</ui-button>').querySelector('ui-button');
    /** @type {Event[]} */
    const native = [];
    controlOf(button).addEventListener('click', (event) => native.push(event));

    click(controlOf(button));

    assert.equal(native.length, 1, 'the native click still reaches the control');
  });

  it('emits ui4u:press for an anchor control', () => {
    // A hash href so jsdom does not attempt a real navigation.
    const button = mount('<ui-button href="#docs">Docs</ui-button>').querySelector('ui-button');
    const presses = collectPresses(button);

    const event = click(controlOf(button));

    assert.equal(presses.length, 1);
    assert.equal(presses[0].href, '#docs');
    assert.equal(event.defaultPrevented, false, 'a live link is not cancelled');
  });

  it('click() activates programmatically', () => {
    const button = mount('<ui-button>Save</ui-button>').querySelector('ui-button');
    const presses = collectPresses(button);

    assert.equal(button.click(), button, 'returns this');
    assert.equal(presses.length, 1);
  });
});

describe('ui-button disabled', () => {
  afterEach(() => cleanup());

  it('mirrors onto the native button', () => {
    const button = mount('<ui-button disabled>Save</ui-button>').querySelector('ui-button');

    assert.equal(button.disabled, true);
    assert.equal(controlOf(button).disabled, true);
    assert.equal(controlOf(button).getAttribute('aria-disabled'), null);
  });

  it('sets aria-disabled on an anchor, which cannot be natively disabled', () => {
    const button = mount('<ui-button href="/docs" disabled>Docs</ui-button>').querySelector(
      'ui-button'
    );

    assert.equal(controlOf(button).getAttribute('aria-disabled'), 'true');
    assert.equal(controlOf(button).hasAttribute('disabled'), false);
  });

  it('keeps aria-disabled in sync with the attribute', () => {
    const button = mount('<ui-button href="/docs">Docs</ui-button>').querySelector('ui-button');

    button.disabled = true;
    assert.equal(controlOf(button).getAttribute('aria-disabled'), 'true');

    button.disabled = false;
    assert.equal(controlOf(button).hasAttribute('aria-disabled'), false);
  });

  it('blocks activation and cancels the native click', () => {
    const button = mount('<ui-button>Save</ui-button>').querySelector('ui-button');
    const presses = collectPresses(button);

    button.disabled = true;
    const event = click(controlOf(button));

    assert.equal(presses.length, 0, 'no ui4u:press');
    assert.equal(event.defaultPrevented, true, 'the native click is cancelled');

    button.click();
    assert.equal(presses.length, 0, 'click() is a no-op too');
  });

  it('blocks an anchor and cancels its navigation', () => {
    const button = mount('<ui-button href="/docs">Docs</ui-button>').querySelector('ui-button');
    const presses = collectPresses(button);

    button.disabled = true;
    const event = click(controlOf(button));

    assert.equal(presses.length, 0);
    assert.equal(event.defaultPrevented, true);
  });

  it('swallows Enter and Space while disabled', () => {
    const button = mount('<ui-button href="/docs" disabled>Docs</ui-button>').querySelector(
      'ui-button'
    );

    assert.equal(press(controlOf(button), 'Enter').defaultPrevented, true);
    assert.equal(press(controlOf(button), ' ').defaultPrevented, true, 'Space must not scroll');
    assert.equal(press(controlOf(button), 'a').defaultPrevented, false);
  });
});

describe('ui-button loading', () => {
  afterEach(() => cleanup());

  it('sets aria-busy on the control', () => {
    const button = mount('<ui-button>Save</ui-button>').querySelector('ui-button');

    assert.equal(controlOf(button).hasAttribute('aria-busy'), false);

    button.loading = true;
    assert.equal(controlOf(button).getAttribute('aria-busy'), 'true');
    assert.equal(button.dataset.loading, 'true');

    button.loading = false;
    assert.equal(controlOf(button).hasAttribute('aria-busy'), false);
    assert.equal(button.hasAttribute('data-loading'), false);
  });

  it('exposes a polite live region announcing the busy state', () => {
    const button = mount('<ui-button>Save</ui-button>').querySelector('ui-button');
    const status = statusOf(button);

    assert.equal(status.getAttribute('role'), 'status');
    assert.equal(status.getAttribute('aria-live'), 'polite');
    assert.equal(status.textContent, '', 'quiet until busy');

    button.loading = true;
    assert.equal(status.textContent, 'Working…');

    button.loading = false;
    assert.equal(status.textContent, '');
  });

  it('keeps the live region out of the accessible name', () => {
    const button = mount('<ui-button loading>Save</ui-button>').querySelector('ui-button');

    assert.equal(controlOf(button).textContent, 'Save');
  });

  it('blocks activation while busy', () => {
    const button = mount('<ui-button>Save</ui-button>').querySelector('ui-button');
    const presses = collectPresses(button);

    button.loading = true;
    const event = click(controlOf(button));

    assert.equal(presses.length, 0);
    assert.equal(event.defaultPrevented, true);
    assert.equal(controlOf(button).disabled, true, 'the native button is disabled while busy');
  });

  it('marks an anchor busy and unavailable', () => {
    const button = mount('<ui-button href="/docs">Docs</ui-button>').querySelector('ui-button');

    button.loading = true;

    assert.equal(controlOf(button).getAttribute('aria-busy'), 'true');
    assert.equal(controlOf(button).getAttribute('aria-disabled'), 'true');
  });

  it('fires again once loading clears', () => {
    const button = mount('<ui-button>Save</ui-button>').querySelector('ui-button');
    const presses = collectPresses(button);

    button.loading = true;
    button.loading = false;
    click(controlOf(button));

    assert.equal(presses.length, 1);
  });
});

describe('ui-button accessible name', () => {
  afterEach(() => cleanup());

  it('is the authored text content in button mode', () => {
    const button = mount('<ui-button>Save changes</ui-button>').querySelector('ui-button');
    const control = controlOf(button);

    assert.equal(control.textContent, 'Save changes');
    assert.equal(control.getAttribute('aria-label'), null, 'no label override needed');
  });

  it('is the authored text content in anchor mode', () => {
    const button = mount('<ui-button href="/docs">Documentation</ui-button>').querySelector(
      'ui-button'
    );

    assert.equal(controlOf(button).textContent, 'Documentation');
  });

  it('keeps rich label markup inside the control', () => {
    const host = mount('<ui-button><strong>Save</strong> now</ui-button>');
    const button = host.querySelector('ui-button');
    const control = controlOf(button);

    assert.equal(control.querySelector('strong').textContent, 'Save');
    assert.equal(control.textContent, 'Save now');
  });

  it('stays a single tab stop', () => {
    const button = mount('<ui-button>Save</ui-button>').querySelector('ui-button');

    assert.equal(controlOf(button).tabIndex, 0);
  });
});

describe('ui-button teardown', () => {
  afterEach(() => cleanup());

  it('removes generated markup and restores the label on disconnect', () => {
    const button = mount('<ui-button>Save</ui-button>').querySelector('ui-button');

    button.remove();

    assert.equal(button.querySelector('.ui4u-button__control'), null, 'control removed');
    assert.equal(button.querySelector('.ui4u-button__status'), null, 'live region removed');
    assert.equal(button.textContent, 'Save', 'author markup restored');
    assert.equal(button.hasAttribute('data-variant'), false, 'style hooks cleared');
  });

  it('rebuilds correctly when reconnected', () => {
    const button = mount('<ui-button variant="ghost" size="lg">Save</ui-button>').querySelector(
      'ui-button'
    );

    button.remove();
    document.body.appendChild(button);

    const control = controlOf(button);
    assert.equal(control.localName, 'button');
    assert.equal(control.textContent, 'Save');
    assert.equal(button.dataset.variant, 'ghost');
    assert.equal(button.dataset.size, 'lg');
  });

  it('does not fire presses after disconnect', () => {
    const button = mount('<ui-button>Save</ui-button>').querySelector('ui-button');
    const control = controlOf(button);
    const presses = collectPresses(button);

    button.remove();
    click(control);

    assert.equal(presses.length, 0, 'tracked listeners were disposed');
  });

  it('is inert before it connects', () => {
    const button = document.createElement('ui-button');

    assert.equal(controlOf(button), null);
    assert.equal(button.variant, 'primary');
    assert.equal(button.disabled, false);
  });
});