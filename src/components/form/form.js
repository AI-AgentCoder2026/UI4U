import { UI4UElement } from '../../core/base.js';
import { append, clear, delegate, el, on, setText, uid } from '../../core/dom.js';

/**
 * @typedef {'submit' | 'change' | 'blur'} ValidateOn
 *
 * @typedef {object} FormError
 * @property {string} name the field's `name`
 * @property {string} message the message the field reported
 * @property {HTMLElement} field the failing field element
 *
 * @typedef {object} FormValidityResult
 * @property {boolean} valid
 * @property {FormError[]} errors empty when `valid`
 *
 * @typedef {object} FormOptions
 * @property {ValidateOn} [validateOn] When fields are re-checked. Default `'submit'`.
 * @property {boolean} [noValidate] Submit without validating. Default `false`.
 * @property {Record<string, (detail: any, event: CustomEvent) => unknown>} [bindings]
 *   Semantic bindings, e.g. `{ submit: ({ values }) => values.email !== '' }`.
 */

// The default, `submit`, is absent: an unknown value falls back to it.
const VALIDATE_ON = ['change', 'blur'];

/** Used only when a field reports an invalid state with no message at all. */
const FALLBACK_MESSAGE = 'This field needs your attention.';

const SUMMARY_TITLE_ONE = 'There is a problem with this form';
const SUMMARY_TITLE_MANY = 'There are {count} problems with this form';

/**
 * Every control `ui-form` knows how to validate.
 *
 * `ui-radio` is deliberately absent: it is validated through its
 * `ui-radio-group`, which is the element that carries the `name`. Everything
 * listed here has to satisfy the same contract — `checkValidity()` returning
 * `{ valid, message, value, name }` and a `clearValidity()` — so this list is
 * the form's real definition of "a field".
 */
const FIELD_SELECTOR = 'ui-input, ui-textarea, ui-checkbox, ui-radio-group, ui-dropdown';

/**
 * A validating form wrapper around a REAL `<form>`. It discovers its descendant
 * field elements by `name` — `ui-input`, `ui-textarea`, `ui-checkbox`,
 * `ui-radio-group` and `ui-dropdown` — checks them through their own
 * `checkValidity()`, and refuses to submit while anything is invalid.
 *
 * ```html
 * <ui-form validate-on="submit">
 *   <ui-input name="email" label="Email" type="email" required></ui-input>
 *   <ui-button type="submit">Save</ui-button>
 * </ui-form>
 * ```
 *
 * Emits `ui4u:submit` — `detail: { values, event }` — only when valid, and
 * `ui4u:invalid` — `detail: { errors, values, event }` — when a submit is
 * blocked. `event` is the native `submit` event, so a consumer can still call
 * `preventDefault()` on it to keep the page from navigating.
 *
 * The native `<form>` always carries `novalidate`: the browser's own
 * constraint-validation bubble would pre-empt the submit event entirely, and
 * this component reports every failure itself — accessibly, with focus moved to
 * the first bad field.
 *
 * Binds to `submit` — `detail: { values, event }`, the same payload the event
 * carries. A binding that returns `false` takes the submit over: the native
 * event is prevented, and no validation, error marking, summary or `ui4u:submit`
 * happens. There is no `invalid` binding — by the time the form reports a
 * blocked submit it has already marked the fields and moved focus, and undoing
 * that afterwards would only leave the page describing failures that are no
 * longer there.
 */
export class Form extends UI4UElement {
  static get observedAttributes() {
    return ['validate-on', 'no-validate'];
  }

  /** @type {HTMLFormElement|null} */
  #native = null;
  /** @type {HTMLElement|null} */
  #summary = null;
  /** @type {HTMLElement|null} */
  #summaryTitle = null;
  /** @type {HTMLElement|null} */
  #summaryList = null;
  /** @type {Node[]} the author's children, moved into the native form */
  #stash = [];
  /** Fields this form has marked, so its own errors never mask a fix. */
  #marked = new WeakSet();
  /**
   * Field state as authored, so `reset()` restores rather than blanks.
   *
   * @type {Map<HTMLElement, { value?: string, checked?: boolean }>}
   */
  #authored = new Map();
  #built = false;
  /** True once a submit has been attempted, so the summary can go live. */
  #submitted = false;

