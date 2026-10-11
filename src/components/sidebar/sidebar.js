import { UI4UElement } from '../../core/base.js';
import { el, on, uid } from '../../core/dom.js';
import { focusTrap } from '../../core/focus-trap.js';

/**
 * Viewport query that switches the sidebar into its off-canvas drawer. Kept in
 * sync with the media query in `sidebar.css`; `data-narrow` overrides it so a
 * test (or a demo control) can force the drawer without a real viewport.
 */
const NARROW_QUERY = '(max-width: 48rem)';

/**
 * @typedef {'left' | 'right'} SidebarSide
 *
 * @typedef {object} SidebarOptions
 * @property {boolean} [expanded] Whether the sidebar starts open. Default `true`.
 * @property {SidebarSide} [side] Which edge it sits on. Default `'left'`.
 * @property {string} [width] CSS length for the full width, e.g. `'16rem'`.
 * @property {string} [rail] CSS length for the collapsed (rail) width.
 *
 * @typedef {object} SidebarChangeDetail
 * @property {boolean} expanded
 * @property {boolean} rail Whether the sidebar is currently in rail mode.
 *
 * @typedef {object} SidebarNavigateDetail
 * @property {SidebarItem} item
 * @property {number} index
 * @property {string} href
 *
 * @typedef {object} ItemRecord
 * @property {SidebarItem} item
 * @property {HTMLAnchorElement|HTMLButtonElement} control
 * @property {string} label
 * @property {string} href
 */

/**
 * One navigation entry, authored as light DOM:
 *
 * ```html
 * <ui-sidebar-item label="Components" href="/demo/tabs.html"></ui-sidebar-item>
 * ```
 *
 * This is a declarative marker only — `ui-sidebar` renders the real
 * `<a href>`/`<button>` inside it and owns every role, `aria-*` attribute and
 * tab stop, so the two always agree. See `ItemRecord`.
 */
export class SidebarItem extends UI4UElement {}

/**
 * A navigation sidebar: a labelled landmark of links and buttons, a collapse
 * toggle, a rail mode, and an off-canvas drawer on narrow viewports.
 *
 * ```html
 * <ui-sidebar expanded label="Main">
 *   <ui-sidebar-item label="Overview" active></ui-sidebar-item>
 *   <ui-sidebar-item label="Components" href="/demo/tabs.html"></ui-sidebar-item>
 * </ui-sidebar>
 * ```
 *
 * Emits `ui4u:change` — `detail: { expanded, rail }` — and `ui4u:navigate` —
 * `detail: { item, index, href }`.
 */
export class Sidebar extends UI4UElement {
  static get observedAttributes() {
    return ['expanded', 'side', 'width', 'rail', 'label', 'data-narrow'];
  }

  /** @type {HTMLButtonElement|null} */
  #toggle = null;
  /** @type {HTMLElement|null} */
  #panel = null;
  /** @type {HTMLElement|null} */
  #backdrop = null;
  /** @type {ItemRecord[]} */
  #records = [];
  /** @type {SidebarItem[]} children moved into the panel */
  #stash = [];
  /** @type {import('../../core/focus-trap.js').FocusTrap|null} */
  #trap = null;
  #index = 0;
  #built = false;
  /*
   * The focus trap is armed by the first open() the user performs. An
   * `expanded` attribute the consumer authored renders the open drawer but
   * must not steal focus from the page during its own upgrade.
   */
  #trapArmed = false;
  /** Guards the property -> attribute reflect loop. @type {boolean} */
  #syncing = false;

  /* ------------------------------------------------------------------ api */

  /** @returns {boolean} */
  get expanded() {
    return this.hasAttribute('expanded');
  }

  set expanded(next) {
    this[next ? 'open' : 'close']();
  }

  /** @returns {SidebarSide} */
  get side() {
    return this.getString('side', 'left') === 'right' ? 'right' : 'left';
  }

