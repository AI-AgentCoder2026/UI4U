import { UI4UElement } from '../../core/base.js';
import { el, on, setText, uid } from '../../core/dom.js';

/**
 * @typedef {object} RadioOptions
 * @property {string} [value] Submitted value of this option.
 * @property {string} [name] Form name; the group owns it and shares it.
 * @property {boolean} [checked] Whether this option starts selected.
 * @property {boolean} [disabled] Mirrors onto the native control.
 * @property {boolean} [required] The group must be answered to be valid.
 *
 * @typedef {object} RadioGroupOptions
 * @property {string} [label] Legend text — the group's accessible name.
 * @property {string} [name] Shared by every option, so they are one native group.
 * @property {string} [value] The selected option's value.
 * @property {string} [hint] Helper text, announced through `aria-describedby`.
 * @property {string} [error] Validation message; drives `aria-invalid`.
 * @property {boolean} [disabled] Disables every option at once.
 * @property {boolean} [required] An unanswered group is invalid.
 * @property {boolean} [srOnly] Hides the legend visually, keeping it for AT.
 * @property {Record<string, (detail: any, event: CustomEvent) => unknown>} [bindings]
 *   Semantic bindings, e.g. `{ change: ({ value }) => value !== 'enterprise' }`.
 *
 * @typedef {object} RadioValidityResult
 * @property {boolean} valid
 * @property {string} message empty when `valid`
 * @property {string} value the selected value, `''` when nothing is selected
 * @property {string} name
 */

/** Used when no platform `validationMessage` is available for the group. */
const GROUP_FALLBACK_MESSAGE = 'Please choose one of these options.';

/** Used when no platform `validationMessage` is available for a single option. */
const RADIO_FALLBACK_MESSAGE = 'Please select this option.';

/**
 * A single radio option wrapping — and keeping — a REAL `<input type="radio">`.
 *
 * Its text content is its visible label, so it reads as ordinary markup:
 *
 * ```html
 * <ui-radio value="pro">Pro</ui-radio>
 * ```
 *
 * Selection, the shared `name` and the keyboard model belong to `ui-radio-group`;
 * a radio on its own is just a control with a label.
 */
export class Radio extends UI4UElement {
  static get observedAttributes() {
    return ['value', 'name', 'checked', 'disabled', 'required'];
  }

  /** @type {HTMLElement|null} */
  #row = null;
  /** @type {HTMLInputElement|null} */
  #native = null;
  /**
   * The author's own child nodes, captured before the label is built so
   * teardown can put them back exactly where they were.
   * @type {Node[]}
   */
  #authored = [];
  /**
   * The group this option belongs to, captured at build time. `closest()` is
   * useless inside `onDisconnect` — the node is already detached by then — so
   * the group is told from here instead.
   * @type {HTMLElement|null}
   */
  #owner = null;
  #built = false;

  /* ------------------------------------------------------------------ api */

  /** @returns {string} */
  get value() {
    return this.getString('value', '');
  }

  set value(next) {
    this.#setTextAttribute('value', next);
  }

  /**
   * The effective name: this radio's own, or the group's. Sharing one name is
   * what makes the options a single native radio group.
   *
   * @returns {string}
   */
  get name() {
    return this.getString('name', '') || this.#group?.getAttribute('name') || '';
  }

  set name(next) {
    this.#setTextAttribute('name', next);
  }

  /**
   * The live state of the native control, so a user click is never clobbered.
   *
   * @returns {boolean}
   */
  get checked() {
    return this.#native ? this.#native.checked : this.getBoolean('checked', false);
  }

