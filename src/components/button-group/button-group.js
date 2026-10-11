import { UI4UElement } from '../../core/base.js';
import { el, on, setText, uid } from '../../core/dom.js';

/**
 * @typedef {object} ButtonGroupOptions
 * @property {string} [label] Label text — the group's accessible name.
 * @property {string} [name] Submitted name; reported on `ui4u:change`.
 * @property {string} [value] The selected button's value.
 * @property {string} [hint] Helper text, announced through `aria-describedby`.
 * @property {string} [error] Validation message; drives `aria-invalid`.
 * @property {boolean} [disabled] Disables every button at once.
 * @property {boolean} [required] An unanswered group is invalid.
 * @property {boolean} [srOnly] Hides the label visually, keeping it for AT.
 * @property {Record<string, (detail: any, event: CustomEvent) => unknown>} [bindings]
 *   Semantic event bindings, registered through `bindAll()`. A handler that
 *   returns `false` (or calls `event.preventDefault()`) vetoes the selection.
 *
 * @typedef {object} ButtonGroupChangeDetail
 * @property {string} value the value being selected
 * @property {string} name
 * @property {string} previous the value before this interaction
 * @property {HTMLElement|null} button the `ui-button` being selected, `null` when clearing
 *
 * @typedef {object} ButtonGroupValidityResult
 * @property {boolean} valid
 * @property {string} message empty when `valid`
 * @property {string} value the selected value, `''` when nothing is selected
 * @property {string} name
 */

/** Used when a required group has no selection and the author set no `error`. */
const GROUP_FALLBACK_MESSAGE = 'Please choose one of these options.';

/** The authored child. A segmented control is made of real `ui-button`s. */
const ITEM = 'ui-button';

/**
 * A segmented control: several real `ui-button`s that together represent ONE
 * choice.
 *
 * ```html
 * <ui-button-group label="View" name="view" value="grid">
 *   <ui-button value="grid">Grid</ui-button>
 *   <ui-button value="table">Table</ui-button>
 * </ui-button-group>
 * ```
 *
 * The buttons stay real buttons — this group never replaces them. What it owns
 * is everything *around* them: the selection, the single tab stop, the
 * arrow-key model and the accessible name. That is exactly "several buttons
 * acting as one choice", which is what a segmented control is, so the group is
 * `role="radiogroup"` and each button is `role="radio"` with `aria-checked`.
 *
 * Listens for `ui4u:change` — `detail: { value, name }`.
 *
 * @example
 * group.configure({ label: 'View', value: 'table', required: true });
 * group.select('grid');
 * group.reportValidity();
 */
export class ButtonGroup extends UI4UElement {
  static get observedAttributes() {
    return ['label', 'name', 'value', 'hint', 'error', 'disabled', 'required', 'sr-only'];
  }

  /** @type {HTMLElement|null} the visible label, and the group's accessible name */
  #label = null;
  /** @type {HTMLElement|null} the joined row of buttons */
  #options = null;
  /** @type {HTMLElement|null} */
  #hint = null;
  /** @type {HTMLElement|null} */
  #error = null;
  /**
   * The author's own child nodes, captured before the chrome is built so
   * teardown can put them back exactly where they were.
   * @type {Node[]}
   */
  #authored = [];
  /**
   * True while `error` holds a message this component produced during
   * `reportValidity()`, as opposed to one the author set.
   * @type {boolean}
   */
  #selfReported = false;
  /** Guards the property -> attribute reflect loop. @type {boolean} */
  #syncing = false;
  #built = false;

  /* ------------------------------------------------------------------ api */

  /**
   * The child buttons, in document order. They are `ui-button` elements — the
   * group's role lives on the native control inside each one, which is also
   * what takes focus.
   *
   * @returns {HTMLElement[]}
   */
  get buttons() {
    const options = this.#options;
    if (!options) return [];
    return [...options.children].filter((node) => node.localName === ITEM);
  }

  /** @returns {string} the label text — the group's accessible name */
  get label() {
    return this.getString('label', '');
  }

  set label(next) {
    this.#setTextAttribute('label', next);
  }

  /** @returns {string} */
  get name() {
    return this.getString('name', '');
  }

  set name(next) {
    this.#setTextAttribute('name', next);
  }

  /** @returns {string} */
  get hint() {
    return this.getString('hint', '');
  }

  set hint(next) {
    this.#setTextAttribute('hint', next);
  }

  /** @returns {string} */
  get error() {
    return this.getString('error', '');
  }

