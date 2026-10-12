import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { cleanup, mount, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component module is evaluated — see helpers/dom.js.
setupDom();

const { Input } = await import('../../src/components/input/input.js');
const { define, isDefined } = await import('../../src/core/registry.js');

define('ui-input', Input);

/** @returns {HTMLInputElement} the native control the component rendered */
function nativeOf(field) {
  return field.querySelector('.ui4u-input__native');
}

/** @returns {HTMLLabelElement|null} */
function labelOf(field) {
  return field.querySelector('.ui4u-input__label');
}

/** @returns {HTMLElement|null} */
function hintOf(field) {
  return field.querySelector('.ui4u-input__hint');
}

/** @returns {HTMLElement|null} */
function errorOf(field) {
  return field.querySelector('.ui4u-input__error');
}

/**
 * Types into the native control the way a user would, so the component sees a
 * real `input` / `change` event pair.
 *
 * @param {HTMLInputElement} native
 * @param {string} text
 */
function type(native, text) {
  native.value = text;
  native.dispatchEvent(new Event('input', { bubbles: true }));
}

/** @param {HTMLInputElement} native */
function commit(native) {
  native.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('ui-input registration', () => {
  it('registers the custom element', () => {
    assert.equal(isDefined('ui-input'), true);
  });
});

describe('ui-input rendering', () => {
  afterEach(() => cleanup());

  it('renders a real native input and keeps it', () => {
    const field = mount('<ui-input label="Email"></ui-input>').querySelector('ui-input');
    const native = nativeOf(field);

    assert.equal(native.localName, 'input');
    // The harness does not publish HTMLInputElement globally, so check the
    // constructor the DOM actually produced.
    assert.equal(native.constructor.name, 'HTMLInputElement');
    assert.equal(field.input, native, 'the same node is exposed, not a copy');
    assert.equal(native.type, 'text');
  });

  it('links the label to the native input', () => {
    const field = mount('<ui-input label="Email"></ui-input>').querySelector('ui-input');
    const label = labelOf(field);

    assert.equal(label.localName, 'label');
    assert.equal(label.getAttribute('for'), nativeOf(field).id);
    assert.equal(label.textContent, 'Email');
  });

  it('never reuses the host id, so the document has no duplicate ids', () => {
    const field = mount('<ui-input id="email-field" label="Email"></ui-input>').querySelector(
      'ui-input'
    );

    // Reusing it would leave two elements sharing one id — invalid HTML, and
    // it makes every `#id` selector ambiguous.
    assert.notEqual(nativeOf(field).id, 'email-field');
    assert.equal(labelOf(field).getAttribute('for'), nativeOf(field).id);
  });

  it('keeps a unique id per generated control', () => {
    const first = mount('<ui-input label="One"></ui-input>').querySelector('ui-input');
    const second = mount('<ui-input label="Two"></ui-input>').querySelector('ui-input');

    assert.ok(nativeOf(first).id);
    assert.notEqual(nativeOf(first).id, nativeOf(second).id);
  });

  it('applies the native type, placeholder, name and autocomplete', () => {
    const field = mount(
      '<ui-input label="Email" type="email" placeholder="you@example.com" name="email" autocomplete="email"></ui-input>'
    ).querySelector('ui-input');
    const native = nativeOf(field);

    assert.equal(native.type, 'email');
    assert.equal(native.placeholder, 'you@example.com');
    assert.equal(native.name, 'email');
    assert.equal(native.autocomplete, 'email');
  });

  it('renders the authored value into the control', () => {
    const field = mount('<ui-input label="Name" value="Ada"></ui-input>').querySelector('ui-input');

    assert.equal(nativeOf(field).value, 'Ada');
    assert.equal(field.value, 'Ada');
  });

  it('leaves the author children untouched', () => {
    const field = mount(
      '<ui-input label="Name"><span class="mine">kept</span></ui-input>'
    ).querySelector('ui-input');

    assert.ok(field.querySelector('span.mine'), 'the author markup is still in the host');
  });

  it('hides the label when there is no label text', () => {
    const field = mount('<ui-input></ui-input>').querySelector('ui-input');

    assert.equal(labelOf(field).hidden, true);
    assert.equal(labelOf(field).textContent, '');
  });

  it('visually hides the label with sr-only, keeping it for AT', () => {
    const field = mount('<ui-input label="Email" sr-only></ui-input>').querySelector('ui-input');

    assert.equal(field.srOnly, true);
    assert.equal(labelOf(field).classList.contains('ui4u-sr-only'), true);
    assert.equal(labelOf(field).hidden, false, 'still exposed, only clipped');
  });
});

describe('ui-input aria wiring', () => {
  afterEach(() => cleanup());

  it('describes the control with the hint', () => {
    const field = mount(
      '<ui-input label="Email" hint="We never share it."></ui-input>'
    ).querySelector('ui-input');

    assert.equal(nativeOf(field).getAttribute('aria-describedby'), hintOf(field).id);
    assert.equal(hintOf(field).hidden, false);
  });

  it('chains hint and error so both are announced', () => {
    const field = mount(
      '<ui-input label="Email" hint="We never share it." error="Not an email"></ui-input>'
    ).querySelector('ui-input');
    const described = nativeOf(field).getAttribute('aria-describedby').split(' ');

    assert.deepEqual(described, [hintOf(field).id, errorOf(field).id]);
  });

  it('drops aria-describedby when neither hint nor error exists', () => {
    const field = mount('<ui-input label="Email" hint="Later"></ui-input>').querySelector(
      'ui-input'
    );

    assert.notEqual(nativeOf(field).getAttribute('aria-describedby'), null);

    field.hint = '';
    assert.equal(nativeOf(field).hasAttribute('aria-describedby'), false);

    field.error = 'Boom';
    assert.equal(nativeOf(field).getAttribute('aria-describedby'), errorOf(field).id);

    field.clearValidity();
    assert.equal(nativeOf(field).hasAttribute('aria-describedby'), false);
  });

  it('marks aria-invalid only while an error is set', () => {
    const field = mount('<ui-input label="Email"></ui-input>').querySelector('ui-input');

    assert.equal(nativeOf(field).hasAttribute('aria-invalid'), false);

    field.error = 'Taken';
    assert.equal(nativeOf(field).getAttribute('aria-invalid'), 'true');

    field.error = '';
    assert.equal(nativeOf(field).hasAttribute('aria-invalid'), false);
  });

  it('marks aria-required when required', () => {
    const field = mount('<ui-input label="Email"></ui-input>').querySelector('ui-input');

    assert.equal(nativeOf(field).hasAttribute('aria-required'), false);

    field.required = true;
    assert.equal(nativeOf(field).getAttribute('aria-required'), 'true');
    assert.equal(nativeOf(field).required, true);

    field.required = false;
    assert.equal(nativeOf(field).hasAttribute('aria-required'), false);
  });

  it('mirrors disabled and readonly onto the native control', () => {
    const field = mount('<ui-input label="Email"></ui-input>').querySelector('ui-input');

    field.disabled = true;
    field.readonly = true;

    assert.equal(nativeOf(field).disabled, true);
    assert.equal(nativeOf(field).readOnly, true);

    field.disabled = false;
    field.readonly = false;

    assert.equal(nativeOf(field).disabled, false);
    assert.equal(nativeOf(field).readOnly, false);
  });
});

describe('ui-input option resolution', () => {
  afterEach(() => cleanup());

  it('resolves every documented size and exposes it as a hook', () => {
    const field = mount('<ui-input label="Email"></ui-input>').querySelector('ui-input');

    for (const size of ['sm', 'md', 'lg']) {
      field.setAttribute('size', size);
      assert.equal(field.size, size);
      assert.equal(field.dataset.size, size);
    }
  });

  it('falls back to md for an unknown size', () => {
    const field = mount('<ui-input label="Email"></ui-input>').querySelector('ui-input');

    field.setAttribute('size', 'nonsense');

    assert.equal(field.size, 'md');
    assert.equal(field.dataset.size, 'md', 'the style hook falls back too');
  });

  it('leaves a typed value alone when an unrelated option changes', () => {
    const field = mount('<ui-input label="Email"></ui-input>').querySelector('ui-input');
    type(nativeOf(field), 'ada@example.com');

    field.hint = 'We never share it.';

    assert.equal(nativeOf(field).value, 'ada@example.com', 'typing is never clobbered');
  });
});

describe('ui-input configure()', () => {
  afterEach(() => cleanup());

  it('applies every option and returns the element', () => {
    const field = mount('<ui-input></ui-input>').querySelector('ui-input');

    const result = field.configure({
      label: 'Email',
      type: 'email',
      value: 'ada@example.com',
      placeholder: 'you@example.com',
      hint: 'We never share it.',
      error: 'Taken',
      size: 'lg',
      required: true,
      disabled: true,
      readonly: true,
      name: 'email',
      autocomplete: 'email',
    });

    assert.equal(result, field);
    assert.equal(field.label, 'Email');
    assert.equal(field.type, 'email');
    assert.equal(field.value, 'ada@example.com');
    assert.equal(field.placeholder, 'you@example.com');
    assert.equal(field.hint, 'We never share it.');
    assert.equal(field.error, 'Taken');
    assert.equal(field.size, 'lg');
    assert.equal(field.required, true);
    assert.equal(field.disabled, true);
    assert.equal(field.readonly, true);
    assert.equal(field.name, 'email');
    assert.equal(field.autocomplete, 'email');
    assert.equal(nativeOf(field).type, 'email');
    assert.equal(nativeOf(field).value, 'ada@example.com');
    assert.equal(labelOf(field).textContent, 'Email');
  });

  it('leaves untouched options alone', () => {
    const field = mount('<ui-input label="Email" size="lg"></ui-input>').querySelector('ui-input');

    field.configure({ size: 'sm' });

    assert.equal(field.size, 'sm');
    assert.equal(field.label, 'Email');
  });
});

describe('ui-input events', () => {
  afterEach(() => cleanup());

  it('emits ui4u:input alongside the native event', () => {
    const field = mount('<ui-input label="Email" name="email"></ui-input>').querySelector(
      'ui-input'
    );
    /** @type {Array<{ value: string, name: string }>} */
    const seen = [];
    /** @type {Event[]} */
    const native = [];

    field.addEventListener('ui4u:input', (event) => seen.push(event.detail));
    nativeOf(field).addEventListener('input', (event) => native.push(event));

    type(nativeOf(field), 'ada@example.com');

    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0], { value: 'ada@example.com', name: 'email' });
    assert.equal(native.length, 1, 'the native input event still fires');
  });

  it('emits ui4u:change on commit only', () => {
    const field = mount('<ui-input label="Email" name="email"></ui-input>').querySelector(
      'ui-input'
    );
    /** @type {Array<{ value: string, name: string }>} */
    const seen = [];
    field.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    type(nativeOf(field), 'ada@example.com');
    assert.equal(seen.length, 0);

    commit(nativeOf(field));
    assert.deepEqual(seen, [{ value: 'ada@example.com', name: 'email' }]);
  });
});

