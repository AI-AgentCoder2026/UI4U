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
 * Accepts either `change` or `ui4u:change` for a binding name.
 *
 * Both spellings are natural — one from the DOM event, one from the method call
 * site — and silently registering under the wrong key would make a binding
 * that never fires.
 *
 * @param {string} name
 * @returns {string}
 */
function normalizeBindingName(name) {
  return String(name ?? '').replace(/^ui4u:/, '');
}

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
  /** True while this element is being relocated inside the document. */
  #moving = false;
  /** Semantic event name → handlers. @type {Map<string, Set<Function>>} */
  #bindings = new Map();

  /** True between `connectedCallback` and `disconnectedCallback`. */
  get isLive() {
    return this.#live;
  }

  connectedCallback() {
    // A relocation is not a new element: rebuilding here would tear down
    // state, listeners and focus that the move was meant to preserve.
    if (this.#moving) return;
    this.#live = true;
    this.onConnect();
  }

  disconnectedCallback() {
    if (this.#moving) return;
    this.#live = false;
    this.onDisconnect();

    for (const dispose of this.#disposers) dispose();
    this.#disposers = [];
  }

  /**
   * Moves this element to another parent **without** a disconnect/reconnect.
   *
   * `appendChild` on a connected node fires both callbacks, which for most
   * components means a teardown and a rebuild. Some have to relocate
   * themselves — a sidebar that becomes an off-canvas drawer must leave any
   * `transform`ed, `filter`ed or `backdrop-filter`ed ancestor, or that ancestor
   * becomes the containing block for its fixed positioning — and that must not
   * cost them their identity.
   *
   * @param {Node} parent
   * @returns {this}
   *
   * @example
   * document.body.contains(sidebar) ? sidebar.moveTo(dock) : sidebar.moveTo(document.body);
   */
  moveTo(parent) {
    if (this.parentNode === parent) return this;
    this.#moving = true;
    try {
      parent.appendChild(this);
    } finally {
      this.#moving = false;
    }
    return this;
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

  /* ------------------------------------------------------------ bindings */

  /**
   * Registers a callback for one of this component's semantic events.
   *
   * A binding runs **before** the component acts, and can override it: call
   * `event.preventDefault()` or return `false` and the component skips its own
   * behaviour for that interaction. Returning anything else lets it proceed.
   * That is the difference between "tell me what happened" and "I am handling
   * this myself".
   *
   * The name matches the event without its `ui4u:` prefix — `bind('change', …)`
   * pairs with `ui4u:change`.
   *
   * @param {string} name e.g. `'change'`
   * @param {(detail: any, event: CustomEvent) => unknown} handler
   * @returns {this}
   *
   * @example
   * field.bind('change', (detail) => {
   *   if (!detail.amount) return false; // reject the value, change nothing
   * });
   */
  bind(name, handler) {
    if (typeof handler !== 'function') return this;
    const key = normalizeBindingName(name);

    if (!this.#bindings.has(key)) this.#bindings.set(key, new Set());
    this.#bindings.get(key)?.add(handler);
    return this;
  }

  /**
   * Removes one binding, or every binding for a name when no handler is given.
   *
   * @param {string} name
   * @param {(detail: any, event: CustomEvent) => unknown} [handler]
   * @returns {this}
   */
  unbind(name, handler) {
    const key = normalizeBindingName(name);
    const handlers = this.#bindings.get(key);
    if (!handlers) return this;

    if (handler) handlers.delete(handler);
    else handlers.clear();

    return this;
  }

  /**
   * The names that currently have at least one binding.
   *
   * @returns {string[]}
   */
  get bindingNames() {
    return [...this.#bindings.keys()].filter((key) => (this.#bindings.get(key)?.size ?? 0) > 0);
  }

  /**
   * Runs the bindings for `name` and reports whether the component may proceed.
   *
   * Returns `true` when there is nothing to run, so an unbound component costs
   * one map lookup and every call site can be written the same way.
   *
   * @param {string} name
   * @param {any} [detail]
   * @returns {boolean} `false` when a binding overrode the action
   *
   * @example
   * if (!this.runBinding('change', { value })) return this;
   */
  runBinding(name, detail = {}) {
    const handlers = this.#bindings.get(normalizeBindingName(name));
    if (!handlers || handlers.size === 0) return true;

    // Snapshot: a binding is allowed to unbind itself while it runs.
    for (const handler of [...handlers]) {
      const event = new CustomEvent(`ui4u:${name}`, {
        detail,
        cancelable: true,
      });

      let result;
      try {
        result = handler(detail, event);
      } catch (error) {
        // A throwing binding must not take the component down with it.
        this.reportError?.(error);
        continue;
      }

      if (result === false || event.defaultPrevented) return false;
    }

    return true;
  }

  /**
   * Adds bindings in bulk. Every component's `configure()` forwards `bindings`
   * here, so `configure({ bindings: { change: fn } })` works everywhere.
   *
   * @param {Record<string, (detail: any, event: CustomEvent) => unknown>} bindings
   * @returns {this}
   */
  bindAll(bindings) {
    if (!bindings || typeof bindings !== 'object') return this;
    for (const [name, handler] of Object.entries(bindings)) this.bind(name, handler);
    return this;
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