  set error(next) {
    this.#selfReported = false;
    this.#setTextAttribute('error', next);
  }

  /** @returns {boolean} */
  get disabled() {
    return this.getBoolean('disabled', false);
  }

  set disabled(next) {
    this.#setBooleanAttribute('disabled', next);
  }

  /** @returns {boolean} */
  get required() {
    return this.getBoolean('required', false);
  }

  set required(next) {
    this.#setBooleanAttribute('required', next);
  }

  /** Hides the label visually while keeping it in the accessibility tree. */
  get srOnly() {
    return this.getBoolean('sr-only', false);
  }

  set srOnly(next) {
    this.#setBooleanAttribute('sr-only', next);
  }

  /**
   * The selected button's value, or `''` when nothing is selected.
   *
   * Assigning it selects the matching button silently — it is the declarative
   * path, so it does not emit `ui4u:change`. Use `select()` to change the
   * selection and be told about it. Assigning `''` clears the selection.
   *
   * @returns {string}
   */
  get value() {
    const checked = this.buttons.find((button) => this.#isChecked(button));
    return checked === undefined ? '' : this.#valueOf(checked);
  }

  set value(next) {
    const wanted = next === null || next === undefined ? '' : String(next);
    this.#select(wanted, { announce: false });
    // A cleared selection is a cleared attribute, not `value=""`.
    if (wanted === '') this.removeAttribute('value');
  }

  /**
   * Applies options and returns `this`.
   *
   * Every option is optional and pass-through: an option left out keeps the
   * value it already has, so a picker can change one without resetting the
   * rest.
   *
   * @param {ButtonGroupOptions} [options]
   * @returns {this}
   *
   * @example
   * group.configure({ label: 'View', value: 'table', required: true });
   */
  configure(options = {}) {
    const { label, name, value, hint, error, disabled, required, srOnly, bindings } = options;

    if (label !== undefined) this.label = label;
    if (name !== undefined) this.name = name;
    if (value !== undefined) this.value = value;
    if (hint !== undefined) this.hint = hint;
    if (error !== undefined) this.error = error;
    if (disabled !== undefined) this.disabled = disabled;
    if (required !== undefined) this.required = required;
    if (srOnly !== undefined) this.srOnly = srOnly;
    this.bindAll(bindings);

    return this;
  }

  /**
   * Selects the button carrying `value` and reports it once.
   *
   * Unlike the `value` setter this is the *imperative* path, so a real
   * selection emits `ui4u:change`. An unknown or disabled value is ignored,
   * and re-selecting the current button keeps it selected rather than
   * toggling it off. A binding that vetoes leaves the group untouched.
   *
   * Focus is not stolen: a programmatic selection should not yank the caret
   * out of whatever the user was typing in.
   *
   * @param {string} value
   * @returns {this}
   *
   * @example
   * group.select('table');
   * group.addEventListener('ui4u:change', ({ detail }) => console.log(detail.value));
   */
  select(value) {
    this.#select(value, { announce: true });
    return this;
  }

  /**
   * Moves focus to the group's single tab stop: the selected button, or the
   * first enabled one when nothing is selected.
   *
   * @param {FocusOptions} [options]
   * @returns {this}
   *
   * @example
   * group.focus();
   */
  focus(options) {
    this.#controlOf(this.#stop())?.focus(options);
    return this;
  }

  /**
   * Re-collects the buttons and re-applies everything the group derives from
   * them: the group `disabled`, the `role`/`aria-checked` pair and the roving
   * tab stop. Call it after adding or removing buttons by hand.
   *
   * @returns {this}
   *
   * @example
   * group.append(createButton('map'));
   * group.refresh();
   */
  refresh() {
    if (!this.#built) return this;

    const options = this.#options;
    if (options) {
      // Anything appended straight to the host joins the row rather than
      // landing outside it.
      const strays = [...this.childNodes].filter((node) => node.localName === ITEM);
      if (strays.length > 0) options.append(...strays);
    }

    // The group owns its children, so it upgrades them itself. An element's own
    // `connectedCallback` runs BEFORE its children's, so at build time the
    // buttons are registered but not yet upgraded — and the native control this
    // group has to put a role and a tab index on does not exist yet.
    if (typeof customElements !== 'undefined' && typeof customElements.upgrade === 'function') {
      for (const button of this.buttons) customElements.upgrade(button);
    }

    this.#syncButtons();
    return this;
  }

  /**
   * Drops the `error` state, without validating.
   *
   * @returns {this}
   *
   * @example
   * group.addEventListener('ui4u:change', () => group.clearValidity());
   */
  clearValidity() {
    this.#selfReported = false;
    if (this.hasAttribute('error')) this.removeAttribute('error');
    return this;
  }

  /**
   * A group is valid when something is selected, when it is not required, or
   * when the author set an `error`.
   *
   * The rule is evaluated here rather than delegated to the buttons: they are
   * real buttons, not native radios, so there is no platform `valueMissing` to
   * ask. The result shape is the one every UI4U field returns, and the one
   * `ui-form` reads.
   *
   * @returns {ButtonGroupValidityResult}
   *
   * @example
   * const { valid, message } = group.checkValidity();
   */
  checkValidity() {
    const value = this.value;
    const name = this.name;
    const error = this.error;

    // An author-supplied error is a deliberate override and always wins. An
    // error this component set itself during `reportValidity()` must not,
    // otherwise answering the question would leave the group invalid forever.
    if (error && !this.#selfReported) return { valid: false, message: error, value, name };

    if (this.required && value === '') {
      return { valid: false, message: GROUP_FALLBACK_MESSAGE, value, name };
    }

    return { valid: true, message: '', value, name };
  }

  /**
   * Surfaces an invalid state — sets `error` from the validation message so the
   * group shows and announces it — and moves focus to the group's tab stop so
   * the user lands on the control they have to answer.
   *
   * @returns {this}
   *
   * @example
   * group.reportValidity();
   */
  reportValidity() {
    const result = this.checkValidity();

    if (result.valid) {
      this.clearValidity();
    } else if (!this.error) {
      this.error = result.message;
      this.#selfReported = true;
    }

    if (!result.valid) this.focus();
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
    if (oldValue === newValue || !this.#built || this.#syncing) return;

    if (name === 'value') this.#applyValue();
    else this.#sync();
  }

  /* --------------------------------------------------------------- build */

  #build() {
    if (this.#built) return;

    const baseId = uid('ui-button-group');

    /**
     * A plain `<span>`, not a `<label>`: this group has no single form control
     * to point `for` at, and a label wrapping the buttons would swallow their
     * clicks. It is associated through `aria-labelledby` instead.
     * @type {HTMLElement}
     */
    const label = el('span', { class: 'ui4u-button-group__label', id: `${baseId}-label` });
    /**
     * `role="presentation"` keeps the wrapper out of the accessibility tree, so
     * the host's `role="radiogroup"` owns the radios directly.
     * @type {HTMLElement}
     */
    const options = el('div', {
      class: 'ui4u-button-group__options',
      role: 'presentation',
    });
    /** @type {HTMLElement} */
    const hint = el('p', { class: 'ui4u-button-group__hint', id: `${baseId}-hint` });
    /** @type {HTMLElement} */
    const error = el('p', { class: 'ui4u-button-group__error', id: `${baseId}-error` });

    this.#authored = [...this.childNodes];
    this.#label = label;
    this.#options = options;
    this.#hint = hint;
    this.#error = error;
    this.#built = true;

    // Several buttons acting as one choice — named explicitly, so assistive
    // technology announces a single control rather than a loose row of buttons.
    this.setAttribute('role', 'radiogroup');

    options.append(...this.#authored.filter((node) => node.localName === ITEM));
    this.prepend(label, options, hint, error);

    this.track(on(options, 'click', (event) => this.#onClick(event)));
    this.track(on(options, 'keydown', (event) => this.#onKeydown(event)));

    this.#sync();
    this.#applyValue();
  }

  #teardown() {
    // The group only ever disabled the CONTROLS, never the buttons' own
    // `disabled` attributes, so that is all there is to undo.
    for (const button of this.buttons) {
      const control = this.#controlOf(button);
      if (!control) continue;
      control.disabled = button.hasAttribute('disabled');
      control.removeAttribute('aria-disabled');
    }

    for (const name of [
      'role',
      'aria-labelledby',
      'aria-describedby',
      'aria-invalid',
      'aria-required',
      'aria-disabled',
    ]) {
      this.removeAttribute(name);
    }

    this.#options?.remove();

    // Put the author's children back in their original order. Everything the
    // component created — label, row, hint, error — went away with the row.
    this.replaceChildren(...this.#authored);

    this.#label = null;
    this.#options = null;
    this.#hint = null;
    this.#error = null;
    this.#authored = [];
    this.#selfReported = false;
    this.#built = false;
  }

  /* ----------------------------------------------------------- behaviour */

  /** Mirrors the group's own options onto the label, hint, error and ARIA. */
  #sync() {
    const label = this.#label;
    const hint = this.#hint;
    const error = this.#error;
    if (!label || !hint || !error) return;

    const labelText = this.label;
    setText(label, labelText);
    // Never `hidden`: a hidden label leaves the group with no accessible name.
    // `sr-only` clips it instead.
    label.classList.toggle('ui4u-sr-only', this.srOnly);

    setText(hint, this.hint);
    hint.hidden = this.hint === '';

    // `setText`, never innerHTML — both may carry user data.
    const errorText = this.error;
    setText(error, errorText);
    error.hidden = errorText === '';

    // The name is the label's, and it survives `sr-only`.
    if (labelText) this.setAttribute('aria-labelledby', label.id);
    else this.removeAttribute('aria-labelledby');

    const describedBy = [hint.hidden ? null : hint.id, error.hidden ? null : error.id]
      .filter(Boolean)
      .join(' ');
    if (describedBy) this.setAttribute('aria-describedby', describedBy);
    else this.removeAttribute('aria-describedby');

    if (errorText) this.setAttribute('aria-invalid', 'true');
    else this.removeAttribute('aria-invalid');

    if (this.required) this.setAttribute('aria-required', 'true');
    else this.removeAttribute('aria-required');

    if (this.disabled) this.setAttribute('aria-disabled', 'true');
    else this.removeAttribute('aria-disabled');

    // Every button derives `disabled` from the group, so a refresh is what
    // pushes this change into them.
    this.refresh();
  }

  /**
   * Applies the `value` attribute silently. This is the authored state, not a
   * user selection, so it must not emit `ui4u:change`.
   */
  #applyValue() {
    const wanted = this.getString('value', '');
    this.#select(wanted, { announce: false });
  }

  /**
   * Puts the group's own semantics on each button's native control: the
   * `radio` role, its `aria-checked`, the roving tab index, and the group-wide
   * `disabled`.
   */
  #syncButtons() {
    const stop = this.#stop();

    for (const button of this.buttons) {
      const control = this.#controlOf(button);
      // An un-upgraded button has no control yet; `refresh()` upgrades it.
      if (!control) continue;

      const disabled = this.#isDisabled(button);

      control.setAttribute('role', 'radio');
      control.setAttribute('aria-checked', String(this.#isChecked(button)));
      // One tab stop for the whole group — otherwise a keyboard user would pay
      // one Tab press per segment to get past a single control.
      control.tabIndex = button === stop ? 0 : -1;

      // The group's `disabled` lands on the CONTROL, never on the button's own
      // `disabled` attribute: that way re-enabling the group cannot clear a
      // flag the author set on one button, and a button's own flag is never
      // confused with the group's.
      if (control.localName === 'button') control.disabled = disabled;
      else if (disabled) control.setAttribute('aria-disabled', 'true');
      else control.removeAttribute('aria-disabled');
    }
  }

  /**
   * Roving tab stop: exactly one button is in the tab order — the selected one,
   * or the first enabled one when nothing is selected. A selected-but-now-
   * disabled button gives its tab stop back to the first enabled button.
   *
   * @returns {HTMLElement|null}
   */
  #stop() {
    const enabled = this.buttons.filter((button) => !this.#isDisabled(button));
    return enabled.find((button) => this.#isChecked(button)) ?? enabled[0] ?? null;
  }

  /**
   * The one place a selection changes. Every other path goes through here, so
   * a binding, a click and an arrow key all behave identically.
   *
   * @param {string} value
   * @param {{ announce?: boolean, focus?: boolean }} [options]
   * @returns {boolean} whether the group now holds this selection
   */
  #select(value, { announce = true, focus = false } = {}) {
    const wanted = value === null || value === undefined ? '' : String(value);
    // `''` is the one value no button carries: it clears the selection.
    const target = wanted === '' ? null : this.#buttonFor(wanted);

    // A value the group does not have, or a disabled button, is not a
    // selection: a group must never report a choice it cannot make.
    if (wanted !== '' && (!target || this.#isDisabled(target))) return false;

    const previous = this.value;
    const detail = /** @type {ButtonGroupChangeDetail} */ ({
      value: wanted,
      name: this.name,
      previous,
      button: /** @type {HTMLElement} */ (target),
    });

    // The binding runs BEFORE anything mutates, so a veto leaves the group
    // exactly as it was — never half-changed.
    if (!this.runBinding('change', detail)) return false;

    if (previous === wanted) {
      // Re-selecting the current button keeps it selected: a segmented control
      // is a choice, not a toggle. And no second event for a non-change.
      if (focus && target) this.#controlOf(target)?.focus();
      return true;
    }

    for (const button of this.buttons) {
      const control = this.#controlOf(button);
      if (!control) continue;
      control.setAttribute('aria-checked', String(button === target));
    }

    this.#syncButtons();

    // The host reflects the selection, so `value` survives a round trip.
    if (wanted === '') this.removeAttribute('value');
    else {
      this.#syncing = true;
      if (this.getString('value', '') !== wanted) this.setAttribute('value', wanted);
      this.#syncing = false;
    }

    if (focus && target) this.#controlOf(target)?.focus();
    if (announce) this.emit('ui4u:change', { value: wanted, name: this.name });

    return true;
  }

  /** @param {string} value @returns {HTMLElement|null} */
  #buttonFor(value) {
    return this.buttons.find((button) => this.#valueOf(button) === value) ?? null;
  }

  /**
   * The native control inside a `ui-button`. This is what carries the radio
   * role, what is focusable and what is clicked — the host element is only the
   * author's markup wrapper.
   *
   * @param {HTMLElement|null} button
   * @returns {HTMLElement|null}
   */
  #controlOf(button) {
    const control = /** @type {{ control?: HTMLElement|null }} */ (button)?.control;
    return control ?? null;
  }

  /** @param {HTMLElement} button @returns {string} */
  #valueOf(button) {
    return button.getAttribute('value') ?? '';
  }

  /** @param {HTMLElement} button @returns {boolean} */
  #isChecked(button) {
    return this.#controlOf(button)?.getAttribute('aria-checked') === 'true';
  }

  /** The button's own `disabled`, or the group's. @param {HTMLElement} button */
  #isDisabled(button) {
    return button.hasAttribute('disabled') || this.disabled;
  }

  /** @param {Event} event */
  #onClick(event) {
    const target = /** @type {Element|null} */ (event.target);
    const button = target?.closest?.(ITEM);
    // A button from another group, or from outside this one, is not ours.
    if (!button || !this.#options?.contains(button)) return;
    if (!this.buttons.includes(button)) return;

    // No `focus`: a real click focuses the control natively already.
    this.#select(this.#valueOf(button), { announce: true });
  }

  /**
   * The arrow-key model, straight from the ARIA authoring practices: a radio
   * group is ONE tab stop, and the arrow keys move *and* select inside it.
   *
   * `Tab` is deliberately absent from the switch and never prevented — it must
   * leave the group entirely, which is what the single tab stop makes possible.
   * Movement clamps at the ends rather than wrapping, so the key is swallowed
   * even when the clamped target is the current button: the platform's own
   * handling would otherwise wrap around and move the selection.
   *
   * @param {KeyboardEvent} event
   */
  #onKeydown(event) {
    const target = /** @type {Element|null} */ (event.target);
    const button = target?.closest?.(ITEM);
    if (!button || !this.#options?.contains(button)) return;

    const buttons = this.buttons;
    const current = buttons.indexOf(button);
    if (current === -1) return;

    const enabled = buttons
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !this.#isDisabled(item));
    if (enabled.length === 0) return;

    const position = enabled.findIndex(({ index }) => index === current);
    if (position === -1) return;

    /** @type {number|null} */
    let next = null;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        next = enabled[Math.min(position + 1, enabled.length - 1)].index;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        next = enabled[Math.max(position - 1, 0)].index;
        break;
      case 'Home':
        next = enabled[0].index;
        break;
      case 'End':
        next = enabled[enabled.length - 1].index;
        break;
      default:
        // Tab, Space, Enter and everything else are left to the platform.
        return;
    }

    // Prevented BEFORE the clamp check below, not after: Chromium's own
    // handling of a segmented control wraps around at the ends, so an
    // unprevented key at the end of the group would move the selection anyway.
    event.preventDefault();

    if (next === current) return;

    const selected = buttons[next];
    // Announcing is what makes the arrow keys "move and select" rather than
    // "move only"; a binding can still veto it.
    this.#select(this.#valueOf(selected), { announce: true, focus: true });
  }

  /** @param {string} name @param {unknown} value */
  #setTextAttribute(name, value) {
    if (value === null || value === undefined || value === '') this.removeAttribute(name);
    else this.setAttribute(name, String(value));
  }

  /** @param {string} name @param {unknown} value */
  #setBooleanAttribute(name, value) {
    if (value) this.setAttribute(name, '');
    else this.removeAttribute(name);
  }
}