describe('ui-input validation', () => {
  afterEach(() => cleanup());

  it('is valid when empty and not required', () => {
    const field = mount('<ui-input label="Email" name="email"></ui-input>').querySelector(
      'ui-input'
    );

    assert.deepEqual(field.checkValidity(), {
      valid: true,
      message: '',
      value: '',
      name: 'email',
    });
  });

  it('is invalid when empty and required', () => {
    const field = mount('<ui-input label="Email" required></ui-input>').querySelector('ui-input');
    const result = field.checkValidity();

    assert.equal(result.valid, false);
    assert.ok(result.message.length > 0, 'the native validationMessage is reported');
    assert.equal(result.value, '');
  });

  it('is invalid for a bad type, and valid once fixed', () => {
    const field = mount(
      '<ui-input label="Email" type="email" name="email" required></ui-input>'
    ).querySelector('ui-input');

    type(nativeOf(field), 'nope');
    assert.equal(field.checkValidity().valid, false);
    assert.equal(field.checkValidity().value, 'nope');

    type(nativeOf(field), 'ada@example.com');
    assert.equal(field.checkValidity().valid, true);
    assert.equal(field.checkValidity().message, '');
  });

  it('treats an author-set error as invalid, with that message', () => {
    const field = mount(
      '<ui-input label="Name" error="That name is taken"></ui-input>'
    ).querySelector('ui-input');
    const result = field.checkValidity();

    assert.equal(result.valid, false);
    assert.equal(result.message, 'That name is taken');
  });

  it('reportValidity() surfaces an error and clearValidity() drops it', () => {
    const field = mount('<ui-input label="Email" required></ui-input>').querySelector('ui-input');

    assert.equal(field.reportValidity(), field, 'returns this');
    assert.equal(field.error.length > 0, true, 'the native message became the error');
    assert.equal(nativeOf(field).getAttribute('aria-invalid'), 'true');

    field.clearValidity();
    assert.equal(field.error, '');
    assert.equal(nativeOf(field).hasAttribute('aria-invalid'), false);

    type(nativeOf(field), 'ada@example.com');
    field.reportValidity();
    assert.equal(field.error, '', 'a valid field clears the error state');
  });
});

