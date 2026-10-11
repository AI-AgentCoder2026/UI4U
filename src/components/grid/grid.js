import { UI4UElement } from '../../core/base.js';

/**
 * @typedef {'xs' | 'sm' | 'md' | 'lg' | 'xl'} GapToken
 * @typedef {'start' | 'center' | 'end' | 'stretch'} GridAlign
 * @typedef {'fixed' | 'fluid'} GridMode
 *
 * @typedef {object} GridOptions
 * @property {number|string|null} [columns] Fixed column count. Wins over `min`.
 * @property {string|null} [min] Minimum track size for fluid mode, e.g. `'18rem'`.
 * @property {GapToken} [gap] Gap scale step. Default `'md'`.
 * @property {GridAlign} [align] `align-items`. Default `'stretch'`.
 * @property {GridAlign} [justify] `justify-items`. Default `'stretch'`.
 * @property {boolean} [dense] Pack rows densely instead of filling them in order.
 */

/**
 * Gap scale step -> spacing token. Never a literal length: the emitted value is
 * always `var(--ui4u-space-*)`, so re-theming retunes the grid for free.
 *
 * @type {Record<GapToken, string>}
 */
export const GAP_TOKENS = {
  xs: 'var(--ui4u-space-2)',
  sm: 'var(--ui4u-space-3)',
  md: 'var(--ui4u-space-4)',
  lg: 'var(--ui4u-space-6)',
  xl: 'var(--ui4u-space-8)',
};

/** Valid gap step names, in scale order. @type {GapToken[]} */
export const GAP_NAMES = /** @type {GapToken[]} */ (Object.keys(GAP_TOKENS));

/** Step used when `gap` is absent or unrecognised. */
export const DEFAULT_GAP = 'md';

/** Minimum track size used when neither `columns` nor `min` is authored. */
export const DEFAULT_MIN = '16rem';

/** Accepted `align-items` / `justify-items` keywords. @type {GridAlign[]} */
export const ALIGN_VALUES = ['start', 'center', 'end', 'stretch'];

/**
 * Only a plain CSS length is allowed into `--ui4u-grid-min`. The value never
 * reaches the parser as markup, but an attribute is still untrusted input and a
 * grid template that silently swallows a typo is worse than one that refuses it.
 */
const LENGTH = /^\d*\.?\d+(px|rem|em|ch|%|vh|vw|vmin|vmax)$/i;

/**
 * Resolves a gap step name to its spacing token, falling back to `DEFAULT_GAP`
 * for anything unrecognised.
 *
 * @param {string} name
 * @returns {GapToken}
 *
 * @example
 * resolveGap('lg');   // 'lg'
 * resolveGap('huge'); // 'md'
 */
export function resolveGap(name) {
  const value = String(name ?? '')
    .trim()
    .toLowerCase();
  return /** @type {GapToken[]} */ (GAP_NAMES).includes(/** @type {GapToken} */ (value))
    ? /** @type {GapToken} */ (value)
    : DEFAULT_GAP;
}

/**
 * A responsive grid container — deliberately CSS-first.
 *
 * The element never measures anything. It resolves its options into a handful of
 * inline custom properties and lets `grid-template-columns` do the rest, so the
 * grid reflows with zero JavaScript on resize.
 *
 * Two modes:
 *
 * - **fluid** — `min` is set. Emits `--ui4u-grid-min` and the stylesheet uses
 *   `repeat(auto-fit, minmax(...))`, so the column count falls out of the
 *   available width.
 * - **fixed** — `columns` is set. Emits `--ui4u-grid-columns` and the
 *   stylesheet uses `repeat(var(--ui4u-grid-columns), minmax(0, 1fr))`.
 *
 * **`columns` wins when both are authored** — a grid that must hold a known
 * number of columns cannot also be fluid. With neither, the grid is fluid from
 * `DEFAULT_MIN`.
 *
 * ```html
 * <ui-grid columns="3" min="18rem" gap="md">…cards…</ui-grid>
 * <ui-grid min="16rem" gap="lg">…fluid, auto-fit…</ui-grid>
 * ```
 *
 * Content is light DOM and is never moved, wrapped or re-parented — the element
 * imposes no roles on what you put inside it. Supplying `label` opts the grid
 * into a single `role="region"` with that accessible name; nothing else is
 * marked up.
 *
 * Listens for `ui4u:change` — `detail: { mode, columns, min, gap, ... }`.
 */
export class Grid extends UI4UElement {
  static get observedAttributes() {
    return ['columns', 'min', 'gap', 'align', 'justify', 'dense', 'label'];
  }

  /** Whether the first apply() has run, so upgrades stay silent. */
  #ready = false;
  /** Whether this element is the one that added `role`/`aria-label`. */
  #labelled = false;

  /* ------------------------------------------------------------------ api */