  /* ------------------------------------------------------------------ api */

  /** @returns {ValidateOn} */
  get validateOn() {
    const value = this.getString('validate-on', 'submit');
    return VALIDATE_ON.includes(value) ? /** @type {ValidateOn} */ (value) : 'submit';
  }

  set validateOn(next) {
    if (next === null || next === undefined || next === '') this.removeAttribute('validate-on');
    else this.setAttribute('validate-on', String(next));
  }

  /**
   * Skips validation entirely and lets the form submit, matching the meaning of
   * the native `novalidate` attribute. The fields keep their own state; the
   * form simply stops blocking.
   *
   * @returns {boolean}
   */
  get noValidate() {
    return this.getBoolean('no-validate', false);
  }

  set noValidate(next) {
    if (next) this.setAttribute('no-validate', '');
    else this.removeAttribute('no-validate');
  }

  /**
   * The fields this form validates: descendant field elements that carry a
   * `name` and belong to this form rather than to a nested one.
   *
   * Every one of these exposes the same
   * `{ valid, message, value, name }` contract from `checkValidity()`, which is
   * what lets one selector cover all of them. A bare `ui-radio` is skipped: its
   * group owns validation, and counting both would report the same problem
   * twice.
   *
   * @returns {HTMLElement[]}
   */
  get fields() {
    return /** @type {HTMLElement[]} */ (
      [...this.querySelectorAll(FIELD_SELECTOR)].filter(
        (field) => field.hasAttribute('name') && field.closest('ui-form') === this
      )
    );
  }

  /**
   * Current field values by `name`, in document order. Values are read live
   * from the native controls, so a user typing is never clobbered.
   *
   * An `amount` field reports a **number**, not the text behind it: a consumer
   * that collects `"45,000"` from a field typed as `45k` has been handed a string
   * it now has to parse back out, and `parseFloat('45,000')` is `45`. Every
   * other field keeps its string. A field with no value yet reports `''`, which
   * is what every other empty field reports.
   *
   * @returns {Record<string, string|number>}
   */
  get values() {
    /** @type {Record<string, string|number>} */
    const values = {};
    for (const field of this.fields) {
      // `numberValue` is a getter, not a method, so `in` is what tests for it —
      // `typeof` would report the parsed number and never fire.
      const parsed = 'numberValue' in field ? /** @type {any} */ (field).numberValue : null;
      values[field.getAttribute('name')] = parsed !== null ? parsed : (field.value ?? '');
    }
    return values;
  }

  /**
   * The native `<form>` the component renders. `null` before it has connected.
   *
   * @returns {HTMLFormElement|null}
   */
  get form() {
    return this.#native;
  }

  /**
   * Applies options and returns `this`.
   *
   * Every option is optional and pass-through: an option left out keeps the
   * value it already has.
   *
   * @param {FormOptions} [options]
   * @returns {this}
   *
   * @example
   * form.configure({ validateOn: 'change', noValidate: false });
   */
  configure(options = {}) {
    const { validateOn, noValidate, bindings } = options;

    if (validateOn !== undefined) this.validateOn = validateOn;
    if (noValidate !== undefined) this.noValidate = noValidate;
    if (bindings !== undefined) this.bindAll(bindings);

    return this;
  }

  /**
   * Checks every named field, marks the failing ones with their message, keeps
   * the summary in sync, and reports the outcome.
   *
   * Fields that now pass have their stale `error` cleared.
   *
   * @returns {FormValidityResult}
   *
   * @example
   * const { valid, errors } = form.validate();
   */
  validate() {
    /** @type {FormError[]} */
    const errors = [];

    for (const field of this.fields) {
      // `ui-input.checkValidity()` reports an author-set `error` as invalid, so
      // an error this form wrote itself has to come off before the field can be
      // re-checked — otherwise a fixed field would look broken forever.
      if (this.#marked.has(field) && typeof field.clearValidity === 'function') {
        field.clearValidity();
      }

      const result = field.checkValidity();

      if (result.valid) {
        this.#marked.delete(field);
        if (typeof field.clearValidity === 'function') field.clearValidity();
        continue;
      }

      const message = result.message || FALLBACK_MESSAGE;
      field.error = message;
      this.#marked.add(field);
      errors.push({ name: field.getAttribute('name'), message, field });
    }

    this.#renderSummary(errors);
    return { valid: errors.length === 0, errors };
  }