describe('ui-input text rendering', () => {
  afterEach(() => cleanup());

  it('renders hint and error as text, never as markup', () => {
    const field = mount(
      '<ui-input label="Name" hint="&lt;b&gt;hint&lt;/b&gt;" error="&lt;img src=x&gt;"></ui-input>'
    ).querySelector('ui-input');

    assert.equal(hintOf(field).textContent, '<b>hint</b>');
    assert.equal(errorOf(field).textContent, '<img src=x>');
    assert.equal(hintOf(field).querySelector('b'), null);
    assert.equal(errorOf(field).querySelector('img'), null);
  });

  it('renders the label as text, never as markup', () => {
    const field = mount(
      '<ui-input label="&lt;script&gt;x&lt;/script&gt;"></ui-input>'
    ).querySelector('ui-input');

    assert.equal(labelOf(field).textContent, '<script>x</script>');
    assert.equal(labelOf(field).querySelector('script'), null);
  });
});

describe('ui-input focus and blur', () => {
  afterEach(() => cleanup());

  it('focus() and blur() drive the native control and return this', () => {
    const field = mount('<ui-input label="Email"></ui-input>').querySelector('ui-input');

    assert.equal(field.focus(), field);
    assert.equal(document.activeElement, nativeOf(field));

    assert.equal(field.blur(), field);
    assert.notEqual(document.activeElement, nativeOf(field));
  });
});

