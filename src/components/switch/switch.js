import { UI4UElement } from '../../core/base.js';
import { el, on, setText, uid } from '../../core/dom.js';

/**
 * @typedef {'sm' | 'md' | 'lg'} SwitchSize
 *
 * @typedef {object} SwitchOptions
 * @property {string} [label] Visible (or, with `sr-only`, spoken) label text.
 * @property {string} [name] Setting name, reported in every event detail.
 * @property {boolean} [checked] Whether the switch starts on.
 * @property {string} [hint] Helper text, announced through `aria-describedby`.
 * @property {string} [error] Validation message; drives `aria-invalid`.
 * @property {boolean} [disabled] Blocks activation and mirrors onto the button.
 * @property {boolean} [required] The switch must be on for the field to be valid.
 * @property {SwitchSize} [size] Control scale. Default `'md'`.
 * @property {boolean} [srOnly] Hides the label visually, keeping it for AT.
 * @property {Record<string, (detail: any, event: CustomEvent) => unknown>} [bindings]
 *   Semantic bindings, e.g. `{ change: ({ checked }) => checked }`.
 *
 * @typedef {object} SwitchValidityResult
 * @property {boolean} valid
 * @property {string} message empty when `valid`
 * @property {boolean} checked the on/off state
 * @property {string} name
 */

/** Used when there is no platform message to report. */
const FALLBACK_MESSAGE = 'Please turn this on to continue.';

// The default, `md`, is absent from this list: an unknown size falls back to it
// rather than resolving to itself — the same rule `ui-button` follows.
const SIZES = ['sm', 'lg'];

/**
 * A binary setting that applies the moment it is flipped.
 *
 * The distinction from `ui-checkbox` is the whole reason this component exists:
 * a checkbox is part of a form submission, so it needs a real `<input>` and a
 * value to send. A switch is not submitted — it *takes effect* — so it needs no
 * form-value semantics to preserve, and can therefore be a real
 * `<button role="switch">` with `aria-checked`.
 *
 * ```html
 * <ui-switch label="Release notes" name="notes"></ui-switch>
 * <ui-switch label="Dark theme" checked></ui-switch>
 * ```
 *
 * That one difference buys the veto. A native checkbox has already toggled
 * itself by the time a `change` handler runs, so a rejected change has to be
 * *undone* (see `ui-checkbox`). Here nothing has happened yet: the binding runs
 * first and returns `false` to leave the switch exactly where it was.
 *
 * Listens for `ui4u:change` — `detail: { name, checked }` — and binds to
 * `change` under the same name.
 *
 * @example
 * sw.configure({ label: 'Dark theme', hint: 'Applies immediately.', checked: true });
 * sw.addEventListener('ui4u:change', (event) => console.log(event.detail.checked));
 */
export class Switch extends UI4UElement {
  static get observedAttributes() {
    return [
      'label',
      'name',
      'checked',
      'hint',
      'error',
      'disabled',
      'required',
      'size',
      'sr-only',
      'aria-label',
    ];
  }

  /** @type {HTMLElement|null} */
  #row = null;
  /** @type {HTMLButtonElement|null} */
  #control = null;
  /** @type {HTMLElement|null} */
  #label = null;
  /** @type {HTMLElement|null} */
  #hint = null;
  /** @type {HTMLElement|null} */
  #error = null;
  /**
   * True while `error` holds a message this component produced during
   * `reportValidity()`, as opposed to one the author set.
   * @type {boolean}
   */
  #selfReported = false;
  #built = false;

  /* ------------------------------------------------------------------ api */

  /** @returns {string} */
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

  /**
   * The on/off state.
   *
   * The ATTRIBUTE is the single source of truth — the button holds no
   * independent copy — so a user toggle, a property assignment and
   * `setAttribute('checked', '')` all land in the same place and can never
   * disagree. That is also what makes the veto trivial: nothing has moved yet
   * when the binding runs.
   *
   * @returns {boolean}
   */
  get checked() {
    return this.getBoolean('checked', false);
  }

