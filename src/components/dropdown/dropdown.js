import { UI4UElement } from '../../core/base.js';
import { el, append, on, setText, uid } from '../../core/dom.js';
import { position } from '../../core/position.js';

/**
 * @typedef {object} DropdownOptionInfo
 * @property {string} value the committed value of the option
 * @property {string} label the option's text content, trimmed
 * @property {boolean} disabled
 * @property {boolean} selected
 *
 * @typedef {object} DropdownOptions
 * @property {string} [label] Visible (or, with `sr-only`, spoken) label text.
 * @property {string} [name] Form name, also reported in every event detail.
 * @property {string|string[]} [value] Selected value, or every selected value
 *   when `multiple` is set.
 * @property {string} [placeholder] Shown on the trigger while nothing is chosen.
 * @property {string} [hint] Helper text, announced through `aria-describedby`.
 * @property {string} [error] Validation message; drives `aria-invalid`.
 * @property {boolean} [disabled]
 * @property {boolean} [required]
 * @property {boolean} [multiple] Allow more than one option to be selected.
 * @property {boolean} [open] Whether the list starts open.
 * @property {boolean} [srOnly] Hides the label visually, keeping it for AT.
 * @property {Record<string, (detail: any, event: CustomEvent) => unknown>} [bindings]
 *   Semantic bindings, e.g. `{ change: ({ value }) => value !== 'my' }`.
 *
 * @typedef {object} DropdownValidityResult
 * @property {boolean} valid
 * @property {string} message empty when `valid`
 * @property {string|string[]} value the value that was validated
 * @property {string} name
 */

/** Tag name of an authored option element. */
const OPTION_TAG = 'ui-dropdown-option';

/** Used when the component has to phrase the `required` failure itself. */
const FALLBACK_MESSAGE = 'Please choose an option.';

/** How long a type-ahead buffer keeps collecting characters. */
const TYPEAHEAD_RESET_MS = 600;

/**
 * Last-resort accessible name for a trigger with no label, no placeholder and
 * no selection — an unnamed button is announced as just "button".
 */
const NAME_FALLBACK = 'Select an option';

/**
 * A single option, authored in light DOM:
 *
 * ```html
 * <ui-dropdown-option value="my">Malaysia</ui-dropdown-option>
 * ```
 *
 * `ui-dropdown` owns every role, `aria-*` attribute and the option's position
 * while the list is open — they are set and removed by the parent, never here.
 */
export class DropdownOption extends UI4UElement {}

/**
 * A custom listbox: a real `<button>` trigger plus a portalled panel of options.
 *
 * ```html
 * <ui-dropdown label="Country" name="country" placeholder="Choose a country" required>
 *   <ui-dropdown-option value="my">Malaysia</ui-dropdown-option>
 *   <ui-dropdown-option value="sg">Singapore</ui-dropdown-option>
 *   <ui-dropdown-option value="th" disabled>Thailand (fully booked)</ui-dropdown-option>
 * </ui-dropdown>
 * ```
 *
 * Keyboard model — the **select-only combobox** pattern: focus never leaves the
 * trigger, and `aria-activedescendant` names the option the user is on. That is
 * what keeps the portalled panel usable: a focus trap would fight the fact that
 * the panel is not a descendant of the trigger.
 *
 * - closed: <kbd>Enter</kbd>/<kbd>Space</kbd>/<kbd>↓</kbd>/<kbd>↑</kbd> open,
 *   <kbd>Home</kbd>/<kbd>End</kbd> open onto the first/last option, typing jumps
 *   to a matching label, <kbd>Tab</kbd> moves on
 * - open: <kbd>↑</kbd>/<kbd>↓</kbd> move, <kbd>Home</kbd>/<kbd>End</kbd> jump,
 *   <kbd>Enter</kbd> commits and closes, <kbd>Space</kbd> commits — or, with
 *   `multiple`, toggles and stays open — <kbd>Esc</kbd> closes and returns focus
 *   to the trigger
 *
 * Listens for `ui4u:open` and `ui4u:close`, plus `ui4u:change` —
 * `detail: { value, name, option }` — on every commit.
 *
 * Binds to `open`, `close` and `change` with the same names and details. A
 * binding that returns `false` stops the commit entirely: a vetoed `change`
 * leaves the previous selection — and the list, open or closed, exactly as it
 * was — untouched, whatever the commit came from. All three commit paths
 * (click, <kbd>Enter</kbd>/<kbd>Space</kbd>, <kbd>Ctrl</kbd>+<kbd>Arrow</kbd>)
 * share one guarded step rather than three copies of the check.
 *
 * Setting the `open` attribute or the `value` yourself bypasses `open`/`close`
 * and the commit path respectively: that is authored state, already decided by
 * the time any handler could see it.
 */