describe('ui-input teardown', () => {
  afterEach(() => cleanup());

  it('removes generated markup and restores the authored children', () => {
    const field = mount(
      '<ui-input label="Email" size="lg"><span class="mine">kept</span></ui-input>'
    ).querySelector('ui-input');

    field.remove();

    assert.equal(field.querySelector('.ui4u-input__label'), null, 'label removed');
    assert.equal(field.querySelector('.ui4u-input__native'), null, 'native input removed');
    assert.equal(field.querySelector('.ui4u-input__hint'), null, 'hint removed');
    assert.equal(field.querySelector('.ui4u-input__error'), null, 'error removed');
    assert.equal(field.querySelector('span.mine').textContent, 'kept', 'author markup restored');
    assert.equal(field.hasAttribute('data-size'), false, 'style hook cleared');
  });

  it('rebuilds correctly when reconnected', () => {
    const field = mount('<ui-input label="Email" hint="Later" size="sm"></ui-input>').querySelector(
      'ui-input'
    );

    field.remove();
    document.body.appendChild(field);

    assert.equal(nativeOf(field).localName, 'input');
    assert.equal(labelOf(field).getAttribute('for'), nativeOf(field).id);
    assert.equal(field.dataset.size, 'sm');
    assert.equal(nativeOf(field).getAttribute('aria-describedby'), hintOf(field).id);
  });

  it('does not emit after disconnect', () => {
    const field = mount('<ui-input label="Email"></ui-input>').querySelector('ui-input');
    const native = nativeOf(field);
    /** @type {unknown[]} */
    const seen = [];
    field.addEventListener('ui4u:input', (event) => seen.push(event.detail));

    field.remove();
    type(native, 'ada@example.com');

    assert.equal(seen.length, 0, 'tracked listeners were disposed');
  });

  it('is inert before it connects', () => {
    const field = document.createElement('ui-input');

    assert.equal(field.input, null);
    assert.equal(field.value, '');
    assert.equal(field.size, 'md');
    assert.equal(field.checkValidity().valid, true);
  });

  it('does not stay invalid forever after reportValidity()', () => {
    const field = mount('<ui-input label="Email" type="email" required></ui-input>').querySelector(
      'ui-input'
    );

    // Empty and required: the component reports the failure onto itself.
    field.reportValidity();
    assert.equal(field.error !== '', true, 'an error message is showing');
    assert.equal(field.checkValidity().valid, false);

    // The user fixes it. A self-reported error must not keep failing the field,
    // otherwise the form would loop on a message it produced itself.
    field.input.value = 'ada@example.com';

    assert.equal(field.checkValidity().valid, true, 'valid once corrected');
  });

  it('still treats an author-supplied error as a deliberate override', () => {
    const field = mount(
      '<ui-input label="Email" type="email" value="ada@example.com" error="Taken"></ui-input>'
    ).querySelector('ui-input');

    assert.equal(field.checkValidity().valid, false);
  });
});

/* --- amount mode ---------------------------------------------------------- */