  /** @returns {number} fixed column count, or `0` when unset */
  get columns() {
    const value = Math.trunc(this.getNumber('columns', 0));
    return value > 0 ? value : 0;
  }

  /** @returns {string} minimum track size, or `''` when unset */
  get min() {
    const value = this.getString('min', '').trim();
    return LENGTH.test(value) ? value : '';
  }

  /** @returns {GapToken} gap step name; unrecognised names resolve to `'md'` */
  get gap() {
    return resolveGap(this.getString('gap', ''));
  }

  /** @returns {string} the spacing token `gap` resolves to */
  get gapValue() {
    return GAP_TOKENS[this.gap];
  }

  /** @returns {GridAlign} */
  get align() {
    const value = this.getString('align', 'stretch');
    return ALIGN_VALUES.includes(/** @type {GridAlign} */ (value))
      ? /** @type {GridAlign} */ (value)
      : 'stretch';
  }

  /** @returns {GridAlign} */
  get justify() {
    const value = this.getString('justify', 'stretch');
    return ALIGN_VALUES.includes(/** @type {GridAlign} */ (value))
      ? /** @type {GridAlign} */ (value)
      : 'stretch';
  }

  /** @returns {boolean} */
  get dense() {
    return this.getBoolean('dense', false);
  }

  /** @returns {string} */
  get label() {
    return this.getString('label', '').trim();
  }

  /**
   * Which template the stylesheet should render.
   *
   * `columns` wins over `min`: a grid that must hold an exact number of columns
   * cannot also be fluid, so the authored count is authoritative.
   *
   * @returns {GridMode}
   */
  get mode() {
    return this.columns > 0 ? 'fixed' : 'fluid';
  }

  /**
   * Applies options and returns `this`.
   *
   * Pass `null` for `columns` or `min` to clear that option.
   *
   * @param {GridOptions} [options]
   * @returns {this}
   *
   * @example
   * grid.configure({ columns: 3, gap: 'lg' });
   */
  configure(options = {}) {
    const { columns, min, gap, align, justify, dense } = options;

    if (columns === null) this.removeAttribute('columns');
    else if (columns !== undefined) this.setAttribute('columns', String(columns));

    if (min === null) this.removeAttribute('min');
    else if (min !== undefined) this.setAttribute('min', String(min));

    if (gap !== undefined) this.setAttribute('gap', gap);
    if (align !== undefined) this.setAttribute('align', align);
    if (justify !== undefined) this.setAttribute('justify', justify);

    if (dense === true) this.setAttribute('dense', '');
    else if (dense === false) this.removeAttribute('dense');

    // A disconnected element only applies on connect; connected ones are
    // already up to date through `attributeChangedCallback`.
    if (!this.#ready) this.#apply();

    return this;
  }

  /* ------------------------------------------------------------ lifecycle */

  onConnect() {
    this.#apply();
  }

  attributeChangedCallback(_name, oldValue, newValue) {
    if (oldValue === newValue) return;
    // Options authored in markup are applied once, by `onConnect`.
    if (!this.#ready) return;
    this.#apply();
    this.emit('ui4u:change', this.snapshot());
  }

  /**
   * The resolved options, for consumers and for the change event.
   *
   * @returns {{ mode: GridMode, columns: number, min: string, gap: GapToken, align: GridAlign, justify: GridAlign, dense: boolean }}
   */
  snapshot() {
    return {
      mode: this.mode,
      columns: this.columns,
      min: this.mode === 'fixed' ? '' : this.min || DEFAULT_MIN,
      gap: this.gap,
      align: this.align,
      justify: this.justify,
      dense: this.dense,
    };
  }

  /* ------------------------------------------------------------ behaviour */

  /** Writes the resolved options as inline custom properties. */
  #apply() {
    const mode = this.mode;

    this.dataset.mode = mode;
    this.style.setProperty('--ui4u-grid-gap', this.gapValue);
    this.style.setProperty('--ui4u-grid-align', this.align);
    this.style.setProperty('--ui4u-grid-justify', this.justify);

    if (mode === 'fixed') {
      this.style.setProperty('--ui4u-grid-columns', String(this.columns));
      this.style.removeProperty('--ui4u-grid-min');
    } else {
      this.style.setProperty('--ui4u-grid-min', this.min || DEFAULT_MIN);
      this.style.removeProperty('--ui4u-grid-columns');
    }

    this.#syncLabel();
    this.#ready = true;
  }

  /**
   * A `region` role is opt-in through `label`, and only the element that added
   * it takes it away again — an author-supplied `role` is never clobbered.
   */
  #syncLabel() {
    const label = this.label;

    if (label) {
      if (!this.hasAttribute('role')) this.setAttribute('role', 'region');
      this.setAttribute('aria-label', label);
      this.#labelled = true;
      return;
    }

    if (!this.#labelled) return;
    this.removeAttribute('role');
    this.removeAttribute('aria-label');
    this.#labelled = false;
  }
}
