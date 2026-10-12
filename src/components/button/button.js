import { UI4UElement } from '../../core/base.js';
import { append, el, on, uid } from '../../core/dom.js';

/**
 * @typedef {'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'} ButtonVariant
 * @typedef {'sm' | 'md' | 'lg'} ButtonSize
 * @typedef {'button' | 'submit' | 'reset'} ButtonType
 *
 * @typedef {object} ButtonOptions
 * @property {ButtonVariant} [variant] Visual treatment. Default `'primary'`.
 * @property {ButtonSize} [size] Control scale. Default `'md'`.
 * @property {ButtonType} [type] Native button type. Ignored in anchor mode.
 * @property {boolean} [disabled] Blocks activation and mirrors onto the control.
 * @property {boolean} [loading] Marks the control busy and blocks activation.
 * @property {string} [href] Renders an `<a href>` instead of a `<button>`.
 * @property {Record<string, Function>} [bindings] Event handlers keyed by name
 *   (`press`). A handler receives `(detail, event)` and can veto the activation
 *   by returning `false` or calling `event.preventDefault()` — which also
 *   suppresses the native follow-through, whether that is navigation or a form
 *   submit.
 */

/** Announced through the polite live region while `loading` is set. */
const LOADING_TEXT = 'Working…';

// The defaults — `primary`, `md`, `button` — are absent from these lists: an
// unknown value falls back to them rather than resolving to itself.
const VARIANTS = ['secondary', 'ghost', 'danger', 'subtle'];
const SIZES = ['sm', 'lg'];
const TYPES = ['submit', 'reset'];

/**
 * A button that always wraps a REAL control — `<button>`, or `<a href>` once
 * `href` is set. Never a `<div>` with a click handler, so keyboard activation,
 * form participation and assistive-technology semantics are the platform's.
 *
 * ```html
 * <ui-button variant="primary" size="md" type="submit">Save</ui-button>
 * <ui-button href="/docs" variant="ghost">Docs</ui-button>
 * <ui-button loading>Saving…</ui-button>
 * ```
 *
 * The label is light DOM: the author's children are moved into the native
 * control on connect and put back on disconnect, so the accessible name is
 * whatever text the author wrote.
 *
 * Listens for `ui4u:press` — `detail: { variant, size, href, control }`.
 */
export class Button extends UI4UElement {
  static get observedAttributes() {
    return ['variant', 'size', 'type', 'disabled', 'loading', 'href', 'target', 'rel'];
  }

  /** @type {HTMLElement|null} the native `<button>` or `<a>` */
  #control = null;
  /** @type {HTMLElement|null} the polite live region announcing `loading` */
  #status = null;
  /** @type {Node[]} the author's children, moved into the control */
  #stash = [];
  #built = false;

  /* ------------------------------------------------------------------ api */

  /** @returns {ButtonVariant} */
  get variant() {
    const value = this.getString('variant', 'primary');
    return VARIANTS.includes(value) ? /** @type {ButtonVariant} */ (value) : 'primary';
  }

  set variant(next) {
    this.setAttribute('variant', next);
  }

  /** @returns {ButtonSize} */
  get size() {
    const value = this.getString('size', 'md');
    return SIZES.includes(value) ? /** @type {ButtonSize} */ (value) : 'md';
  }

  set size(next) {
    this.setAttribute('size', next);
  }

  /** @returns {ButtonType} */
  get type() {
    const value = this.getString('type', 'button');
    return TYPES.includes(value) ? /** @type {ButtonType} */ (value) : 'button';
  }

  set type(next) {
    this.setAttribute('type', next);
  }

  /** @returns {boolean} */
  get disabled() {
    return this.getBoolean('disabled', false);
  }

  set disabled(next) {
    if (next) this.setAttribute('disabled', '');
    else this.removeAttribute('disabled');
  }

  /** @returns {boolean} */
  get loading() {
    return this.getBoolean('loading', false);
  }

  set loading(next) {
    if (next) this.setAttribute('loading', '');
    else this.removeAttribute('loading');
  }

  /** @returns {string} empty string renders a `<button>` rather than an `<a>` */
  get href() {
    return this.getString('href', '');
  }

  set href(next) {
    if (next === null || next === undefined || next === '') this.removeAttribute('href');
    else this.setAttribute('href', String(next));
  }

  /**
   * The native control — `<button>` or `<a>`. `null` before the element has
   * connected.
   *
   * @returns {HTMLElement|null}
   */
  get control() {
    return this.#control;
  }

  /** @returns {boolean} whether activation is currently blocked */
  get inactive() {
    return this.disabled || this.loading;
  }

  /**
   * Applies options and returns `this`.
   *
   * Every option is optional and pass-through: an option left out keeps the
   * value it already has, so a picker can change one without resetting the rest.
   *
   * @param {ButtonOptions} [options]
   * @returns {this}
   *
   * @example
   * button.configure({ variant: 'danger', size: 'sm', loading: true });
   */
  configure(options = {}) {
    const { variant, size, type, disabled, loading, href, bindings } = options;

    if (variant !== undefined) this.variant = variant;
    if (size !== undefined) this.size = size;
    if (type !== undefined) this.type = type;
    if (disabled !== undefined) this.disabled = disabled;
    if (loading !== undefined) this.loading = loading;
    if (href !== undefined) this.href = href;
    if (bindings !== undefined) this.bindAll(bindings);

    return this;
  }