  set side(next) {
    this.setAttribute('side', next === 'right' ? 'right' : 'left');
  }

  /** @returns {string} CSS length, e.g. `'16rem'`. */
  get width() {
    return this.getString('width', '');
  }

  set width(next) {
    this.#setLength('width', '--ui4u-sidebar-width', next);
  }

  /** @returns {string} CSS length for the collapsed rail. */
  get rail() {
    return this.getString('rail', '');
  }

  set rail(next) {
    this.#setLength('rail', '--ui4u-sidebar-rail', next);
  }

  /**
   * Whether the sidebar is in off-canvas drawer mode.
   *
   * Defaults to the {@link NARROW_QUERY} media query; setting the
   * `data-narrow` attribute overrides it, which is how the unit tests reach
   * drawer behaviour without a real viewport.
   *
   * @returns {boolean}
   */
  get narrow() {
    if (this.hasAttribute('data-narrow')) return this.getBoolean('data-narrow', false);
    return typeof matchMedia === 'function' ? matchMedia(NARROW_QUERY).matches : false;
  }

  set narrow(next) {
    this.setAttribute('data-narrow', String(Boolean(next)));
  }

  /** @returns {SidebarItem[]} the item elements, in document order */
  get items() {
    return /** @type {SidebarItem[]} */ (
      [...this.children].filter((child) => child.localName === 'ui-sidebar-item')
    );
  }

  /** @returns {number} index of the active item */
  get activeIndex() {
    return this.#index;
  }

  /** @returns {SidebarItem|null} */
  get activeItem() {
    return this.#records[this.#index]?.item ?? null;
  }

  /** The rendered toggle button, or `null` before the first build. @returns {HTMLButtonElement|null} */
  get toggleButton() {
    return this.#toggle;
  }

  /**
   * Applies options and returns `this`.
   *
   * @param {SidebarOptions} [options]
   * @returns {this}
   *
   * @example
   * sidebar.configure({ side: 'right', width: '18rem', rail: '4rem', expanded: true });
   */
  configure(options = {}) {
    const { expanded, side = 'left', width, rail } = options;

    this.setAttribute('side', side);
    if (width !== undefined) this.width = width;
    if (rail !== undefined) this.rail = rail;
    if (expanded !== undefined) this.expanded = expanded;

    return this;
  }

  /** @returns {this} */
  open() {
    return this.#setExpanded(true);
  }

  /** @returns {this} */
  close() {
    return this.#setExpanded(false);
  }

  /** @returns {this} */
  toggle() {
    return this.#setExpanded(!this.expanded);
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

    if (name === 'expanded') {
      this.#sync();
    } else if (name === 'side' || name === 'data-narrow') {
      this.dataset.side = this.side;
      this.#sync();
    } else if (name === 'width' || name === 'rail') {
      this.#applyLengths();
    } else if (name === 'label') {
      this.#applyLabel();
    }
  }

  /* --------------------------------------------------------------- build */

