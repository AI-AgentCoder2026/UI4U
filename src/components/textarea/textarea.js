import { UI4UElement } from '../../core/base.js';
import { el, on, setText, uid } from '../../core/dom.js';

/**
 * @typedef {'sm' | 'md' | 'lg'} TextareaSize
 *
 * @typedef {object} TextareaOptions
 * @property {string} [label] Visible (or, with `sr-only`, spoken) label text.
 * @property {string} [name] Form name, also reported in every event detail.
 * @property {string} [placeholder]
 * @property {string} [value] Current value; also the authored initial value.
 * @property {number} [rows] Visible height, in lines. Default `3`.
 * @property {string} [hint] Helper text, announced through `aria-describedby`.
 * @property {string} [error] Validation message; drives `aria-invalid`.
 * @property {TextareaSize} [size] Control scale. Default `'md'`.
 * @property {boolean} [required] Marks the field required.
 * @property {boolean} [disabled] Mirrors onto the native control.
 * @property {boolean} [readonly] Mirrors onto the native control.
 * @property {boolean} [srOnly] Hides the label visually, keeping it announced.
 * @property {boolean} [grow] Expand to fit the content instead of scrolling.
 * @property {string} [autocomplete] Native autofill hint.
 * @property {Record<string, Function>} [bindings] Event handlers keyed by name
 *   (`input`, `change`). A handler receives `(detail, event)` and can veto the
 *   component's own behaviour by returning `false` or calling
 *   `event.preventDefault()`.
 *
 * @typedef {object} TextareaValidityResult
 * @property {boolean} valid
 * @property {string} message empty when `valid`
 * @property {string} value the value that was validated
 * @property {string} name
 */

// The default size, `md`, is absent from this list: an unknown value falls
// back to it rather than resolving to itself.
const SIZES = ['sm', 'lg'];

/** Used only when the platform gives us an empty `validationMessage`. */
const FALLBACK_MESSAGE = 'Please enter some text.';

/** How many lines the field shows when the author names none. */
const DEFAULT_ROWS = 3;

/**
 * Event name -> binding name. They differ only by the `ui4u:` prefix, which
 * `runBinding` would strip anyway; spelling both out keeps the call site from
 * passing a DOM event name where a binding name is expected.
 */
const BINDING_NAME = /** @type {const} */ ({
  'ui4u:input': 'input',
  'ui4u:change': 'change',
});

/**
 * A multiline field that wraps — and keeps — a REAL `<textarea>` in light DOM.
 * Never a `<div>` with `contenteditable`: native spellcheck, autocorrect, IME
 * composition, mobile keyboards, password managers and form submission all
 * depend on a genuine control, and the component never re-renders it from a
 * property.
 *
 * ```html
 * <ui-textarea label="Notes" rows="4" hint="Markdown is fine."></ui-textarea>
 * <ui-textarea label="Summary" required error="Say something."></ui-textarea>
 * ```
 *
 * Emits `ui4u:input` on every keystroke and `ui4u:change` **on commit** —
 * `detail: { value, name }` — where commit means the native `change` event (the
 * field losing focus after an edit) or <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> +
 * <kbd>Enter</kbd>.
 *
 * Bare <kbd>Enter</kbd> deliberately does *not* commit. In a single-line field
 * Enter means "done"; here it means a new line, and hijacking it would turn a
 * paragraph into a list of one-line fragments.
 */
export class Textarea extends UI4UElement {
  static get observedAttributes() {
    return [
      'label',
      'name',
      'placeholder',
      'value',
      'rows',
      'hint',
      'error',
      'size',
      'required',
      'disabled',
      'readonly',
      'sr-only',
      'grow',
      'autocomplete',
    ];
  }

  /** @type {HTMLLabelElement|null} */
  #label = null;
  /** @type {HTMLTextAreaElement|null} */
  #native = null;
  /** @type {HTMLElement|null} */
  #hint = null;
  /** @type {HTMLElement|null} */
  #error = null;
  /**
   * True while this component is writing `value` itself, so the attribute
   * callback does not echo the write back into the control. Without it,
   * clearing the value would wipe the text the reader is still typing.
   * @type {boolean}
   */
  #writing = false;
  /**
   * True while `error` holds a message this component produced during
   * `reportValidity()`, as opposed to one the author set.
   * @type {boolean}
   */
  #selfReported = false;
  /** True between the native control gaining and losing focus. @type {boolean} */
  #focused = false;
  /**
   * The height auto-grow last applied, kept here rather than read back off the
   * control: `offsetHeight` would force a synchronous reflow on every keystroke,
   * and a host that does not lay out at all (jsdom, SSR) reports 0 for it,
   * which would quietly turn "grow only" into "resize to whatever you just
   * typed".
   * @type {number}
   */
  #lastHeight = 0;
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

  /** @returns {string} */
  get autocomplete() {
    return this.getString('autocomplete', '');
  }

  set autocomplete(next) {
    this.#setTextAttribute('autocomplete', next);
  }