  /**
   * Drops every error this form reported and hides the summary. Fields are not
   * touched otherwise.
   *
   * @returns {this}
   *
   * @example
   * form.resetValidity();
   */
  resetValidity() {
    for (const field of this.fields) {
      if (typeof field.clearValidity === 'function') field.clearValidity();
    }

    this.#marked = new WeakSet();
    this.#renderSummary([]);
    this.#submitted = false;
    return this;
  }

  /**
   * Returns every field to the value it was authored with, and drops the error
   * state.
   *
   * Restoring rather than blanking, because that is what the platform means by
   * a reset: a form opened on an existing record should come back with the
   * record on it, not empty. `<button type="reset">` inside the form does the
   * same thing — the native `reset` event is intercepted rather than left to
   * reset the inner `<input>`s only, which would leave every custom element
   * still showing what the user typed.
   *
   * @returns {this}
   *
   * @example
   * form.reset(); // back to the authored values, no error state
   */
  reset() {
    for (const field of this.fields) {
      const authored = this.#authored.get(field);
      if (!authored) continue;

      if (authored.checked !== undefined && 'checked' in field) {
        /** @type {any} */ (field).checked = authored.checked;
      } else if ('value' in field) {
        /** @type {any} */ (field).value = authored.value;
      }
    }

    return this.resetValidity();
  }

  /* ------------------------------------------------------------ lifecycle */

  onConnect() {
    this.#build();
  }

  onDisconnect() {
    this.#teardown();
  }