  set checked(next) {
    const value = Boolean(next);
    this.#setBooleanAttribute('checked', value);
    // Written unconditionally: the attribute is the authored initial value and
    // may already carry `value`, in which case no callback would fire and the
    // control would keep the previous selection.
    if (this.#native) this.#native.checked = value;
  }

  /** Effective state: this radio's own flag, or the group's. @returns {boolean} */
  get disabled() {
    return this.getBoolean('disabled', false) || this.#group?.hasAttribute('disabled') === true;
  }

  set disabled(next) {
    this.#setBooleanAttribute('disabled', next);
  }

  /** Effective state: this radio's own flag, or the group's. @returns {boolean} */
  get required() {
    return this.getBoolean('required', false) || this.#group?.hasAttribute('required') === true;
  }

  set required(next) {
    this.#setBooleanAttribute('required', next);
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
   * The enclosing group, or `null`. Read through `getAttribute`/`hasAttribute`
   * rather than through the group's properties, so a radio still resolves its
   * group correctly before the group's own definition has loaded.
   *
   * @returns {HTMLElement|null}
   */
  get group() {
    return this.#group;
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
   * Re-applies the effective state (own attributes plus the group's) onto the
   * native control and the ARIA. The group calls this whenever it re-syncs;
   * you rarely need to.
   *
   * @returns {this}
   */
  sync() {
    this.#sync();
    return this;
  }

  /**
   * An option is valid when it is selected, or when nothing requires it to be.
   * The group owns the real rule — this exists so a radio can be validated on
   * its own, for example inside a `ui-form` that lists fields by name.
   *
   * @returns {RadioValidityResult}
   *
   * @example
   * const { valid } = option.checkValidity();
   */
  checkValidity() {
    const value = this.value;
    const name = this.name;

    if (this.required && !this.checked) {
      const message = this.#native?.validationMessage || RADIO_FALLBACK_MESSAGE;
      return { valid: false, message, value, name };
    }

    return { valid: true, message: '', value, name };
  }

  /* ------------------------------------------------------------ lifecycle */

  onConnect() {
    this.#build();
    // The group may already be live (an element's `connectedCallback` runs
    // before its children's), so this is what lets it re-scan immediately.
    this.#owner?.refresh?.();
  }

  onDisconnect() {
    this.#teardown();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.#built) return;

    // `checked` is the one option that is applied only when it really changes —
    // re-applying it on every unrelated change would undo the user's selection.
    if (name === 'checked') this.#applyChecked();
    else this.#sync();
  }

  /* --------------------------------------------------------------- build */

  #build() {
    if (this.#built) return;

    const baseId = uid('ui4u-radio');
    const inputId = `${baseId}-input`;

    /** @type {HTMLElement} */
    const row = el('span', { class: 'ui4u-radio__row' });
    /** @type {HTMLInputElement} */
    const native = el('input', { class: 'ui4u-radio__native', id: inputId, type: 'radio' });
    // `for`, not nesting: the label holds the author's text only, so it can
    // never end up wrapping another control.
    /** @type {HTMLLabelElement} */
    const label = el('label', { class: 'ui4u-radio__label', for: inputId });

    this.#authored = [...this.childNodes];
    this.#row = row;
    this.#native = native;
    this.#owner = this.closest('ui-radio-group');
    this.#built = true;

    // The author's text becomes the label — moved, never cloned, so teardown
    // can hand it back untouched.
    label.append(...this.#authored);
    row.append(native, label);

    this.track(on(native, 'change', () => this.#onNativeChange()));

    this.prepend(row);

    this.#sync();
  }

  #teardown() {
    this.#row?.remove();

    // Restore the authored children in their original order. The row is already
    // detached, so only the author's own nodes are left to put back.
    this.replaceChildren(...this.#authored);

    this.#row = null;
    this.#native = null;
    this.#authored = [];
    this.#built = false;

    // An option leaving the group changes its tab stop and its checked value,
    // so the group re-scans — from its stored reference, because `closest()`
    // already returns `null` at this point.
    this.#owner?.refresh?.();
    this.#owner = null;
  }

  /* ----------------------------------------------------------- behaviour */

  #sync() {
    const native = this.#native;
    if (!native) return;

    native.name = this.name;
    native.value = this.value || 'on';
    native.disabled = this.disabled;
    native.required = this.required;
  }

  /** Applies the `checked` attribute to the control, and only then. */
  #applyChecked() {
    const native = this.#native;
    if (native) native.checked = this.getBoolean('checked', false);
  }

  #onNativeChange() {
    const detail = { value: this.value, name: this.name, checked: this.checked };

    // Inside a group the group owns the decision: `#select()` there runs the
    // binding and restores the selection, so running one here as well would
    // offer the same interaction twice and veto it twice.
    if (this.#group) {
      this.emit('ui4u:change', detail, {
        // Inside a group the group emits one bubbled `ui4u:change` of its own;
        // a second one from every option would double up for consumers.
        bubbles: false,
      });
      return;
    }

    // Standalone: the platform has already ticked the control, so a veto
    // unticks it rather than merely skipping the event.
    if (!this.runBinding('change', detail)) {
      if (this.#native) this.#native.checked = false;
      return;
    }

    this.emit('ui4u:change', detail, { bubbles: false });
  }

  /** @returns {HTMLElement|null} */
  get #group() {
    return this.closest('ui-radio-group');
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

/**
 * A group of radio options that owns the semantics: one shared `name`, one
 * selection, one legend, and a single tab stop with arrow-key navigation
 * inside.
 *
 * ```html
 * <ui-radio-group label="Plan" name="plan" value="pro">
 *   <ui-radio value="free">Free</ui-radio>
 *   <ui-radio value="pro">Pro</ui-radio>
 * </ui-radio-group>
 * ```
 *
 * The group renders a `<fieldset>` + `<legend>` around the authored options,
 * which is what gives the group its accessible name — and it marks the fieldset
 * `role="radiogroup"` so assistive technology reports one control rather than a
 * loose set of radios.
 *
 * Listens for `ui4u:change` — `detail: { value, name }`.
 *
 * Binds to `change` with the same name and detail, on the group and on a
 * standalone option alike. A binding that returns `false` puts the selection
 * back: the shared `name` has already unchecked the previous option by the time
 * any handler could run, so a veto restores that one rather than simply
 * skipping the event. The `value` attribute is what makes this possible — it
 * records the last committed selection, which is exactly the state to restore.
 *
 * @example
 * group.configure({ label: 'Plan', required: true, value: 'team' });
 * group.reportValidity();
 */
export class RadioGroup extends UI4UElement {
  static get observedAttributes() {
    return ['label', 'name', 'value', 'hint', 'error', 'disabled', 'required', 'sr-only'];
  }

  /** @type {HTMLFieldSetElement|null} */
  #fieldset = null;
  /** @type {HTMLLegendElement|null} */
  #legend = null;
  /** @type {HTMLElement|null} */
  #options = null;
  /** @type {HTMLElement|null} */
  #hint = null;
  /** @type {HTMLElement|null} */
  #error = null;
  /** @type {Radio[]} */
  #radios = [];
  /**
   * The author's own child nodes, captured before the fieldset is built so
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

  /** @returns {HTMLElement[]} the option elements, in document order */
  get radios() {
    return [...this.#radios];
  }

  /** @returns {string} the legend text — the group's accessible name */
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

  /** Hides the legend visually while keeping it in the accessibility tree. */
  get srOnly() {
    return this.getBoolean('sr-only', false);
  }

  set srOnly(next) {
    this.#setBooleanAttribute('sr-only', next);
  }

  /**
   * The selected option's value, or `''` when nothing is selected.
   *
   * @returns {string}
   */
  get value() {
    return this.#radios.find((radio) => radio.checked)?.value ?? '';
  }

  /**
   * Selects the option carrying `next`. An unknown value is ignored — a group
   * can never end up reporting a selection it does not have.
   *
   * @param {string} next
   */
  set value(next) {
    const wanted = next === null || next === undefined ? '' : String(next);
    const radio = this.#radios.find((option) => option.value === wanted);
    if (radio) radio.checked = true;
  }

  /**
   * The rendered fieldset, or `null` before the element has connected.
   *
   * @returns {HTMLFieldSetElement|null}
   */
  get fieldset() {
    return this.#fieldset;
  }

  /**
   * Applies options and returns `this`.
   *
   * Every option is optional and pass-through: an option left out keeps the
   * value it already has, so a picker can change one without resetting the rest.
   *
   * @param {RadioGroupOptions} [options]
   * @returns {this}
   *
   * @example
   * group.configure({ label: 'Plan', required: true, value: 'team' });
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
    if (bindings !== undefined) this.bindAll(bindings);

    return this;
  }

  /**
   * Moves focus to the group's single tab stop: the selected option, or the
   * first enabled one when nothing is selected.
   *
   * @param {FocusOptions} [options]
   * @returns {this}
   */
  focus(options) {
    this.#stop()?.focus(options);
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
   * The rule is evaluated here rather than delegated to the native radios:
   * `input.checkValidity()` reports validity per control, and hosts disagree
   * about whether an unchecked required radio in a group with no selection is
   * `valueMissing`. No rules engine — that is `ui-form`'s job.
   *
   * @returns {RadioValidityResult}
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

  /**
   * Re-collects the options and re-applies everything they derive from this
   * group: the shared `name`, the effective disabled/required state, and the
   * roving tab stop.
   *
   * `ui-radio` calls this for you from its own connect and disconnect hooks, so
   * options added or removed after load are handled; call it directly when you
   * move nodes around in a way the component cannot see.
   *
   * @returns {this}
   *
   * @example
   * group.append(document.createElement('ui-radio'));
   * group.refresh();
   */
  refresh() {
    if (!this.#built) return this;

    const options = this.#options;
    if (options) {
      // Anything appended straight to the host joins the list rather than
      // landing outside the fieldset.
      const strays = [...this.childNodes].filter((node) => node.localName === 'ui-radio');
      if (strays.length > 0) options.append(...strays);
      this.#radios = /** @type {Radio[]} */ (
        [...options.children].filter((node) => node.localName === 'ui-radio')
      );
    }

    for (const radio of this.#radios) {
      // Not every option has upgraded yet — an un-upgraded element has no sync.
      if (typeof radio.sync === 'function') radio.sync();
    }

    this.#syncTabIndex();
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

    const baseId = uid('ui4u-radio-group');
    /** @type {HTMLFieldSetElement} */
    const fieldset = el('fieldset', {
      class: 'ui4u-radio-group__field',
      // The fieldset already groups its contents; naming the role explicitly is
      // what tells assistive technology this is one set of options to answer,
      // not a loose collection of radios.
      role: 'radiogroup',
    });
    /** @type {HTMLLegendElement} */
    const legend = el('legend', { class: 'ui4u-radio-group__legend' });
    /** @type {HTMLElement} */
    const options = el('div', { class: 'ui4u-radio-group__options' });
    /** @type {HTMLElement} */
    const hint = el('p', { class: 'ui4u-radio-group__hint', id: `${baseId}-hint` });
    /** @type {HTMLElement} */
    const error = el('p', { class: 'ui4u-radio-group__error', id: `${baseId}-error` });

    this.#authored = [...this.childNodes];
    this.#fieldset = fieldset;
    this.#legend = legend;
    this.#options = options;
    this.#hint = hint;
    this.#error = error;
    this.#built = true;

    fieldset.append(legend, options, hint, error);
    options.append(...this.#authored.filter((node) => node.localName === 'ui-radio'));

    this.prepend(fieldset);

    this.track(on(fieldset, 'change', (event) => this.#onNativeChange(event)));
    this.track(on(fieldset, 'keydown', (event) => this.#onKeydown(event)));

    this.#sync();
    this.#applyValue();
  }

  #teardown() {
    this.#fieldset?.remove();

    // Put the author's children back in their original order. Everything the
    // component created — fieldset, legend, options, hint, error — went away
    // with the fieldset.
    this.replaceChildren(...this.#authored);

    this.#fieldset = null;
    this.#legend = null;
    this.#options = null;
    this.#hint = null;
    this.#error = null;
    this.#radios = [];
    this.#selfReported = false;
    this.#built = false;
  }

  /* ----------------------------------------------------------- behaviour */

  /** Mirrors the group's own options onto the legend, hint, error and ARIA. */
  #sync() {
    const fieldset = this.#fieldset;
    const legend = this.#legend;
    const hint = this.#hint;
    const error = this.#error;
    if (!fieldset || !legend || !hint || !error) return;

    const labelText = this.label;
    setText(legend, labelText);
    legend.hidden = labelText === '';
    legend.classList.toggle('ui4u-sr-only', this.srOnly);

    setText(hint, this.hint);
    hint.hidden = this.hint === '';

    // `setText`, never innerHTML — both may carry user data.
    const errorText = this.error;
    setText(error, errorText);
    error.hidden = errorText === '';

    const describedBy = [hint.hidden ? null : hint.id, error.hidden ? null : error.id]
      .filter(Boolean)
      .join(' ');
    if (describedBy) fieldset.setAttribute('aria-describedby', describedBy);
    else fieldset.removeAttribute('aria-describedby');

    if (errorText) fieldset.setAttribute('aria-invalid', 'true');
    else fieldset.removeAttribute('aria-invalid');

    if (this.required) fieldset.setAttribute('aria-required', 'true');
    else fieldset.removeAttribute('aria-required');

    // Every option derives `disabled`, `required` and `name` from the group, so
    // a refresh is what pushes this change into the native controls.
    this.refresh();
  }

  /** Applies the `value` attribute to the matching option. */
  #applyValue() {
    const wanted = this.getString('value', '');
    if (wanted === '') return;

    const radio = this.#radios.find((option) => option.value === wanted);
    if (!radio) return;

    radio.checked = true;
    // The authored selection is also the tab stop, from the very first render.
    this.#syncTabIndex();
  }

  /**
   * Roving tab stop: exactly one option is in the tab order — the selected one,
   * or the first enabled one when nothing is selected. Without this a group of
   * ten options would cost a keyboard user ten Tab presses to get past.
   *
   * @returns {Radio|null}
   */
  #stop() {
    const enabled = this.#radios.filter((radio) => !radio.disabled);
    const selected = enabled.find((radio) => radio.checked);
    return selected ?? enabled[0] ?? null;
  }

  #syncTabIndex() {
    const stop = this.#stop();

    for (const radio of this.#radios) {
      const native = radio.input;
      if (!native) continue;
      native.tabIndex = radio === stop ? 0 : -1;
    }
  }

  #onNativeChange(event) {
    const target = /** @type {Element|null} */ (event.target);
    const changed = this.#radios.find((radio) => radio.input === target);
    if (changed) this.#select(changed);
  }

  /**
   * The group owns selection: checking one option clears its siblings. The
   * shared `name` already does this natively; doing it explicitly as well keeps
   * the rule true for hosts that group radios more narrowly, and it is the one
   * path arrow-key navigation takes — which must report itself the same way a
   * click does.
   *
   * @param {Radio} selected
   */
  #select(selected) {
    // The last committed selection, read before anything changes. The shared
    // `name` has already applied mutual exclusion by the time this runs, so
    // this is the only record of what the group looked like a moment ago.
    const previous = this.getString('value', '');

    /*
     * Guarded before the group is re-tabbable and the attribute rewritten.
     *
     * A veto has to restore the previous selection rather than merely skip the
     * emit: the browser has already applied the group's mutual exclusion, so
     * "do nothing" would mean leaving the newly chosen option ticked. Re-ticking
     * the previous option is what puts the group back; when there was no
     * previous selection, unticking restores the empty state instead.
     */
    if (!this.runBinding('change', { value: selected.value, name: this.name })) {
      const restored = this.#radios.find((radio) => radio.value === previous);
      if (restored) restored.checked = true;
      else selected.checked = false;
      this.#syncTabIndex();
      return;
    }

    for (const radio of this.#radios) {
      if (radio !== selected && radio.checked) radio.checked = false;
    }

    this.#syncTabIndex();

    const next = this.value;
    if (this.getString('value', '') !== next) {
      this.#syncing = true;
      this.setAttribute('value', next);
      this.#syncing = false;
    }

    this.emit('ui4u:change', { value: next, name: this.name });
  }

  /**
   * The arrow-key model, straight from the ARIA authoring practices: a radio
   * group is ONE tab stop, and the arrow keys move *and* select inside it.
   *
   * `Tab` is deliberately absent from the switch and never prevented — it must
   * leave the group entirely, which is what the single tab stop makes possible.
   * Movement clamps at the ends rather than wrapping, so the key is swallowed
   * even when the clamped target is the current option: the platform's own
   * arrow handling would otherwise wrap around and move the selection.
   *
   * @param {KeyboardEvent} event
   */
  #onKeydown(event) {
    const radios = this.#radios;
    const current = radios.findIndex((radio) => radio.input === event.target);
    if (current === -1) return;

    const enabled = radios
      .map((radio, index) => ({ radio, index }))
      .filter(({ radio }) => !radio.disabled);
    if (enabled.length === 0) return;

    const position = enabled.findIndex(({ index }) => index === current);
    if (position === -1) return;

    /** @type {number|null} */
    let target = null;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        target = enabled[Math.min(position + 1, enabled.length - 1)].index;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        target = enabled[Math.max(position - 1, 0)].index;
        break;
      case 'Home':
        target = enabled[0].index;
        break;
      case 'End':
        target = enabled[enabled.length - 1].index;
        break;
      default:
        // Tab, Space, Enter and everything else are left to the platform.
        return;
    }

    // Prevented before the clamp check below, not after: Chromium's own radio
    // handling wraps around at the ends, so an unprevented key at the end of the
    // group would move the selection after all.
    event.preventDefault();

    if (target === current) return;

    const selected = radios[target];
    selected.checked = true;
    selected.focus();
    this.#select(selected);
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