  /**
   * Visible height, in lines. Anything unparseable falls back to the default
   * rather than becoming `NaN` — the native `rows` property would then coerce
   * it to `0` and collapse the field to a sliver.
   *
   * @returns {number}
   */
  get rows() {
    const parsed = Number.parseInt(this.getString('rows', ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ROWS;
  }

  set rows(next) {
    this.#setTextAttribute('rows', next);
  }

  /** @returns {TextareaSize} */
  get size() {
    const value = this.getString('size', 'md');
    return SIZES.includes(value) ? /** @type {TextareaSize} */ (value) : 'md';
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

  /**
   * Expand the field to fit its content instead of scrolling inside it.
   *
   * Growing never changes the accessible value, only the rendered height, so
   * nothing is announced that the reader did not type. It is capped by
   * `--ui4u-textarea-grow-max`; past that the field scrolls as usual.
   *
   * @returns {boolean}
   */
  get grow() {
    return this.getBoolean('grow', false);
  }

  set grow(next) {
    this.#setBooleanAttribute('grow', next);
  }

  /**
   * The native control itself. `null` before the element has connected.
   *
   * @returns {HTMLTextAreaElement|null}
   */
  get textarea() {
    return this.#native;
  }

  /**
   * Applies options and returns `this`.
   *
   * Every option is optional and pass-through: an option left out keeps the
   * value it already has, so a picker can change one without resetting the rest.
   *
   * @param {TextareaOptions} [options]
   * @returns {this}
   *
   * @example
   * notes.configure({ rows: 8, hint: 'Markdown is fine.', grow: true });
   */
  configure(options = {}) {
    const {
      label,
      name,
      placeholder,
      value,
      rows,
      hint,
      error,
      size,
      required,
      disabled,
      readonly,
      srOnly,
      grow,
      autocomplete,
      bindings,
    } = options;

    if (label !== undefined) this.label = label;
    if (name !== undefined) this.name = name;
    if (placeholder !== undefined) this.placeholder = placeholder;
    if (value !== undefined) this.value = value;
    if (rows !== undefined) this.rows = rows;
    if (hint !== undefined) this.hint = hint;
    if (error !== undefined) this.error = error;
    if (size !== undefined) this.size = size;
    if (required !== undefined) this.required = required;
    if (disabled !== undefined) this.disabled = disabled;
    if (readonly !== undefined) this.readonly = readonly;
    if (srOnly !== undefined) this.srOnly = srOnly;
    if (grow !== undefined) this.grow = grow;
    if (autocomplete !== undefined) this.autocomplete = autocomplete;
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

  /** @returns {this} */
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
   * notes.addEventListener('ui4u:input', () => notes.clearValidity());
   */
  clearValidity() {
    this.#selfReported = false;
    if (this.hasAttribute('error')) this.removeAttribute('error');
    if (typeof this.#native?.setCustomValidity === 'function') this.#native.setCustomValidity('');
    return this;
  }

  /**
   * Validates through the native control — `required` plus whatever constraint
   * the browser carries — and reports an author-set `error` as invalid too.
   * No rules engine here: that is `ui-form`'s job.
   *
   * @returns {TextareaValidityResult}
   *
   * @example
   * const { valid, message } = notes.checkValidity();
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

    if (typeof native.checkValidity === 'function') {
      const valid = native.checkValidity();
      const message = valid ? '' : native.validationMessage || FALLBACK_MESSAGE;
      return { valid, message, value, name };
    }

    // Fallback for a host without constraint validation: `required` only.
    // Trimmed, because a paragraph of spaces is not an answer to "say
    // something" even though `required` alone would accept it.
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

    // `value` is the one option that must not be re-applied on every unrelated
    // change — it would overwrite what the user is currently typing.
    if (name === 'value') {
      // A write this component made is not a user edit; echoing it back would
      // clobber the text being typed.
      if (!this.#writing) this.#syncValue();
      return;
    }

    // A height change only matters to the auto-grow, and the label only to the
    // label — but re-laying out the whole field is cheap and keeps one path.
    this.#sync();
    if (name === 'grow') this.#resize();
  }

  /**
   * Writes the `value` attribute without echoing it into the control.
   *
   * @param {string|null|undefined} next
   * @returns {void}
   */
  #setValueSilently(next) {
    this.#writing = true;
    try {
      if (next === null || next === undefined || next === '') this.removeAttribute('value');
      else this.setAttribute('value', String(next));
    } finally {
      this.#writing = false;
    }
  }

  /* --------------------------------------------------------------- build */

  #build() {
    if (this.#built) return;

    const baseId = uid('ui4u-textarea');
    // Always generate a fresh id for the control. Reusing the host's id would
    // leave two elements sharing one id in the document, which is invalid HTML
    // and makes every `#id` selector ambiguous.
    const fieldId = `${baseId}-control`;

    /** @type {HTMLLabelElement} */
    const label = el('label', { class: 'ui4u-textarea__label', for: fieldId });
    /** @type {HTMLTextAreaElement} */
    const native = el('textarea', {
      class: 'ui4u-textarea__native',
      id: fieldId,
    });
    /** @type {HTMLElement} */
    const hint = el('p', { class: 'ui4u-textarea__hint', id: `${baseId}-hint` });
    /** @type {HTMLElement} */
    const error = el('p', { class: 'ui4u-textarea__error', id: `${baseId}-error` });

    this.#label = label;
    this.#native = native;
    this.#hint = hint;
    this.#error = error;
    this.#built = true;

    this.track(on(native, 'input', () => this.#onNativeInput()));
    /*
     * The native `change` event is the commit signal. A textarea fires it when
     * the field loses focus after an edit, and not at all for the keystrokes
     * in between — which is exactly the distinction this component needs, and
     * the reason it cannot simply forward every `input` as a change.
     */
    this.track(on(native, 'change', () => this.#commit()));

    this.track(
      on(native, 'keydown', (event) => {
        const key = /** @type {KeyboardEvent} */ (event).key;
        if (key !== 'Enter') return;
        // Bare Enter is a newline here, not a submit — see the class comment.
        if (
          !(/** @type {KeyboardEvent} */ (event).ctrlKey) &&
          !(/** @type {KeyboardEvent} */ (event).metaKey)
        ) {
          return;
        }
        // Committed from `keydown`, and that is the only place it can be: the
        // platform does not insert a newline for a modified Enter in a
        // textarea, so there is no following `input` event to hang the commit
        // on. Waiting for one would leave the flag armed and let the *next*
        // keystroke commit a value the reader had not finished.
        this.#commit();
      })
    );

    this.track(on(native, 'focus', () => (this.#focused = true)));
    this.track(
      on(native, 'blur', () => {
        this.#focused = false;
        // Losing focus is the one moment a shrinking field cannot disturb
        // anyone, so auto-grow is allowed to tighten back up here.
        this.#resize();
      })
    );

    // The author's own children are left exactly where they are — only the
    // generated nodes are added around them, so teardown is a plain removal.
    this.prepend(label, native);
    this.append(hint, error);

    this.#sync();
    this.#syncValue();
    this.#resize();
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
    this.#focused = false;
    this.#lastHeight = 0;
    this.#built = false;

    delete this.dataset.size;
  }

  /* ----------------------------------------------------------- behaviour */

  #onNativeInput() {
    // Auto-grow before the binding, so the height is right even for a reader
    // who then refuses the keystroke. It cannot change the value either way.
    this.#resize();

    if (!this.runBinding(BINDING_NAME['ui4u:input'], { value: this.value, name: this.name }))
      return;
    this.emit('ui4u:input', { value: this.value, name: this.name });
  }

  /**
   * The reader has finished with this value: reflect it onto the attribute and
   * announce it. A veto leaves both alone, so the committed text is exactly
   * what is on screen and what a consumer reading `value` sees.
   *
   * @returns {void}
   */
  #commit() {
    if (!this.runBinding(BINDING_NAME['ui4u:change'], { value: this.value, name: this.name })) {
      return;
    }

    this.#setValueSilently(this.value);
    this.emit('ui4u:change', { value: this.value, name: this.name });
  }

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
    native.rows = this.rows;

    this.dataset.size = this.size;
    if (this.grow) this.dataset.grow = '';
    else delete this.dataset.grow;
  }

  /** Applies the `value` attribute to the control, and only then. */
  #syncValue() {
    const native = this.#native;
    if (!native) return;

    const next = this.getString('value', '');
    if (native.value !== next) native.value = next;
    this.#resize();
  }

  /**
   * Auto-grow: match the height to the content.
   *
   * While the field has focus it only ever grows. Shrinking under a reader who
   * is mid-sentence moves the content they are typing after every deletion and
   * re-focus — the exact "it fights me" feeling auto-grow earns its bad name
   * for. On blur it tightens back down.
   *
   * The `height: auto` dance is required: reading `scrollHeight` of a sized
   * element reports the box, not the content, so the old height has to go
   * before the new one can be measured.
   *
   * @returns {void}
   */
  #resize() {
    const native = this.#native;
    if (!native) return;

    // Turning `grow` off has to release the height it took, or the field stays
    // pinned at whatever it last measured.
    if (!this.grow) {
      this.#lastHeight = 0;
      native.style.height = '';
      return;
    }

    native.style.height = 'auto';
    const needed = native.scrollHeight;
    native.style.height = '';

    // A host that does not lay out (jsdom, SSR) measures zero. Setting
    // `height: 0px` there would collapse a perfectly good field, so an
    // unmeasurable field is simply left at whatever CSS gives it.
    if (!Number.isFinite(needed) || needed <= 0) return;

    const next = this.#focused && this.#lastHeight > needed ? this.#lastHeight : needed;
    native.style.height = `${next}px`;
    this.#lastHeight = next;
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
