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
 * @property {boolean} sized Whether a size has been authored or dragged. Unsized
 *   slots stay fluid (`auto`), which is what nested layouts want.
 * @property {number|null} min
 * @property {number|null} max
 * @property {boolean} resizable
 * @property {boolean} collapsible
 * @property {boolean} collapsed
 *
 /**
 * @typedef {object} SplitterSpec
 * @property {HTMLElement} node
 * @property {PanelSlot} before
 * @property {PanelSlot} after
 * @property {'column' | 'row'} axis
 *
 * @typedef {object} LayoutOptions
 * @property {string} [gutter] Splitter thickness. Default `'var(--ui4u-layout-splitter-size)'`.
 * @property {number} [step] Keyboard resize step in px. Default `16`.
 */

/** Every valid slot name. @type {PanelSlot[]} */
export const SLOTS = ['top', 'left', 'right', 'center', 'bottom'];

/**
 * Reads the slot from a panel or a nested layout. Defaults to `center`, which
 * is the flexible region.
 *
 * @param {Element} node
 * @returns {PanelSlot}
 */
export function readSlot(node) {
  const value = node.getAttribute('slot');
  return SLOTS.includes(/** @type {PanelSlot} */ (value)) ? /** @type {PanelSlot} */ (value) : 'center';
}

/**
 * Grid area for a separator, derived from the region it opens and the axis it
 * splits. Column separators open `center` (sp-l) or `right` (sp-r); row
 * separators open `center` (sp-t) or `bottom` (sp-b).
 *
 * @param {'column' | 'row'} axis
 * @param {PanelSlot} after
 * @returns {string}
 */
export function separatorArea(axis, after) {
  if (axis === 'row') return after === 'bottom' ? 'sp-b' : 'sp-t';
  return after === 'right' ? 'sp-r' : 'sp-l';
}

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
 * **Layouts nest.** Any slot can hold another `ui-layout` instead of a panel, so
 * a sidebar can be a workspace of its own — with its own centre and further
 * left/right regions, and its own top and bottom — to any depth:
 *
 * ```html
 * <ui-layout>
 *   <ui-layout slot="left" label="Explorer">
 *     <ui-panel slot="left" size="8rem" resizable>Rail</ui-panel>
 *     <ui-panel slot="center">Explorer body</ui-panel>
 *     <ui-panel slot="bottom" size="3rem">Filters</ui-panel>
 *   </ui-layout>
 *   <ui-panel slot="center">Editor</ui-panel>
 *   <ui-panel slot="bottom" size="4rem">Status</ui-panel>
 * </ui-layout>
 * ```
 *
 * Events bubble, and each carries the `layout` that emitted it, so a listener
 * on an outer layout can tell its own events from a nested one's.
 *
 * Listens for `ui4u:resize` and `ui4u:collapse`.
 */
export class Layout extends UI4UElement {
  static get observedAttributes() {
    return ['gutter', 'step'];
  }

  /** @type {Map<string, PanelSpec>} */
  #panels = new Map();
  /** @type {Map<string, SplitterSpec>} */
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

    for (const { node } of this.#splitters.values()) node.remove();
    this.#splitters.clear();
    this.#panels.clear();

    this.style.gridTemplateAreas = '';
    this.style.gridTemplateColumns = '';
    this.style.gridTemplateRows = '';
  }

  /* --------------------------------------------------------------- build */

  #build() {
    // Any slot may be filled by a panel *or* by another layout, which is what
    // makes the component recursive: a sidebar can be a nested layout with its
    // own centre and further left/right regions, to any depth.
    const nodes = /** @type {HTMLElement[]} */ (
      [...this.children].filter((c) => c.localName === 'ui-panel' || c.localName === 'ui-layout')
    );
    if (nodes.length === 0) return;

