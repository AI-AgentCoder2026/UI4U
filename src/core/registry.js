/**
 * Custom element registration.
 *
 * Component modules only export their class — they never call
 * `customElements.define` at import time. `src/index.js` (the public entry)
 * wires them up, so importing a single component module stays side-effect free
 * and safe under SSR.
 */

/** @type {Map<string, CustomElementConstructor>} */
const registry = new Map();

/**
 * Registers a custom element exactly once.
 *
 * Safe to call in a non-browser environment (SSR, unit tests without a DOM),
 * where it is a no-op — importing the library must never crash Node.
 *
 * @param {string} tagName e.g. `'ui-tabs'`
 * @param {CustomElementConstructor} constructor
 * @returns {boolean} whether the element was registered by this call
 *
 * @example
 * import { Tabs } from './components/tabs/index.js';
 * define('ui-tabs', Tabs);
 */
export function define(tagName, constructor) {
  if (typeof customElements === 'undefined') return false;
  if (registry.has(tagName) || customElements.get(tagName)) return false;

  customElements.define(tagName, constructor);
  registry.set(tagName, constructor);
  return true;
}

/**
 * @param {string} tagName
 * @returns {CustomElementConstructor|undefined}
 */
export function get(tagName) {
  return registry.get(tagName) ?? customElements?.get(tagName);
}

/**
 * @param {string} tagName
 * @returns {boolean}
 */
export function isDefined(tagName) {
  return typeof customElements !== 'undefined' && Boolean(customElements.get(tagName));
}

/**
 * Every tag name registered through this registry, in registration order.
 *
 * @returns {string[]}
 */
export function definedTags() {
  return [...registry.keys()];
}
