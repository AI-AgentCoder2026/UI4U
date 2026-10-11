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