    for (const node of nodes) {
      const slot = readSlot(node);
      if (!SLOTS.includes(slot)) continue;

      node.style.gridArea = slot;
      if (node.hasAttribute('label')) node.setAttribute('aria-label', node.getAttribute('label') ?? '');
      else if (!node.hasAttribute('aria-label')) {
        node.setAttribute('aria-label', `${slot} ${node.localName === 'ui-layout' ? 'region' : 'panel'}`);
      }

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
      // A slot with no authored size — typically a nested layout — stays fluid
      // until it is actually given one or dragged.
      sized: size !== null,
      min: toPx(node.getAttribute('min')),
      max: toPx(node.getAttribute('max')),
      resizable: node.hasAttribute('resizable'),
      collapsible: node.hasAttribute('collapsible'),
      collapsed: false,
    };
  }

  #buildSplitters() {
    // Column separators divide left / center / right.
    const columns = ['left', 'center', 'right'].filter((slot) => this.#panels.has(slot));
    for (let i = 0; i < columns.length - 1; i += 1) {
      this.#createSplitter(
        `column:${columns[i]}|${columns[i + 1]}`,
        /** @type {PanelSlot} */ (columns[i]),
        /** @type {PanelSlot} */ (columns[i + 1]),
        'column'
      );
    }

    // Row separators divide top / center / bottom, so the header and the status
    // bar are resizable too rather than being fixed decoration.
    const rows = ['top', 'center', 'bottom'].filter((slot) => this.#panels.has(slot));
    for (let i = 0; i < rows.length - 1; i += 1) {
      this.#createSplitter(
        `row:${rows[i]}|${rows[i + 1]}`,
        /** @type {PanelSlot} */ (rows[i]),
        /** @type {PanelSlot} */ (rows[i + 1]),
        'row'
      );
    }
  }

  /**
   * @param {string} key
   * @param {PanelSlot} before
   * @param {PanelSlot} afterSlot
   * @param {'column' | 'row'} axis
   */
  #createSplitter(key, before, afterSlot, axis) {
    const spec = this.#panels.get(before);
    const after = this.#panels.get(afterSlot);
    const name =
      spec?.label || after?.label
        ? `Resize ${spec?.label || before} and ${after?.label || afterSlot}`
        : 'Resize layout';

    /** @type {HTMLElement} */
    const splitter = el('div', {
      class: `ui4u-layout__splitter ui4u-layout__splitter--${axis}`,
      role: 'separator',
      tabindex: '0',
      // A separator dividing left/right is vertical; one dividing top/bottom is
      // horizontal. This is what assistive tech announces.
      'aria-orientation': axis === 'column' ? 'vertical' : 'horizontal',
      'aria-label': name,
    });

    this.#splitters.set(key, { node: splitter, before, after: afterSlot, axis });

    /*
     * The separator is a real child of the layout — it has to be in the DOM to
     * receive focus, pointer capture and the role assistive tech reads.
     *
     * It is inserted immediately before the region it opens rather than
     * appended, so tab order reads "handle, then the thing it handles" instead
     * of making keyboard users tab through a panel's content to reach its
     * resize handle. Grid placement is unaffected, because `grid-area` decides
     * where each item lands, not its position in the DOM.
     */
    const afterNode = this.#panels.get(afterSlot)?.node ?? null;
    if (afterNode?.parentNode === this) this.insertBefore(splitter, afterNode);
    else this.appendChild(splitter);

    this.#disposers.push(
      on(splitter, 'keydown', (event) => this.#onSplitterKey(event, before, afterSlot, axis)),
      on(splitter, 'dblclick', () => {
        this.#reset(before);
        this.#reset(afterSlot);
        this.#apply();
      }),
      draggable(splitter, {
        onDown: (event) => {
          const target = this.#panels.get(before) ?? this.#panels.get(afterSlot);
          if (!target?.resizable) return false;

          // `preventDefault` below stops text selection during the drag, but it
          // also suppresses the browser's native focus-on-click. Without this,
          // clicking the handle and then pressing an arrow key does nothing,
          // because focus is still wherever it was — which reads as "the
          // keyboard shortcut is broken".
          splitter.focus({ preventScroll: true });

          // Remember where both regions started: `delta` is cumulative from the
          // pointer-down origin, so it must be added to the starting size
          // rather than used as the size itself.
          this.#dragOrigin.set(before, this.#panels.get(before)?.current ?? 0);
          this.#dragOrigin.set(afterSlot, this.#panels.get(afterSlot)?.current ?? 0);
          event.preventDefault();
          return true;
        },
        onMove: (event, delta) => {
          // Same rule on both axes: travelling along the axis grows what comes
          // before and shrinks what comes after.
          const travel = axis === 'column' ? delta.x : delta.y;
          this.#resize(before, (this.#dragOrigin.get(before) ?? 0) + travel);
          this.#resize(afterSlot, (this.#dragOrigin.get(afterSlot) ?? 0) - travel);
          this.#apply();
        },
      })
    );
  }

  /* ------------------------------------------------------------ behaviour */

  /**
   * Sets a slot's track size, clamped to its min/max.
   *
   * @param {PanelSlot} slot
   * @param {number} px
   * @param {{ silent?: boolean }} [options]
   */
  #resize(slot, px, { silent = false } = {}) {
    const spec = this.#panels.get(slot);
    if (!spec || !spec.resizable || spec.collapsed) return;

    const next = clamp(px, spec.min, spec.max);
    if (next === spec.current && spec.sized) return;

    spec.current = next;
    // First explicit size turns a fluid slot into a fixed track.
    spec.sized = true;
    if (!silent) {
      this.emit('ui4u:resize', { slot, size: next, min: spec.min, max: spec.max, layout: this });
    }
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
    this.emit('ui4u:collapse', { slot, collapsed: spec.collapsed, layout: this });
  }

  /**
   * @param {KeyboardEvent} event
   * @param {PanelSlot} before
   * @param {PanelSlot} after
   * @param {'column' | 'row'} axis
   */
  #onSplitterKey(event, before, after, axis) {
    const step = this.step;
    const beforeSpec = this.#panels.get(before);
    const afterSpec = this.#panels.get(after);

    // A column separator responds to the horizontal arrows, a row separator to
    // the vertical ones, so the keys always match what the handle does on screen.
    const grow = axis === 'column' ? 'ArrowRight' : 'ArrowDown';
    const shrink = axis === 'column' ? 'ArrowLeft' : 'ArrowUp';

    /** @type {number|null} */
    let delta = null;

    switch (event.key) {
      case grow:
        delta = step;
        break;
      case shrink:
        delta = -step;
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
      if (spec.collapsed) return '0px';
      // No authored size and nothing dragged yet: stay fluid. A nested layout
      // is the usual case here.
      if (!spec.sized) return 'auto';
      return `${Math.round(spec.current)}px`;
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

    /* Rows: optional top, the flexible middle, optional bottom — each separated
       from its neighbour by a gutter row when both are present. */
    /** @type {string[]} */
    const rows = [];
    /** @type {string[]} */
    const areas = [];

    /** @type {PanelSlot[]} */
    const rowSlots = ['top', 'center', 'bottom'].filter((slot) => has(slot));

    rowSlots.forEach((slot, index) => {
      rows.push(slot === 'center' ? 'minmax(0, 1fr)' : size(slot));
      areas.push(slot === 'center' ? middle.join(' ') : span(slot));

      // A gutter row between this region and the next one.
      const next = rowSlots[index + 1];
      if (next) {
        rows.push(gutter);
        areas.push(span(separatorArea('row', next)));
      }
    });

    // A layout with only left/right regions still needs one row to hold them.
    if (rows.length === 0) {
      rows.push('auto');
      areas.push(middle.join(' '));
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

    for (const { node, before, after, axis } of this.#splitters.values()) {
      node.style.gridArea = separatorArea(axis, after);
      this.#updateSplitterAria(node, before, after);
    }
  }

  /** @param {HTMLElement} splitter @param {PanelSlot} before @param {PanelSlot} after */
  #updateSplitterAria(splitter, before, after) {
    const spec = this.#panels.get(before) ?? this.#panels.get(after);
    if (!spec) return;

    splitter.setAttribute('aria-valuenow', String(Math.round(spec.current)));

    // Only advertise bounds that are actually enforced. Reporting a bound the
    // component does not clamp to would tell assistive tech a limit the user
    // can pass straight through.
    if (typeof spec.min === 'number') {
      splitter.setAttribute('aria-valuemin', String(Math.round(spec.min)));
    } else {
      splitter.removeAttribute('aria-valuemin');
    }

    if (typeof spec.max === 'number') {
      splitter.setAttribute('aria-valuemax', String(Math.round(spec.max)));
    } else {
      splitter.removeAttribute('aria-valuemax');
    }
  }
}

/**
 * A layout region. Positioning comes from `slot`; sizing from `size`/`min`/`max`.
 *
 * A `ui-layout` may stand in for a panel in any slot — see {@link Layout}.
 */
export class Panel extends UI4UElement {
  /** @returns {PanelSlot} */
  get slot() {
    return readSlot(this);
  }
}