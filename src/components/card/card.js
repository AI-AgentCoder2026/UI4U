import { UI4UElement } from '../../core/base.js';
import { el, on, setText } from '../../core/dom.js';

/**
 * @typedef {'default' | 'outline' | 'glass'} CardVariant
 *
 * @typedef {object} CardOptions
 * @property {string} [heading] The card's title. Also its accessible name when
 *   `href` is set. Deliberately not `title`: that is the browser's tooltip
 *   attribute, and a card does not want one.
 * @property {string} [eyebrow] Small label above the heading.
 * @property {string} [href] Makes the whole card one link.
 * @property {CardVariant} [variant] Surface treatment. Default `'default'`.
 * @property {'none' | 'sm' | 'md' | 'lg'} [padding] Inner padding. Default `'md'`.
 * @property {boolean} [interactive] Raise and tilt the card on hover and focus.
 * @property {number} [headingLevel] Heading element for the title. Default `3`.
 * @property {Record<string, Function>} [bindings] Event handlers keyed by name
 *   (`press`). A handler receives `(detail, event)` and can veto by returning
 *   `false` or calling `event.preventDefault()`.
 *
 * @example
 * <ui-card eyebrow="Forms" heading="ui-checkbox" href="checkbox.html">
 *   Real checkbox, indeterminate state, shared validation.
 * </ui-card>
 */

/** Attributes a child may carry to claim a part of the card. */
const PART = 'data-part';

const VARIANTS = ['outline', 'glass'];
const PADDINGS = ['none', 'sm', 'lg'];

/**
 * One item in a grid: an optional eyebrow, a heading, a body and a row of
 * actions. Renders in light DOM, so the author's own markup is the content.
 *
 * ```html
 * <ui-card eyebrow="Data" heading="ui-tablegrid" href="tablegrid.html">
 *   Column groups, sorting, search, selection and copy.
 * </ui-card>
 * ```
 *
 * With `href` the card becomes a single link via a stretched anchor around the
 * heading. That is deliberate: one tab stop whose accessible name is the
 * card's own title, rather than a `<div>` with a click handler and a separate
 * invisible link somewhere inside.
 *
 * Emits `ui4u:press` — `detail: { href, card }`.
 */
export class Card extends UI4UElement {
  static get observedAttributes() {
    return ['heading', 'eyebrow', 'href', 'variant', 'padding', 'interactive', 'heading-level'];
  }

  /** @type {HTMLElement|null} */
  #frame = null;
  /** @type {HTMLElement|null} */
  #link = null;
  /** @type {Node[]} the author's children, moved into the card */
  #stash = [];
  #built = false;

  /* ------------------------------------------------------------------ api */

  /** @returns {string} */
  get heading() {
    return this.getString('heading', '');
  }

  set heading(next) {
    if (next === null || next === undefined) this.removeAttribute('heading');
    else this.setAttribute('heading', String(next));
  }

  /** @returns {string} */
  get eyebrow() {
    return this.getString('eyebrow', '');
  }

  set eyebrow(next) {
    if (next === null || next === undefined) this.removeAttribute('eyebrow');
    else this.setAttribute('eyebrow', String(next));
  }

  /** @returns {string} empty renders a non-interactive card */
  get href() {
    return this.getString('href', '');
  }

  set href(next) {
    if (next === null || next === undefined || next === '') this.removeAttribute('href');
    else this.setAttribute('href', String(next));
  }

  /** @returns {CardVariant} */
  get variant() {
    const raw = this.getString('variant', '');
    return /** @type {CardVariant} */ (VARIANTS.includes(raw) ? raw : 'default');
  }

  set variant(next) {
    if (next === null || next === undefined || next === '') this.removeAttribute('variant');
    else this.setAttribute('variant', String(next));
  }

  /** @returns {boolean} */
  get interactive() {
    return this.getBoolean('interactive', false) || this.href !== '';
  }

