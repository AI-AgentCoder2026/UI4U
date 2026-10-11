import { UI4UElement } from '../../core/base.js';
import { el, on, setText, uid } from '../../core/dom.js';
import { position } from '../../core/position.js';
import { CalendarPanel } from './calendar.js';
import { formatAmount, parseAmount } from './amount.js';
import { fromISO, toISO } from './date.js';

/**
 * @typedef {'sm' | 'md' | 'lg'} InputSize
 * @typedef {'text' | 'amount' | 'date' | ...} InputType
 *
 * @typedef {object} InputOptions
 * @property {string} [label] Visible (or, with `sr-only`, spoken) label text.
 * @property {string} [type] Native input type, or `'amount'` / `'date'` for the
 *   two richer modes. Everything else is passed to the native control.
 *   Default `'text'`.
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
 * @property {number} [decimals] `amount` only. Fixed decimal places to display.
 * @property {number} [min] Inclusive lower bound, for `amount` or `date`.
 * @property {number|string} [max] Inclusive upper bound, for `amount` or `date`.
 * @property {string} [locale] `date` only. BCP-47 tag for month and weekday names.
 * @property {number} [firstDayOfWeek] `date` only. `0` for Sunday, `1` for Monday.
 * @property {boolean} [range] `date` only. Two clicks make a range.
 * @property {'day' | 'month' | 'year'} [view] `date` only. Level the panel opens at.
 *
 * @typedef {object} InputValidityResult
 * @property {boolean} valid
 * @property {string} message empty when `valid`
 * @property {string} value the value that was validated
 * @property {string} name
 *
 * @typedef {object} DateRangeValue
 * @property {string} from ISO `YYYY-MM-DD`, `''` when unset
 * @property {string} to ISO `YYYY-MM-DD`, `''` when unset
 */

// The default size, `md`, is absent from this list: an unknown value falls
// back to it rather than resolving to itself.
const SIZES = ['sm', 'lg'];

