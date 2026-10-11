import { UI4UElement } from '../../core/base.js';
import { el, on, uid } from '../../core/dom.js';

/**
 * @typedef {'horizontal' | 'vertical'} TabsOrientation
 * @typedef {'automatic' | 'manual'} TabsActivation
 * @typedef {'glass' | 'solid' | 'underline'} TabsVariant
 *
 * @typedef {object} TabsOptions
 * @property {number} [active] Zero-based index of the initially active panel.
 * @property {TabsOrientation} [orientation] Keyboard axis. Default `'horizontal'`.
 * @property {TabsActivation} [activation] `'automatic'` activates on arrow-key
 *   navigation; `'manual'` requires Enter/Space. Default `'automatic'`.
 * @property {TabsVariant} [variant] Visual treatment. Default `'glass'`.
 * @property {string} [label] Accessible name for the tab list.
 */

/**
 * A single tab panel. Authored as light DOM by the consumer:
 *
 * ```html
 * <ui-tab label="Overview">Panel content</ui-tab>
 * ```
 *
 * `ui-tabs` owns all panel wiring — roles, `aria-*`, `hidden` and tab order —
 * so you never set them by hand.
 */
export class Tab extends UI4UElement {}

/**
 * Tabbed panels with a keyboard-navigable tab list and full ARIA wiring.
 *
 * ```html
 * <ui-tabs label="Project sections" variant="glass">
 *   <ui-tab label="Overview">…</ui-tab>
 *   <ui-tab label="Activity">…</ui-tab>
 *   <ui-tab label="Settings">…</ui-tab>
 * </ui-tabs>
 * ```
 *
 * Listens for `ui4u:change` — `detail: { index, label, tab }`.
 */
export class Tabs extends UI4UElement {
  static get observedAttributes() {
    return ['active', 'orientation', 'activation', 'variant', 'label'];
  }

  /** @type {HTMLElement|null} */
  #list = null;
  /** @type {HTMLButtonElement[]} */
  #buttons = [];
  /** @type {Tab[]} */
  #panels = [];
  #index = 0;
  #built = false;
  /** Guards the property -> attribute reflect loop. @type {boolean} */
  #syncing = false;

  /* ------------------------------------------------------------------ api */

  /** @returns {Tab[]} the panel elements, in document order */
  get tabs() {
    return /** @type {Tab[]} */ (
      [...this.children].filter((child) => child.localName === 'ui-tab')
    );
  }

  /** @returns {number} index of the active panel */
  get active() {
    return this.#index;
  }

  set active(next) {
    this.#go(Number(next) || 0);
  }

  /** @returns {Tab|null} */
  get activeTab() {
    return this.#panels[this.#index] ?? null;
  }

  /** @returns {TabsOrientation} */
  get orientation() {
    return this.getString('orientation', 'horizontal') === 'vertical' ? 'vertical' : 'horizontal';
  }

  /** @returns {TabsActivation} */
  get activation() {
    return this.getString('activation', 'automatic') === 'manual' ? 'manual' : 'automatic';
  }

  /** @returns {TabsVariant} */
  get variant() {
    const value = this.getString('variant', 'glass');
    return value === 'solid' || value === 'underline' ? value : 'glass';
  }

  /**
   * Applies options and returns `this`.
   *
   * @param {TabsOptions} [options]
   * @returns {this}
   *
   * @example
   * tabs.configure({ variant: 'underline', activation: 'manual', active: 2 });
   */
  configure(options = {}) {
    const {
      active,
      orientation = 'horizontal',
      activation = 'automatic',
      variant = 'glass',
      label,
    } = options;

    this.setAttribute('orientation', orientation);
    this.setAttribute('activation', activation);
    this.setAttribute('variant', variant);
    if (label !== undefined) this.setAttribute('label', label);
    if (active !== undefined) this.active = active;

    return this;
  }

  /** @returns {this} */
  next() {
    return this.#step(1);
  }

  /** @returns {this} */
  previous() {
    return this.#step(-1);
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

    if (name === 'active') {
      this.#go(this.getNumber('active', 0));
    } else if (name === 'label') {
      this.#applyLabel();
    } else if (name === 'variant') {
      this.dataset.variant = this.variant;
    } else if (name === 'orientation') {
      this.dataset.orientation = this.orientation;
      this.#list?.setAttribute('aria-orientation', this.orientation);
    }
  }

  /* --------------------------------------------------------------- build */

