/**
 * A tiny synchronous event emitter used for component-internal signalling.
 *
 * Public component events are real DOM `CustomEvent`s (see `UI4UElement.emit`);
 * this emitter is for wiring inside a component where no DOM event is needed.
 */
export class Emitter {
  /** @type {Map<string, Set<Function>>} */
  #listeners = new Map();

  /**
   * @param {string} type
   * @param {(payload?: any) => void} handler
   * @returns {() => void} disposer
   */
  on(type, handler) {
    if (!this.#listeners.has(type)) this.#listeners.set(type, new Set());
    this.#listeners.get(type).add(handler);
    return () => this.off(type, handler);
  }

  /**
   * Subscribes for exactly one emission.
   *
   * @param {string} type
   * @param {(payload?: any) => void} handler
   * @returns {() => void} disposer
   */
  once(type, handler) {
    const dispose = this.on(type, (payload) => {
      dispose();
      handler(payload);
    });
    return dispose;
  }

  /**
   * @param {string} type
   * @param {(payload?: any) => void} handler
   * @returns {this}
   */
  off(type, handler) {
    this.#listeners.get(type)?.delete(handler);
    return this;
  }

  /**
   * Calls every listener for `type`. A throwing listener never prevents the
   * others from running.
   *
   * @param {string} type
   * @param {any} [payload]
   * @returns {number} number of listeners invoked
   */
  emit(type, payload) {
    const handlers = this.#listeners.get(type);
    if (!handlers?.size) return 0;

    for (const handler of [...handlers]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[ui4u] listener for "${type}" threw:`, error);
      }
    }

    return handlers.size;
  }

  /** Drops every listener. Call from `disconnectedCallback`. */
  clear() {
    this.#listeners.clear();
  }
}