  set checked(next) {
    this.#setBooleanAttribute('checked', next);
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
    // Assigning `error` directly is an author decision, so it stops being a
    // self-reported validation message.
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

  /** @returns {SwitchSize} */
  get size() {
    const value = this.getString('size', 'md');
    return SIZES.includes(value) ? /** @type {SwitchSize} */ (value) : 'md';
  }

  set size(next) {
    this.setAttribute('size', next);
  }

  /** Hides the label visually while keeping it in the accessibility tree. */
  get srOnly() {
    return this.getBoolean('sr-only', false);
  }

  set srOnly(next) {
    this.#setBooleanAttribute('sr-only', next);
  }

  /**
   * The native control — the `<button role="switch">`. `null` before the element
   * has connected.
   *
   * @returns {HTMLButtonElement|null}
   */
  get control() {
    return this.#control;
  }

  /**
   * Applies options and returns `this`.
   *
   * Every option is optional and pass-through: an option left out keeps the
   * value it already has, so a picker can change one without resetting the rest.
   *
   * @param {SwitchOptions} [options]
   * @returns {this}
   *
   * @example
   * sw.configure({ label: 'Dark theme', size: 'lg', hint: 'Applies immediately.' });
   */
  configure(options = {}) {
    const { label, name, checked, hint, error, disabled, required, size, srOnly, bindings } =
      options;

    if (label !== undefined) this.label = label;
    if (name !== undefined) this.name = name;
    if (checked !== undefined) this.checked = checked;
    if (hint !== undefined) this.hint = hint;
    if (error !== undefined) this.error = error;
    if (disabled !== undefined) this.disabled = disabled;
    if (required !== undefined) this.required = required;
    if (size !== undefined) this.size = size;
    if (srOnly !== undefined) this.srOnly = srOnly;
    if (bindings !== undefined) this.bindAll(bindings);

    return this;
  }

  /**
   * Flips the switch the way a user would: the `change` binding runs first and
   * may veto, and `ui4u:change` fires only if it did not. A disabled switch
   * does nothing.
   *
   * @returns {boolean} the state the switch ended in
   *
   * @example
   * sw.toggle();
   */
  toggle() {
    const before = this.checked;
    this.#flip();
    return this.checked !== before;
  }

  /**
   * Moves focus to the switch.
   *
   * @param {FocusOptions} [options]
   * @returns {this}
   */
  focus(options) {
    this.#control?.focus(options);
    return this;
  }

  /**
   * Removes focus from the switch.
   *
   * @returns {this}
   */
  blur() {
    this.#control?.blur();
    return this;
  }

  /**
   * Drops the `error` state, without validating.
   *
   * @returns {this}
   *
   * @example
   * sw.addEventListener('ui4u:change', () => sw.clearValidity());
   */
  clearValidity() {
    this.#selfReported = false;
    if (this.hasAttribute('error')) this.removeAttribute('error');
    return this;
  }

  /**
   * A switch is valid unless it is `required` and off, or the author set an
   * `error` — the same rule as `ui-checkbox`, so `ui-form` can drive every
   * field identically. No rules engine: that is `ui-form`'s job.
   *
   * @returns {SwitchValidityResult}
   *
   * @example
   * const { valid, message } = sw.checkValidity();
   */
  checkValidity() {
    const checked = this.checked;
    const name = this.name;
    const error = this.error;

    /*
     * An author-supplied error is a deliberate override and always wins. An
     * error this component set itself during `reportValidity()` must not —
     * otherwise turning the switch on would leave it permanently invalid,
     * because the error it is judged by came from the error it produced.
     */
    if (error && !this.#selfReported) {
      return { valid: false, message: error, checked, name };
    }

    if (this.required && !checked) {
      return { valid: false, message: FALLBACK_MESSAGE, checked, name };
    }

    return { valid: true, message: '', checked, name };
  }

  /**
   * Surfaces an invalid state — sets `error` from the validation message so the
   * field shows and announces it. A valid field clears the error instead.
   *
   * @returns {this}
   */
  reportValidity() {
    const result = this.checkValidity();

    if (result.valid) {
      this.clearValidity();
    } else if (!this.error) {
      this.error = result.message;
      // Set after the assignment: the setter marks an error as author-supplied,
      // and this one came from us.
      this.#selfReported = true;
    }

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
    this.#sync();
  }

  /* --------------------------------------------------------------- build */

  #build() {
    if (this.#built) return;

    const baseId = uid('ui4u-switch');
    // Always a fresh id for the label. Reusing the host's id would leave two
    // elements sharing one id, which is invalid HTML and makes every `#id`
    // selector ambiguous.
    const labelId = `${baseId}-label`;

    /** @type {HTMLElement} */
    const row = el('span', { class: 'ui4u-switch__row' });
    /** @type {HTMLButtonElement} */
    const control = el('button', {
      class: 'ui4u-switch__control',
      type: 'button',
      role: 'switch',
      id: `${baseId}-control`,
    });
    /** @type {HTMLElement} */
    const track = el('span', { class: 'ui4u-switch__track', 'aria-hidden': 'true' });
    /** @type {HTMLElement} */
    const knob = el('span', { class: 'ui4u-switch__knob' });
    // A label span, never a <label>: the control is a button, and a label that
    // wraps a control swallows its clicks and interferes with activation.
    /** @type {HTMLElement} */
    const label = el('span', { class: 'ui4u-switch__label', id: labelId });
    /** @type {HTMLElement} */
    const hint = el('p', { class: 'ui4u-switch__hint', id: `${baseId}-hint` });
    /** @type {HTMLElement} */
    const error = el('p', { class: 'ui4u-switch__error', id: `${baseId}-error` });

    track.append(knob);
    control.append(track);
    row.append(control, label);

    this.#row = row;
    this.#control = control;
    this.#label = label;
    this.#hint = hint;
    this.#error = error;
    this.#built = true;

    this.track(on(control, 'click', () => this.#flip()));
    this.track(
      on(control, 'keydown', (event) => this.#onKeydown(/** @type {KeyboardEvent} */ (event)))
    );
    this.track(on(row, 'click', (event) => this.#onRowClick(/** @type {MouseEvent} */ (event))));

    // The author's own children are left exactly where they are — only the
    // generated nodes are added around them, so teardown is a plain removal.
    this.prepend(row);
    this.append(hint, error);

    this.#sync();
  }

  #teardown() {
    this.#row?.remove();
    this.#hint?.remove();
    this.#error?.remove();

    this.#row = null;
    this.#control = null;
    this.#label = null;
    this.#hint = null;
    this.#error = null;
    this.#selfReported = false;
    this.#built = false;

    delete this.dataset.size;
  }

  /* ----------------------------------------------------------- behaviour */

  /** Mirrors every option onto the native control and the ARIA. */
  #sync() {
    const control = this.#control;
    const label = this.#label;
    const hint = this.#hint;
    const error = this.#error;
    if (!control || !label || !hint || !error) return;

    const labelText = this.label;
    setText(label, labelText);
    label.hidden = labelText === '';
    label.classList.toggle('ui4u-sr-only', this.srOnly);

    setText(hint, this.hint);
    hint.hidden = this.hint === '';

    // `setText`, never innerHTML — both may carry user data.
    const errorText = this.error;
    setText(error, errorText);
    error.hidden = errorText === '';

    const describedBy = [hint.hidden ? null : hint.id, error.hidden ? null : error.id]
      .filter(Boolean)
      .join(' ');
    if (describedBy) control.setAttribute('aria-describedby', describedBy);
    else control.removeAttribute('aria-describedby');

    if (errorText) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');

    if (this.required) control.setAttribute('aria-required', 'true');
    else control.removeAttribute('aria-required');

    /*
     * The visible label is the accessible name. An `aria-label` on the host is
     * mirrored so a switch with no visible text can still be named — the host
     * is not the control, so the attribute would otherwise be read by nothing.
     */
    const ariaLabel = this.getAttribute('aria-label');
    if (ariaLabel) control.setAttribute('aria-label', ariaLabel);
    else control.removeAttribute('aria-label');

    if (labelText) control.setAttribute('aria-labelledby', label.id);
    else control.removeAttribute('aria-labelledby');

    // The attribute is the state, so there is nothing else to mirror — this is
    // what keeps a user toggle and an authored `checked` from ever diverging.
    control.setAttribute('aria-checked', String(this.checked));
    control.disabled = this.disabled;

    this.dataset.size = this.size;
  }

  /**
   * Runs the `change` binding first and mutates only if it lets the flip
   * through. This ordering is the component's reason for existing: there is no
   * native state to undo, so a veto simply does nothing.
   *
   * @param {MouseEvent} [event] the native click, cancelled on a veto
   */
  #flip(event) {
    if (!this.#built) return;
    // A disabled `<button>` is already inert natively; jsdom and any future
    // host that delivers the event anyway must still not flip the state.
    if (this.disabled) return;

    const detail = { name: this.name, checked: !this.checked };

    if (!this.runBinding('change', detail)) {
      // Nothing has changed, so there is nothing to undo — but the native click
      // is still a click, and swallowing it would hide the interaction from the
      // author's own listeners.
      event?.preventDefault();
      return;
    }

    this.checked = detail.checked;
    this.emit('ui4u:change', detail);
  }

  /**
   * `Enter` and `Space` toggle the switch. A native `<button>` already does
   * this, but only through activation behaviour the DOM harness does not
   * implement — and owning the key explicitly means Space cannot scroll the
   * page behind the control while the state is being decided.
   *
   * @param {KeyboardEvent} event
   */
  #onKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    // Suppresses the synthesised click, so one key press is one toggle.
    event.preventDefault();
    this.#flip();
  }

  /**
   * The label sits beside the control, not around it, so it carries the click
   * itself: a settings row whose text does nothing is a trap on touch.
   *
   * @param {MouseEvent} event
   */
  #onRowClick(event) {
    if (event.target !== this.#label) return;
    // Focus first, so the switch keeps the keyboard position the label implies.
    // `:focus-visible` stays quiet for a pointer, so no ring appears.
    this.#control?.focus();
    this.#flip(event);
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
