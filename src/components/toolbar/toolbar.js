import { UI4UElement } from '../../core/base.js';
import { on } from '../../core/dom.js';

/**
 * @typedef {'horizontal' | 'vertical'} ToolbarOrientation
 *
 * @typedef {object} ToolbarOptions
 * @property {string} [label] Accessible name. Recommended — an unlabelled
 *   `role="toolbar"` is announced as an unnamed group of buttons.
 * @property {ToolbarOrientation} [orientation] Arrow-key direction. Default
 *   `'horizontal'`.
 * @property {boolean} [srOnly] Hide the visible label but keep it in the
 *   accessibility tree.
 */

/**
 * What counts as a control inside the bar.
 *
 * Deliberately not `focusables()` from `core/dom.js`: that helper filters on
 * measured geometry, which is what a focus *trap* needs but which returns
 * nothing at all in an environment without layout — the node:test harness
 * included, where every rect is zero. Explicit `disabled`, `hidden` and
 * `aria-hidden` are the conditions a toolbar can actually reason about.
 */
const CONTROL_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * A bar of controls that behaves as one unit for the keyboard.
 *
 * Put one anywhere: inside a `ui-panel` in any `ui-layout` region, or directly
 * in a layout as a thin, non-resizable region; or as the header of a
 * `ui-tablegrid`, where it becomes the table's own toolbar.
 *
 * ```html
 * <ui-toolbar label="Filters">
 *   <ui-input label="Search"></ui-input>
 *   <ui-button variant="primary">Apply</ui-button>
 * </ui-toolbar>
 * ```
 *
 * Its whole job is the keyboard contract. Any number of controls inside is a
 * **single tab stop**: Tab enters and leaves the bar in one press, and the
 * arrow keys move between the controls inside it. That is what makes a long row
 * of filters usable without tabbing through every field.
 *
 * Children stay in light DOM, so `ui-input`, `ui-button` and anything else keep
 * working exactly as they do on their own.
 *
 * Emits `ui4u:navigate` when the focus moves within the bar.
 */
export class Toolbar extends UI4UElement {
  static get observedAttributes() {
    return ['label', 'orientation', 'sr-only'];
  }

  #ready = false;
  /** @type {Array<() => void>} */
  #own = [];

  /* ------------------------------------------------------------------ api */

  /** @returns {string} */
  get label() {
    return this.getString('label', '');
  }

  set label(next) {
    this.setAttribute('label', next ?? '');
  }

  /** @returns {ToolbarOrientation} */
  get orientation() {
    return this.getString('orientation', 'horizontal') === 'vertical' ? 'vertical' : 'horizontal';
  }

  set orientation(next) {
    this.setAttribute('orientation', next);
  }

  /** @returns {boolean} */
  get srOnly() {
    return this.getBoolean('sr-only', false);
  }

  set srOnly(next) {
    if (next) this.setAttribute('sr-only', '');
    else this.removeAttribute('sr-only');
  }

  /**
   * The focusable controls currently inside the bar, in visual order.
   *
   * @returns {HTMLElement[]}
   */
  get items() {
    return /** @type {HTMLElement[]} */ (
      [...this.querySelectorAll(CONTROL_SELECTOR)].filter(
        (node) => !node.hasAttribute('hidden') && node.getAttribute('aria-hidden') !== 'true'
      )
    );
  }

  /**
   * Applies options and returns `this`.
   *
   * @param {ToolbarOptions} [options]
   * @returns {this}
   *
   * @example
   * toolbar.configure({ label: 'Filters', orientation: 'vertical' });
   */
  configure(options = {}) {
    const { label, orientation, srOnly } = options;

    if (label !== undefined) this.label = label;
    if (orientation !== undefined) this.orientation = orientation;
    if (srOnly !== undefined) this.srOnly = srOnly;

    return this;
  }

  /**
   * Recomputes the roving tab stop.
   *
   * Children arrive and leave after the bar does. This is public so the state
   * can be re-derived on demand — and so it works in environments without a
   * `MutationObserver`, where the automatic path silently does nothing.
   *
   * @returns {this}
   *
   * @example
   * toolbar.appendChild(extraControl);
   * toolbar.refresh();
   */
  refresh() {
    this.#applyRoving();
    return this;
  }

