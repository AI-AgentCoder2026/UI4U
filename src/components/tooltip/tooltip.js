import { UI4UElement } from '../../core/base.js';
import { el, on, setText, uid } from '../../core/dom.js';
import { normalizePlacement, position } from '../../core/position.js';

/**
 * @typedef {'top' | 'right' | 'bottom' | 'left'} TooltipPlacement
 *
 * @typedef {object} TooltipOptions
 * @property {string} [content] Plain text shown in the surface. Never markup.
 * @property {TooltipPlacement} [placement] Preferred side. Default `'top'`.
 * @property {number} [delay] Milliseconds before a pointer hover opens the
 *   surface. Default `0`. Keyboard focus always opens immediately.
 * @property {boolean} [disabled] Suppresses showing without unmounting.
 * @property {Record<string, (detail: any, event: CustomEvent) => unknown>} [bindings]
 *   Semantic bindings, e.g. `{ show: () => false }`.
 */

/** Elements that are reachable with a keyboard without an explicit tabindex. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), audio[controls], video[controls], [contenteditable]:not([contenteditable="false"]), details > summary';

/**
 * A tooltip. The light DOM children are the trigger; the component creates and
 * positions the surface:
 *
 * ```html
 * <ui-tooltip content="Rebuild the index" placement="top">Rebuild</ui-tooltip>
 * ```
 *
 * When the children are not focusable — bare text, say — the host itself
 * becomes the trigger and is given a `tabindex`, so keyboard users are never
 * left without a way in. The surface is described by the trigger through
 * `aria-describedby` and is `hidden` while closed, which keeps it out of the
 * accessibility tree instead of leaving an empty node for a screen reader to
 * walk into.
 *
 * Listens for `ui4u:show` and `ui4u:hide` — `detail: { placement }`.
 *
 * Binds to `show`, with the same detail: a binding that returns `false` keeps
 * the surface closed, whichever way it was asked for — hover, focus or a direct
 * `show()`. There is deliberately no `hide` binding: the component also hides
 * itself on teardown, when `disabled` is set and when `content` is removed, and
 * a vetoed hide would strand `#visible` at `true` so the surface could never
 * open again. Retracting is not a decision a consumer gets to make.
 */
export class Tooltip extends UI4UElement {
  static get observedAttributes() {
    return ['content', 'placement', 'delay', 'disabled'];
  }

  /** @type {HTMLElement|null} */
  #surface = null;
  /** @type {HTMLElement|null} the element that receives pointer and focus */
  #trigger = null;
  /** aria-describedby the trigger had before we touched it, restored verbatim */
  #describedBy = null;
  /** tabindex we added to the host so it could take focus, restored on teardown */
  #addedTabindex = false;
  /** @type {ReturnType<typeof setTimeout>|null} */
  #timer = null;
  /** The placement actually used after flipping. @type {TooltipPlacement} */
  #placement = 'top';
  #visible = false;
  #built = false;
  /** Guards the property -> attribute reflect loop. @type {boolean} */
  #syncing = false;

  /* ------------------------------------------------------------------ api */

  /** @returns {string} the plain text rendered in the surface */
  get content() {
    return this.getString('content', '');
  }

  /** @returns {TooltipPlacement} the requested side, before any flip */
  get placement() {
    return normalizePlacement(this.getString('placement', ''));
  }

  /** @returns {number} pointer-hover delay in milliseconds */
  get delay() {
    const value = this.getNumber('delay', 0);
    return value > 0 ? value : 0;
  }

  /** @returns {boolean} */
  get disabled() {
    return this.getBoolean('disabled');
  }

  /** @returns {boolean} whether the surface is currently open */
  get visible() {
    return this.#visible;
  }

  /** @returns {HTMLElement|null} the generated surface, exposed for styling and tests */
  get surface() {
    return this.#surface;
  }

  /** @returns {HTMLElement|null} the element the tooltip is anchored to */
  get trigger() {
    return this.#trigger;
  }

  /**
   * Applies options and returns `this`.
   *
   * @param {TooltipOptions} [options]
   * @returns {this}
   *
   * @example
   * tooltip.configure({ content: 'Rebuild the index', placement: 'bottom', delay: 200 });
   */
  configure(options = {}) {
    const { content, placement = 'top', delay = 0, disabled = false, bindings } = options;

    if (content !== undefined) this.setAttribute('content', content);
    this.setAttribute('placement', placement);
    this.reflect('delay', delay);
    this.reflect('disabled', disabled || null);
    this.bindAll(bindings);

    if (disabled) this.hide();

    return this;
  }