  /** Syncs the `label` attribute onto the tab list's accessible name. */
  #applyLabel() {
    const label = this.getString('label', '');
    if (!this.#list) return;
    if (label) this.#list.setAttribute('aria-label', label);
    else this.#list.removeAttribute('aria-label');
  }

  #build() {
    if (this.#built) return;

    const panels = this.tabs;
    if (panels.length === 0) return;

    const baseId = uid('ui4u-tabs');

    /** @type {HTMLElement} */
    const list = el('div', { class: 'ui4u-tabs__list', role: 'tablist' });
    list.setAttribute('aria-orientation', this.orientation);

    /** @type {HTMLButtonElement[]} */
    const buttons = [];
    /** @type {Tab[]} */
    const wired = [];

    panels.forEach((panel, index) => {
      if (!panel.id) panel.id = `${baseId}-panel-${index}`;
      const tabId = `${baseId}-tab-${index}`;

      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabId);
      panel.setAttribute('tabindex', '-1');

      /** @type {HTMLButtonElement} */
      const button = el(
        'button',
        {
          type: 'button',
          class: 'ui4u-tabs__tab',
          role: 'tab',
          id: tabId,
          'aria-controls': panel.id,
          'aria-selected': 'false',
          tabindex: '-1',
        },
        panel.getString('label', `Tab ${index + 1}`)
      );

      button.addEventListener('click', () => this.#go(index, { focus: true }));

      buttons.push(button);
      wired.push(panel);
      list.appendChild(button);
    });

    this.#list = list;
    this.#buttons = buttons;
    this.#panels = wired;
    this.#built = true;

    this.dataset.variant = this.variant;
    this.dataset.orientation = this.orientation;

    this.#applyLabel();
    this.prepend(list);
    this.track(on(list, 'keydown', (event) => this.#onKeydown(event)));

    this.#go(this.getNumber('active', 0));
  }

  #teardown() {
    if (this.#list?.parentNode === this) this.#list.remove();
    for (const panel of this.#panels) {
      panel.removeAttribute('role');
      panel.removeAttribute('aria-labelledby');
      panel.removeAttribute('hidden');
    }
    this.#list = null;
    this.#buttons = [];
    this.#panels = [];
    this.#built = false;
  }

  /* ----------------------------------------------------------- behaviour */

  /**
   * @param {number} index
   * @param {{focus?: boolean}} [options]
   */
  #go(index, { focus = false } = {}) {
    if (!this.#built || this.#panels.length === 0) return;

    const total = this.#panels.length;
    const next = Math.min(Math.max(index, 0), total - 1);
    const changed = next !== this.#index;
    this.#index = next;

    this.#buttons.forEach((button, i) => {
      const selected = i === next;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      this.#panels[i].hidden = !selected;
      this.#panels[i].tabIndex = selected ? 0 : -1;
    });

    if (this.hasAttribute('active') && this.getAttribute('active') !== String(next)) {
      this.#syncing = true;
      this.setAttribute('active', String(next));
      this.#syncing = false;
    }
    if (focus) this.#buttons[next]?.focus();

    if (changed) {
      this.emit('ui4u:change', {
        index: next,
        label: this.#panels[next]?.getAttribute('label') ?? '',
        tab: this.#panels[next] ?? null,
      });
    }
  }

  /** @param {number} delta @returns {this} */
  #step(delta) {
    const total = this.#panels.length;
    if (total === 0) return this;
    return this.#go((this.#index + delta + total) % total, { focus: true });
  }

  /** @param {KeyboardEvent} event */
  #onKeydown(event) {
    const current = this.#buttons.findIndex((button) => button === event.target);
    if (current === -1) return;

    const vertical = this.orientation === 'vertical';
    const nextKey = vertical ? 'ArrowDown' : 'ArrowRight';
    const prevKey = vertical ? 'ArrowUp' : 'ArrowLeft';
    const manual = this.activation === 'manual';

    /** @type {number|null} */
    let target = null;

    switch (event.key) {
      case nextKey:
        target = (current + 1) % this.#buttons.length;
        break;
      case prevKey:
        target = (current - 1 + this.#buttons.length) % this.#buttons.length;
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = this.#buttons.length - 1;
        break;
      case 'Enter':
      case ' ':
        if (manual) target = current;
        break;
      default:
        return;
    }

    event.preventDefault();

    if (manual && event.key !== 'Enter' && event.key !== ' ') {
      // Move focus only; the panel stays put until Enter/Space.
      this.#buttons[target].focus();
      return;
    }

    this.#go(target, { focus: true });
  }
}
