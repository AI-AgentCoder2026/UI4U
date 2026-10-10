import { UI4UElement } from '../../core/base.js';
import { el, on, setText, uid } from '../../core/dom.js';

/**
 * @typedef {'sm' | 'md' | 'lg'} InputSize
 *
 * @typedef {object} InputOptions
 * @property {string} [label] Visible (or, with `sr-only`, spoken) label text.
 * @property {string} [type] Native input type. Default `'text'`.
 * @property {string} [value] Current value; also the authored initial value.
 * @property {string} [placeholder]
 * @property {string} [hint] Helper text, announced through `aria-describedby`.
 * @property {string} [error] Validation message; drives `aria-invalid`.
 * @property {InputSize} [size] Control scale. Default `'md'`.
 * @property {boolean} [required] Marks the field required.
 * @property {boolean} [disabled] Mirrors onto the native control.
 * @property {boolean} [readonly] Mirrors onto the native control.
 * @property {string} [name] Form name, also reported in every event detail.
 * @property {string} [autocomplete] Native autofill hint.
 *
 * @typedef {object} InputValidityResult
 * @property {boolean} valid
 * @property {string} message empty when `valid`
 * @property {string} value the value that was validated
 * @property {string} name
 */

// The default size, `md`, is absent from this list: an unknown value falls
// back to it rather than resolving to itself.
const SIZES = ['sm', 'lg'];

/** Used only when the platform gives us an empty `validationMessage`. */
const FALLBACK_MESSAGE = 'Please enter a valid value.';

/**
 * A text field that wraps — and keeps — a REAL `<input>` in light DOM. Never a
 * `<div>` that imitates one: native autofill, IME composition, mobile
 * keyboards, password managers and form submission all depend on a genuine
 * control, and the component never re-renders it from a property.
 *
 * ```html
 * <ui-input label="Email" type="email" required hint="We never share it."></ui-input>
 * <ui-input label="Name" value="Ada" error="That name is taken" size="lg"></ui-input>
 * ```
 *
 * Listens for `ui4u:input` and `ui4u:change` — `detail: { value, name }` —
 * emitted in addition to the native events, which still fire untouched.
 */
export class Input extends UI4UElement {
  static get observedAttributes() {
    return [
      'label',
      'type',
      'value',
      'placeholder',
      'hint',
      'error',
      'size',
      'required',
      'disabled',
      'readonly',
      'name',
      'autocomplete',
      'sr-only',
    ];
  }

  /** @type {HTMLLabelElement|null} */
  #label = null;
  /** @type {HTMLInputElement|null} */
  #native = null;
  /** @type {HTMLElement|null} */
  #hint = null;
  /** @type {HTMLElement|null} */
  #error = null;
  #built = false;

  /* ------------------------------------------------------------------ api */

  /** @returns {string} */
  get label() {
    return this.getString('label', '');
  }

  set label(next) {
    this.#setTextAttribute('label', next);
  }

  /**
   * The live value of the native control, so a user typing is never clobbered.
   *
   * @returns {string}
   */
  get value() {
    return this.#native ? this.#native.value : this.getString('value', '');
  }

  set value(next) {
    this.#setTextAttribute('value', next);
  }

  /** @returns {string} */
  get type() {
    return this.getString('type', 'text') || 'text';
  }

  set type(next) {
    this.#setTextAttribute('type', next);
  }

  /** @returns {string} */
  get placeholder() {
    return this.getString('placeholder', '');
  }

  set placeholder(next) {
    this.#setTextAttribute('placeholder', next);
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
    this.#setTextAttribute('error', next);
  }

  /** @returns {InputSize} */
  get size() {
    const value = this.getString('size', 'md');
    return SIZES.includes(value) ? /** @type {InputSize} */ (value) : 'md';
  }

  set size(next) {
    this.setAttribute('size', next);
  }

  /** @returns {boolean} */
  get required() {
    return this.getBoolean('required', false);
  }

