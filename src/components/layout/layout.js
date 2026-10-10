import { UI4UElement } from '../../core/base.js';
import { el, on } from '../../core/dom.js';
import { draggable } from '../../core/pointer.js';
import { clamp, toPx } from '../../core/size.js';

/**
 * @typedef {'top' | 'left' | 'right' | 'center' | 'bottom'} PanelSlot
 *
 * @typedef {object} PanelSpec
 * @property {HTMLElement} node
 * @property {string} label
 * @property {number} initial Initial track size in px, used by double-click reset.
 * @property {number} current Current track size in px.
 * @property {number|null} min
 * @property {number|null} max
 * @property {boolean} resizable
 * @property {boolean} collapsible
 * @property {boolean} collapsed
 *
 * @typedef {object} LayoutOptions
 * @property {string} [gutter] Splitter thickness. Default `'var(--ui4u-layout-splitter-size)'`.
 * @property {number} [step] Keyboard resize step in px. Default `16`.
 */

/**
 * A resizable five-region layout: top, left, right, center and bottom.
 *
 * ```html
 * <ui-layout>
 *   <ui-panel slot="top" label="Header">…</ui-panel>
 *   <ui-panel slot="left" size="16rem" min="10rem" resizable>…</ui-panel>
 *   <ui-panel slot="center">…</ui-panel>
 *   <ui-panel slot="right" size="18rem" min="12rem" resizable>…</ui-panel>
 *   <ui-panel slot="bottom" size="6rem" min="4rem" resizable>…</ui-panel>
 * </ui-layout>
 * ```
 *
 * `center` is the flexible region — it takes whatever the others do not. Panels
 * are positioned by their `slot` attribute; absent slots simply do not exist.
 *
 * Listens for `ui4u:resize` and `ui4u:collapse`.
 */
export class Layout extends UI4UElement {
  static get observedAttributes() {
    return ['gutter', 'step'];
  }

  /** @type {Map<string, PanelSpec>} */
  #panels = new Map();
  /** @type {Map<string, HTMLElement>} */
  #splitters = new Map();
  /** Panel sizes captured at pointer-down, keyed by slot. @type {Map<PanelSlot, number>} */
  #dragOrigin = new Map();
  /** @type {Array<() => void>} */
  #disposers = [];

