import { UI4UElement } from '../../core/base.js';
import { el, on, setText, uid } from '../../core/dom.js';

/**
 * @typedef {object} CheckboxOptions
 * @property {string} [label] Visible (or, with `sr-only`, spoken) label text.
 * @property {string} [name] Form name, also reported in every event detail.
 * @property {string} [value] Submitted value. Defaults to `'on'`, the HTML default.
 * @property {boolean} [checked] Whether the box starts ticked.
 * @property {boolean} [indeterminate] The mixed state of a "select all" parent.
 * @property {string} [hint] Helper text, announced through `aria-describedby`.
 * @property {string} [error] Validation message; drives `aria-invalid`.
 * @property {boolean} [disabled] Mirrors onto the native control.
 * @property {boolean} [required] The box must be ticked for the field to be valid.
 * @property {boolean} [readonly] The user may not change it; `checked` is then the state.
 * @property {boolean} [srOnly] Hides the label visually, keeping it for AT.
 * @property {Record<string, (detail: any, event: CustomEvent) => unknown>} [bindings]
 *   Semantic bindings, e.g. `{ change: ({ checked }) => checked }`.
 *
 * @typedef {object} CheckboxValidityResult
 * @property {boolean} valid
 * @property {string} message empty when `valid`
 * @property {string} value the submitted `value` — not the on/off state
 * @property {string} name
 */

/** Used only when the platform gives us an empty `validationMessage`. */
const FALLBACK_MESSAGE = 'Please tick this box to continue.';

/**
 * A checkbox field that wraps — and keeps — a REAL `<input type="checkbox">`
 * in light DOM. Never a `<div>` that imitates one: native focus rings, form
 * submission, password managers and every assistive technology depend on a
 * genuine control, and the component never re-renders it from a property.
 *
 * ```html
 * <ui-checkbox label="Email me about releases" name="releases"></ui-checkbox>
 * <ui-checkbox label="Select all" indeterminate></ui-checkbox>
 * ```
 *
 * Validity follows the native rule: a checkbox is valid unless it is
 * `required` and unticked. An unticked optional box is not an error — it simply
 * contributes nothing to the submitted data.
 *
 * Listens for `ui4u:change` — `detail: { value, name, checked }` — emitted in
 * addition to the native event, which still fires untouched.
 *
 * Binds to `change` with the same name and detail. A binding that returns
 * `false` puts the control back where the user found it — the browser has
 * already toggled it by the time any `change` handler could run, so a veto
 * cannot merely skip the event; it has to undo the tick. The native event
 * still fires either way, because the platform's own interaction already
 * happened and no component gets to un-happen it.
 *
 * @example
 * box.configure({ label: 'Accept terms', required: true, hint: 'Required to sign up.' });
 * const { valid, message } = box.checkValidity();
 */
export class Checkbox extends UI4UElement {
  static get observedAttributes() {
    return [
      'label',
      'name',
      'value',
      'checked',
      'indeterminate',
      'hint',
      'error',
      'disabled',
      'required',
      'readonly',
      'sr-only',
    ];
  }

  /** @type {HTMLElement|null} */
  #row = null;
  /** @type {HTMLLabelElement|null} */
  #label = null;
  /** @type {HTMLInputElement|null} */
  #native = null;
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
  /** Guards the property -> attribute reflect loop. @type {boolean} */
  #syncing = false;
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
   * The value a form would submit. `'on'` when unset, exactly like a bare
   * `<input type="checkbox">`.
   *
   * @returns {string}
   */
  get value() {
    return this.#native ? this.#native.value : this.getString('value', 'on') || 'on';
  }

  set value(next) {
    this.#setTextAttribute('value', next);
  }

  /**
   * The live state of the native control, so a user click is never clobbered.
   *
   * The `checked` ATTRIBUTE stays the authored initial value — it is never
   * rewritten by a user toggle, for the same reason `ui-input` leaves `value`
   * alone. While `readonly`, the attribute is authoritative and a user toggle
   * is reverted.
   *
   * @returns {boolean}
   */
  get checked() {
    return this.#native ? this.#native.checked : this.getBoolean('checked', false);
  }