  set required(next) {
    this.#setBooleanAttribute('required', next);
  }

  /** @returns {boolean} */
  get disabled() {
    return this.getBoolean('disabled', false);
  }

  set disabled(next) {
    this.#setBooleanAttribute('disabled', next);
  }

  /** @returns {boolean} */
  get readonly() {
    return this.getBoolean('readonly', false);
  }

  set readonly(next) {
    this.#setBooleanAttribute('readonly', next);
  }

  /** Hides the label visually while keeping it in the accessibility tree. */
  get srOnly() {
    return this.getBoolean('sr-only', false);
  }

  set srOnly(next) {
    this.#setBooleanAttribute('sr-only', next);
  }

  /** @returns {string} */
  get name() {
    return this.getString('name', '');
  }

  set name(next) {
    this.#setTextAttribute('name', next);
  }

  /** @returns {string} */
  get autocomplete() {
    return this.getString('autocomplete', '');
  }

  set autocomplete(next) {
    this.#setTextAttribute('autocomplete', next);
  }

  /**
   * The native control itself. `null` before the element has connected.
   *
   * @returns {HTMLInputElement|null}
   */
  get input() {
    return this.#native;
  }

  /**
   * Applies options and returns `this`.
   *
   * Every option is optional and pass-through: an option left out keeps the
   * value it already has, so a picker can change one without resetting the rest.
   *
   * @param {InputOptions} [options]
   * @returns {this}
   *
   * @example
   * field.configure({ size: 'lg', hint: 'We never share it.', required: true });
   */
  configure(options = {}) {
    const {
      label,
      type,
      value,
      placeholder,
      hint,
      error,
      size,
      required,
      disabled,
      readonly,
      name,
      autocomplete,
    } = options;

    if (label !== undefined) this.label = label;
    if (type !== undefined) this.type = type;
    if (value !== undefined) this.value = value;
    if (placeholder !== undefined) this.placeholder = placeholder;
    if (hint !== undefined) this.hint = hint;
    if (error !== undefined) this.error = error;
    if (size !== undefined) this.size = size;
    if (required !== undefined) this.required = required;
    if (disabled !== undefined) this.disabled = disabled;
    if (readonly !== undefined) this.readonly = readonly;
    if (name !== undefined) this.name = name;
    if (autocomplete !== undefined) this.autocomplete = autocomplete;

    return this;
  }

  /**
   * Moves focus to the native control.
   *
   * @param {FocusOptions} [options]
   * @returns {this}
   */
  focus(options) {
    this.#native?.focus(options);
    return this;
  }

  /**
   * Removes focus from the native control.
   *
   * @returns {this}
   */
  blur() {
    this.#native?.blur();
    return this;
  }