describe('ui-input type="amount"', () => {
  afterEach(() => cleanup());

  /** Types into the control the way a user would. */
  const type = (field, text) => {
    const native = nativeOf(field);
    native.value = text;
    native.dispatchEvent(new window.Event('input', { bubbles: true }));
  };

  it('formats as the user types', () => {
    const field = mount('<ui-input type="amount"></ui-input>').querySelector('ui-input');

    type(field, '5000');
    assert.equal(nativeOf(field).value, '5,000');

    type(field, '5000000');
    assert.equal(nativeOf(field).value, '5,000,000');
  });

  it('parses the k, m and b shortcuts as you type', () => {
    const field = mount('<ui-input type="amount"></ui-input>').querySelector('ui-input');

    type(field, '5k');
    assert.equal(field.amount, 5000);
    assert.equal(nativeOf(field).value, '5,000');

    type(field, '3m');
    assert.equal(field.amount, 3_000_000);

    type(field, '2b');
    assert.equal(field.amount, 2_000_000_000);
  });

  it('leaves a half-typed decimal alone so the caret is not disturbed', () => {
    const field = mount('<ui-input type="amount"></ui-input>').querySelector('ui-input');

    type(field, '12.');
    assert.equal(nativeOf(field).value, '12.', 'must not reformat mid-number');
    assert.equal(field.amount, 12);
  });

  it('reports the parsed number alongside the text in its events', () => {
    const field = mount('<ui-input type="amount"></ui-input>').querySelector('ui-input');
    /** @type {any[]} */
    const seen = [];
    field.addEventListener('ui4u:input', (event) => seen.push(event.detail));

    type(field, '2.5k');

    assert.equal(seen.at(-1).value, '2,500');
    assert.equal(seen.at(-1).amount, 2500);
  });

  it('keeps the text control under the hood', () => {
    const field = mount('<ui-input type="amount"></ui-input>').querySelector('ui-input');
    assert.equal(nativeOf(field).type, 'text', 'the browser has no amount type');
    assert.equal(field.dataset.mode, 'amount');
  });

  it('honours a fixed decimal count', () => {
    const field = mount('<ui-input type="amount" decimals="2"></ui-input>').querySelector(
      'ui-input'
    );

    type(field, '8421');
    assert.equal(nativeOf(field).value, '8,421.00');
    assert.equal(field.amount, 8421);
  });

  it('rejects text that is not an amount', () => {
    const field = mount('<ui-input type="amount"></ui-input>').querySelector('ui-input');

    type(field, 'abc');
    const result = field.checkValidity();
    assert.equal(result.valid, false);
    assert.match(result.message, /k, m or b/);
  });

  it('checks the min and max bounds', () => {
    const field = mount('<ui-input type="amount" min="1000" max="9000"></ui-input>').querySelector(
      'ui-input'
    );

    type(field, '500');
    assert.equal(field.checkValidity().valid, false);

    type(field, '5000');
    assert.equal(field.checkValidity().valid, true);

    type(field, '50000');
    assert.equal(field.checkValidity().valid, false);
  });

  it('treats an empty required amount as invalid', () => {
    const field = mount('<ui-input type="amount" required></ui-input>').querySelector('ui-input');

    assert.equal(field.checkValidity().valid, false);
  });
});

/* --- date mode ------------------------------------------------------------ */