  set checked(next) {
    const value = Boolean(next);
    // Guarded, because setting an attribute the element already carries fires no
    // `attributeChangedCallback` — and the control still has to be updated.
    this.#syncing = true;
    this.#setBooleanAttribute('checked', value);
    this.#syncing = false;
    if (this.#native) this.#native.checked = value;
  }

  /**
   * The mixed state. This is an IDL property on the native input with **no
   * content attribute of its own**, so it can never be reflected the usual way:
   * `input.indeterminate = true` writes nothing to the markup. The component
   * therefore makes the ATTRIBUTE the source of truth — it is what authored
   * `<ui-checkbox indeterminate>` and the setter both write — and mirrors it
   * onto the control in `#sync()`. The reverse direction is handled in the
   * `change` listener: the browser clears `indeterminate` when the box is
   * clicked, so the attribute is re-read from the control afterwards.
   *
   * @returns {boolean}
   */
  get indeterminate() {
    return this.getBoolean('indeterminate', false);
  }

  set indeterminate(next) {
    const value = Boolean(next);
    this.#syncing = true;
    this.#setBooleanAttribute('indeterminate', value);
    this.#syncing = false;
    if (this.#native) this.#native.indeterminate = value;
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
   * @param {CheckboxOptions} [options]
   * @returns {this}
   *
   * @example
   * box.configure({ label: 'Accept terms', required: true, hint: 'Required to sign up.' });
   */
  configure(options = {}) {
    const {
      label,
      name,
      value,
      checked,
      indeterminate,
      hint,
      error,
      disabled,
      required,
      readonly,
      srOnly,
      bindings,
    } = options;

    if (label !== undefined) this.label = label;
    if (name !== undefined) this.name = name;
    if (value !== undefined) this.value = value;
    if (checked !== undefined) this.checked = checked;
    if (indeterminate !== undefined) this.indeterminate = indeterminate;
    if (hint !== undefined) this.hint = hint;
    if (error !== undefined) this.error = error;
    if (disabled !== undefined) this.disabled = disabled;
    if (required !== undefined) this.required = required;
    if (readonly !== undefined) this.readonly = readonly;
    if (srOnly !== undefined) this.srOnly = srOnly;
    if (bindings !== undefined) this.bindAll(bindings);

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
   * box.addEventListener('ui4u:change', () => box.clearValidity());
   */
  clearValidity() {
    this.#selfReported = false;
    if (this.hasAttribute('error')) this.removeAttribute('error');
    if (typeof this.#native?.setCustomValidity === 'function') this.#native.setCustomValidity('');
    return this;
  }

  /**
   * A checkbox is valid unless it is `required` and unticked, or the author set
   * an `error`. The rule is evaluated here rather than delegated to
   * `input.checkValidity()`, whose radio/checkbox group semantics differ between
   * hosts; the platform message is still preferred when there is one. No rules
   * engine — that is `ui-form`'s job.
   *
   * @returns {CheckboxValidityResult}
   *
   * @example
   * const { valid, message } = box.checkValidity();
   */
  checkValidity() {
    const value = this.value;
    const name = this.name;
    const error = this.error;

    // An author-supplied error is a deliberate override and always wins. An
    // error this component set itself during `reportValidity()` must not —
    // otherwise ticking the box would leave it permanently invalid, because
    // the error it is judged by came from the error it produced.
    if (error && !this.#selfReported) return { valid: false, message: error, value, name };

    const native = this.#native;
    if (this.required && !this.checked) {
      return { valid: false, message: native?.validationMessage || FALLBACK_MESSAGE, value, name };
    }

    if (native && typeof native.checkValidity === 'function') {
      const valid = native.checkValidity();
      return {
        valid,
        message: valid ? '' : native.validationMessage || FALLBACK_MESSAGE,
        value,
        name,
      };
    }

    return { valid: true, message: '', value, name };
  }

  /**
   * Surfaces an invalid state — sets `error` from the validation message so the
   * field shows and announces it — then triggers the browser's own bubble.
   * A valid field clears the error state instead.
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
    if (oldValue === newValue || !this.#built || this.#syncing) return;

    // `checked` is the one option that must only be applied when it actually
    // changes — re-applying it on every unrelated change would undo the click
    // the user just made.
    if (name === 'checked') this.#applyChecked();
    else this.#sync();
  }

  /* --------------------------------------------------------------- build */

  #build() {
    if (this.#built) return;

    const baseId = uid('ui4u-checkbox');
    // Always generate a fresh id for the control. Reusing the host's id would
    // leave two elements sharing one id in the document, which is invalid HTML
    // and makes every `#id` selector ambiguous.
    const inputId = `${baseId}-input`;

    /** @type {HTMLElement} */
    const row = el('span', { class: 'ui4u-checkbox__row' });
    /** @type {HTMLInputElement} */
    const native = el('input', {
      class: 'ui4u-checkbox__native',
      id: inputId,
      type: 'checkbox',
    });
    // `for`, not nesting: the label holds text only, so it can never end up
    // wrapping another control.
    /** @type {HTMLLabelElement} */
    const label = el('label', { class: 'ui4u-checkbox__label', for: inputId });
    /** @type {HTMLElement} */
    const hint = el('p', { class: 'ui4u-checkbox__hint', id: `${baseId}-hint` });
    /** @type {HTMLElement} */
    const error = el('p', { class: 'ui4u-checkbox__error', id: `${baseId}-error` });

    row.append(native, label);

    this.#row = row;
    this.#native = native;
    this.#label = label;
    this.#hint = hint;
    this.#error = error;
    this.#built = true;

    this.track(on(native, 'change', () => this.#onNativeChange()));
    this.track(on(native, 'click', () => this.#revertWhenReadonly()));

    // The author's own children are left exactly where they are — only the
    // generated nodes are added around them, so teardown is a plain removal.
    this.prepend(row);
    this.append(hint, error);

    this.#sync();
    this.#applyChecked();
  }

  #teardown() {
    this.#row?.remove();
    this.#hint?.remove();
    this.#error?.remove();

    this.#row = null;
    this.#native = null;
    this.#label = null;
    this.#hint = null;
    this.#error = null;
    this.#selfReported = false;
    this.#built = false;
  }

  /* ----------------------------------------------------------- behaviour */

  /** Mirrors every option except `checked` onto the native control and the ARIA. */
  #sync() {
    const native = this.#native;
    const label = this.#label;
    const hint = this.#hint;
    const error = this.#error;
    if (!native || !label || !hint || !error) return;

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

    // `readonly` has no effect on a checkbox natively, so the state is exposed
    // to AT and enforced in `#revertWhenReadonly()`.
    if (this.readonly) native.setAttribute('aria-readonly', 'true');
    else native.removeAttribute('aria-readonly');

    native.disabled = this.disabled;
    native.readOnly = this.readonly;
    native.required = this.required;
    native.name = this.name;

    const nextValue = this.getString('value', '') || 'on';
    if (native.value !== nextValue) native.value = nextValue;

    // See the `indeterminate` getter: the attribute is the source of truth and
    // the control is the mirror.
    const nextIndeterminate = this.indeterminate;
    if (native.indeterminate !== nextIndeterminate) native.indeterminate = nextIndeterminate;
  }

  /** Applies the `checked` attribute to the control, and only then. */
  #applyChecked() {
    const native = this.#native;
    if (!native) return;

    const next = this.getBoolean('checked', false);
    if (native.checked !== next) native.checked = next;
  }

  /**
   * While `readonly` the authored `checked` attribute is the state, so a user
   * toggle is undone after the control has flipped itself. Done here rather than
   * by cancelling the click, because `preventDefault()` on a checkbox click
   * depends on host activation behaviour.
   */
  #revertWhenReadonly() {
    if (!this.readonly) return;
    const native = this.#native;
    if (native && native.checked !== this.getBoolean('checked', false)) {
      native.checked = this.getBoolean('checked', false);
    }
  }

  #onNativeChange() {
    const native = this.#native;

    // Read before the mirror below overwrites it: the attribute is the source
    // of truth for the mixed state, so this is the pre-click value a veto has
    // to restore.
    const wasIndeterminate = this.indeterminate;

    // The browser clears `indeterminate` when the box is clicked. Mirror that
    // back onto the attribute so the two never disagree — see the `indeterminate`
    // getter for why the attribute is the source of truth.
    if (native && native.indeterminate !== this.indeterminate) {
      this.indeterminate = native.indeterminate;
    }

    if (this.readonly) return;

    const detail = { value: this.value, name: this.name, checked: this.checked };

    /*
     * The platform has already toggled the control by the time `change` fires,
     * so a veto has to put it back rather than merely skip the emit — the same
     * approach as `#revertWhenReadonly()`, because cancelling a checkbox click
     * with `preventDefault()` depends on host activation behaviour.
     *
     * `change` only ever fires when the box has toggled, so inverting the live
     * state restores exactly what the user saw. The mixed state goes back
     * through the setter, which mirrors it onto the control as well.
     */
    if (!this.runBinding('change', detail)) {
      if (native) native.checked = !native.checked;
      this.indeterminate = wasIndeterminate;
      return;
    }

    this.emit('ui4u:change', detail);
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