  /**
   * Drops the `error` state and any custom validity, without validating.
   *
   * @returns {this}
   *
   * @example
   * form.addEventListener('ui4u:input', () => field.clearValidity());
   */
  clearValidity() {
    if (this.hasAttribute('error')) this.removeAttribute('error');
    if (typeof this.#native?.setCustomValidity === 'function') this.#native.setCustomValidity('');
    return this;
  }

  /**
   * Validates through the native input — `required` plus whatever constraint
   * the `type` carries — and reports an author-set `error` as invalid too.
   * No rules engine here: that is `ui-form`'s job.
   *
   * @returns {InputValidityResult}
   *
   * @example
   * const { valid, message } = field.checkValidity();
   */
  checkValidity() {
    const value = this.value;
    const name = this.name;
    const error = this.error;

    if (error) return { valid: false, message: error, value, name };

    const native = this.#native;
    if (!native) return { valid: true, message: '', value, name };

    if (typeof native.checkValidity === 'function') {
      const valid = native.checkValidity();
      const message = valid ? '' : native.validationMessage || FALLBACK_MESSAGE;
      return { valid, message, value, name };
    }

    // Fallback for a host without constraint validation: `required` only.
    const missing = this.required && value.trim() === '';
    return { valid: !missing, message: missing ? FALLBACK_MESSAGE : '', value, name };
  }

  /**
   * Surfaces an invalid state — sets `error` from the native message so the
   * field shows and announces it — then triggers the browser's own bubble.
   * A valid field clears the error state instead.
   *
   * @returns {this}
   */
  reportValidity() {
    const result = this.checkValidity();

    if (result.valid) this.clearValidity();
    else if (!this.error) this.error = result.message;

    if (typeof this.#native?.reportValidity === 'function') this.#native.reportValidity();
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

    // `value` is the one option that must not be re-applied on every unrelated
    // change — it would overwrite what the user is currently typing.
    if (name === 'value') this.#syncValue();
    else this.#sync();
  }

  /* --------------------------------------------------------------- build */

  #build() {
    if (this.#built) return;

    const baseId = uid('ui4u-input');
    // Always generate a fresh id for the control. Reusing the host's id would
    // leave two elements sharing one id in the document, which is invalid HTML
    // and makes every `#id` selector ambiguous.
    const inputId = `${baseId}-input`;

    /** @type {HTMLLabelElement} */
    const label = el('label', { class: 'ui4u-input__label', for: inputId });
    /** @type {HTMLInputElement} */
    const native = el('input', {
      class: 'ui4u-input__native',
      id: inputId,
      type: this.type,
    });
    /** @type {HTMLElement} */
    const hint = el('p', { class: 'ui4u-input__hint', id: `${baseId}-hint` });
    /** @type {HTMLElement} */
    const error = el('p', { class: 'ui4u-input__error', id: `${baseId}-error` });

    this.#label = label;
    this.#native = native;
    this.#hint = hint;
    this.#error = error;
    this.#built = true;

    this.track(on(native, 'input', () => this.#emitValue('ui4u:input')));
    this.track(on(native, 'change', () => this.#emitValue('ui4u:change')));

    // The author's own children are left exactly where they are — only the
    // generated nodes are added around them, so teardown is a plain removal.
    this.prepend(label, native);
    this.append(hint, error);

    this.#sync();
    this.#syncValue();
  }

  #teardown() {
    this.#label?.remove();
    this.#native?.remove();
    this.#hint?.remove();
    this.#error?.remove();

    this.#label = null;
    this.#native = null;
    this.#hint = null;
    this.#error = null;
    this.#built = false;

    delete this.dataset.size;
  }

  /* ----------------------------------------------------------- behaviour */

  /** Mirrors every option except `value` onto the native control and the ARIA. */
  #sync() {
    const label = this.#label;
    const native = this.#native;
    const hint = this.#hint;
    const error = this.#error;
    if (!label || !native || !hint || !error) return;

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
    if (describedBy) native.setAttribute('aria-describedby', describedBy);
    else native.removeAttribute('aria-describedby');

    if (errorText) native.setAttribute('aria-invalid', 'true');
    else native.removeAttribute('aria-invalid');

    if (this.required) native.setAttribute('aria-required', 'true');
    else native.removeAttribute('aria-required');

    native.required = this.required;
    native.disabled = this.disabled;
    native.readOnly = this.readonly;
    native.placeholder = this.placeholder;
    native.name = this.name;
    native.autocomplete = this.autocomplete;
    // Assigning `type` resets a native value, so only touch it when it differs.
    if (native.type !== this.type) native.type = this.type;

    this.dataset.size = this.size;
  }

  /** Applies the `value` attribute to the control, and only then. */
  #syncValue() {
    const native = this.#native;
    if (!native) return;

    const next = this.getString('value', '');
    if (native.value !== next) native.value = next;
  }

  /**
   * @param {'ui4u:input' | 'ui4u:change'} type
   */
  #emitValue(type) {
    this.emit(type, { value: this.value, name: this.name });
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