export class Dropdown extends UI4UElement {
  static get observedAttributes() {
    return [
      'label',
      'name',
      'value',
      'placeholder',
      'hint',
      'error',
      'disabled',
      'required',
      'multiple',
      'open',
      'sr-only',
    ];
  }

  /** @type {HTMLLabelElement|null} */
  #label = null;
  /** @type {HTMLButtonElement|null} */
  #trigger = null;
  /** @type {HTMLElement|null} */
  #valueSpan = null;
  /** @type {HTMLElement|null} */
  #hint = null;
  /** @type {HTMLElement|null} */
  #error = null;
  /** The portalled listbox, or `null` while closed. @type {HTMLElement|null} */
  #panel = null;
  /** The author's option elements, wherever they currently live. @type {HTMLElement[]} */
  #optionEls = [];
  /** @type {Set<string>} */
  #selection = new Set();
  #activeIndex = -1;
  #baseId = '';
  #built = false;
  /**
   * True while `error` holds a message this component produced during
   * `reportValidity()`, as opposed to one the author set.
   * @type {boolean}
   */
  #selfReported = false;
  /** Listeners that exist only while the panel is open. @type {Array<() => void>} */
  #closeDisposers = [];
  #typeahead = '';
  /** @type {ReturnType<typeof setTimeout>|null} */
  #typeaheadTimer = null;

  /* ------------------------------------------------------------------ api */

  /**
   * Whether the list is open.
   *
   * The `open` **attribute** and `configure({ open })` both read and write this
   * state; the imperative form is `open()` / `close()` / `toggle()`, because a
   * boolean getter and a method cannot share the name `open`.
   *
   * @returns {boolean}
   */
  get isOpen() {
    return this.hasAttribute('open');
  }

  set isOpen(next) {
    if (next) this.open();
    else this.close();
  }