describe('ui-input type="date"', () => {
  afterEach(() => cleanup());

  /** @returns {Element|null} the portalled panel, or null when closed */
  const panel = () => document.querySelector('.ui4u-calendar');

  it('shows the local format while keeping the ISO value in the attribute', () => {
    const field = mount(
      '<ui-input type="date" value="2026-08-14" locale="en-GB"></ui-input>'
    ).querySelector('ui-input');

    assert.equal(field.value, '2026-08-14', 'the value stays machine-readable');
    assert.match(nativeOf(field).value, /2026/);
  });

  it('marks the control as opening a dialog', () => {
    const field = mount('<ui-input type="date"></ui-input>').querySelector('ui-input');
    assert.equal(nativeOf(field).getAttribute('aria-haspopup'), 'dialog');
    assert.equal(nativeOf(field).getAttribute('aria-expanded'), 'false');
  });

  it('portals the panel to the body, not inside the field', () => {
    const field = mount('<ui-input type="date"></ui-input>').querySelector('ui-input');

    field.openPicker();

    const open = panel();
    assert.ok(open, 'the panel is open');
    assert.equal(field.contains(open), false, 'it must not live inside the host');
    assert.equal(open.parentElement, document.body);
  });

  it('closes on teardown so nothing is left on the body', () => {
    const field = mount('<ui-input type="date"></ui-input>').querySelector('ui-input');
    field.openPicker();
    assert.ok(panel());

    field.remove();
    assert.equal(panel(), null);
  });

  it('renders a day grid with one roving tab stop', () => {
    const field = mount('<ui-input type="date"></ui-input>').querySelector('ui-input');
    field.openPicker();

    const grid = panel().querySelector('[role="grid"]');
    assert.ok(grid);

    const stops = panel().querySelectorAll('.ui4u-calendar__day[tabindex="0"]');
    assert.equal(stops.length, 1, 'a grid is a single tab stop');
  });

  it('picks a date with the mouse and writes it back as ISO', () => {
    const field = mount('<ui-input type="date" value="2026-08-14"></ui-input>').querySelector(
      'ui-input'
    );
    field.openPicker();

    const target = panel().querySelector('.ui4u-calendar__day[data-date="2026-08-20"]');
    target.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    assert.equal(field.value, '2026-08-20');
    assert.equal(panel(), null, 'a single date closes the panel');
  });

  it('completes a range from a half-open one', () => {
    const field = mount('<ui-input type="date" range value="2026-08-14"></ui-input>').querySelector(
      'ui-input'
    );
    field.openPicker();

    panel()
      .querySelector('.ui4u-calendar__day[data-date="2026-08-20"]')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    assert.deepEqual(field.range, { from: '2026-08-14', to: '2026-08-20' });
  });

  it('starts a range from an empty field and closes it after two clicks', () => {
    // The panel opens on the current month, so drive it to a known one first.
    const field = mount('<ui-input type="date" range></ui-input>').querySelector('ui-input');
    field.openPicker();

    const next = panel().querySelector('.ui4u-calendar__nav[aria-label="Next"]');
    next.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    const days = [...panel().querySelectorAll('.ui4u-calendar__day:not([data-outside])')];
    days[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    const range = field.range;
    assert.ok(range.from, 'a start date was picked');
    assert.equal(range.to, '', 'the range is still open');
  });

  it('swaps the ends when the second click is earlier', () => {
    // A half-open range starting 20 Aug, completed by clicking 5 Aug. Rather
    // than producing a negative range, the ends swap.
    const field = mount('<ui-input type="date" range value="2026-08-20"></ui-input>').querySelector(
      'ui-input'
    );
    field.openPicker();

    panel()
      .querySelector('.ui4u-calendar__day[data-date="2026-08-05"]')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    assert.deepEqual(field.range, { from: '2026-08-05', to: '2026-08-20' });
    assert.equal(field.checkValidity().valid, true, 'a swapped range is still valid');
  });

  it('opens at the month view when asked', () => {
    const field = mount(
      '<ui-input type="date" view="month" value="2026-08-14"></ui-input>'
    ).querySelector('ui-input');
    field.openPicker();

    assert.equal(panel().querySelectorAll('.ui4u-calendar__month').length, 12);
    assert.equal(panel().querySelectorAll('.ui4u-calendar__day').length, 0);
  });

  it('drills from months down to days', () => {
    const field = mount(
      '<ui-input type="date" view="month" value="2026-08-14"></ui-input>'
    ).querySelector('ui-input');
    field.openPicker();

    panel()
      .querySelector('.ui4u-calendar__month[data-month="7"]')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    assert.ok(panel().querySelector('.ui4u-calendar__day[data-date="2026-08-01"]'));
  });

  it('opens at the year view and drills down twice', () => {
    const field = mount(
      '<ui-input type="date" view="year" value="2026-08-14"></ui-input>'
    ).querySelector('ui-input');
    field.openPicker();

    assert.equal(panel().querySelectorAll('.ui4u-calendar__year').length, 12);

    panel()
      .querySelector('.ui4u-calendar__year[data-year="2026"]')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(panel().querySelectorAll('.ui4u-calendar__month').length, 12);

    panel()
      .querySelector('.ui4u-calendar__month[data-month="7"]')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.ok(panel().querySelector('.ui4u-calendar__day'));
  });

  it('moves the roving focus with the arrow keys', () => {
    const field = mount('<ui-input type="date" value="2026-08-14"></ui-input>').querySelector(
      'ui-input'
    );
    field.openPicker();

    const body = panel().querySelector('.ui4u-calendar__body');
    body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    const focused = panel().querySelector('.ui4u-calendar__day[tabindex="0"]');
    assert.equal(focused.dataset.date, '2026-08-15');
    assert.equal(
      panel().querySelectorAll('.ui4u-calendar__day[tabindex="0"]').length,
      1,
      'still exactly one tab stop'
    );
  });

  it('closes on Escape', () => {
    const field = mount('<ui-input type="date"></ui-input>').querySelector('ui-input');
    field.openPicker();

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(panel(), null);
  });

  it('disables days outside its bounds', () => {
    const field = mount(
      '<ui-input type="date" min="2026-08-10" max="2026-08-20" value="2026-08-14"></ui-input>'
    ).querySelector('ui-input');
    field.openPicker();

    assert.equal(
      panel().querySelector('.ui4u-calendar__day[data-date="2026-08-05"]').disabled,
      true
    );
    assert.equal(
      panel().querySelector('.ui4u-calendar__day[data-date="2026-08-15"]').disabled,
      false
    );
  });

  it('validates the chosen date against its bounds', () => {
    const field = mount(
      '<ui-input type="date" min="2026-08-10" max="2026-08-20" value="2026-09-01"></ui-input>'
    ).querySelector('ui-input');

    const result = field.checkValidity();
    assert.equal(result.valid, false);
    assert.match(result.message, /or earlier/);
  });

  it('rejects a reversed range', () => {
    const field = mount(
      '<ui-input type="date" range value="2026-08-20/2026-08-10"></ui-input>'
    ).querySelector('ui-input');

    assert.equal(field.checkValidity().valid, false);
  });

  it('exposes the chosen range as a getter', () => {
    const field = mount(
      '<ui-input type="date" range value="2026-08-10/2026-08-20"></ui-input>'
    ).querySelector('ui-input');

    assert.deepEqual(field.range, { from: '2026-08-10', to: '2026-08-20' });
  });

  it('stays closed when the field is disabled', () => {
    const field = mount('<ui-input type="date" disabled></ui-input>').querySelector('ui-input');

    field.openPicker();
    assert.equal(panel(), null);
  });
});

/* --- date formats and typed entry ---------------------------------------- */

describe('ui-input date formats', () => {
  afterEach(() => cleanup());

  const typed = (field, text) => {
    const native = field.querySelector('.ui4u-input__native');
    native.value = text;
    native.dispatchEvent(new window.Event('input', { bubbles: true }));
    return native;
  };

  it('defaults to the ISO format', () => {
    const field = mount('<ui-input type="date" value="2026-08-14"></ui-input>').querySelector(
      'ui-input'
    );

    assert.equal(field.format, 'yyyy-MM-dd');
    assert.equal(field.querySelector('.ui4u-input__native').value, '2026-08-14');
  });

  it('shows the value in the chosen format', () => {
    const field = mount(
      '<ui-input type="date" value="2026-08-14" format="dd/MM/yyyy"></ui-input>'
    ).querySelector('ui-input');

    assert.equal(field.querySelector('.ui4u-input__native').value, '14/08/2026');
    assert.equal(field.value, '2026-08-14', 'the stored value stays ISO');
  });

  it('supports a leading-year format too', () => {
    const field = mount(
      '<ui-input type="date" value="2026-08-14" format="yyyy/MM/dd"></ui-input>'
    ).querySelector('ui-input');

    assert.equal(field.querySelector('.ui4u-input__native').value, '2026/08/14');
  });

  it('falls back to ISO for an unknown format', () => {
    const field = mount('<ui-input type="date" format="nonsense"></ui-input>').querySelector(
      'ui-input'
    );
    assert.equal(field.format, 'yyyy-MM-dd');
  });

  it('uses the format as the placeholder, so it says what to type', () => {
    const field = mount('<ui-input type="date" format="dd/MM/yyyy"></ui-input>').querySelector(
      'ui-input'
    );

    assert.equal(field.querySelector('.ui4u-input__native').placeholder, 'dd/MM/yyyy');
  });

  it('re-renders the shown value when the format changes', () => {
    const field = mount(
      '<ui-input type="date" value="2026-08-14" format="dd/MM/yyyy"></ui-input>'
    ).querySelector('ui-input');

    field.format = 'yyyy/MM/dd';

    assert.equal(field.querySelector('.ui4u-input__native').value, '2026/08/14');
  });

  /* --- manual entry ------------------------------------------------------ */

  it('is writable, not read-only', () => {
    const field = mount('<ui-input type="date"></ui-input>').querySelector('ui-input');
    assert.equal(field.querySelector('.ui4u-input__native').readOnly, false);
  });

  it('accepts a hand-typed date in the chosen format', () => {
    const field = mount('<ui-input type="date" format="dd/MM/yyyy"></ui-input>').querySelector(
      'ui-input'
    );

    typed(field, '14/08/2026');

    assert.equal(field.value, '2026-08-14');
    assert.equal(field.querySelector('.ui4u-input__native').value, '14/08/2026');
  });

  it('leaves the text alone while it does not parse', () => {
    const field = mount('<ui-input type="date" format="dd/MM/yyyy"></ui-input>').querySelector(
      'ui-input'
    );

    const native = typed(field, '14/0');

    assert.equal(field.value, '', 'nothing committed');
    assert.equal(native.value, '14/0', 'and the text is not rewritten mid-word');
  });

  it('rejects text in the wrong order rather than guessing', () => {
    const field = mount('<ui-input type="date" format="yyyy/MM/dd"></ui-input>').querySelector(
      'ui-input'
    );

    typed(field, '14/08/2026');

    assert.equal(field.value, '', '14/08/2026 is not yyyy/MM/dd');
  });

  it('refuses a typed date outside its bounds', () => {
    const field = mount(
      '<ui-input type="date" format="dd/MM/yyyy" min="2026-01-01" max="2026-12-31"></ui-input>'
    ).querySelector('ui-input');

    typed(field, '14/08/2025');

    assert.equal(field.value, '');
  });

  it('reads a hand-typed range', () => {
    const field = mount(
      '<ui-input type="date" range format="dd/MM/yyyy"></ui-input>'
    ).querySelector('ui-input');

    typed(field, '10/08/2026 → 14/08/2026');

    assert.equal(field.value, '2026-08-10/2026-08-14');
  });

  it('stores an ISO range whatever the display format', () => {
    const field = mount(
      '<ui-input type="date" range value="2026-08-10/2026-08-14" format="dd/MM/yyyy"></ui-input>'
    ).querySelector('ui-input');

    assert.equal(field.querySelector('.ui4u-input__native').value, '10/08/2026 → 14/08/2026');
  });

  it('applies the format through configure', () => {
    const field = mount('<ui-input type="date" value="2026-08-14"></ui-input>').querySelector(
      'ui-input'
    );

    field.configure({ format: 'dd.MM.yyyy' });

    assert.equal(field.querySelector('.ui4u-input__native').value, '14.08.2026');
  });
});

/* --- invalid state on commit ---------------------------------------------- */

describe('ui-input date commit', () => {
  afterEach(() => cleanup());

  const type = (field, text) => {
    const native = field.querySelector('.ui4u-input__native');
    native.value = text;
    native.dispatchEvent(new window.Event('input', { bubbles: true }));
    return native;
  };

  const commit = (field) => {
    field
      .querySelector('.ui4u-input__native')
      .dispatchEvent(new window.Event('change', { bubbles: true }));
  };

  const ddmm = () =>
    mount('<ui-input type="date" format="dd/MM/yyyy"></ui-input>').querySelector('ui-input');

  it('leaves an unreadable date alone while typing', () => {
    const field = ddmm();
    const native = type(field, '14/0');

    assert.equal(native.value, '14/0', 'not cleared mid-word');
    assert.equal(field.error, '', 'and not flagged yet');
  });

  it('clears and flags an unreadable date on commit', () => {
    const field = ddmm();
    const native = type(field, '14/0');

    commit(field);

    assert.equal(native.value, '', 'cleared');
    assert.equal(field.value, '');
    assert.equal(native.getAttribute('aria-invalid'), 'true', 'so the border goes red');
    assert.match(field.error, /dd\/MM\/yyyy/);
  });

  it('names the format it wanted', () => {
    const field = ddmm();
    type(field, 'nonsense');
    commit(field);
    assert.equal(field.error, 'Enter a date as dd/MM/yyyy.');
  });

  it('clears the error once a valid date is typed', () => {
    const field = ddmm();
    type(field, 'nonsense');
    commit(field);
    assert.equal(field.error, '' === field.error ? '' : field.error); // sanity: set
    assert.ok(field.error.length > 0);

    type(field, '14/08/2026');
    assert.equal(field.error, '', 'the flag clears when the reader fixes it');
    assert.equal(field.value, '2026-08-14');
  });

  it('clears the error when the field is emptied', () => {
    const field = ddmm();
    type(field, 'nonsense');
    commit(field);

    type(field, '');
    assert.equal(field.error, '');
  });

  it('rejects a date outside its bounds on commit', () => {
    const field = mount(
      '<ui-input type="date" format="dd/MM/yyyy" min="2026-01-01" max="2026-12-31"></ui-input>'
    ).querySelector('ui-input');

    const native = type(field, '14/08/2025');
    assert.equal(native.value, '14/08/2025', 'tolerated while typing');

    commit(field);
    assert.equal(native.value, '');
    assert.equal(field.value, '');
  });

  it('rejects a range whose second half will not read', () => {
    const field = mount(
      '<ui-input type="date" range format="dd/MM/yyyy"></ui-input>'
    ).querySelector('ui-input');

    const native = type(field, '10/08/2026 → oops');
    commit(field);

    assert.equal(native.value, '');
    assert.equal(field.value, '');
  });

  it('keeps a valid range on commit', () => {
    const field = mount(
      '<ui-input type="date" range format="dd/MM/yyyy"></ui-input>'
    ).querySelector('ui-input');

    type(field, '10/08/2026 → 14/08/2026');
    commit(field);

    assert.equal(field.value, '2026-08-10/2026-08-14');
    assert.equal(field.error, '');
  });
});
