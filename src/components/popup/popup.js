import { UI4UElement } from '../../core/base.js';
import { el, on, uid } from '../../core/dom.js';
import { focusTrap } from '../../core/focus-trap.js';

/**
 * @typedef {'modal' | 'popover' | 'drawer'} PopupMode
 *
 * @typedef {object} PopupOptions
 * @property {PopupMode} [mode] `'modal'` traps focus; `'popover'` and
 *   `'drawer'` do not. Default `'modal'`.
 * @property {boolean} [open] Whether it starts open.
 * @property {boolean} [dismissible] Close on Escape and backdrop click. Default `true`.
 * @property {'left' | 'right'} [side] Edge for `drawer` mode. Default `'right'`.
 * @property {string} [label] Accessible name.
 */

/**
 * An overlay dialog: a modal with a focus trap, a non-trapping popover, or an
 * edge drawer.
 *
 * ```html
 * <ui-popup label="Confirm" mode="modal">
 *   <p>Delete this project?</p>
 *   <ui-button variant="danger">Delete</ui-button>
 * </ui-popup>
 * ```
 *
 * The surface is portalled to `<body>`: `position: fixed` resolves against the
 * nearest ancestor with `transform`, `filter` or `backdrop-filter`, so a popup
 * inside a translucent panel would otherwise land in the wrong place — the same
 * trap the tooltip hit.
 *
 * Listens for `ui4u:open`, `ui4u:close` and `ui4u:cancel`.
 */
export class Popup extends UI4UElement {
  static get observedAttributes() {
    return ['open', 'mode', 'side', 'dismissible', 'label'];
  }

  /** @type {import('../../core/focus-trap.js').FocusTrap|null} */
  #trap = null;
  /** @type {HTMLElement|null} */
  #surface = null;
  /** @type {HTMLElement|null} */
  #backdrop = null;
  /** @type {HTMLElement|null} */
  #closeButton = null;
  #built = false;
  /** Guards the attribute reflect loop. @type {boolean} */
  #syncing = false;

  /* ------------------------------------------------------------------ api */

  /** @returns {boolean} */
  get isOpen() {
    return this.hasAttribute('open');
  }

  set isOpen(next) {
    this[next ? 'openPopup' : 'closePopup']();
  }

  /** @returns {PopupMode} */
  get mode() {
    const value = this.getString('mode', 'modal');
    return value === 'popover' || value === 'drawer' ? value : 'modal';
  }

  /** @returns {'left' | 'right'} */
  get side() {
    return this.getString('side', 'right') === 'left' ? 'left' : 'right';
  }

  /** @returns {boolean} */
  get dismissible() {
    return this.getBoolean('dismissible', true);
  }

  /** @returns {string} */
  get label() {
    return this.getString('label', '');
  }

  /** The portalled dialog surface, or `null` before the first build. @returns {HTMLElement|null} */
  get surface() {
    return this.#surface;
  }

  /**
   * Applies options and returns `this`.
   *
   * @param {PopupOptions} [options]
   * @returns {this}
   *
   * @example
   * popup.configure({ mode: 'drawer', side: 'left', open: true });
   */
  configure(options = {}) {
    const { mode, open, dismissible, side, label } = options;

    if (mode !== undefined) this.setAttribute('mode', mode);
    if (dismissible !== undefined) this.setAttribute('dismissible', String(dismissible));
    if (side !== undefined) this.setAttribute('side', side);
    if (label !== undefined) this.setAttribute('label', label);
    if (open !== undefined) this.isOpen = open;

    return this;
  }