  /** Opens the surface. A no-op while `disabled` or without `content`. */
  show() {
    if (!this.#built) this.#build();
    if (!this.#surface || !this.#trigger) return this;
    if (this.disabled || !this.content) return this;
    // Already open — one open, one `ui4u:show`.
    if (this.#visible) return this;

    // Guarded while the surface is still hidden, which is the whole point of
    // this one being bindable: a binding that says no leaves no tooltip behind.
    // The detail carries the REQUESTED placement, because nothing is measured
    // until the surface is shown — `ui4u:show` reports the side it landed on.
    if (!this.runBinding('show', { placement: this.placement })) return this;

    this.#clearTimer();

    this.#surface.hidden = false;
    this.#visible = true;
    this.#place();

    this.emit('ui4u:show', { placement: this.#placement });
    return this;
  }

  /** Closes the surface immediately. Never delayed — see the class notes. */
  hide() {
    this.#clearTimer();
    if (!this.#visible) return this;

    this.#visible = false;
    if (this.#surface) {
      this.#surface.hidden = true;
      this.#surface.removeAttribute('data-placement');
    }

    this.emit('ui4u:hide', { placement: this.placement });
    return this;
  }

  /** @returns {this} */
  toggle() {
    return this.visible ? this.hide() : this.show();
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

    if (name === 'content') {
      this.#sync();
    } else if (name === 'placement') {
      if (this.#visible) this.#place();
    } else if (name === 'disabled') {
      if (this.disabled) this.hide();
    }
  }

  /* --------------------------------------------------------------- build */

  #build() {
    if (this.#built) return;

    /** @type {HTMLElement} */
    const surface = el('span', {
      class: 'ui4u-tooltip__surface',
      role: 'tooltip',
      id: uid('ui4u-tooltip'),
      hidden: true,
    });

    // Resolved before the surface is appended, so it can never pick itself.
    const trigger = this.#resolveTrigger();

    setText(surface, this.content);

    this.#surface = surface;
    this.#trigger = trigger;
    this.#built = true;

    // The trigger is described by the surface, never labelled by it — the
    // tooltip adds context, it must not become the accessible name.
    this.#describedBy = trigger.getAttribute('aria-describedby');
    trigger.setAttribute('aria-describedby', surface.id);

    this.dataset.placement = this.placement;

    /*
     * Portal the surface to <body>.
     *
     * The surface is positioned with `position: fixed`, and any ancestor with a
     * `transform`, `filter` or `backdrop-filter` becomes the containing block
     * for fixed descendants — the tooltip then lands somewhere unrelated to
     * where the maths put it. Translucent panels are common, so mounting in
     * place is not survivable. The trigger keeps its `aria-describedby` link,
     * which works across the DOM.
     */
    const host = this.ownerDocument?.body ?? this.ownerDocument?.documentElement;
    if (host) host.appendChild(surface);
    else this.append(surface);

    this.track(on(this, 'pointerover', (event) => this.#onPointerOver(event)));
    this.track(on(this, 'pointerout', (event) => this.#onPointerOut(event)));
    this.track(on(this, 'focusin', () => this.#onFocusIn()));
    this.track(on(this, 'focusout', (event) => this.#onFocusOut(event)));
    this.track(on(this, 'keydown', (event) => this.#onKeydown(event)));
  }

  #teardown() {
    this.hide();
    this.#clearTimer();

    const trigger = this.#trigger;

    if (trigger) {
      // Restore whatever the author had, rather than blanket-removing.
      if (this.#describedBy === null) trigger.removeAttribute('aria-describedby');
      else trigger.setAttribute('aria-describedby', this.#describedBy);

      if (this.#addedTabindex && trigger === this) this.removeAttribute('tabindex');
    }
    this.#describedBy = null;
    this.#addedTabindex = false;

    this.#surface?.remove();

    this.#surface = null;
    this.#trigger = null;
    this.#visible = false;
    this.#built = false;
  }

  /* ----------------------------------------------------------- internals */

  /**
   * Picks the element the tooltip is anchored to: the first focusable child,
   * otherwise the host itself — which is then made focusable so a text-only
   * trigger is still reachable with a keyboard.
   *
   * @returns {HTMLElement}
   */
  #resolveTrigger() {
    const focusable = /** @type {HTMLElement|null} */ (this.querySelector(FOCUSABLE) ?? null);
    if (focusable) return focusable;

    if (!this.hasAttribute('tabindex')) {
      this.setAttribute('tabindex', '0');
      this.#addedTabindex = true;
    }
    return this;
  }

  /** Keeps the surface text in sync and drops an open surface when content goes. */
  #sync() {
    if (!this.#surface) return;
    setText(this.#surface, this.content);
    if (!this.content) this.hide();
  }

  /** Measures and positions the surface. Only meaningful once it is unhidden. */
  #place() {
    if (!this.#surface || !this.#trigger) return;

    this.#placement = position(this.#trigger, this.#surface, {
      placement: this.placement,
      gap: 8,
    });
    this.#surface.dataset.placement = this.#placement;
  }

  /** @param {number} [after] milliseconds to wait before opening */
  #schedule(after = this.delay) {
    this.#clearTimer();
    if (this.disabled || !this.content) return;

    // Zero delay still goes through a timer so a rapid pointer sweep across
    // several triggers settles on the last one instead of stacking surfaces.
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.show();
    }, after);
  }

  #clearTimer() {
    if (this.#timer === null) return;
    clearTimeout(this.#timer);
    this.#timer = null;
  }

  /** @param {PointerEvent} event */
  #onPointerOver(event) {
    const from = /** @type {Node|null} */ (event.relatedTarget);
    // Moving between children of the same trigger is not a new hover.
    if (from && this.contains(from)) return;
    this.#schedule();
  }

  /** @param {PointerEvent} event */
  #onPointerOut(event) {
    const to = /** @type {Node|null} */ (event.relatedTarget);
    if (to && this.contains(to)) return;
    this.hide();
  }

  #onFocusIn() {
    this.#clearTimer();
    // Keyboard users get the surface at once; a delay here reads as "broken".
    this.show();
  }

  /** @param {FocusEvent} event */
  #onFocusOut(event) {
    const to = /** @type {Node|null} */ (event.relatedTarget);
    if (to && (this.contains(to) || to === this.#surface || this.#surface?.contains(to))) return;
    this.hide();
  }

  /** @param {KeyboardEvent} event */
  #onKeydown(event) {
    if (event.key !== 'Escape' || !this.#visible) return;
    this.hide();
  }
}