  /**
   * Applies options and returns `this`.
   *
   * @param {CardOptions} [options]
   * @returns {this}
   *
   * @example
   * card.configure({ heading: 'ui-card', eyebrow: 'Layout', href: 'card.html' });
   */
  configure(options = {}) {
    const { heading, eyebrow, href, variant, padding, interactive, headingLevel, bindings } =
      options;

    if (heading !== undefined) this.heading = heading;
    if (eyebrow !== undefined) this.eyebrow = eyebrow;
    if (href !== undefined) this.href = href;
    if (variant !== undefined) this.variant = variant;
    if (interactive !== undefined) {
      if (interactive) this.setAttribute('interactive', '');
      else this.removeAttribute('interactive');
    }
    if (headingLevel !== undefined) this.setAttribute('heading-level', String(headingLevel));
    if (padding !== undefined) {
      if (padding === null) this.removeAttribute('padding');
      else this.setAttribute('padding', String(padding));
    }
    if (bindings !== undefined) this.bindAll(bindings);

    return this;
  }

  /**
   * Focuses the card's link, or the card itself when it is not a link.
   *
   * Overrides the native `focus()` on purpose, so a caller does not have to
   * know whether a given card is a link: focusing a card always lands on
   * something the user can act from.
   *
   * @returns {this}
   */
  focus() {
    (this.#link ?? /** @type {HTMLElement|null} */ (this.#frame))?.focus();
    return this;
  }

  /* ------------------------------------------------------------ lifecycle */

  onConnect() {
    this.#build();
  }

  onDisconnect() {
    this.#teardown();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.#built) return;

    // The title, the link and the padding all live in DOM this component made,
    // so they are rebuilt rather than patched.
    if (name === 'heading' || name === 'href' || name === 'padding' || name === 'heading-level') {
      this.#rebuild();
      return;
    }
    this.#applyDecorations();
  }

  /* --------------------------------------------------------------- build */

  #rebuild() {
    this.#teardown();
    this.#build();
  }

