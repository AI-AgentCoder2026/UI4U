import { UI4UElement } from '../../core/base.js';
import { el, on, uid } from '../../core/dom.js';

/**
 * @typedef {'glass' | 'solid' | 'ghost'} DisclosureVariant
 *
 * @typedef {object} DisclosureOptions
 * @property {boolean} [open] Whether the content starts expanded.
 * @property {string} [summary] Text for the always-visible trigger.
 * @property {DisclosureVariant} [variant] Visual treatment. Default `'glass'`.
 */

/**
 * A disclosure — one trigger and the content it reveals or hides.
 *
 * Content is authored as light DOM and moved into a labelled region on
 * connect; `disconnectedCallback` puts it back, so the element can be moved
 * around or re-parented without losing its markup.
 *
 * ```html
 * <ui-disclosure summary="Source">
 *   <p>Anything can go in here.</p>
 * </ui-disclosure>
 * ```
 *
 * Listens for `ui4u:change` — `detail: { open }`.
 */
export class Disclosure extends UI4UElement {
  static get observedAttributes() {
    return ['open', 'summary', 'variant'];
  }

  /** @type {HTMLButtonElement|null} */
  #trigger = null;
  /** @type {HTMLElement|null} */
  #content = null;
  /** @type {HTMLElement[]} children moved into the content region */
  #stash = [];
  #built = false;
  /** Guards the property -> attribute reflect loop. @type {boolean} */
  #syncing = false;

  /* ------------------------------------------------------------------ api */

  /** @returns {boolean} */
  get expanded() {
    return this.hasAttribute('open');
  }

  set expanded(next) {
    this[next ? 'open' : 'close']();
  }

  /** @returns {DisclosureVariant} */
  get variant() {
    const value = this.getString('variant', 'glass');
    return value === 'solid' || value === 'ghost' ? value : 'glass';
  }

  /** @returns {string} */
  get summary() {
    return this.getString('summary', '');
  }

  /**
   * Applies options and returns `this`.
   *
   * @param {DisclosureOptions} [options]
   * @returns {this}
   *
   * @example
   * disclosure.configure({ summary: 'Advanced', open: true });
   */
  configure(options = {}) {
    const { open, summary, variant = 'glass' } = options;

    if (summary !== undefined) this.setAttribute('summary', summary);
    this.setAttribute('variant', variant);
    if (open !== undefined) this.expanded = open;

    return this;
  }

  /** @returns {this} */
  open() {
    return this.#set(true);
  }

  /** @returns {this} */
  close() {
    return this.#set(false);
  }

  /** @returns {this} */
  toggle() {
    return this.#set(!this.expanded);
  }

  /* ------------------------------------------------------------ lifecycle */

  onConnect() {
    this.#build();
  }

  onDisconnect() {
    this.#teardown();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.#built || this.#syncing) return;

    if (name === 'open') {
      this.#sync();
    } else if (name === 'summary') {
      this.#renderSummary();
    } else if (name === 'variant') {
      this.dataset.variant = this.variant;
    }
  }

  /* --------------------------------------------------------------- build */

  #build() {
    if (this.#built) return;

    const baseId = uid('ui4u-disclosure');

    /** @type {HTMLElement[]} */
    const stash = [...this.children];

    /** @type {HTMLElement} */
    const content = el('div', {
      class: 'ui4u-disclosure__content',
      id: `${baseId}-content`,
    });
    for (const child of stash) content.appendChild(child);

    /** @type {HTMLElement} */
    const label = el('span', { class: 'ui4u-disclosure__label' });

    /** @type {HTMLButtonElement} */
    const trigger = el(
      'button',
      {
        type: 'button',
        class: 'ui4u-disclosure__summary',
        id: `${baseId}-summary`,
        'aria-controls': content.id,
        'aria-expanded': 'false',
      },
      label
    );

    // One listener only — a second click handler would toggle twice and
    // cancel itself out.
    this.track(on(trigger, 'click', () => this.toggle()));

    content.setAttribute('role', 'region');
    content.setAttribute('aria-labelledby', trigger.id);

    this.#trigger = trigger;
    this.#content = content;
    this.#stash = stash;
    this.#built = true;

    this.dataset.variant = this.variant;
    this.#renderSummary();
    this.prepend(trigger, content);

    this.#sync();
  }

  #teardown() {
    // Put the author's markup back exactly where they put it.
    for (const child of this.#stash) this.insertBefore(child, this.firstChild);
    this.#stash = [];

    this.#trigger?.remove();
    this.#content?.remove();
    this.#trigger = null;
    this.#content = null;
    this.#built = false;
  }

  /* ----------------------------------------------------------- behaviour */

  #renderSummary() {
    if (!this.#trigger) return;
    const label = this.#trigger.querySelector('.ui4u-disclosure__label');
    // `setText`, never innerHTML — summary may come from user data.
    if (label) label.textContent = this.summary || 'Show more';
  }

  /** Mirrors the `open` attribute onto `aria-expanded` and the region's visibility. */
  #sync() {
    if (!this.#trigger || !this.#content) return;
    const expanded = this.expanded;
    this.#trigger.setAttribute('aria-expanded', String(expanded));
    this.#content.hidden = !expanded;
  }

  /** @param {boolean} next @returns {this} */
  #set(next) {
    if (!this.#built) this.#build();
    if (next === this.expanded) return this;

    this.#syncing = true;
    if (next) this.setAttribute('open', '');
    else this.removeAttribute('open');
    this.#syncing = false;

    this.#sync();
    this.emit('ui4u:change', { open: next });
    return this;
  }
}