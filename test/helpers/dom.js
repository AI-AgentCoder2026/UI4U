/**
 * DOM harness for node:test.
 *
 * `UI4UElement` captures `globalThis.HTMLElement` when its module is evaluated,
 * so a DOM must exist **before** any component module is imported. Tests
 * therefore call `setupDom()` at module scope and then import components
 * dynamically:
 *
 * ```js
 * import { setupDom } from '../helpers/dom.js';
 * setupDom();
 * const { Tabs } = await import('../../src/components/tabs/tabs.js');
 * ```
 */
import jsdomPkg from 'jsdom';

const { JSDOM } = jsdomPkg;

/** Globals the UI4U source legitimately reaches for. */
const EXPOSED = [
  'window',
  'document',
  'customElements',
  'HTMLElement',
  'Element',
  'Node',
  'NodeList',
  'Event',
  'CustomEvent',
  'KeyboardEvent',
  'MouseEvent',
  'PointerEvent',
  'getComputedStyle',
];

/** @type {import('jsdom').DOM | null} */
let current = null;

/**
 * Creates a jsdom instance and publishes the globals the library expects.
 *
 * @param {string} [body] initial body markup (trusted, test-authored only)
 * @returns {import('jsdom').DOM}
 */
export function setupDom(body = '') {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`, {
    pretendToBeVisual: true,
    url: 'http://localhost/',
  });

  for (const key of EXPOSED) {
    if (dom.window[key] !== undefined) {
      globalThis[key] =
        key === 'getComputedStyle' ? dom.window[key].bind(dom.window) : dom.window[key];
    }
  }

  // jsdom ships no matchMedia; UI4U guards for it, and this keeps tests honest.
  if (typeof globalThis.matchMedia !== 'function') {
    globalThis.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    });
  }

  current = dom;
  return dom;
}

/** @returns {import('jsdom').DOM} */
export function dom() {
  if (!current) throw new Error('setupDom() must be called before using the harness');
  return current;
}

/**
 * Mounts trusted, test-authored markup into the document body and returns the
 * host element. Uses `innerHTML` deliberately — this is a test fixture, never
 * consumer input.
 *
 * @param {string} markup
 * @returns {HTMLElement} the host element
 */
export function mount(markup) {
  const host = document.createElement('div');
  host.innerHTML = markup;
  document.body.appendChild(host);
  return host;
}

/** Removes everything the test mounted. */
export function cleanup() {
  document.body.innerHTML = '';
}

/**
 * Dispatches a keydown from an element.
 *
 * @param {Element} target
 * @param {string} key
 * @param {KeyboardEventInit} [init]
 * @returns {KeyboardEvent} the dispatched event
 */
export function press(target, key, init = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

/**
 * Dispatches a click from an element.
 *
 * @param {Element} target
 * @returns {MouseEvent} the dispatched event
 */
export function click(target) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/**
 * Collects `ui4u:change` payloads emitted by a component.
 *
 * @param {EventTarget} target
 * @returns {Array<{ index: number, label: string }>} live array, appended in order
 */
export function collectChanges(target) {
  /** @type {Array<{ index: number, label: string }>} */
  const seen = [];
  target.addEventListener('ui4u:change', (event) => seen.push(event.detail));
  return seen;
}
