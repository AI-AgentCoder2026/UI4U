import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { cleanup, click, mount, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component module is evaluated — see helpers/dom.js.
setupDom();

const { Checkbox } = await import('../../src/components/checkbox/checkbox.js');
const { define, isDefined } = await import('../../src/core/registry.js');

define('ui-checkbox', Checkbox);

/** @returns {HTMLInputElement} the native control the component rendered */
function nativeOf(box) {
  return box.querySelector('.ui4u-checkbox__native');
}

/** @returns {HTMLLabelElement|null} */
function labelOf(box) {
  return box.querySelector('.ui4u-checkbox__label');
}

/** @returns {HTMLElement|null} */
function hintOf(box) {
  return box.querySelector('.ui4u-checkbox__hint');
}

/** @returns {HTMLElement|null} */
function errorOf(box) {
  return box.querySelector('.ui4u-checkbox__error');
}

describe('ui-checkbox registration', () => {
  it('registers the custom element', () => {
    assert.equal(isDefined('ui-checkbox'), true);
  });
});

describe('ui-checkbox rendering', () => {
  afterEach(() => cleanup());

  it('renders a real native checkbox and keeps it', () => {
    const box = mount('<ui-checkbox label="Email me"></ui-checkbox>').querySelector('ui-checkbox');
    const native = nativeOf(box);

    assert.equal(native.localName, 'input');
    // The harness does not publish HTMLInputElement globally, so check the
    // constructor the DOM actually produced.
    assert.equal(native.constructor.name, 'HTMLInputElement');
    assert.equal(native.type, 'checkbox');
    assert.equal(box.input, native, 'the same node is exposed, not a copy');
  });

  it('links the label to the native input', () => {
    const box = mount('<ui-checkbox label="Email me"></ui-checkbox>').querySelector('ui-checkbox');

    assert.equal(labelOf(box).localName, 'label');
    assert.equal(labelOf(box).getAttribute('for'), nativeOf(box).id);
    assert.equal(labelOf(box).textContent, 'Email me');
  });

  it('never nests the control inside the label', () => {
    const box = mount('<ui-checkbox label="Email me"></ui-checkbox>').querySelector('ui-checkbox');

    // A label that wraps other controls swallows their clicks; `for` keeps the
    // two cleanly separated.
    assert.equal(labelOf(box).querySelector('input'), null);
    assert.equal(labelOf(box).parentNode.className, 'ui4u-checkbox__row');
  });

  it('never reuses the host id, so the document has no duplicate ids', () => {
    const box = mount('<ui-checkbox id="opt-in" label="Email me"></ui-checkbox>').querySelector(
      'ui-checkbox'
    );

    assert.notEqual(nativeOf(box).id, 'opt-in');
    assert.equal(labelOf(box).getAttribute('for'), nativeOf(box).id);
  });

  it('keeps a unique id per generated control', () => {
    const first = mount('<ui-checkbox label="One"></ui-checkbox>').querySelector('ui-checkbox');
    const second = mount('<ui-checkbox label="Two"></ui-checkbox>').querySelector('ui-checkbox');

    assert.ok(nativeOf(first).id);
    assert.notEqual(nativeOf(first).id, nativeOf(second).id);
  });

  it('applies name and value, defaulting the value to on', () => {
    const plain = mount('<ui-checkbox label="One"></ui-checkbox>').querySelector('ui-checkbox');
    const named = mount(
      '<ui-checkbox label="Two" name="releases" value="weekly"></ui-checkbox>'
    ).querySelector('ui-checkbox');

    assert.equal(nativeOf(plain).value, 'on', 'the HTML default is kept');
    assert.equal(plain.value, 'on');
    assert.equal(nativeOf(named).name, 'releases');
    assert.equal(nativeOf(named).value, 'weekly');
    assert.equal(named.value, 'weekly');
  });

  it('renders the authored checked state', () => {
    const box = mount('<ui-checkbox label="One" checked></ui-checkbox>').querySelector(
      'ui-checkbox'
    );

    assert.equal(nativeOf(box).checked, true);
    assert.equal(box.checked, true);
  });

  it('leaves the author children untouched', () => {
    const box = mount(
      '<ui-checkbox label="One"><span class="mine">kept</span></ui-checkbox>'
    ).querySelector('ui-checkbox');

    assert.ok(box.querySelector('span.mine'), 'the author markup is still in the host');
  });

  it('hides the label when there is no label text', () => {
    const box = mount('<ui-checkbox></ui-checkbox>').querySelector('ui-checkbox');

    assert.equal(labelOf(box).hidden, true);
    assert.equal(labelOf(box).textContent, '');
  });

  it('visually hides the label with sr-only, keeping it for AT', () => {
    const box = mount('<ui-checkbox label="Search" sr-only></ui-checkbox>').querySelector(
      'ui-checkbox'
    );

    assert.equal(box.srOnly, true);
    assert.equal(labelOf(box).classList.contains('ui4u-sr-only'), true);
    assert.equal(labelOf(box).hidden, false, 'still exposed, only clipped');
  });
});

describe('ui-checkbox aria wiring', () => {
  afterEach(() => cleanup());

  it('describes the control with the hint', () => {
    const box = mount(
      '<ui-checkbox label="One" hint="Only for release notes."></ui-checkbox>'
    ).querySelector('ui-checkbox');

    assert.equal(nativeOf(box).getAttribute('aria-describedby'), hintOf(box).id);
    assert.equal(hintOf(box).hidden, false);
  });

  it('chains hint and error so both are announced', () => {
    const box = mount(
      '<ui-checkbox label="One" hint="Only for release notes." error="You must accept"></ui-checkbox>'
    ).querySelector('ui-checkbox');

    assert.deepEqual(nativeOf(box).getAttribute('aria-describedby').split(' '), [
      hintOf(box).id,
      errorOf(box).id,
    ]);
  });

  it('drops aria-describedby when neither hint nor error exists', () => {
    const box = mount('<ui-checkbox label="One" hint="Later"></ui-checkbox>').querySelector(
      'ui-checkbox'
    );

    assert.notEqual(nativeOf(box).getAttribute('aria-describedby'), null);

    box.hint = '';
    assert.equal(nativeOf(box).hasAttribute('aria-describedby'), false);

    box.error = 'Boom';
    assert.equal(nativeOf(box).getAttribute('aria-describedby'), errorOf(box).id);

    box.clearValidity();
    assert.equal(nativeOf(box).hasAttribute('aria-describedby'), false);
  });

  it('marks aria-invalid only while an error is set', () => {
    const box = mount('<ui-checkbox label="One"></ui-checkbox>').querySelector('ui-checkbox');

    assert.equal(nativeOf(box).hasAttribute('aria-invalid'), false);

    box.error = 'You must accept';
    assert.equal(nativeOf(box).getAttribute('aria-invalid'), 'true');

    box.error = '';
    assert.equal(nativeOf(box).hasAttribute('aria-invalid'), false);
  });

  it('marks aria-required and aria-readonly from the options', () => {
    const box = mount('<ui-checkbox label="One"></ui-checkbox>').querySelector('ui-checkbox');

    assert.equal(nativeOf(box).hasAttribute('aria-required'), false);
    assert.equal(nativeOf(box).hasAttribute('aria-readonly'), false);

    box.required = true;
    box.readonly = true;

    assert.equal(nativeOf(box).getAttribute('aria-required'), 'true');
    assert.equal(nativeOf(box).getAttribute('aria-readonly'), 'true');
    assert.equal(nativeOf(box).required, true);

    box.required = false;
    box.readonly = false;

    assert.equal(nativeOf(box).hasAttribute('aria-required'), false);
    assert.equal(nativeOf(box).hasAttribute('aria-readonly'), false);
  });

  it('mirrors disabled onto the native control', () => {
    const box = mount('<ui-checkbox label="One"></ui-checkbox>').querySelector('ui-checkbox');

    box.disabled = true;
    assert.equal(nativeOf(box).disabled, true);

    box.disabled = false;
    assert.equal(nativeOf(box).disabled, false);
  });
});

describe('ui-checkbox configure()', () => {
  afterEach(() => cleanup());

  it('applies every option and returns the element', () => {
    const box = mount('<ui-checkbox></ui-checkbox>').querySelector('ui-checkbox');

    const result = box.configure({
      label: 'Email me',
      name: 'releases',
      value: 'weekly',
      checked: true,
      indeterminate: true,
      hint: 'Only for release notes.',
      error: 'You must accept',
      disabled: true,
      required: true,
      readonly: true,
      srOnly: true,
    });

    assert.equal(result, box);
    assert.equal(box.label, 'Email me');
    assert.equal(box.name, 'releases');
    assert.equal(box.value, 'weekly');
    assert.equal(box.checked, true);
    assert.equal(box.indeterminate, true);
    assert.equal(box.hint, 'Only for release notes.');
    assert.equal(box.error, 'You must accept');
    assert.equal(box.disabled, true);
    assert.equal(box.required, true);
    assert.equal(box.readonly, true);
    assert.equal(box.srOnly, true);
    assert.equal(nativeOf(box).indeterminate, true);
    assert.equal(labelOf(box).textContent, 'Email me');
  });

  it('leaves untouched options alone', () => {
    const box = mount('<ui-checkbox label="Email me" required></ui-checkbox>').querySelector(
      'ui-checkbox'
    );

    box.configure({ hint: 'Only for release notes.' });

    assert.equal(box.hint, 'Only for release notes.');
    assert.equal(box.label, 'Email me');
    assert.equal(box.required, true);
  });
});

describe('ui-checkbox checked state', () => {
  afterEach(() => cleanup());

  it('reads the live control, so a user toggle is never clobbered', () => {
    const box = mount('<ui-checkbox label="One" checked></ui-checkbox>').querySelector(
      'ui-checkbox'
    );

    nativeOf(box).checked = false;
    assert.equal(box.checked, false);

    // An unrelated option change must not re-apply `checked`.
    box.hint = 'Later';
    assert.equal(nativeOf(box).checked, false, 'the click survives');
  });

  it('re-applies the authored attribute on the next change', () => {
    const box = mount('<ui-checkbox label="One"></ui-checkbox>').querySelector('ui-checkbox');

    nativeOf(box).checked = true;
    box.hint = 'Later';

    box.setAttribute('checked', '');
    assert.equal(nativeOf(box).checked, true);
  });

  it('the setter works even when the attribute already carries the value', () => {
    const box = mount('<ui-checkbox label="One" checked></ui-checkbox>').querySelector(
      'ui-checkbox'
    );

    assert.equal(box.checked, true);
    box.checked = false;
    assert.equal(nativeOf(box).checked, false);

    box.checked = true;
    assert.equal(nativeOf(box).checked, true, 'setting the same attribute again still applies');
  });
});

describe('ui-checkbox indeterminate state', () => {
  afterEach(() => cleanup());

  it('mirrors the attribute onto the control, which has none of its own', () => {
    const box = mount('<ui-checkbox label="One" indeterminate></ui-checkbox>').querySelector(
      'ui-checkbox'
    );

    assert.equal(box.indeterminate, true);
    assert.equal(nativeOf(box).indeterminate, true);

    box.indeterminate = false;
    assert.equal(nativeOf(box).indeterminate, false);
    assert.equal(box.hasAttribute('indeterminate'), false);
  });

  it('mirrors the control back onto the attribute when the browser clears it', () => {
    const box = mount('<ui-checkbox label="One" indeterminate></ui-checkbox>').querySelector(
      'ui-checkbox'
    );

    // This is what a click does natively, and the reason the attribute cannot
    // be the only copy of the state.
    nativeOf(box).indeterminate = false;
    nativeOf(box).dispatchEvent(new Event('change', { bubbles: true }));

    assert.equal(box.indeterminate, false);
    assert.equal(box.hasAttribute('indeterminate'), false);
  });

  it('the setter applies even when the attribute already carries the value', () => {
    const box = mount('<ui-checkbox label="One" indeterminate></ui-checkbox>').querySelector(
      'ui-checkbox'
    );

    box.indeterminate = true;
    assert.equal(nativeOf(box).indeterminate, true);
  });
});

describe('ui-checkbox readonly', () => {
  afterEach(() => cleanup());

  it('a click cannot change a readonly box', () => {
    const box = mount('<ui-checkbox label="One" readonly></ui-checkbox>').querySelector(
      'ui-checkbox'
    );

    click(nativeOf(box));

    assert.equal(nativeOf(box).checked, false, 'still unticked');
  });

  it('a readonly box stays ticked and emits nothing', () => {
    const box = mount('<ui-checkbox label="One" checked readonly></ui-checkbox>').querySelector(
      'ui-checkbox'
    );
    /** @type {unknown[]} */
    const seen = [];
    box.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    click(nativeOf(box));

    assert.equal(nativeOf(box).checked, true, 'the authored state wins');
    assert.equal(seen.length, 0);
  });
});

describe('ui-checkbox events', () => {
  afterEach(() => cleanup());

  it('emits ui4u:change alongside the native event', () => {
    const box = mount(
      '<ui-checkbox label="One" name="releases" value="weekly"></ui-checkbox>'
    ).querySelector('ui-checkbox');
    /** @type {Array<{ value: string, name: string, checked: boolean }>} */
    const seen = [];
    box.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    nativeOf(box).checked = true;
    nativeOf(box).dispatchEvent(new Event('change', { bubbles: true }));

    assert.deepEqual(seen, [{ value: 'weekly', name: 'releases', checked: true }]);
  });
});

describe('ui-checkbox validation', () => {
  afterEach(() => cleanup());

  it('is valid when unticked and not required', () => {
    const box = mount('<ui-checkbox label="One" name="releases"></ui-checkbox>').querySelector(
      'ui-checkbox'
    );

    assert.deepEqual(box.checkValidity(), {
      valid: true,
      message: '',
      value: 'on',
      name: 'releases',
    });
  });

  it('is invalid when unticked and required', () => {
    const box = mount('<ui-checkbox label="One" required></ui-checkbox>').querySelector(
      'ui-checkbox'
    );
    const result = box.checkValidity();

    assert.equal(result.valid, false);
    assert.ok(result.message.length > 0, 'a message is always reported');
  });

  it('is valid once a required box is ticked', () => {
    const box = mount('<ui-checkbox label="One" required></ui-checkbox>').querySelector(
      'ui-checkbox'
    );

    box.checked = true;

    const result = box.checkValidity();
    assert.equal(result.valid, true);
    assert.equal(result.message, '');
  });

  it('reports the submitted value, not the on/off state', () => {
    const box = mount(
      '<ui-checkbox label="One" name="releases" value="weekly"></ui-checkbox>'
    ).querySelector('ui-checkbox');

    assert.equal(box.checkValidity().value, 'weekly');
  });

  it('treats an author-set error as invalid, with that message', () => {
    const box = mount(
      '<ui-checkbox label="One" error="You must accept the terms"></ui-checkbox>'
    ).querySelector('ui-checkbox');
    const result = box.checkValidity();

    assert.equal(result.valid, false);
    assert.equal(result.message, 'You must accept the terms');
  });

  it('reportValidity() surfaces an error and clearValidity() drops it', () => {
    const box = mount('<ui-checkbox label="One" required></ui-checkbox>').querySelector(
      'ui-checkbox'
    );

    assert.equal(box.reportValidity(), box, 'returns this');
    assert.ok(box.error.length > 0, 'a message became the error');
    assert.equal(nativeOf(box).getAttribute('aria-invalid'), 'true');

    box.clearValidity();
    assert.equal(box.error, '');
    assert.equal(nativeOf(box).hasAttribute('aria-invalid'), false);

    box.checked = true;
    box.reportValidity();
    assert.equal(box.error, '', 'a valid field clears the error state');
  });

  it('does not stay invalid forever after reportValidity()', () => {
    const box = mount('<ui-checkbox label="One" required></ui-checkbox>').querySelector(
      'ui-checkbox'
    );

    box.reportValidity();
    assert.ok(box.error !== '');
    assert.equal(box.checkValidity().valid, false);

    box.checked = true;

    assert.equal(box.checkValidity().valid, true, 'valid once corrected');
  });
});

describe('ui-checkbox text rendering', () => {
  afterEach(() => cleanup());

  it('renders label, hint and error as text, never as markup', () => {
    const box = mount(
      '<ui-checkbox label="&lt;script&gt;x&lt;/script&gt;" hint="&lt;b&gt;hint&lt;/b&gt;" error="&lt;img src=x&gt;"></ui-checkbox>'
    ).querySelector('ui-checkbox');

    assert.equal(labelOf(box).textContent, '<script>x</script>');
    assert.equal(hintOf(box).textContent, '<b>hint</b>');
    assert.equal(errorOf(box).textContent, '<img src=x>');
    assert.equal(labelOf(box).querySelector('script'), null);
    assert.equal(hintOf(box).querySelector('b'), null);
    assert.equal(errorOf(box).querySelector('img'), null);
  });
});

describe('ui-checkbox focus and blur', () => {
  afterEach(() => cleanup());

  it('focus() and blur() drive the native control and return this', () => {
    const box = mount('<ui-checkbox label="One"></ui-checkbox>').querySelector('ui-checkbox');

    assert.equal(box.focus(), box);
    assert.equal(document.activeElement, nativeOf(box));

    assert.equal(box.blur(), box);
    assert.notEqual(document.activeElement, nativeOf(box));
  });
});

describe('ui-checkbox teardown', () => {
  afterEach(() => cleanup());

  it('removes generated markup and keeps the authored children', () => {
    const box = mount(
      '<ui-checkbox label="One"><span class="mine">kept</span></ui-checkbox>'
    ).querySelector('ui-checkbox');

    box.remove();

    assert.equal(box.querySelector('.ui4u-checkbox__row'), null, 'row removed');
    assert.equal(box.querySelector('.ui4u-checkbox__native'), null, 'native input removed');
    assert.equal(box.querySelector('.ui4u-checkbox__hint'), null, 'hint removed');
    assert.equal(box.querySelector('.ui4u-checkbox__error'), null, 'error removed');
    assert.equal(box.querySelector('span.mine').textContent, 'kept', 'author markup restored');
  });

  it('rebuilds correctly when reconnected', () => {
    const box = mount(
      '<ui-checkbox label="One" hint="Later" indeterminate></ui-checkbox>'
    ).querySelector('ui-checkbox');

    box.remove();
    document.body.appendChild(box);

    assert.equal(nativeOf(box).localName, 'input');
    assert.equal(labelOf(box).getAttribute('for'), nativeOf(box).id);
    assert.equal(nativeOf(box).getAttribute('aria-describedby'), hintOf(box).id);
    assert.equal(nativeOf(box).indeterminate, true);
  });

  it('does not emit after disconnect', () => {
    const box = mount('<ui-checkbox label="One"></ui-checkbox>').querySelector('ui-checkbox');
    const native = nativeOf(box);
    /** @type {unknown[]} */
    const seen = [];
    box.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    box.remove();
    native.checked = true;
    native.dispatchEvent(new Event('change', { bubbles: true }));

    assert.equal(seen.length, 0, 'tracked listeners were disposed');
  });

  it('is inert before it connects', () => {
    const box = document.createElement('ui-checkbox');

    assert.equal(box.input, null);
    assert.equal(box.value, 'on');
    assert.equal(box.checked, false);
    assert.equal(box.indeterminate, false);
    assert.equal(box.checkValidity().valid, true);
  });
});