  /**
   * Applies options and returns `this`.
   *
   * @param {LayoutOptions} [options]
   * @returns {this}
   *
   * @example
   * layout.configure({ step: 24, gutter: '10px' });
   */
  configure(options = {}) {
    const { gutter, step } = options;
    if (gutter !== undefined) this.setAttribute('gutter', gutter);
    if (step !== undefined) this.setAttribute('step', String(step));
    return this;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    // Observed attributes can fire before the layout is connected and built,
    // so guard on the panels rather than on a separate flag.
    if (oldValue === newValue || this.#panels.size === 0) return;
    // `step` is read live on every keypress, so only `gutter` — which is baked
    // into the grid template — needs the layout recomputed.
    if (name === 'gutter') this.#apply();
  }

  /** @returns {number} keyboard resize step in px */
  get step() {
    return Math.max(1, this.getNumber('step', 16));
  }

  /** @returns {string} */
  get gutter() {
    return this.getString('gutter', '');
  }

  /** Panel for a slot, if present. @param {PanelSlot} slot @returns {PanelSpec|null} */
  panel(slot) {
    return this.#panels.get(slot) ?? null;
  }

  /**
   * Current track size of a panel, in pixels, or `null` when the slot is
   * absent. This is what the grid is actually rendering, so it is the value
   * exposed on each separator's `aria-valuenow`.
   *
   * @param {PanelSlot} slot
   * @returns {number|null}
   *
   * @example
   * layout.sizeOf('left'); // 240
   */
  sizeOf(slot) {
    const spec = this.#panels.get(slot);
    if (!spec) return null;
    return spec.collapsed ? 0 : Math.round(spec.current);
  }

  /**
   * Sets a panel's track size in pixels, clamped to its own min/max. This is
   * the programmatic equivalent of dragging its separator.
   *
   * @param {PanelSlot} slot
   * @param {number} px
   * @returns {this}
   *
   * @example
   * layout.setSlotSize('left', 280);
   */
  setSlotSize(slot, px) {
    this.#resize(slot, px);
    this.#apply();
    return this;
  }

  /**
   * Collapses or restores a panel. Only panels marked `collapsible` respond.
   *
   * @param {PanelSlot} slot
   * @param {boolean} collapsed
   * @returns {this}
   *
   * @example
   * layout.setSlotCollapsed('left', true);
   */
  setSlotCollapsed(slot, collapsed) {
    this.#toggleCollapse(slot, collapsed);
    return this;
  }

  /**
   * Restores every panel to the size it was authored with, and un-collapses
   * anything that is currently collapsed.
   *
   * @returns {this}
   */
  reset() {
    for (const [slot, spec] of this.#panels) {
      spec.collapsed = false;
      this.#reset(slot);
    }
    this.#apply();
    return this;
  }

  /** @returns {PanelSlot[]} */
  get slots() {
    return [...this.#panels.keys()];
  }

  /* ------------------------------------------------------------ lifecycle */

  onConnect() {
    this.#build();
  }

  onDisconnect() {
    for (const dispose of this.#disposers) dispose();
    this.#disposers = [];
    this.#dragOrigin.clear();

    for (const splitter of this.#splitters.values()) splitter.remove();
    this.#splitters.clear();
    this.#panels.clear();

    this.style.gridTemplateAreas = '';
    this.style.gridTemplateColumns = '';
    this.style.gridTemplateRows = '';
  }

  /* --------------------------------------------------------------- build */

  #build() {
    const nodes = /** @type {HTMLElement[]} */ ([...this.children].filter((c) => c.localName === 'ui-panel'));
    if (nodes.length === 0) return;

    for (const node of nodes) {
      const slot = /** @type {PanelSlot} */ (node.getAttribute('slot') ?? 'center');
      if (!['top', 'left', 'right', 'center', 'bottom'].includes(slot)) continue;

      node.style.gridArea = slot;
      if (node.hasAttribute('label')) node.setAttribute('aria-label', node.getAttribute('label') ?? '');
      else if (!node.hasAttribute('aria-label')) node.setAttribute('aria-label', `${slot} panel`);

      this.#panels.set(slot, this.#readSpec(node));
    }

    this.setAttribute('role', this.getAttribute('role') ?? 'region');
    if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', 'Workspace layout');

    this.#buildSplitters();
    this.#apply();
  }

  /** @param {HTMLElement} node @returns {PanelSpec} */
  #readSpec(node) {
    const size = node.getAttribute('size');
    const current = toPx(size) ?? 0;

    return {
      node,
      label: node.getAttribute('label') ?? '',
      initial: current,
      current,
      min: toPx(node.getAttribute('min')),
      max: toPx(node.getAttribute('max')),
      resizable: node.hasAttribute('resizable'),
      collapsible: node.hasAttribute('collapsible'),
      collapsed: false,
    };
  }

  #buildSplitters() {
    const horizontal = ['left', 'center', 'right'].filter((slot) => this.#panels.has(slot));

    for (let i = 0; i < horizontal.length - 1; i += 1) {
      const before = /** @type {PanelSlot} */ (horizontal[i]);
      const after = /** @type {PanelSlot} */ (horizontal[i + 1]);
      this.#createSplitter(`${before}|${after}`, before, after);
    }
  }

  /** @param {string} key @param {PanelSlot} before @param {PanelSlot} after */
  #createSplitter(key, before, after) {
    const spec = this.#panels.get(before);
    const name =
      spec?.label || this.#panels.get(after)?.label
        ? `Resize ${spec?.label || before} and ${this.#panels.get(after)?.label || after}`
        : `Resize layout`;

    /** @type {HTMLElement} */
    const splitter = el('div', {
      class: 'ui4u-layout__splitter',
      role: 'separator',
      tabindex: '0',
      'aria-orientation': 'vertical',
      'aria-label': name,
    });

    this.#splitters.set(key, splitter);
    // The separator is a real child of the layout — it has to be in the DOM to
    // receive focus, pointer capture and the role that assistive tech reads.
    this.appendChild(splitter);

    this.#disposers.push(
      on(splitter, 'keydown', (event) => this.#onSplitterKey(event, before, after)),
      on(splitter, 'dblclick', () => {
        this.#reset(before);
        this.#reset(after);
        this.#apply();
      }),
      draggable(splitter, {
        onDown: (event) => {
          const target = this.#panels.get(before) ?? this.#panels.get(after);
          if (!target?.resizable) return false;
          // Remember where both panels started: `delta` is cumulative from the
          // pointer-down origin, so it must be added to the starting size
          // rather than used as the size itself.
          this.#dragOrigin.set(before, this.#panels.get(before)?.current ?? 0);
          this.#dragOrigin.set(after, this.#panels.get(after)?.current ?? 0);
          event.preventDefault();
          return true;
        },
        onMove: (event, delta) => {
          this.#resize(before, (this.#dragOrigin.get(before) ?? 0) + delta.x);
          this.#resize(after, (this.#dragOrigin.get(after) ?? 0) - delta.x);
          this.#apply();
        },
      })
    );
  }

  /* ------------------------------------------------------------ behaviour */

  /**
   * Sets a panel's track size, clamped to its min/max.
   *
   * @param {PanelSlot} slot
   * @param {number} px
   * @param {{ silent?: boolean }} [options]
   */
  #resize(slot, px, { silent = false } = {}) {
    const spec = this.#panels.get(slot);
    if (!spec || !spec.resizable || spec.collapsed) return;

    const next = clamp(px, spec.min, spec.max);
    if (next === spec.current) return;

    spec.current = next;
    if (!silent) this.emit('ui4u:resize', { slot, size: next, min: spec.min, max: spec.max });
  }