  #build() {
    if (this.#built) return;

    const stash = [...this.childNodes];

    /** @type {HTMLElement} */
    const frame = el('div', { class: 'ui4u-card__frame' });

    if (!this.href) {
      /*
       * Programmatically focusable, so a static card can still receive focus —
       * `focus()` is overridden to forward here, and a container with no
       * `tabindex` is not a focus target at all. It stays out of the tab order:
       * the arrow keys in a `ui-cards` grid use it, Tab does not.
       */
      frame.setAttribute('tabindex', '-1');
    }

    /** @type {HTMLElement} */
    const body = el('div', { class: 'ui4u-card__body' });

    // Parts the author claimed by attribute; anything unclaimed is still
    // content, so it goes to the body rather than being dropped.
    /** @type {Node[]} */
    const claimed = { title: [], eyebrow: [], actions: [], body: [], rest: [] };

    for (const node of stash) {
      const part = node instanceof HTMLElement ? (node.getAttribute(PART) ?? '').trim() : '';

      if (part === 'title') claimed.title.push(node);
      else if (part === 'eyebrow') claimed.eyebrow.push(node);
      else if (part === 'actions') claimed.actions.push(node);
      else if (part === 'body') claimed.body.push(node);
      else claimed.rest.push(node);
    }

    this.#stash = stash;

    // Title: the author's own heading wins, so they keep control of the level
    // and of any markup inside it.
    const level = Number.parseInt(this.getString('heading-level', '3'), 10);
    const headingTag = `h${Number.isFinite(level) ? Math.min(Math.max(level, 1), 6) : 3}`;

    /** @type {HTMLElement} */
    let titleNode;
    if (claimed.title.length > 0) {
      titleNode = /** @type {HTMLElement} */ (
        el('div', { class: 'ui4u-card__title' }, claimed.title)
      );
      // A plain wrapper would cost the heading semantics; unwrap it if the
      // author only supplied one element, so their own `<h3>` stays the title.
      const only = claimed.title[0];
      if (claimed.title.length === 1 && only instanceof HTMLElement) {
        only.classList.add('ui4u-card__title');
        titleNode = only;
      }
    } else if (this.heading) {
      // `setText`, not an `el()` option: `el()` has no `text` key, so it would
      // silently become an attribute and leave the title empty.
      titleNode = /** @type {HTMLElement} */ (el(headingTag, { class: 'ui4u-card__title' }));
      setText(titleNode, this.heading);
    } else {
      titleNode = el('div', { class: 'ui4u-card__title' });
    }

    /** @type {HTMLElement|null} */
    let eyebrowNode = null;
    if (claimed.eyebrow.length > 0) {
      eyebrowNode = /** @type {HTMLElement} */ (
        el('div', { class: 'ui4u-card__eyebrow' }, claimed.eyebrow)
      );
      const only = claimed.eyebrow[0];
      if (claimed.eyebrow.length === 1 && only instanceof HTMLElement) {
        only.classList.add('ui4u-card__eyebrow');
        eyebrowNode = only;
      }
    } else if (this.eyebrow) {
      eyebrowNode = el('div', { class: 'ui4u-card__eyebrow' });
      setText(eyebrowNode, this.eyebrow);
    }

    // The body takes the text content. Empty when the author supplied none.
    const bodyNodes = [...claimed.body, ...claimed.rest];
    if (bodyNodes.length > 0) body.append(...bodyNodes);

    let actionsNode = null;
    if (claimed.actions.length > 0) {
      actionsNode = el('div', { class: 'ui4u-card__actions' }, claimed.actions);
    }

    /*
     * A card that goes somewhere is one link, and the link wraps the title so
     * its accessible name is the card's own name. The anchor is then stretched
     * over the whole card in CSS — which also means the actions have to sit
     * above it to stay clickable.
     */
    /** @type {HTMLAnchorElement|null} */
    let link = null;
    if (this.href) {
      link = /** @type {HTMLAnchorElement} */ (
        el('a', { class: 'ui4u-card__link', href: this.href })
      );
      link.appendChild(titleNode);
      for (const name of ['target', 'rel']) {
        const value = this.getAttribute(name);
        if (value !== null) link.setAttribute(name, value);
      }
    } else {
      titleNode.setAttribute('id', `${this.id || 'ui4u-card'}-title`);
    }

    if (eyebrowNode) frame.appendChild(eyebrowNode);
    frame.appendChild(link ?? titleNode);
    if (bodyNodes.length > 0) frame.appendChild(body);
    if (actionsNode) frame.appendChild(actionsNode);

    if (link) {
      this.track(on(link, 'click', (event) => this.#onActivate(/** @type {MouseEvent} */ (event))));
    }

    // The author's children were moved into the frame; put them back verbatim.
    this.appendChild(frame);
    this.#frame = frame;
    this.#link = link;
    this.#built = true;

    this.#applyDecorations();
  }

  #teardown() {
    // The author's own nodes go back exactly as they were written, so a
    // rebuild — or a disconnect — never leaves a stripped card behind.
    for (const node of this.#stash) this.appendChild(node);
    this.#stash = [];

    this.#frame?.remove();
    this.#frame = null;
    this.#link = null;
    this.#built = false;

    delete this.dataset.variant;
    delete this.dataset.padding;
    delete this.dataset.interactive;
  }

  #applyDecorations() {
    this.dataset.variant = this.variant;
    this.dataset.padding = PADDINGS.includes(this.getString('padding', ''))
      ? this.getString('padding', 'md')
      : 'md';
    if (this.interactive) this.dataset.interactive = '';
    else delete this.dataset.interactive;
  }

  /** @param {MouseEvent} event */
  #onActivate(event) {
    // Guarded before the press is announced so a veto genuinely means "do
    // nothing" — including the navigation the browser would otherwise do.
    if (!this.runBinding('press', { href: this.href, card: this })) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this.emit('ui4u:press', { href: this.href, card: this });
  }
}

export default Card;