  /**
   * Every authored option, in document order.
   *
   * @returns {DropdownOptionInfo[]}
   *
   * @example
   * console.log(field.options.map((option) => option.value));
   */
  get options() {
    return this.#optionEls.map((option) => ({
      value: this.#valueOf(option),
      label: this.#labelOf(option),
      disabled: this.#isDisabled(option),
      selected: this.#selection.has(this.#valueOf(option)),
    }));
  }

  /** @returns {boolean} */
  get multiple() {
    return this.getBoolean('multiple', false);
  }

  set multiple(next) {
    this.#setBooleanAttribute('multiple', next);
  }

  /**
   * The committed value — a string normally, an array of every selected value
   * when `multiple` is set.
   *
   * @returns {string|string[]}
   */
  get value() {
    if (!this.#built) {
      // Before the first build the attribute is the only thing that exists.
      const raw = this.getString('value', '');
      return this.multiple
        ? raw
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
        : raw;
    }

    const chosen = [...this.#selection];
    return this.multiple ? chosen : (chosen[0] ?? '');
  }

  set value(next) {
    const wanted = Array.isArray(next)
      ? next.map((part) => String(part))
      : next === null || next === undefined || next === ''
        ? []
        : [String(next)];

    // The runtime set is the source of truth; the attribute mirrors it so the
    // state survives serialisation and is readable in devtools.
    this.#selection = new Set(wanted);
    this.#setTextAttribute('value', wanted.join(','));
    this.#syncSelection();
  }

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
   * The real trigger button, or `null` before the element has connected.
   *
   * @returns {HTMLButtonElement|null}
   */
  get trigger() {
    return this.#trigger;
  }

  /**
   * The portalled listbox panel, or `null` while closed.
   *
   * @returns {HTMLElement|null}
   */
  get panel() {
    return this.#panel;
  }

  /**
   * Applies options and returns `this`.
   *
   * Every option is optional and pass-through: an option left out keeps the
   * value it already has, so a picker can change one without resetting the rest.
   *
   * @param {DropdownOptions} [options]
   * @returns {this}
   *
   * @example
   * field.configure({ label: 'Country', required: true, placeholder: 'Pick one' });
   */
  configure(options = {}) {
    const {
      label,
      name,
      value,
      placeholder,
      hint,
      error,
      disabled,
      required,
      multiple,
      open,
      srOnly,
      bindings,
    } = options;

    if (label !== undefined) this.label = label;
    if (name !== undefined) this.name = name;
    if (value !== undefined) this.value = value;
    if (placeholder !== undefined) this.placeholder = placeholder;
    if (hint !== undefined) this.hint = hint;
    if (error !== undefined) this.error = error;
    if (disabled !== undefined) this.disabled = disabled;
    if (required !== undefined) this.required = required;
    if (multiple !== undefined) this.multiple = multiple;
    if (srOnly !== undefined) this.srOnly = srOnly;
    if (open !== undefined) this.isOpen = open;
    if (bindings !== undefined) this.bindAll(bindings);

    return this;
  }

  /**
   * Opens the list and marks the selected option — or the first enabled one —
   * as the active option.
   *
   * @returns {this}
   *
   * @example
   * field.open();
   */
  open() {
    if (this.isOpen) return this;
    // Guarded before the attribute, so a veto never builds the panel. Setting
    // the attribute directly is the unguarded route, and deliberately so.
    if (!this.runBinding('open', { name: this.name })) return this;

    this.setAttribute('open', '');
    return this;
  }

  /**
   * Closes the list and returns the author's options to the host.
   *
   * @returns {this}
   */
  close() {
    if (!this.isOpen) return this;
    // Guarded before the attribute: the panel stays up and the options stay in
    // it, which is what "leave this open" has to mean.
    if (!this.runBinding('close', { name: this.name })) return this;

    this.removeAttribute('open');
    return this;
  }

  /**
   * Opens when closed, closes when open.
   *
   * @returns {this}
   */
  toggle() {
    return this.isOpen ? this.close() : this.open();
  }

  /**
   * Moves focus to the trigger. Focus never moves into the panel, so this is
   * also how focus is brought back after a keyboard close.
   *
   * @param {FocusOptions} [options]
   * @returns {this}
   */
  focus(options) {
    this.#trigger?.focus(options);
    return this;
  }

  /**
   * Drops the `error` state, without validating.
   *
   * @returns {this}
   *
   * @example
   * field.addEventListener('ui4u:change', () => field.clearValidity());
   */
  clearValidity() {
    this.#selfReported = false;
    if (this.hasAttribute('error')) this.removeAttribute('error');
    return this;
  }

  /**
   * Validates `required` against the committed selection, and reports an
   * author-set `error` as invalid too. The result shape matches `ui-input`
   * exactly, so `ui-form` drives the two components identically. No rules engine
   * here: that is `ui-form`'s job.
   *
   * @returns {DropdownValidityResult}
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
    // otherwise choosing a value would leave the field permanently invalid,
    // because the error it is judged by came from the error it produced.
    if (error && !this.#selfReported) return { valid: false, message: error, value, name };

    const empty = Array.isArray(value) ? value.length === 0 : value === '';
    const missing = this.required && empty;
    return { valid: !missing, message: missing ? FALLBACK_MESSAGE : '', value, name };
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

    if (name === 'open') {
      // No binding here: the attribute is already the decided state, so a veto
      // could not un-decide it. `open()` / `close()` are the guarded routes.
      if (this.isOpen) this.#show();
      else this.#destroyPanel();
      return;
    }

    // `value` is the one option that must not be re-applied on every unrelated
    // change — it would discard what the user has chosen.
    if (name === 'value') this.#applyValueFromAttribute();
    else this.#sync();
  }

  /* --------------------------------------------------------------- build */

  #build() {
    if (this.#built) return;

    this.#baseId = uid('ui4u-dropdown');
    const baseId = this.#baseId;
    // Always generate a fresh id for the trigger. Reusing the host's id would
    // leave two elements sharing one id in the document, which is invalid HTML
    // and makes every `#id` selector ambiguous.
    const triggerId = `${baseId}-trigger`;

    /** @type {HTMLLabelElement} */
    const label = el('label', { class: 'ui4u-dropdown__label', for: triggerId });
    /** @type {HTMLButtonElement} */
    const trigger = el('button', {
      class: 'ui4u-dropdown__trigger',
      type: 'button',
      id: triggerId,
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      'aria-controls': `${baseId}-listbox`,
    });
    /** @type {HTMLElement} */
    const valueSpan = el('span', { class: 'ui4u-dropdown__value' });
    /** @type {HTMLElement} */
    const hint = el('p', { class: 'ui4u-dropdown__hint', id: `${baseId}-hint` });
    /** @type {HTMLElement} */
    const error = el('p', { class: 'ui4u-dropdown__error', id: `${baseId}-error` });

    append(trigger, valueSpan);

    this.#label = label;
    this.#trigger = trigger;
    this.#valueSpan = valueSpan;
    this.#hint = hint;
    this.#error = error;
    this.#optionEls = /** @type {HTMLElement[]} */ (
      [...this.children].filter((child) => child.localName === OPTION_TAG)
    );
    this.#built = true;

    this.track(on(trigger, 'click', () => this.toggle()));
    this.track(on(trigger, 'keydown', (event) => this.#onKeydown(event)));

    // The author's own options are left where they are — only the generated
    // nodes are added around them, so teardown is a plain removal.
    this.prepend(label, trigger);
    this.append(hint, error);

    this.#renderOptions();
    this.#applyValueFromAttribute();
    this.#sync();

    if (this.isOpen) this.#show();
  }

  #teardown() {
    this.#destroyPanel();

    for (const option of this.#optionEls) {
      // Strip everything the component added, so the author's markup is back
      // exactly as they wrote it.
      option.removeAttribute('role');
      option.removeAttribute('id');
      option.removeAttribute('aria-selected');
      option.removeAttribute('aria-disabled');
      option.removeAttribute('data-active');
      delete option.dataset.value;
      this.appendChild(option);
    }
    this.#optionEls = [];

    this.#label?.remove();
    this.#trigger?.remove();
    this.#hint?.remove();
    this.#error?.remove();

    this.#label = null;
    this.#trigger = null;
    this.#valueSpan = null;
    this.#hint = null;
    this.#error = null;
    this.#activeIndex = -1;
    this.#built = false;

    delete this.dataset.open;
    delete this.dataset.required;
    delete this.dataset.multiple;
  }

  /* ----------------------------------------------------------- behaviour */

  /**
   * Gives every option its `role`, id and selection state. Called on build and
   * never while the panel is open, because the options are inside the panel then
   * — they move, they are never re-created.
   */
  #renderOptions() {
    this.#optionEls.forEach((option, index) => {
      if (!option.id) option.id = `${this.#baseId}-option-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      // A hook the option keeps wherever it lives, so tests and CSS can read
      // the committed value without going through the host.
      option.dataset.value = this.#valueOf(option);
    });
  }

  /** Mirrors every option except `value` onto the trigger and the ARIA. */
  #sync() {
    const label = this.#label;
    const trigger = this.#trigger;
    const hint = this.#hint;
    const error = this.#error;
    if (!label || !trigger || !hint || !error) return;

    const labelText = this.label;
    setText(label, labelText);
    label.hidden = labelText === '';
    label.classList.toggle('ui4u-sr-only', this.srOnly);
    label.dataset.required = String(this.required);

    setText(hint, this.hint);
    hint.hidden = this.hint === '';

    // `setText`, never innerHTML — both may carry user data.
    const errorText = this.error;
    setText(error, errorText);
    error.hidden = errorText === '';

    const describedBy = [hint.hidden ? null : hint.id, error.hidden ? null : error.id]
      .filter(Boolean)
      .join(' ');
    if (describedBy) trigger.setAttribute('aria-describedby', describedBy);
    else trigger.removeAttribute('aria-describedby');

    if (errorText) trigger.setAttribute('aria-invalid', 'true');
    else trigger.removeAttribute('aria-invalid');

    if (this.required) trigger.setAttribute('aria-required', 'true');
    else trigger.removeAttribute('aria-required');

    trigger.disabled = this.disabled;

    this.dataset.required = String(this.required);
    this.dataset.multiple = String(this.multiple);

    this.#panel?.setAttribute('aria-multiselectable', String(this.multiple));
    this.#syncSelection();
  }

  /** Applies the `value` attribute to the selection, and only then. */
  #applyValueFromAttribute() {
    const raw = this.getString('value', '');
    const wanted = this.multiple
      ? raw
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      : raw
        ? [raw]
        : [];

    this.#selection = new Set(wanted);
    this.#syncSelection();
  }

  /**
   * Writes the selection back onto the options and the trigger's text. The
   * attribute is deliberately left alone: it is authored state, and only the
   * `value` setter (or a commit) should ever change it.
   */
  #syncSelection() {
    for (const option of this.#optionEls) {
      const value = this.#valueOf(option);
      option.setAttribute('aria-selected', String(this.#selection.has(value)));

      if (this.#isDisabled(option)) option.setAttribute('aria-disabled', 'true');
      else option.removeAttribute('aria-disabled');
    }

    this.#applyTriggerText();
  }

  /**
   * Announces the committed value: the trigger's text is the selection, so the
   * name a screen reader reads out always carries the current value.
   */
  #applyTriggerText() {
    const span = this.#valueSpan;
    const trigger = this.#trigger;
    if (!span || !trigger) return;

    // A value with no matching option still has to read back as something.
    const labels = this.#selectedLabels();
    const chosen = (labels.length > 0 ? labels : [...this.#selection]).join(', ');
    const text = chosen || this.placeholder || this.label;

    setText(span, text);
    trigger.dataset.placeholder = String(chosen === '' && this.placeholder !== '');

    // Only as a last resort: an `aria-label` would hide the value from the
    // accessible name, so it is applied when there is nothing else to read.
    if (text === '') trigger.setAttribute('aria-label', NAME_FALLBACK);
    else trigger.removeAttribute('aria-label');
  }

  /**
   * Builds the portalled panel, moves the author's options into it, and wires
   * the listeners that only make sense while it is open.
   */
  #show() {
    if (!this.#built || this.#panel || !this.#trigger) return;

    /** @type {HTMLElement} */
    const panel = el('div', {
      class: 'ui4u-dropdown__panel',
      id: `${this.#baseId}-listbox`,
      role: 'listbox',
    });
    panel.setAttribute('aria-multiselectable', String(this.multiple));

    // Move before appending: one reflow, and the panel never renders with
    // options still in the host.
    for (const option of this.#optionEls) panel.appendChild(option);

    // Portalled: see the class docs for why this cannot live in place.
    const host = this.ownerDocument?.body ?? this.ownerDocument?.documentElement;
    host?.appendChild(panel);
    this.#panel = panel;

    this.#trigger.setAttribute('aria-expanded', 'true');
    this.dataset.open = 'true';

    this.#activeIndex = -1;
    this.#setActive(this.#defaultActive());

    this.#place();
    // Keydown and click on the panel too: focus normally stays on the trigger,
    // but a click inside the panel must never fall through to the page behind.
    this.#closeDisposers.push(on(panel, 'keydown', (event) => this.#onKeydown(event)));
    this.#closeDisposers.push(on(panel, 'click', (event) => this.#onOptionClick(event)));

    const doc = this.ownerDocument;
    if (doc) {
      this.#closeDisposers.push(on(doc, 'click', (event) => this.#onOutside(event)));
    }

    const view = doc?.defaultView;
    if (view) {
      this.#closeDisposers.push(
        on(view, 'scroll', () => this.#place(), { capture: true, passive: true })
      );
      this.#closeDisposers.push(on(view, 'resize', () => this.#place(), { passive: true }));
    }

    this.emit('ui4u:open', { name: this.name });
  }

  /** Removes the panel, its listeners, and puts the options back where they came from. */
  #destroyPanel() {
    for (const dispose of this.#closeDisposers) dispose();
    this.#closeDisposers = [];

    const panel = this.#panel;
    if (panel) {
      for (const option of this.#optionEls) this.appendChild(option);
      panel.remove();
    }

    this.#panel = null;
    this.#activeIndex = -1;
    this.#clearTypeahead();

    this.#trigger?.setAttribute('aria-expanded', 'false');
    this.#trigger?.removeAttribute('aria-activedescendant');
    delete this.dataset.open;
  }

  /** Positions the panel under the trigger, flipping when it would overflow. */
  #place() {
    const trigger = this.#trigger;
    const panel = this.#panel;
    if (!trigger || !panel) return;

    // jsdom and SSR report a zero-size rect: leave the panel to the CSS anchor
    // width rather than writing a `0px` inline value that would break it.
    const rect =
      typeof trigger.getBoundingClientRect === 'function' ? trigger.getBoundingClientRect() : null;
    if (rect && rect.width > 0) {
      panel.style.setProperty('--ui4u-dropdown-anchor-width', `${Math.round(rect.width)}px`);
    }

    panel.dataset.placement = position(trigger, panel, { placement: 'bottom', gap: 4 });
  }

  /** @param {Event} event */
  #onOutside(event) {
    const target = /** @type {Node|null} */ (event.target);
    if (target && (this.contains(target) || this.#panel?.contains(target))) return;
    this.close();
  }

  /**
   * Committing a click: the clicked option becomes the active one, so a click
   * and a <kbd>Enter</kbd> on the same option do exactly the same thing.
   *
   * @param {Event} event
   */
  #onOptionClick(event) {
    const origin = /** @type {Element|null} */ (event.target);
    const option =
      origin && typeof origin.closest === 'function' ? origin.closest(OPTION_TAG) : null;
    if (!option || !this.#panel?.contains(option)) return;

    const index = this.#optionEls.indexOf(/** @type {HTMLElement} */ (option));
    if (index === -1 || this.#isDisabled(/** @type {HTMLElement} */ (option))) return;

    this.#setActive(index);
    if (this.multiple) this.#toggleActive();
    else this.#commitActive({ close: true });
  }

  /**
   * The keyboard contract, in one place. Focus lives on the trigger, so this
   * handler serves both the closed and the open state.
   *
   * @param {KeyboardEvent} event
   */
  #onKeydown(event) {
    const key = event.key;

    if (key === 'Escape') {
      if (!this.isOpen) return;
      event.preventDefault();
      this.close();
      // Focus never actually leaves the trigger, so this is belt and braces —
      // but a programmatic `close()` from a listener may have moved it.
      this.#trigger?.focus();
      return;
    }

    if (!this.isOpen) {
      switch (key) {
        case 'Enter':
        case ' ':
        case 'ArrowDown':
        case 'ArrowUp':
        case 'Home':
        case 'End': {
          // Without this the browser also synthesises a `click` for Space and
          // Enter on a <button>, and the list would open and close at once.
          event.preventDefault();
          this.open();
          if (key === 'ArrowUp' || key === 'End') {
            this.#setActive(this.#lastEnabled());
          } else {
            this.#setActive(this.#defaultActive());
          }
          return;
        }
        default:
          this.#onTypeahead(event);
          return;
      }
    }

    switch (key) {
      case 'Tab':
        // Close, but do not swallow the key: the user must be able to leave.
        this.close();
        return;
      case 'ArrowDown':
        event.preventDefault();
        if (this.multiple && (event.ctrlKey || event.metaKey)) this.#selectNext(1);
        else this.#moveActive(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (this.multiple && (event.ctrlKey || event.metaKey)) this.#selectNext(-1);
        else this.#moveActive(-1);
        return;
      case 'Home':
        event.preventDefault();
        this.#setActive(this.#firstEnabled());
        return;
      case 'End':
        event.preventDefault();
        this.#setActive(this.#lastEnabled());
        return;
      case 'Enter':
        event.preventDefault();
        this.#commitActive({ close: true });
        return;
      case ' ':
        event.preventDefault();
        if (this.multiple) this.#toggleActive();
        else this.#commitActive({ close: true });
        return;
      default:
        this.#onTypeahead(event);
    }
  }

  /**
   * Moves to the next option whose label starts with the typed characters.
   * Typing is also how a closed listbox opens onto a matching option.
   *
   * @param {KeyboardEvent} event
   */
  #onTypeahead(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.length !== 1) return;

    this.#clearTypeahead();
    this.#typeaheadTimer = setTimeout(() => {
      this.#typeahead = '';
      this.#typeaheadTimer = null;
    }, TYPEAHEAD_RESET_MS);

    const buffer = this.#typeahead + event.key.toLowerCase();
    this.#typeahead = buffer;

    // A second character that finds nothing falls back to searching for that
    // character alone, so "sq" never dead-ends on "Singapore".
    const match = this.#findByPrefix(buffer);
    if (match === -1) return;

    event.preventDefault();
    if (!this.isOpen) this.open();
    this.#setActive(match);
  }

  #clearTypeahead() {
    if (this.#typeaheadTimer !== null) clearTimeout(this.#typeaheadTimer);
    this.#typeaheadTimer = null;
    this.#typeahead = '';
  }

  /** @param {string} prefix @returns {number} index, or `-1` */
  #findByPrefix(prefix) {
    const total = this.#optionEls.length;
    const start = this.#activeIndex < 0 ? 0 : this.#activeIndex;

    for (let step = 1; step <= total; step += 1) {
      const index = (start + step) % total;
      const option = this.#optionEls[index];
      if (!option || this.#isDisabled(option)) continue;
      if (this.#labelOf(option).toLowerCase().startsWith(prefix)) return index;
    }

    return -1;
  }

  /** @param {number} from @param {number} delta @returns {number} */
  #stepEnabled(from, delta) {
    const total = this.#optionEls.length;
    if (total === 0) return -1;

    // Seed so the first candidate is the neighbour of `from` — for `from < 0`,
    // that is the very first or very last option.
    let index = from < 0 ? (delta > 0 ? -1 : total) : from;

    // Walk the whole list before giving up: every option can be disabled, and a
    // single pass is enough because the walk wraps exactly once.
    for (let step = 0; step < total; step += 1) {
      index = (index + delta + total) % total;
      const option = this.#optionEls[index];
      if (option && !this.#isDisabled(option)) return index;
    }

    return -1;
  }

  /** The selected option, or the first enabled one. @returns {number} */
  #defaultActive() {
    const selected = this.#optionEls.findIndex(
      (option) => this.#selection.has(this.#valueOf(option)) && !this.#isDisabled(option)
    );
    return selected === -1 ? this.#firstEnabled() : selected;
  }

  /** @returns {number} */
  #firstEnabled() {
    return this.#stepEnabled(-1, 1);
  }

  /** @returns {number} */
  #lastEnabled() {
    return this.#stepEnabled(-1, -1);
  }

  /** @param {number} delta */
  #moveActive(delta) {
    const next = this.#stepEnabled(this.#activeIndex, delta);
    if (next !== -1) this.#setActive(next);
  }

  /**
   * @param {number} index
   * @param {{ scroll?: boolean }} [options]
   */
  #setActive(index, { scroll = true } = {}) {
    this.#activeIndex = index < 0 || index >= this.#optionEls.length ? -1 : index;
    this.#syncActive();

    const option = this.#activeIndex < 0 ? null : this.#optionEls[this.#activeIndex];
    if (scroll && option && typeof option.scrollIntoView === 'function') {
      option.scrollIntoView({ block: 'nearest' });
    }
  }

  /** Publishes the active option through `data-active` and `aria-activedescendant`. */
  #syncActive() {
    this.#optionEls.forEach((option, index) => {
      if (index === this.#activeIndex) option.setAttribute('data-active', 'true');
      else option.removeAttribute('data-active');
    });

    const trigger = this.#trigger;
    if (!trigger) return;

    const active = this.#activeIndex < 0 ? null : this.#optionEls[this.#activeIndex];
    if (active) trigger.setAttribute('aria-activedescendant', active.id);
    else trigger.removeAttribute('aria-activedescendant');
  }

  /**
   * Selects the active option, replacing the selection, and closes when asked.
   *
   * @param {{ close?: boolean }} [options]
   */
  #commitActive({ close = true } = {}) {
    const option = this.#activeIndex < 0 ? null : this.#optionEls[this.#activeIndex];
    if (!option || this.#isDisabled(option)) return;

    this.#apply(new Set([this.#valueOf(option)]), option, { close });
  }

  /** Adds or removes the active option from the selection, and stays open. */
  #toggleActive() {
    const option = this.#activeIndex < 0 ? null : this.#optionEls[this.#activeIndex];
    if (!option || this.#isDisabled(option)) return;

    const value = this.#valueOf(option);
    const next = new Set(this.#selection);
    if (next.has(value)) next.delete(value);
    else next.add(value);

    this.#apply(next, option);
  }

  /**
   * Extends the selection across one more option. The simple, correct reading of
   * Ctrl+Arrow in a multiple listbox.
   *
   * @param {number} delta
   */
  #selectNext(delta) {
    const next = this.#stepEnabled(this.#activeIndex, delta);
    if (next === -1) return;

    this.#setActive(next);
    const option = this.#optionEls[next];
    const selection = new Set(this.#selection);
    selection.add(this.#valueOf(option));

    this.#apply(selection, option);
  }

  /**
   * The single path every `ui4u:change` goes through — a click commit, an
   * <kbd>Enter</kbd> commit, a <kbd>Space</kbd> toggle and Ctrl+Arrow all land
   * here, so the binding is guarded once instead of at three call sites.
   *
   * The detail describes the selection this interaction WOULD commit, read
   * from `next` rather than from live state: the binding has to be offered the
   * decision before it is taken, and it is the same payload the emit carries.
   *
   * @param {Set<string>} next the selection to commit
   * @param {HTMLElement} option the option responsible for it
   * @param {{ close?: boolean }} [options] close the list before emitting
   * @returns {boolean} `false` when a binding took the change over
   */
  #apply(next, option, { close = false } = {}) {
    const chosen = [...next];
    const detail = {
      value: this.multiple ? chosen : (chosen[0] ?? ''),
      name: this.name,
      option,
    };

    if (!this.runBinding('change', detail)) return false;

    this.#selection = next;
    this.#setTextAttribute('value', chosen.join(','));
    this.#syncSelection();

    if (close) this.close();
    this.emit('ui4u:change', detail);
    return true;
  }

  /* --------------------------------------------------------------- option */

  /** @param {HTMLElement} option @returns {string} */
  #valueOf(option) {
    // An option with no `value` falls back to its own label, so a plain
    // `<ui-dropdown-option>Malaysia</ui-dropdown-option>` still works.
    return option.getAttribute('value') ?? this.#labelOf(option);
  }

  /** @param {HTMLElement} option @returns {string} */
  #labelOf(option) {
    return (option.textContent ?? '').trim();
  }

  /** @param {HTMLElement} option @returns {boolean} */
  #isDisabled(option) {
    return option.hasAttribute('disabled');
  }

  /** @returns {string[]} */
  #selectedLabels() {
    return this.#optionEls
      .filter((option) => this.#selection.has(this.#valueOf(option)))
      .map((option) => this.#labelOf(option));
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