  /** @returns {this} */
  openPopup() {
    if (!this.#built) this.#build();
    if (this.isOpen) return this;

    this.#syncing = true;
    this.setAttribute('open', '');
    this.#syncing = false;

    this.#applyState();
    this.#activateTrap();
    this.emit('ui4u:open', { mode: this.mode });
    return this;
  }

  /** @returns {this} */
  closePopup() {
    if (!this.isOpen) return this;

    this.#syncing = true;
    this.removeAttribute('open');
    this.#syncing = false;

    this.#releaseTrap();
    this.#applyState();
    this.emit('ui4u:close', { mode: this.mode });
    return this;
  }

  /** @returns {this} */
  toggle() {
    return this.isOpen ? this.closePopup() : this.openPopup();
  }

  /* ------------------------------------------------------------ lifecycle */

  onConnect() {
    this.#build();
  }

  onDisconnect() {
    this.#releaseTrap();

    // Put the author's markup back before the portalled surface goes away,
    // otherwise a disconnect permanently swallows the popup's content.
    const stash = this.#surface ? [...this.#surface.children] : [];
    const close = this.#closeButton;
    for (const child of stash) {
      if (child === close) continue;
      this.appendChild(child);
    }

    this.#surface?.remove();
    this.#backdrop?.remove();
    this.#surface = null;
    this.#backdrop = null;
    this.#closeButton = null;
    this.#built = false;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.#built || this.#syncing) return;

    if (name === 'open') {
      if (this.isOpen) {
        this.#applyState();
        this.#activateTrap();
        this.emit('ui4u:open', { mode: this.mode });
      } else {
        this.#releaseTrap();
        this.#applyState();
        this.emit('ui4u:close', { mode: this.mode });
      }
      return;
    }

    if (name === 'mode' || name === 'side') {
      this.dataset.mode = this.mode;
      this.dataset.side = this.side;
    }
    if (name === 'label') this.#applyLabel();
  }

  /* --------------------------------------------------------------- build */

  #build() {
    if (this.#built) return;

    const baseId = uid('ui4u-popup');
    /** @type {HTMLElement[]} */
    const stash = [...this.children];

    /** @type {HTMLElement} */
    const surface = el('div', {
      class: 'ui4u-popup__surface',
      id: `${baseId}-surface`,
      role: 'dialog',
      tabindex: '-1',
    });
    for (const child of stash) surface.appendChild(child);

    /** @type {HTMLElement} */
    const close = el(
      'button',
      {
        type: 'button',
        class: 'ui4u-popup__close',
        'aria-label': 'Close dialog',
      },
      '×'
    );
    close.addEventListener('click', () => this.#dismiss());
    surface.appendChild(close);

    /** @type {HTMLElement} */
    const backdrop = el('div', { class: 'ui4u-popup__backdrop' });
    backdrop.addEventListener('click', () => this.#dismiss());

    this.#surface = surface;
    this.#backdrop = backdrop;
    this.#closeButton = close;
    this.#built = true;

    this.dataset.mode = this.mode;
    this.dataset.side = this.side;
    this.#applyLabel();

    // Portalled: see the class docs for why this cannot live in place.
    const host = this.ownerDocument?.body ?? this.ownerDocument?.documentElement;
    if (host) host.append(backdrop, surface);

    // Escape is a document-level intent while the popup is open: in `popover`
    // and `drawer` modes focus is not trapped, so the key can arrive from
    // outside the portalled surface entirely.
    const doc = this.ownerDocument;
    if (doc) this.track(on(doc, 'keydown', (event) => this.#onKeydown(event)));

    this.#applyState();
  }

  /* ----------------------------------------------------------- behaviour */

  #applyState() {
    const open = this.isOpen;
    const modal = this.mode === 'modal';

    /*
     * The surface and backdrop are portalled to <body>, so they are NOT
     * descendants of this host — a `ui-popup[data-mode] .ui4u-popup__surface`
     * selector would never match. The styling state therefore travels on the
     * portalled nodes themselves.
     */
    for (const node of [this.#surface, this.#backdrop]) {
      if (!node) continue;
      node.dataset.mode = this.mode;
      node.dataset.side = this.side;
      node.dataset.open = String(open);
    }
    this.dataset.mode = this.mode;
    this.dataset.side = this.side;
    this.dataset.open = String(open);

    if (this.#surface) {
      this.#surface.hidden = !open;
      this.#surface.setAttribute('aria-modal', String(modal));
    }
    if (this.#backdrop) this.#backdrop.hidden = !open || this.mode === 'popover';
    if (this.#closeButton) this.#closeButton.hidden = !this.dismissible;
  }

  #applyLabel() {
    if (!this.#surface) return;
    const label = this.label;
    if (label) this.#surface.setAttribute('aria-label', label);
    else this.#surface.removeAttribute('aria-label');
  }

  #activateTrap() {
    // Only a modal constrains focus. A popover or drawer must let the user
    // carry on with the page behind it.
    if (this.mode !== 'modal' || !this.isOpen || !this.#surface) return;
    if (this.#trap) return;

    this.#trap = focusTrap(this.#surface);
    this.#trap.activate();
  }

  #releaseTrap() {
    if (!this.#trap) return;
    this.#trap.deactivate();
    this.#trap = null;
  }

  #dismiss() {
    if (!this.dismissible) return;
    this.emit('ui4u:cancel', { mode: this.mode });
    this.closePopup();
  }

  /** @param {KeyboardEvent} event */
  #onKeydown(event) {
    if (!this.isOpen) return;
    if (event.key === 'Escape' && this.dismissible) {
      event.preventDefault();
      this.#dismiss();
    }
  }
}