  /**
   * @param {string} attribute
   * @param {string} property
   * @param {unknown} value
   */
  #setLength(attribute, property, value) {
    if (value === null || value === undefined || value === '') this.removeAttribute(attribute);
    else this.setAttribute(attribute, String(value));
    this.style.setProperty(property, String(value || ''));
  }

  /** Mirrors the `width`/`rail` attributes onto the component's CSS knobs. */
  #applyLengths() {
    const width = this.width;
    const rail = this.rail;
    this.style.setProperty('--ui4u-sidebar-width', width || '');
    this.style.setProperty('--ui4u-sidebar-rail', rail || '');
  }

  #applyLabel() {
    const label = this.getString('label', '');
    if (label) this.setAttribute('aria-label', label);
    else this.removeAttribute('aria-label');
  }

  #build() {
    if (this.#built) return;

    const items = this.items;
    if (items.length === 0) return;

    const baseId = uid('ui4u-sidebar');

    /** @type {SidebarItem[]} */
    const stash = items;

    /*
     * `tabindex="-1"` is load-bearing: it is the trap root's last-resort focus
     * target. Without it the root is not focusable at all and a focus event
     * arriving from outside has nowhere to be sent back to.
     */
    /** @type {HTMLElement} */
    const panel = el('div', {
      class: 'ui4u-sidebar__panel',
      id: `${baseId}-panel`,
      tabindex: '-1',
    });
    /** @type {HTMLElement} */
    const list = el('div', { class: 'ui4u-sidebar__items', id: `${baseId}-items` });
    /** @type {HTMLElement} */
    const backdrop = el('div', {
      class: 'ui4u-sidebar__backdrop',
      'aria-hidden': 'true',
      hidden: true,
    });

    /** @type {HTMLButtonElement} */
    const toggle = el(
      'button',
      {
        type: 'button',
        class: 'ui4u-sidebar__toggle',
        'aria-controls': `${baseId}-panel`,
        'aria-expanded': 'true',
      },
      el('span', { class: 'ui4u-sidebar__toggle-glyph', 'aria-hidden': 'true' }, '«')
    );

    /** @type {ItemRecord[]} */
    const records = stash.map((item, index) => this.#buildItem(item, index));

    for (const item of stash) list.appendChild(item);
    panel.appendChild(list);

    this.#toggle = toggle;
    this.#panel = panel;
    this.#backdrop = backdrop;
    this.#records = records;
    this.#stash = stash;
    this.#built = true;

    // The host is the trap's last-resort focus target when the panel has no
    // visible focusable (jsdom, or a rail with every item hidden).
    this.setAttribute('tabindex', '-1');
    this.setAttribute('role', 'navigation');

    /*
     * An authored `expanded` describes the docked sidebar. Below the
     * breakpoint that same sidebar is an off-canvas drawer, which is only ever
     * opened deliberately — a page load must not cover itself with a sheet and
     * a focus trap the reader never asked for.
     */
    if (this.narrow && this.expanded) {
      this.#syncing = true;
      this.removeAttribute('expanded');
      this.#syncing = false;
    }

    this.dataset.side = this.side;
    this.#applyLabel();
    this.#applyLengths();

    this.append(toggle, panel);

    /*
     * Portalled: the backdrop is `position: fixed`, so an ancestor with
     * `transform`, `filter` or `backdrop-filter` would become its containing
     * block. It is therefore NOT a descendant of this host — styles it by its
     * own class, never through a `ui-sidebar ...` selector.
     */
    const body = this.ownerDocument?.body ?? this.ownerDocument?.documentElement;
    if (body) body.appendChild(backdrop);

    this.track(on(toggle, 'click', () => this.toggle()));
    this.track(on(backdrop, 'click', () => this.close()));

    /*
     * Escape is a document-level intent while the drawer holds focus: the key
     * can arrive from anywhere inside the trapped panel, so it is handled on
     * the document rather than on the host. A non-modal sidebar must never
     * steal Escape from the page behind it.
     */
    const doc = this.ownerDocument;
    if (doc) {
      this.track(
        on(doc, 'keydown', (event) => {
          if (event.key !== 'Escape' || !this.narrow || !this.expanded) return;
          event.preventDefault();
          this.close();
        })
      );
    }
    // Delegated, so a consumer adding items later needs no extra wiring.
    this.track(
      on(this, 'click', (event) => {
        const index = this.#indexFrom(event.target);
        if (index !== -1) this.#activate(index, { focus: true });
      })
    );
    this.track(on(this, 'keydown', (event) => this.#onKeydown(event)));
    // A rail strip is unreadable without labels: entering it expands it.
    this.track(
      on(this, 'focusin', (event) => {
        if (this.#indexFrom(/** @type {Node|null} */ (event.target)) !== -1) this.#expandOnFocus();
      })
    );

    this.#activate(this.#initialIndex(items), { silent: true });
    this.#collapseIfDrawer();
    this.#sync();
    this.#watchViewport();
  }

  /**
   * An off-canvas drawer must not cover the page on load, even when the author
   * wrote `expanded`. That is the whole point of off-canvas: the content behind
   * it stays readable until the user asks for the navigation.
   */
  #collapseIfDrawer() {
    if (!this.narrow || !this.expanded) return;
    this.#syncing = true;
    this.removeAttribute('expanded');
    this.#syncing = false;
  }

  /**
   * @param {SidebarItem} item
   * @param {number} index
   * @param {HTMLElement} list
   * @returns {ItemRecord}
   */
  #buildItem(item, index) {
    const label = item.getString('label', '') || `Item ${index + 1}`;
    const href = item.getString('href', '');
    const icon = item.getString('icon', '');

    // A navigation entry without a destination is a command, so it must be a
    // real button — never a clickable <div> or a link with no href.
    /** @type {HTMLAnchorElement|HTMLButtonElement} */
    const control = href
      ? el('a', { class: 'ui4u-sidebar__link', href, title: label })
      : el('button', { class: 'ui4u-sidebar__link', type: 'button', title: label });

    if (icon)
      control.appendChild(el('span', { class: 'ui4u-sidebar__icon', 'aria-hidden': 'true' }, icon));
    control.appendChild(el('span', { class: 'ui4u-sidebar__label' }, label));

    item.appendChild(control);

    return { item, control, label, href };
  }

  /**
   * @param {SidebarItem[]} items
   * @returns {number}
   */
  #initialIndex(items) {
    const authored = items.findIndex((item) => item.hasAttribute('active'));
    return authored === -1 ? 0 : authored;
  }

  #teardown() {
    this.#releaseTrap();

    // The control lives inside the item, so removing the panel is not enough:
    // each item still carries the control this component generated.
    for (const record of this.#records) record.control.remove();

    this.#toggle?.remove();
    this.#panel?.remove();
    this.#backdrop?.remove();

    /*
     * Restore the author's markup in document order. Re-inserting each item
     * before `firstChild` instead would reverse them, and a rebuilt sidebar
     * would come back with its items the wrong way round.
     */
    for (const item of this.#stash) this.append(item);
    this.#stash = [];

    this.#toggle = null;
    this.#panel = null;
    this.#backdrop = null;
    this.#records = [];
    this.#index = 0;
    this.removeAttribute('tabindex');
    this.removeAttribute('role');
    delete this.dataset.expanded;
    delete this.dataset.rail;
    delete this.dataset.side;
    delete this.dataset.drawer;
    this.#built = false;
  }

  /* ----------------------------------------------------------- behaviour */

  /** Keeps `data-drawer` honest when the viewport crosses the breakpoint. */
  #watchViewport() {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia(NARROW_QUERY);
    this.track(
      on(query, 'change', () => {
        // Shrinking into drawer mode should tuck the sidebar away again.
        this.#collapseIfDrawer();
        this.#sync();
      })
    );
  }

  /**
   * Collapsed and rail mode are the same state: a narrow strip whose labels
   * are only reachable through each control's `title`.
   *
   * @param {boolean} next
   * @returns {this}
   */
  #setExpanded(next) {
    if (!this.#built) this.#build();
    const changed = next !== this.expanded;
    if (next) this.#trapArmed = true;

    this.#syncing = true;
    if (next) this.setAttribute('expanded', '');
    else this.removeAttribute('expanded');
    this.#syncing = false;

    this.#sync();

    if (changed) this.emit('ui4u:change', { expanded: next, rail: !next });
    return this;
  }

  #sync() {
    const expanded = this.expanded;
    const narrow = this.narrow;

    this.dataset.expanded = String(expanded);
    this.dataset.rail = String(!expanded);
    this.dataset.drawer = String(narrow);

    if (this.#toggle) {
      this.#toggle.setAttribute('aria-expanded', String(expanded));
      const name = expanded ? 'Collapse navigation' : 'Expand navigation';
      this.#toggle.setAttribute('aria-label', name);
      this.#toggle.setAttribute('title', name);
      const glyph = this.#toggle.querySelector('.ui4u-sidebar__toggle-glyph');
      if (glyph) {
        glyph.textContent = expanded
          ? this.side === 'right'
            ? '»'
            : '«'
          : this.side === 'right'
            ? '«'
            : '»';
      }
    }

    // Off-canvas means out of the tab order, not merely invisible: an item the
    // user cannot see must not be a Tab stop either.
    const offscreen = narrow && !expanded;

    if (this.#backdrop) this.#backdrop.hidden = !narrow || !expanded;
    if (this.#panel) this.#panel.setAttribute('aria-hidden', String(offscreen));
    this.#records.forEach((record, i) => {
      record.control.tabIndex = !offscreen && i === this.#index ? 0 : -1;
    });

    if (narrow && expanded) this.#activateTrap();
    else this.#releaseTrap();
  }

  #activateTrap() {
    if (this.#trap || !this.#panel || !this.#trapArmed) return;
    // The trap root is the panel, so the initial focus must be inside it.
    this.#trap = focusTrap(this.#panel, {
      initialFocus: this.#records[this.#index]?.control ?? null,
    });
    this.#trap.activate();
  }

  #releaseTrap() {
    if (!this.#trap) return;
    this.#trap.deactivate();
    this.#trap = null;

    // The drawer is dismissed from inside itself, so focus would otherwise be
    // dropped on <body> — hand it back to the button that opened the drawer.
    if (this.#toggle && typeof this.#toggle.focus === 'function') {
      this.#toggle.focus({ preventScroll: true });
    }
  }

  /** Focus entering a collapsed rail expands it rather than trapping the user. */
  #expandOnFocus() {
    if (this.expanded) return;
    this.#setExpanded(true);
  }

  /**
   * @param {Node|null} target
   * @returns {number} index of the record behind `target`, or `-1`
   */
  #indexFrom(target) {
    if (!target) return -1;
    return this.#records.findIndex((record) => record.control === target);
  }

  /**
   * @param {number} index
   * @param {{focus?: boolean, silent?: boolean}} [options]
   */
  #activate(index, { focus = false, silent = false } = {}) {
    if (!this.#records.length) return;

    const next = Math.min(Math.max(index, 0), this.#records.length - 1);
    this.#index = next;

    this.#records.forEach((record, i) => {
      const active = i === next;
      if (active) record.control.setAttribute('aria-current', 'page');
      else record.control.removeAttribute('aria-current');
      record.control.tabIndex = active ? 0 : -1;
      if (active) record.item.setAttribute('active', '');
      else record.item.removeAttribute('active');
    });

    if (focus) this.#records[next].control.focus();

    if (!silent) {
      const record = this.#records[next];
      this.emit('ui4u:navigate', { item: record.item, index: next, href: record.href });
    }
  }

  /** @param {KeyboardEvent} event */
  #onKeydown(event) {
    const index = this.#indexFrom(event.target);
    if (index === -1) return;

    const total = this.#records.length;
    const vertical = this.side === 'left';
    const nextKey = vertical ? 'ArrowDown' : 'ArrowRight';
    const prevKey = vertical ? 'ArrowUp' : 'ArrowLeft';

    /** @type {number|null} */
    let target = null;

    switch (event.key) {
      case nextKey:
        target = (index + 1) % total;
        break;
      case prevKey:
        target = (index - 1 + total) % total;
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = total - 1;
        break;
      case 'Enter':
      case ' ':
        // preventDefault stops Space from scrolling the page and stops Enter
        // from navigating: the consumer decides what activating an item means.
        event.preventDefault();
        this.#activate(index, { focus: true });
        return;
      default:
        return;
    }

    event.preventDefault();
    this.#records[target].control.focus();
  }
}
