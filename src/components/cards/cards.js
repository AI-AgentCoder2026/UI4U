import { UI4UElement } from '../../core/base.js';
import { on } from '../../core/dom.js';

/**
 * @typedef {object} CardsOptions
 * @property {string} [label] Accessible name for the list. Recommended.
 * @property {number|null} [columns] A fixed track count. `null` (the default)
 *   lets the grid fill the width, which is what a responsive catalogue wants.
 * @property {string} [min] Minimum track width when `columns` is not fixed, in
 *   any CSS length. Default `'18rem'`.
 *
 * @example
 * <ui-cards label="Components" min="20rem">
 *   <ui-card heading="ui-tabs" href="tabs.html">…</ui-card>
 * </ui-cards>
 */

/**
 * Lays `ui-card` children out in a responsive grid.
 *
 * The whole point is the track count: a table gives one row per item however
 * wide the window is, which reads as a list. A card grid fills the space —
 * several per row on a desktop, one on a phone — with no media query of your
 * own.
 *
 * ```html
 * <ui-cards label="Components">
 *   <ui-card eyebrow="Forms" heading="ui-checkbox" href="checkbox.html">
 *     Real checkbox, indeterminate state, shared validation.
 *   </ui-card>
 * </ui-cards>
 * ```
 *
 * The container is a list and each card is a list item, so the count and
 * position are announced rather than read as a pile of unrelated boxes.
 *
 * Card children are expected to be light-DOM `ui-card` elements, and are
 * observed so cards added later still get list semantics.
 */
export class Cards extends UI4UElement {
  static get observedAttributes() {
    return ['label', 'columns', 'min'];
  }

  /** @type {MutationObserver|null} */
  #observer = null;
  #built = false;

  /* ------------------------------------------------------------------ api */

  /** @returns {string} */
  get label() {
    return this.getString('label', '');
  }

  set label(next) {
    if (next === null || next === undefined) this.removeAttribute('label');
    else this.setAttribute('label', String(next));
  }

  /** @returns {CardsOptions['columns']} `null` when the grid auto-fills */
  get columns() {
    const raw = Number.parseInt(this.getString('columns', ''), 10);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }

  set columns(next) {
    if (next === null || next === undefined) this.removeAttribute('columns');
    else this.setAttribute('columns', String(next));
  }

  /** @returns {string} */
  get min() {
    return this.getString('min', '18rem');
  }

  set min(next) {
    if (next === null || next === undefined) this.removeAttribute('min');
    else this.setAttribute('min', String(next));
  }

  /**
   * The cards currently in the grid.
   *
   * @returns {HTMLElement[]}
   */
  get cards() {
    return /** @type {HTMLElement[]} */ ([...this.querySelectorAll(':scope > ui-card')]);
  }

  /**
   * Applies options and returns `this`.
   *
   * @param {CardsOptions} [options]
   * @returns {this}
   *
   * @example
   * cards.configure({ label: 'Components', columns: 3, min: '16rem' });
   */
  configure(options = {}) {
    const { label, columns, min, bindings } = options;

    if (label !== undefined) this.label = label;
    if (columns !== undefined) this.columns = columns;
    if (min !== undefined) this.min = min;
    if (bindings !== undefined) this.bindAll(bindings);

    return this;
  }

  /* ------------------------------------------------------------ lifecycle */

  onConnect() {
    this.#built = true;
    this.#apply();

    if (typeof MutationObserver === 'function') {
      const observer = new MutationObserver(() => this.#applyItems());
      observer.observe(this, { childList: true });
      this.#observer = observer;
    }

    this.track(
      on(this, 'keydown', (event) => {
        const key = /** @type {KeyboardEvent} */ (event).key;
        if (key !== 'ArrowRight' && key !== 'ArrowLeft') return;
        if (/** @type {HTMLElement|null} */ (event.target)?.closest('ui-card') === null) return;

        const cards = this.cards.filter((card) => !card.hasAttribute('disabled'));
        if (cards.length === 0) return;

        const current = /** @type {HTMLElement} */ (event.target).closest('ui-card');
        const index = cards.indexOf(/** @type {HTMLElement} */ (current));
        if (index === -1) return;

        const step = key === 'ArrowRight' ? 1 : -1;
        // Clamp rather than wrap, so an arrow at either end is a no-op instead
        // of teleporting the reader across the grid.
        const next = cards[Math.min(Math.max(index + step, 0), cards.length - 1)];
        if (!next || next === current) return;

        event.preventDefault();
        // Land on the card's own control where it has one, so the arrow keys
        // walk the links a reader would actually press.
        const link = /** @type {HTMLElement|null} */ (next.querySelector('a, button, input'));
        (link ?? next).focus();
      })
    );
  }

  onDisconnect() {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#built = false;

    for (const card of this.cards) card.removeAttribute('role');
    this.removeAttribute('role');
    delete this.dataset.columns;
  }

  attributeChangedCallback() {
    if (this.#built) this.#apply();
  }

  /* --------------------------------------------------------------- internals */

  #apply() {
    this.setAttribute('role', 'list');

    const label = this.label;
    if (label) this.setAttribute('aria-label', label);
    else this.removeAttribute('aria-label');

    const columns = this.columns;
    if (columns === null) {
      delete this.dataset.columns;
      // Auto-fill rather than a media query: the caller states the smallest
      // card they would accept, and the grid works out the rest.
      this.style.setProperty(
        '--ui4u-cards-columns',
        `repeat(auto-fill, minmax(min(100%, ${this.min}), 1fr))`
      );
    } else {
      this.dataset.columns = String(columns);
      this.style.setProperty('--ui4u-cards-columns', `repeat(${columns}, minmax(0, 1fr))`);
    }

    this.#applyItems();
  }

  /**
   * Gives every card list-item semantics and makes it programmatically
   * focusable.
   *
   * Applied on each change rather than once at build: a card added afterwards
   * — which is how every catalogue is actually populated — would otherwise be
   * announced as an orphan.
   *
   * `tabindex="-1"` rather than `0` on purpose. The card is a container; the
   * tab stop a keyboard user wants is the card's own link or first control. The
   * card itself only needs to be *reachable* so the arrow keys can move focus
   * into it.
   */
  #applyItems() {
    for (const card of this.querySelectorAll('ui-card')) {
      card.setAttribute('role', 'listitem');
      if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '-1');
    }
  }
}

export default Cards;