/** Types this component drives itself; anything else is the browser's problem. */
const AMOUNT = 'amount';
const DATE = 'date';

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
      'decimals',
      'min',
      'max',
      'locale',
      'first-day',
      'range',
      'view',
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
  /** @type {CalendarPanel|null} */
  #calendar = null;
  /** @type {Array<() => void>} */
  #panelDisposers = [];
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

  /**
   * The live value of the native control, so a user typing is never clobbered.
   *
   * A `date` field is the exception: its control shows a *formatted* date, and
   * the attribute holds the ISO one. Returning the display string would make a
   * consumer store "14 Aug 2026", so the machine-readable value wins there.
   *
   * @returns {string}
   */
  get value() {
    if (this.#isDate) return this.getString('value', '');
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

  /** @returns {boolean} true when this component drives the control itself. */
  get #isAmount() {
    return this.type === AMOUNT;
  }

  /** @returns {boolean} */
  get #isDate() {
    return this.type === DATE;
  }

  /**
   * The numeric value behind an `amount` field, or `null` when the text is not
   * an amount.
   *
   * The text stays under the user's control; this is the number a consumer
   * should actually store.
   *
   * @returns {number|null}
   */
  get amount() {
    return parseAmount(this.value).value;
  }

  /**
   * The chosen date range, for a `date` field with `range`.
   *
   * @returns {DateRangeValue}
   */
  get range() {
    const value = this.getString('value', '');
    if (!value.includes('/')) return { from: value, to: '' };
    const [from = '', to = ''] = value.split('/');
    return { from, to };
  }

  /** @returns {number|null} fixed decimal places for an `amount` field */
  get decimals() {
    const value = Number.parseInt(this.getString('decimals', ''), 10);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  /** @returns {string} BCP-47 tag used by the date panel. */
  get locale() {
    return this.getString('locale', 'en-GB');
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
    // Assigning `error` directly is an author decision, so it stops being a
    // self-reported validation message.
    this.#selfReported = false;
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
      decimals,
      min,
      max,
      locale,
      firstDayOfWeek,
      range,
      view,
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
    if (decimals !== undefined) this.#setTextAttribute('decimals', decimals);
    if (min !== undefined) this.#setTextAttribute('min', min);
    if (max !== undefined) this.#setTextAttribute('max', max);
    if (locale !== undefined) this.setAttribute('locale', locale);
    if (firstDayOfWeek !== undefined) this.setAttribute('first-day', firstDayOfWeek);
    if (range !== undefined) this.setAttribute('range', String(Boolean(range)));
    if (view !== undefined) this.setAttribute('view', view);

    return this;
  }

  /**
   * Opens the calendar panel on a `date` field.
   *
   * @returns {this}
   *
   * @example
   * dateField.openPicker();
   */
  openPicker() {
    if (this.#isDate) this.#openCalendar();
    return this;
  }

  /** @returns {this} */
  closePicker() {
    this.#closeCalendar();
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
    this.#selfReported = false;
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

    // An author-supplied error is a deliberate override and always wins. An
    // error this component set itself during `reportValidity()` must not —
    // otherwise correcting the field would leave it permanently invalid,
    // because the error it is judged by came from the error it produced.
    if (error && !this.#selfReported) return { valid: false, message: error, value, name };

    const native = this.#native;
    if (!native) return { valid: true, message: '', value, name };

    if (this.#isAmount) {
      const check = this.#checkAmount();
      if (!check.valid) return { ...check, value, name };
    } else if (this.#isDate) {
      const check = this.#checkDate();
      if (!check.valid) return { ...check, value, name };
    }

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
   * Range checking for an `amount` field, which the native `min`/`max`
   * attributes cannot express against a live-formatted text value.
   *
   * @returns {{ valid: boolean, message: string }}
   */
  #checkAmount() {
    const parsed = parseAmount(this.value);
    if (this.value.trim() === '') {
      return { valid: !this.required, message: this.required ? FALLBACK_MESSAGE : '' };
    }
    if (parsed.value === null) {
      return { valid: false, message: 'Enter a number, optionally with k, m or b.' };
    }

    const min = Number.parseFloat(this.getString('min', ''));
    const max = Number.parseFloat(this.getString('max', ''));

    if (Number.isFinite(min) && parsed.value < min) {
      return { valid: false, message: `Enter ${formatAmount(min)} or more.` };
    }
    if (Number.isFinite(max) && parsed.value > max) {
      return { valid: false, message: `Enter ${formatAmount(max)} or less.` };
    }

    return { valid: true, message: '' };
  }

  /**
   * @returns {{ valid: boolean, message: string }}
   */
  #checkDate() {
    const value = this.getString('value', '');
    if (value === '') {
      return { valid: !this.required, message: this.required ? FALLBACK_MESSAGE : '' };
    }

    const min = this.getString('min', '');
    const max = this.getString('max', '');

    if (this.getBoolean('range', false)) {
      const { from, to } = this.range;
      if (!fromISO(from)) return { valid: false, message: 'Choose a valid start date.' };
      if (to && !fromISO(to)) return { valid: false, message: 'Choose a valid end date.' };
      if (to && fromISO(to) && fromISO(from) > fromISO(to)) {
        return { valid: false, message: 'The end date must not be before the start date.' };
      }
      if (min && fromISO(from) && toISO(fromISO(from)) < min) {
        return { valid: false, message: `Choose ${min} or later.` };
      }
      if (max && to && fromISO(to) && toISO(fromISO(to)) > max) {
        return { valid: false, message: `Choose ${max} or earlier.` };
      }
      return { valid: true, message: '' };
    }

    const chosen = fromISO(value);
    if (!chosen) return { valid: false, message: 'Choose a valid date.' };
    if (min && toISO(chosen) < min) return { valid: false, message: `Choose ${min} or later.` };
    if (max && toISO(chosen) > max) return { valid: false, message: `Choose ${max} or earlier.` };
    return { valid: true, message: '' };
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
    if (oldValue === newValue || !this.#built) return;

    // Switching to or from `amount` / `date` changes the native control type and
    // which listeners are attached, so it needs a full rebuild.
    if (name === 'type') {
      this.#teardown();
      this.#build();
      return;
    }

    if (name === 'decimals' || name === 'min' || name === 'max') {
      this.#reformatAmount();
      this.#sync();
      return;
    }

    // Any of these change what the calendar panel should show next time it opens,
    // so refresh it in place rather than leaving stale state behind.
    if (name === 'range' || name === 'view' || name === 'locale' || name === 'first-day') {
      this.#closeCalendar();
      this.#syncCalendarConfig();
      this.#sync();
      return;
    }

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

    this.track(on(native, 'input', () => this.#onNativeInput()));
    this.track(on(native, 'change', () => this.#emitValue('ui4u:change')));

    if (this.#isDate) {
      // The panel is the only way in. Leaving the field free-hand would let a
      // half-typed date sit there with no way to show it as invalid.
      native.readOnly = true;
      native.classList.add('ui4u-input__native--pickable');
      native.setAttribute('aria-haspopup', 'dialog');
      native.setAttribute('aria-expanded', 'false');
      this.track(on(native, 'click', () => this.#openCalendar()));
      this.track(on(native, 'focus', () => this.#openCalendar()));
      this.track(
        on(native, 'keydown', (event) => {
          const key = /** @type {KeyboardEvent} */ (event).key;
          if (key === 'Enter' || key === ' ' || key === 'ArrowDown') {
            /** @type {KeyboardEvent} */ (event).preventDefault();
            this.#openCalendar();
          }
        })
      );
    }

    if (this.#isAmount) {
      // A mobile numeric keypad, without giving up the text entry the k/m/b
      // shortcuts need.
      native.inputMode = 'decimal';
      native.autocomplete ??= 'off';
    }

    // The author's own children are left exactly where they are — only the
    // generated nodes are added around them, so teardown is a plain removal.
    this.prepend(label, native);
    this.append(hint, error);

    this.#sync();
    this.#syncValue();
  }

  #teardown() {
    this.#closeCalendar();
    this.#calendar?.destroy();
    this.#calendar = null;

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

  /* ---------------------------------------------------------- amount mode */

  /**
   * Reformats an amount in place as it is typed.
   *
   * Only a *finished* number is rewritten. `12.` and `12,` are half-typed
   * decimals, and reformatting those would move the caret out from under the
   * user mid-number.
   */
  #reformatAmount() {
    const native = this.#native;
    if (!native) return;

    const parsed = parseAmount(native.value);
    if (parsed.value === null || !parsed.complete) return;

    const decimals = this.decimals ?? undefined;
    // Deliberately *not* clamped to `min`/`max`: silently rewriting what the
    // user typed would hide the reason it is out of range. `checkValidity()`
    // reports the bound instead.
    const formatted = formatAmount(parsed.value, {
      ...(decimals === undefined ? {} : { decimals }),
    });

    if (formatted === native.value) return;
    native.value = formatted;

    // "Keep typing where the user was" — the shortcut consumed a character, so
    // the caret would otherwise be left mid-number.
    const end = formatted.length;
    if (typeof native.setSelectionRange === 'function') {
      native.setSelectionRange(end, end);
    }
  }

  /** @param {'ui4u:input' | 'ui4u:change'} type */
  #onNativeInput(type = 'ui4u:input') {
    if (this.#isAmount) this.#reformatAmount();
    this.#emitValue(type);
  }

  /* ----------------------------------------------------------- date mode */

  #openCalendar() {
    const native = this.#native;
    if (!native || !this.#isDate || this.disabled) return;
    if (this.#calendar?.isOpen) return;

    if (!this.#calendar) {
      this.#calendar = new CalendarPanel({
        onSelect: (selection) => {
          const next = this.getBoolean('range', false)
            ? `${selection.from}/${selection.to}`
            : selection.from;
          this.value = next;
          this.#syncValue();
          this.emit('ui4u:change', {
            value: next,
            name: this.name,
            ...selection,
          });
        },
        onClose: () => this.#closeCalendar(),
      });
    }

    this.#syncCalendarConfig();

    this.#calendar.open(/** @type {HTMLElement} */ (native), (anchor, surface) =>
      position(anchor, surface, { placement: 'bottom', gap: 6 })
    );

    native.setAttribute('aria-expanded', 'true');

    // The panel lives on <body>, so the component no longer contains it and
    // cannot use focus events to notice a click elsewhere.
    const doc = native.ownerDocument;
    const view = doc.defaultView;

    /** @type {Array<() => void>} */
    const disposers = [
      on(doc, 'pointerdown', (event) => {
        const target = /** @type {Node|null} */ (event.target);
        if (target instanceof Node && !this.contains(target)) {
          if (this.#calendar?.element.contains(target)) return;
          this.#closeCalendar();
        }
      }),
      on(doc, 'keydown', (event) => {
        if (/** @type {KeyboardEvent} */ (event).key === 'Escape') this.#closeCalendar();
      }),
    ];

    if (view) {
      const reposition = () => {
        if (!this.#calendar?.isOpen) return;
        position(native, this.#calendar.element, { placement: 'bottom', gap: 6 });
      };
      disposers.push(on(view, 'scroll', reposition, true));
      disposers.push(on(view, 'resize', reposition));
    }

    this.#panelDisposers = disposers;
  }

  #closeCalendar() {
    for (const dispose of this.#panelDisposers) dispose();
    this.#panelDisposers = [];

    this.#calendar?.close();
    this.#native?.setAttribute('aria-expanded', 'false');
  }

  /** Pushes the current attributes into the panel, open or not. */
  #syncCalendarConfig() {
    const raw = this.getString('view', 'day');
    const view = raw === 'year' || raw === 'month' ? raw : 'day';

    const parsedFirst = Number.parseInt(this.getString('first-day', '1'), 10);
    // `0` is Sunday and is perfectly valid, so this cannot use `||` — that
    // would silently turn a Sunday-first calendar into a Monday-first one.
    const firstDayOfWeek = Number.isFinite(parsedFirst) ? parsedFirst : 1;

    this.#calendar?.setConfig({
      view,
      range: this.getBoolean('range', false),
      locale: this.locale,
      firstDayOfWeek,
      bounds: { min: this.getString('min', ''), max: this.getString('max', '') },
      value: this.getString('value', ''),
    });
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
    // A date field is read-only so the panel is the only way in; overwriting
    // that here would otherwise re-open the door to half-typed dates.
    native.readOnly = this.#isDate ? true : this.readonly;
    native.placeholder = this.#placeholderFor();
    native.name = this.name;
    native.autocomplete = this.autocomplete;

    // Assigning `type` resets a native value, so only touch it when it differs.
    // `amount` and `date` are driven here rather than by the browser, so the
    // control underneath stays a plain text field.
    const nativeType = this.#isAmount || this.#isDate ? 'text' : this.type;
    if (native.type !== nativeType) native.type = nativeType;

    this.dataset.size = this.size;
    this.dataset.mode = this.#isAmount ? 'amount' : this.#isDate ? 'date' : 'text';
  }

  /**
   * The placeholder to show.
   *
   * For a date field the format is a better hint than anything the author is
   * likely to invent, and a range needs to say it holds two dates.
   *
   * @returns {string}
   */
  #placeholderFor() {
    if (this.placeholder !== '') return this.placeholder;
    if (!this.#isDate) return '';

    const locale = this.locale;
    const sample = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
      fromISO('2026-08-14') ?? new Date(2026, 7, 14)
    );
    return this.getBoolean('range', false) ? `${sample} → ${sample}` : sample;
  }

  /** Applies the `value` attribute to the control, and only then. */
  #syncValue() {
    const native = this.#native;
    if (!native) return;

    const raw = this.getString('value', '');
    const next = this.#isDate ? this.#dateText(raw) : raw;
    if (native.value !== next) native.value = next;
  }

  /**
   * The human-readable text for an ISO date value.
   *
   * The attribute keeps the machine format and the field shows the local one,
   * so the value a consumer stores is never rewritten into a display string.
   *
   * @param {string} raw ISO date, or `from/to` in range mode
   * @returns {string}
   */
  #dateText(raw) {
    if (!raw) return '';

    const format = (iso) => {
      const date = fromISO(iso);
      if (!date) return '';
      return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium' }).format(date);
    };

    if (raw.includes('/')) {
      const [from = '', to = ''] = raw.split('/');
      return [format(from), format(to)].filter(Boolean).join(' → ');
    }

    return format(raw);
  }

  /**
   * @param {'ui4u:input' | 'ui4u:change'} type
   */
  #emitValue(type) {
    // An amount field reports the number alongside the text, so a consumer never
    // has to re-parse what the component already knows.
    this.emit(type, {
      value: this.value,
      name: this.name,
      ...(this.#isAmount ? { amount: this.amount } : {}),
      ...(this.#isDate ? { date: this.range } : {}),
    });
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
