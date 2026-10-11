import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { cleanup, mount, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component module is evaluated — see helpers/dom.js.
setupDom();

const { Popup } = await import('../../src/components/popup/popup.js');
const { define, isDefined } = await import('../../src/core/registry.js');

define('ui-popup', Popup);

/**
 * The surface is portalled to <body>, so it is not inside the host. The
 * component exposes it as a getter, which is also the right public API to use.
 *
 * @param {Element} popup
 * @returns {HTMLElement|null}
 */
function surfaceOf(popup) {
  return /** @type {any} */ (popup).surface ?? document.querySelector('.ui4u-popup__surface');
}

/** Dispatches a keydown on the document, where the popup listens. */
function pressKey(key) {
  document.dispatchEvent(
    new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  );
}

describe('ui-popup registration', () => {
  it('registers as a custom element', () => {
    assert.equal(isDefined('ui-popup'), true);
  });
});

describe('ui-popup build', () => {
  let popup;

  beforeEach(() => {
    popup = mount('<ui-popup label="Confirm"><p>Body</p></ui-popup>').querySelector('ui-popup');
  });

  afterEach(() => cleanup());

  it('portals the surface and backdrop to the body', () => {
    const surface = surfaceOf(popup);
    assert.ok(surface);
    assert.equal(surface.parentElement, document.body);
    assert.equal(popup.querySelector('.ui4u-popup__surface'), null, 'not nested in the host');
  });

  it('gives the surface a dialog role and the supplied label', () => {
    const surface = surfaceOf(popup);
    assert.equal(surface.getAttribute('role'), 'dialog');
    assert.equal(surface.getAttribute('aria-label'), 'Confirm');
  });

  it('drops the label attribute when none is supplied', () => {
    const bare = mount('<ui-popup><p>x</p></ui-popup>').querySelector('ui-popup');
    assert.equal(surfaceOf(bare).hasAttribute('aria-label'), false);
  });

  it('moves the authored markup into the surface', () => {
    const surface = surfaceOf(popup);
    assert.equal(surface.querySelector('p').textContent, 'Body');
  });

  it('adds a close button with an accessible name', () => {
    const close = surfaceOf(popup).querySelector('.ui4u-popup__close');
    assert.equal(close.tagName, 'BUTTON');
    assert.equal(close.getAttribute('aria-label'), 'Close dialog');
  });

  it('starts closed and hidden', () => {
    assert.equal(popup.isOpen, false);
    assert.equal(surfaceOf(popup).hidden, true);
    assert.equal(popup.dataset.open, 'false');
  });
});

describe('ui-popup modes', () => {
  afterEach(() => cleanup());

  const build = (attrs = '') =>
    mount(`<ui-popup label="T" ${attrs}><p>x</p></ui-popup>`).querySelector('ui-popup');

  it('defaults to modal and marks aria-modal when open', () => {
    const popup = build();
    assert.equal(popup.mode, 'modal');

    popup.openPopup();
    assert.equal(surfaceOf(popup).getAttribute('aria-modal'), 'true');
  });

  it('never marks a non-modal as aria-modal', () => {
    for (const mode of ['popover', 'drawer']) {
      cleanup();
      const popup = build(`mode="${mode}" open`);
      assert.equal(popup.mode, mode);
      assert.equal(surfaceOf(popup).getAttribute('aria-modal'), 'false', mode);
    }
  });

  it('falls back to modal for an unknown mode', () => {
    assert.equal(build('mode="nonsense"').mode, 'modal');
  });

  it('hides the backdrop in popover mode', () => {
    build('mode="popover" open');
    const backdrop = document.querySelector('.ui4u-popup__backdrop');
    assert.equal(backdrop.hidden, true);
  });

  it('defaults the drawer side to right', () => {
    assert.equal(build('mode="drawer"').side, 'right');
    assert.equal(build('mode="drawer" side="left"').side, 'left');
  });
});

describe('ui-popup open and close', () => {
  let popup;

  beforeEach(() => {
    popup = mount('<ui-popup label="T"><button id="a">A</button></ui-popup>').querySelector(
      'ui-popup'
    );
  });

  afterEach(() => cleanup());

  it('openPopup reveals the surface and reflects the attribute', () => {
    popup.openPopup();
    assert.equal(popup.isOpen, true);
    assert.equal(popup.hasAttribute('open'), true);
    assert.equal(surfaceOf(popup).hidden, false);
    assert.equal(popup.dataset.open, 'true');
  });

  it('closePopup hides it again', () => {
    popup.openPopup();
    popup.closePopup();
    assert.equal(popup.isOpen, false);
    assert.equal(surfaceOf(popup).hidden, true);
  });

  it('opens and closes from the open attribute changing', () => {
    popup.setAttribute('open', '');
    assert.equal(popup.isOpen, true);
    assert.equal(surfaceOf(popup).hidden, false);

    popup.removeAttribute('open');
    assert.equal(surfaceOf(popup).hidden, true);
  });

  it('toggles', () => {
    popup.toggle();
    assert.equal(popup.isOpen, true);
    popup.toggle();
    assert.equal(popup.isOpen, false);
  });

  it('is idempotent and does not emit twice', () => {
    /** @type {any[]} */
    const events = [];
    popup.addEventListener('ui4u:open', (e) => events.push(e.detail));

    popup.openPopup();
    popup.openPopup();
    assert.equal(events.length, 1);
  });

  it('emits ui4u:open and ui4u:close', () => {
    /** @type {string[]} */
    const seen = [];
    popup.addEventListener('ui4u:open', () => seen.push('open'));
    popup.addEventListener('ui4u:close', () => seen.push('close'));

    popup.openPopup();
    popup.closePopup();

    assert.deepEqual(seen, ['open', 'close']);
  });

  it('applies configure() and returns the element', () => {
    const result = popup.configure({
      mode: 'drawer',
      side: 'left',
      dismissible: false,
      label: 'Renamed',
      open: true,
    });

    assert.equal(result, popup);
    assert.equal(popup.mode, 'drawer');
    assert.equal(popup.side, 'left');
    assert.equal(popup.dismissible, false);
    assert.equal(popup.label, 'Renamed');
    assert.equal(popup.isOpen, true);
    assert.equal(surfaceOf(popup).getAttribute('aria-label'), 'Renamed');
  });
});

describe('ui-popup dismissal', () => {
  afterEach(() => cleanup());

  const build = (attrs = '') =>
    mount(`<ui-popup label="T" open ${attrs}><button>A</button></ui-popup>`).querySelector(
      'ui-popup'
    );

  it('closes on Escape and emits ui4u:cancel first', () => {
    const popup = build();
    /** @type {string[]} */
    const seen = [];
    popup.addEventListener('ui4u:cancel', () => seen.push('cancel'));
    popup.addEventListener('ui4u:close', () => seen.push('close'));

    pressKey('Escape');

    assert.deepEqual(seen, ['cancel', 'close']);
    assert.equal(popup.isOpen, false);
  });

  it('ignores Escape when not dismissible', () => {
    const popup = build('dismissible="false"');
    pressKey('Escape');
    assert.equal(popup.isOpen, true);
  });

  it('hides the close button when not dismissible', () => {
    const popup = build('dismissible="false"');
    assert.equal(surfaceOf(popup).querySelector('.ui4u-popup__close').hidden, true);
  });

  it('closes when the backdrop is clicked', () => {
    const popup = build();
    document
      .querySelector('.ui4u-popup__backdrop')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    assert.equal(popup.isOpen, false);
  });

  it('closes when the close button is clicked', () => {
    const popup = build();
    surfaceOf(popup)
      .querySelector('.ui4u-popup__close')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    assert.equal(popup.isOpen, false);
  });

  it('ignores Escape while closed', () => {
    const popup = build();
    popup.closePopup();

    /** @type {any[]} */
    const cancels = [];
    popup.addEventListener('ui4u:cancel', (e) => cancels.push(e.detail));

    pressKey('Escape');
    assert.equal(cancels.length, 0);
  });
});

describe('ui-popup teardown', () => {
  afterEach(() => cleanup());

  it('removes the portalled nodes on disconnect', () => {
    const popup = mount('<ui-popup label="T" open><p>x</p></ui-popup>').querySelector('ui-popup');

    assert.ok(document.querySelector('.ui4u-popup__surface'));
    popup.remove();

    assert.equal(document.querySelector('.ui4u-popup__surface'), null);
    assert.equal(document.querySelector('.ui4u-popup__backdrop'), null);
  });

  it('rebuilds on reconnect', () => {
    const popup = mount('<ui-popup label="T"><p>x</p></ui-popup>').querySelector('ui-popup');
    popup.remove();
    document.body.appendChild(popup);

    assert.ok(document.querySelector('.ui4u-popup__surface'), 'surface rebuilt');
    assert.equal(document.querySelector('.ui4u-popup__surface p').textContent, 'x');
  });
});

describe('ui-popup bindings', () => {
  let popup;

  beforeEach(() => {
    popup = mount('<ui-popup label="Confirm"><p>Body</p></ui-popup>').querySelector('ui-popup');
  });

  afterEach(() => cleanup());

  it('runs an open binding with the detail the event carries', () => {
    /** @type {any[]} */
    const seen = [];
    popup.bind('open', (detail) => seen.push(detail));

    popup.openPopup();

    assert.deepEqual(seen, [{ mode: 'modal' }]);
  });

  it('a binding returning false leaves the popup closed and untrapped', () => {
    /** @type {unknown[]} */
    const events = [];
    popup.addEventListener('ui4u:open', () => events.push('open'));
    popup.bind('open', () => false);

    popup.openPopup();

    assert.equal(popup.isOpen, false, 'no open attribute');
    assert.equal(popup.hasAttribute('open'), false);
    assert.equal(surfaceOf(popup).hidden, true, 'the surface never appeared');
    assert.deepEqual(events, []);
  });

  it('a binding returning false leaves the popup open when asked to close', () => {
    popup.openPopup();
    /** @type {unknown[]} */
    const events = [];
    popup.addEventListener('ui4u:close', () => events.push('close'));
    popup.bind('close', () => false);

    popup.closePopup();

    assert.equal(popup.isOpen, true, 'still open');
    assert.equal(surfaceOf(popup).hidden, false);
    assert.deepEqual(events, []);
  });

  it('a binding calling preventDefault vetoes the open', () => {
    popup.bind('open', (_detail, event) => event.preventDefault());

    popup.openPopup();

    assert.equal(popup.isOpen, false);
    assert.equal(surfaceOf(popup).hidden, true);
  });

  it('a vetoed cancel leaves the popup standing — this is the "are you sure?" case', () => {
    popup.openPopup();
    /** @type {unknown[]} */
    const events = [];
    popup.addEventListener('ui4u:cancel', () => events.push('cancel'));
    popup.bind('cancel', () => false);

    pressKey('Escape');

    assert.equal(popup.isOpen, true, 'the popup did not close behind the consumer back');
    assert.equal(surfaceOf(popup).hidden, false);
    assert.deepEqual(events, [], 'and the dismissal was never announced');
  });

  it('a binding returning undefined lets the popup open, and ui4u:open still fires', () => {
    /** @type {unknown[]} */
    const events = [];
    popup.addEventListener('ui4u:open', () => events.push('open'));
    popup.bind('open', () => undefined);

    popup.openPopup();

    assert.equal(popup.isOpen, true);
    assert.equal(surfaceOf(popup).hidden, false);
    assert.deepEqual(events, ['open']);
  });

  it('cancelling without a veto emits ui4u:cancel and then closes', () => {
    popup.openPopup();
    /** @type {unknown[]} */
    const events = [];
    popup.addEventListener('ui4u:cancel', () => events.push('cancel'));
    popup.addEventListener('ui4u:close', () => events.push('close'));

    pressKey('Escape');

    assert.deepEqual(events, ['cancel', 'close'], 'the existing order is unchanged');
    assert.equal(popup.isOpen, false);
  });

  it('configure({ bindings }) registers bindings', () => {
    /** @type {unknown[]} */
    const seen = [];
    popup.configure({ bindings: { open: (detail) => seen.push(detail) } });

    popup.openPopup();

    assert.equal(seen.length, 1);
    assert.equal(popup.isOpen, true);
  });
});