  /**
   * Activates the control the way a user would. Blocked while `disabled` or
   * `loading`, in which case nothing fires and `this` comes back untouched.
   *
   * @returns {this}
   *
   * @example
   * submitButton.click();
   */
  click() {
    if (!this.#built) this.#build();
    if (!this.inactive) this.#control?.click();
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

    if (name === 'variant') {
      this.dataset.variant = this.variant;
    } else if (name === 'size') {
      this.dataset.size = this.size;
    } else if (name === 'type') {
      this.#applyType();
    } else if (name === 'href' || name === 'target' || name === 'rel') {
      // The native element itself changes, so the control is rebuilt.
      this.#rebuild();
    } else {
      this.#syncState();
    }
  }

  /* --------------------------------------------------------------- build */

  #build() {
    if (this.#built) return;

    const baseId = uid('ui4u-button');
    const stash = [...this.childNodes];

    /** @type {HTMLElement} */
    const control = this.href
      ? el('a', { class: 'ui4u-button__control', href: this.href })
      : el('button', { class: 'ui4u-button__control', type: this.type });
    control.id = `${baseId}-control`;

    /*
     * `target` and `rel` belong to the anchor, not the host, so they are copied
     * across. A button that renders a link has to be able to open one safely:
     * `rel="noopener noreferrer"` on a `target="_blank"` link is the difference
     * between a link and a vulnerability.
     */
    if (this.href) {
      for (const name of ['target', 'rel', 'download', 'hreflang']) {
        const value = this.getAttribute(name);
        if (value !== null) control.setAttribute(name, value);
      }
    }

    // The label is the accessible name, so it moves into the control.
    append(control, stash);

    /** @type {HTMLElement} */
    const status = el('span', {
      class: 'ui4u-button__status',
      id: `${baseId}-status`,
      role: 'status',
      'aria-live': 'polite',
    });

    this.#control = control;
    this.#status = status;
    this.#stash = stash;
    this.#built = true;

    this.dataset.variant = this.variant;
    this.dataset.size = this.size;

    this.track(on(control, 'click', (event) => this.#onActivate(event)));
    this.track(on(control, 'keydown', (event) => this.#onKeydown(event)));

    this.prepend(control, status);
    this.#syncState();
  }

  #teardown() {
    // Put the author's markup back exactly where they put it.
    this.#releaseLabel();

    this.#control?.remove();
    this.#status?.remove();
    this.#control = null;
    this.#status = null;
    this.#stash = [];
    this.#built = false;

    delete this.dataset.variant;
    delete this.dataset.size;
    delete this.dataset.loading;
  }

  /** Rebuilds the native control, e.g. when `href` swaps button for anchor. */
  #rebuild() {
    if (!this.#built) return;
    this.#teardown();
    this.#build();
  }

  /** Moves the author's label nodes out of the control and back into the host. */
  #releaseLabel() {
    for (const child of this.#stash) this.insertBefore(child, this.firstChild);
  }

  /* ----------------------------------------------------------- behaviour */

  #applyType() {
    const control = this.#control;
    if (control?.localName === 'button') control.setAttribute('type', this.type);
  }

  /**
   * Mirrors `disabled` / `loading` onto the control.
   *
   * A `<button>` is disabled natively. An `<a>` cannot be, so it keeps its
   * focusability and carries `aria-disabled` instead — the activation handler
   * does the blocking.
   */
  #syncState() {
    const control = this.#control;
    if (!control) return;

    const busy = this.loading;
    const blocked = this.inactive;

    if (busy) control.setAttribute('aria-busy', 'true');
    else control.removeAttribute('aria-busy');

    if (control.localName === 'button') {
      control.disabled = blocked;
    } else if (blocked) {
      control.setAttribute('aria-disabled', 'true');
    } else {
      control.removeAttribute('aria-disabled');
    }

    if (busy) this.dataset.loading = 'true';
    else delete this.dataset.loading;

    if (this.#status) this.#status.textContent = busy ? LOADING_TEXT : '';
  }

  /** @param {MouseEvent} event */
  #onActivate(event) {
    // The control fired natively — block the follow-through (navigation, form
    // submit) and report nothing.
    if (this.inactive) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    /*
     * Guarded before the press is announced, so a veto means "do nothing at
     * all": no `ui4u:press` and — more importantly — the native follow-through
     * the handler would otherwise let happen, whether that is an anchor
     * navigating away or a submit button submitting the form.
     */
    if (!this.runBinding('press', { control: this.#control, variant: this.variant })) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this.emit('ui4u:press', {
      variant: this.variant,
      size: this.size,
      href: this.href,
      control: this.#control,
    });
  }

  /** @param {KeyboardEvent} event */
  #onKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!this.inactive) return;
    // Space would scroll the page behind an anchor that cannot be activated.
    event.preventDefault();
  }
}