  /**
   * Moves focus to the current tab stop, or to the first control when there is
   * none yet — which is what makes the bar a single tab stop on first entry.
   *
   * @returns {this}
   */
  focus() {
    const items = this.items;
    const stop = items.find((item) => item.getAttribute('tabindex') === '0') ?? items[0];
    stop?.focus();
    if (stop) this.#applyRoving(stop);
    return this;
  }

  /* ------------------------------------------------------------ lifecycle */

  onConnect() {
    this.#apply();

    // Children arrive and leave after the bar does, so the tab stop has to be
    // recomputed rather than baked in at build time.
    this.#own.push(
      on(this, 'focusin', (event) => {
        const target = /** @type {HTMLElement|null} */ (event.target);
        if (target instanceof HTMLElement && this.items.includes(target)) this.#applyRoving(target);
      }),
      on(this, 'keydown', (event) => this.#onKeydown(/** @type {KeyboardEvent} */ (event)))
    );

    const observer =
      typeof MutationObserver === 'function' ? new MutationObserver(() => this.refresh()) : null;
    observer?.observe(this, { childList: true, subtree: true });
    if (observer) this.#own.push(() => observer.disconnect());

    this.#ready = true;
  }

  onDisconnect() {
    for (const dispose of this.#own) dispose();
    this.#own = [];
    this.#ready = false;
  }

  attributeChangedCallback() {
    if (this.#ready) this.#apply();
  }

  /* ----------------------------------------------------------- behaviour */

  /** Mirrors the public attributes onto the ARIA the pattern needs. */
  #apply() {
    this.setAttribute('role', 'toolbar');

    const label = this.label;
    if (label) {
      this.setAttribute('aria-label', label);
      this.removeAttribute('aria-labelledby');
      // The visible caption is drawn from CSS reading this, so the text exists
      // once rather than being duplicated into a node.
      this.setAttribute('data-label', label);
    } else {
      this.removeAttribute('aria-label');
      this.removeAttribute('data-label');
    }

    this.setAttribute('aria-orientation', this.orientation);
    this.dataset.orientation = this.orientation;
    if (this.srOnly) this.dataset.srOnly = '';
    else delete this.dataset.srOnly;

    this.#applyRoving();
  }

  /**
   * Keeps exactly one control at `tabindex="0"`.
   *
   * @param {HTMLElement} [preferred] the control that should hold the stop
   */
  #applyRoving(preferred) {
    const items = this.items;
    if (items.length === 0) return;

    const current = items.find((item) => item.getAttribute('tabindex') === '0');
    const target = preferred ?? current ?? items[0];

    for (const item of items) {
      if (item === target) item.setAttribute('tabindex', '0');
      else item.setAttribute('tabindex', '-1');
    }
  }

  /** @param {KeyboardEvent} event */
  #onKeydown(event) {
    const { key } = event;
    const vertical = this.orientation === 'vertical';
    const forward = vertical ? 'ArrowDown' : 'ArrowRight';
    const back = vertical ? 'ArrowUp' : 'ArrowLeft';

    if (key !== forward && key !== back) return;

    const items = this.items;
    if (items.length === 0) return;

    /*
     * The event's own target is the authority on where the user is. Reading
     * `document.activeElement` instead is right in a browser but wrong the
     * moment anything dispatches a key without focusing first — and it cannot
     * be tested at all without a real focus stack.
     */
    const from = event.target instanceof HTMLElement ? event.target : null;
    const active =
      (from && items.includes(from) && from) ||
      (document.activeElement instanceof HTMLElement && items.includes(document.activeElement)
        ? /** @type {HTMLElement} */ (document.activeElement)
        : null) ||
      items.find((item) => item.getAttribute('tabindex') === '0') ||
      items[0];

    const index = items.indexOf(active);
    const step = key === forward ? 1 : -1;
    // Clamp rather than wrap: arrowing past the end of a toolbar should leave
    // the controls alone, not jump the user back to the first one.
    const nextIndex = Math.min(Math.max(index + step, 0), items.length - 1);
    const next = items[nextIndex];
    if (!next) return;

    event.preventDefault();

    if (nextIndex === index) {
      // Clamped at the end. The tab stop still follows the control the user is
      // on, so tabbing out and back returns them to where they left off.
      this.#applyRoving(active);
      return;
    }

    this.#applyRoving(next);
    next.focus();
    this.emit('ui4u:navigate', { index: nextIndex, label: this.label, toolbar: this });
  }
}

export default Toolbar;