  /** @param {PanelSlot} slot */
  #reset(slot) {
    const spec = this.#panels.get(slot);
    if (!spec) return;
    spec.current = clamp(spec.initial, spec.min, spec.max);
  }

  /**
   * @param {PanelSlot} slot
   * @param {boolean} [force]
   */
  #toggleCollapse(slot, force) {
    const spec = this.#panels.get(slot);
    if (!spec || !spec.collapsible) return;

    const next = typeof force === 'boolean' ? force : !spec.collapsed;
    if (next === spec.collapsed) return;

    if (next) {
      spec.current = clamp(spec.current, spec.min, spec.max);
      spec.collapsed = true;
    } else {
      spec.collapsed = false;
      spec.current = clamp(spec.initial, spec.min, spec.max);
    }

    this.#apply();
    this.emit('ui4u:collapse', { slot, collapsed: spec.collapsed });
  }

  /** @param {KeyboardEvent} event @param {PanelSlot} before @param {PanelSlot} after */
  #onSplitterKey(event, before, after) {
    const step = this.step;
    const beforeSpec = this.#panels.get(before);
    const afterSpec = this.#panels.get(after);

    /** @type {number|null} */
    let delta = null;

    switch (event.key) {
      case 'ArrowLeft':
        delta = -step;
        break;
      case 'ArrowRight':
        delta = step;
        break;
      case 'Home':
        event.preventDefault();
        this.#resize(before, beforeSpec?.min ?? 0);
        this.#resize(after, afterSpec?.min ?? 0);
        this.#apply();
        return;
      case 'End':
        event.preventDefault();
        this.#resize(before, beforeSpec?.max ?? Number.MAX_SAFE_INTEGER);
        this.#resize(after, afterSpec?.max ?? Number.MAX_SAFE_INTEGER);
        this.#apply();
        return;
      case 'Enter':
        event.preventDefault();
        this.#toggleCollapse(before);
        return;
      default:
        return;
    }

    event.preventDefault();
    this.#resize(before, (beforeSpec?.current ?? 0) + delta);
    this.#resize(after, (afterSpec?.current ?? 0) - delta);
    this.#apply();
  }

  /* -------------------------------------------------------------- layout */

  /** Recomputes the grid template from the current panel sizes. */
  #apply() {
    const has = (slot) => this.#panels.has(slot);

    /** Track size for a slot, or `auto` when the slot is absent. */
    const size = (slot) => {
      const spec = this.#panels.get(slot);
      if (!spec) return 'auto';
      return spec.collapsed ? '0px' : `${Math.round(spec.current)}px`;
    };

    const gutter = this.gutter || 'var(--ui4u-layout-splitter-size)';

    /* Columns, and the matching area names for the middle row. */
    /** @type {string[]} */
    const columns = [];
    /** @type {string[]} */
    const middle = [];

    if (has('left')) {
      columns.push(size('left'), gutter);
      middle.push('left', 'sp-l');
    }
    columns.push(has('center') ? 'minmax(0, 1fr)' : '0px');
    middle.push('center');
    if (has('right')) {
      columns.push(gutter, size('right'));
      middle.push('sp-r', 'right');
    }

    const width = middle.length;
    const span = (name) => Array(width).fill(name).join(' ');

    /* Rows: optional top, the flexible middle, optional bottom. */
    /** @type {string[]} */
    const rows = [];
    /** @type {string[]} */
    const areas = [];

    if (has('top')) {
      rows.push(size('top'));
      areas.push(span('top'));
    }
    rows.push(has('center') ? 'minmax(0, 1fr)' : 'auto');
    areas.push(middle.join(' '));
    if (has('bottom')) {
      rows.push(size('bottom'));
      areas.push(span('bottom'));
    }

    this.style.gridTemplateAreas = areas.map((row) => `"${row}"`).join(' ');
    this.style.gridTemplateColumns = columns.join(' ');
    this.style.gridTemplateRows = rows.join(' ');

    // A zero-width track still floors at the panel's own padding, so a
    // collapsed panel is hidden outright rather than left as a 32px sliver.
    // That is also the accessible behaviour: a collapsed panel should not be
    // in the accessibility tree at all.
    for (const spec of this.#panels.values()) {
      spec.node.hidden = spec.collapsed;
    }

    for (const [key, splitter] of this.#splitters) {
      const [before, after] = key.split('|');
      splitter.style.gridArea = before === 'left' || after === 'left' ? 'sp-l' : 'sp-r';
      this.#updateSplitterAria(splitter, /** @type {PanelSlot} */ (before), /** @type {PanelSlot} */ (after));
    }
  }

  /** @param {HTMLElement} splitter @param {PanelSlot} before @param {PanelSlot} after */
  #updateSplitterAria(splitter, before, after) {
    const spec = this.#panels.get(before) ?? this.#panels.get(after);
    if (!spec) return;
    splitter.setAttribute('aria-valuenow', String(Math.round(spec.current)));
    splitter.setAttribute('aria-valuemin', String(Math.round(spec.min ?? 0)));
    splitter.setAttribute('aria-valuemax', String(Math.round(spec.max ?? spec.current)));
  }
}

/**
 * A layout region. Positioning comes from `slot`; sizing from `size`/`min`/`max`.
 */
export class Panel extends UI4UElement {
  /** @returns {PanelSlot} */
  get slot() {
    return /** @type {PanelSlot} */ (this.getAttribute('slot') ?? 'center');
  }
}