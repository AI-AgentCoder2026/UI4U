/**
 * Base class for every UI4U custom element.
 *
 * The `HTMLElement` lookup is guarded so that importing a component module in a
 * non-browser environment (SSR, node:test) yields a usable class instead of a
 * `ReferenceError`. Nothing in this file touches `document` or `window` at
 * module scope.
 */

const HTMLElementBase = /** @type {typeof HTMLElement} */ (
  /** @type {unknown} */ (globalThis.HTMLElement ?? class {})
);

/**
 * Lifecycle contract for components:
 *
 * - `connectedCallback` runs `onConnect`, then marks the element live
 * - `disconnectedCallback` runs `onDisconnect`, then auto-disposes every
 *   listener registered through `track()`, so teardown never leaks
 *
 * Subclasses should override `onConnect`/`onDisconnect` rather than the
 * lifecycle callbacks themselves, and call `super` when they do override.
 */
export class UI4UElement extends HTMLElementBase {
  /** @returns {string[]} attributes that trigger `attributeChangedCallback` */
  static get observedAttributes() {
    return [];
  }

  /** @type {Array<() => void>} */
  #disposers = [];
  #live = false;

  /** True between `connectedCallback` and `disconnectedCallback`. */
  get isLive() {
    return this.#live;
  }

  connectedCallback() {
    this.#live = true;
    this.onConnect();
  }

  disconnectedCallback() {
    this.#live = false;
    this.onDisconnect();

    for (const dispose of this.#disposers) dispose();
    this.#disposers = [];
  }

  attributeChangedCallback(_name, _oldValue, _newValue) {}

  /** Override for setup. The element is connected and styles are available. */
  onConnect() {}

  /** Override for teardown that needs to run before disposers are released. */
  onDisconnect() {}

  /**
   * Registers a disposer to run automatically on disconnect.
   *
   * @template {() => void} D
   * @param {D} dispose
   * @returns {D} the same disposer, for inline use
   */
  track(dispose) {
    this.#disposers.push(dispose);
    return dispose;
  }

  /**
   * Dispatches a namespaced `CustomEvent`. Every UI4U public event is prefixed
   * `ui4u:` so it cannot collide with consumer or framework events.
   *
   * @param {string} type e.g. `'ui4u:change'`
   * @param {any} [detail]
   * @param {{bubbles?: boolean, composed?: boolean}} [options]
   * @returns {boolean} whether the event was dispatched
   *
   * @example
   * tabs.addEventListener('ui4u:change', (e) => console.log(e.detail.index));
   */
  emit(type, detail = {}, { bubbles = true, composed = true } = {}) {
    if (typeof CustomEvent === 'undefined') return false;
    return this.dispatchEvent(new CustomEvent(type, { detail, bubbles, composed }));
  }

  /**
   * @param {string} name
   * @param {boolean} [fallback]
   * @returns {boolean}
   */
  getBoolean(name, fallback = false) {
    const value = this.getAttribute(name);
    if (value === null) return fallback;
    return value !== 'false';
  }

  /**
   * @param {string} name
   * @param {number} [fallback]
   * @returns {number}
   */
  getNumber(name, fallback = 0) {
    const value = Number.parseFloat(this.getAttribute(name) ?? '');
    return Number.isFinite(value) ? value : fallback;
  }

  /**
   * @param {string} name
   * @param {string} [fallback]
   * @returns {string}
   */
  getString(name, fallback = '') {
    return this.getAttribute(name) ?? fallback;
  }

  /**
   * Reflects a property to an attribute.
   *
   * @param {string} name
   * @param {unknown} value
   */
  reflect(name, value) {
    if (value === null || value === undefined) this.removeAttribute(name);
    else this.setAttribute(name, String(value));
  }
}