  attributeChangedCallback(_name, _oldValue, _newValue) {
    if (this.#built) this.#sync();
  }

  /* --------------------------------------------------------------- build */

  #build() {
    if (this.#built) return;

    /** @type {HTMLElement} */
    const summary = el('div', {
      class: 'ui4u-form__summary',
      role: 'alert',
      id: uid('ui4u-form-summary'),
      hidden: true,
    });
    /** @type {HTMLElement} */
    const title = el('p', { class: 'ui4u-form__summary-title' });
    /** @type {HTMLElement} */
    const list = el('ul', { class: 'ui4u-form__summary-list' });
    /** @type {HTMLFormElement} */
    // `noValidate` is deliberate: UI4U reports the failures itself, so the
    // browser must not swallow the submit event with its own bubble first.
    const native = el('form', { class: 'ui4u-form__native', noValidate: true });

    append(summary, [title, list]);

    this.#summary = summary;
    this.#summaryTitle = title;
    this.#summaryList = list;
    this.#native = native;
    this.#built = true;

    this.track(on(this, 'submit', (event) => this.#onSubmit(/** @type {Event} */ (event))));
    /*
     * A `<button type="reset">` is the platform's own way to ask for this. The
     * native `reset` would restore the inner `<input>` elements and leave every
     * custom element still showing what was typed, so the component answers it
     * instead and tells the platform no.
     */
    this.track(
      on(native, 'reset', (event) => {
        event.preventDefault();
        this.reset();
      })
    );
    this.track(
      on(this, 'ui4u:change', () => {
        if (this.validateOn === 'change') this.#revalidate();
      })
    );

    /*
     * Once a submit has been blocked, corrections should clear their own
     * errors as they are made. Without this the summary keeps listing
     * failures the user has already fixed, which reads as the form ignoring
     * them. Before any attempt the form stays quiet, matching validateOn.
     */
    this.track(
      on(this, 'ui4u:input', () => {
        if (this.#submitted) this.#revalidate();
      })
    );
    this.track(on(this, 'focusout', (event) => this.#onFocusOut(event)));

    // Every entry jumps straight to its field, which is the whole point of the
    // summary for anyone navigating by keyboard or by screen reader.
    this.track(
      delegate(summary, 'click', '[data-field]', (_event, matched) => {
        const name = matched.getAttribute('data-field');
        const field = this.fields.find((candidate) => candidate.getAttribute('name') === name);
        this.#focusField(field);
      })
    );

    // The author's children are moved into the native form and put back on
    // disconnect, so the markup they wrote is exactly where they left it.
    const children = [...this.childNodes];
    this.#stash = children;
    append(native, [summary, ...children]);
    this.append(native);

    // Captured once the children are live and upgraded, so `reset()` restores
    // what was authored rather than what the browser guessed.
    for (const field of this.fields) {
      this.#authored.set(
        field,
        'checked' in field
          ? { checked: /** @type {any} */ (field).checked }
          : { value: field.value ?? '' }
      );
    }

    this.#sync();
  }

  #teardown() {
    // Restored through a fragment so the author children keep their original
    // order — inserting each one before `firstChild` would reverse them.
    const restored = document.createDocumentFragment();
    append(restored, this.#stash);
    this.insertBefore(restored, this.firstChild);

    this.#stash = [];
    this.#native?.remove();
    this.#summary = null;
    this.#summaryTitle = null;
    this.#summaryList = null;
    this.#native = null;
    this.#built = false;
    this.#submitted = false;
    this.#authored = new Map();

    delete this.dataset.validateOn;
  }

  /* ----------------------------------------------------------- behaviour */

  /** @param {SubmitEvent|Event} event */
  #onSubmit(event) {
    /*
     * Guarded at the very top, before a field has been looked at. A binding
     * that takes the submit over means the component does nothing at all — no
     * validation pass, no errors, no summary, no focus move — and the browser
     * is told no as well, because nothing was ever going to handle this.
     */
    if (!this.runBinding('submit', { values: this.values, event })) {
      event.preventDefault();
      return;
    }

    if (this.noValidate) {
      this.emit('ui4u:submit', { values: this.values, event, validated: false });
      return;
    }

    const { valid, errors } = this.validate();
    this.#submitted = true;

    if (valid) {
      this.emit('ui4u:submit', { values: this.values, event, validated: true });
      return;
    }

    // The browser is told no; nothing invalid ever leaves through the platform.
    event.preventDefault();
    // Reported, not guarded: the fields are already marked and the summary is
    // already rendered, so there is no un-marking a veto could stand behind.
    this.emit('ui4u:invalid', { errors, values: this.values, event });
    this.#focusFirst(errors);
  }

  /** Re-checks on `change` / `blur`, keeping the summary quiet until a submit. */
  #revalidate() {
    const { valid } = this.validate();
    if (!valid && !this.#submitted) this.#renderSummary([]);
  }

  /** @param {Event} event */
  #onFocusOut(event) {
    if (this.validateOn !== 'blur') return;

    const target = /** @type {Element|null} */ (event.target);
    if (!target || typeof target.matches !== 'function') return;
    if (!target.matches('input, select, textarea')) return;

    this.#revalidate();
  }

  /** @param {FormError[]} errors */
  #focusFirst(errors) {
    this.#focusField(errors[0]?.field);
  }

  /** @param {HTMLElement|undefined} field */
  #focusField(field) {
    if (!field) return;
    if (typeof field.focus === 'function') field.focus();
    else field.querySelector('input, select, textarea')?.focus();
  }

  /**
   * Renders the `role="alert"` summary, or hides it when there is nothing to
   * report. Messages are written as text, never markup.
   *
   * @param {FormError[]} errors
   */
  #renderSummary(errors) {
    const summary = this.#summary;
    const title = this.#summaryTitle;
    const list = this.#summaryList;
    if (!summary || !title || !list) return;

    clear(list);

    if (errors.length === 0) {
      setText(title, '');
      summary.hidden = true;
      return;
    }

    setText(
      title,
      errors.length === 1
        ? SUMMARY_TITLE_ONE
        : SUMMARY_TITLE_MANY.replace('{count}', String(errors.length))
    );

    for (const error of errors) {
      /** @type {HTMLLIElement} */
      const item = el('li', { class: 'ui4u-form__summary-item' });
      /** @type {HTMLButtonElement} */
      const link = el('button', {
        class: 'ui4u-form__summary-link',
        type: 'button',
        'data-field': error.name,
      });

      const control =
        error.field.querySelector('.ui4u-input__native') ??
        error.field.querySelector('input, select, textarea');
      if (control?.id) link.setAttribute('aria-controls', control.id);

      const label = error.field.getAttribute('label') || error.name;
      setText(link, `${label}: ${error.message}`);

      append(item, link);
      append(list, item);
    }

    summary.hidden = false;
  }

  /** @returns {void} */
  #sync() {
    this.dataset.validateOn = this.validateOn;
  }
}
