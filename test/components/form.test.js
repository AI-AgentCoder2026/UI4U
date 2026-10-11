import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { cleanup, mount, setupDom } from '../helpers/dom.js';

// The DOM must exist before any component module is evaluated — the base class
// captures globalThis.HTMLElement at module scope. See helpers/dom.js.
setupDom();

const { Form } = await import('../../src/components/form/form.js');
const { Input } = await import('../../src/components/input/input.js');
const { define, isDefined } = await import('../../src/core/registry.js');

// `ui-input` is a dependency of the form, not a fixture: the form discovers and
// validates real fields, so the element has to exist for the tests to mean
// anything.
define('ui-form', Form);
define('ui-input', Input);

/**
 * The native `<form>` the component renders.
 *
 * @param {Element} form
 * @returns {HTMLFormElement}
 */
function nativeOf(form) {
  return form.querySelector('form');
}

/**
 * Fires the submit the way the platform would. jsdom does not implement
 * interactive submission, so the test dispatches the cancelable event itself —
 * which is exactly what the component listens for.
 *
 * @param {Element} form
 * @returns {Event}
 */
function submit(form) {
  const event = new Event('submit', { bubbles: true, cancelable: true });
  nativeOf(form).dispatchEvent(event);
  return event;
}

/**
 * Types into a field's native control, the way a user would.
 *
 * @param {Element} field
 * @param {string} text
 */
function type(field, text) {
  const native = field.querySelector('.ui4u-input__native');
  native.value = text;
  native.dispatchEvent(new Event('input', { bubbles: true }));
  native.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * @param {Element} form
 * @param {string} name
 * @returns {Element}
 */
function fieldNamed(form, name) {
  return form.querySelector(`ui-input[name="${name}"]`);
}

/** @param {Element} form */
function summaryOf(form) {
  return form.querySelector('.ui4u-form__summary');
}

/** @param {Element} form */
function summaryEntries(form) {
  return [...form.querySelectorAll('.ui4u-form__summary-link')];
}

const TWO_FIELDS = `
  <ui-form id="form">
    <ui-input name="email" label="Email" type="email" required></ui-input>
    <ui-input name="nickname" label="Nickname"></ui-input>
  </ui-form>
`;

describe('ui-form registration', () => {
  it('registers the custom element', () => {
    assert.equal(isDefined('ui-form'), true);
  });
});

describe('ui-form rendering', () => {
  afterEach(() => cleanup());

  it('wraps the author markup in a real form element', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');
    const native = nativeOf(form);

    assert.equal(native.localName, 'form');
    assert.equal(native.parentElement, form);
    assert.equal(form.form, native, 'the same node is exposed, not a copy');
  });

  it('never lets the browser pre-empt the submit event', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');

    // UI4U reports the failures itself, so native constraint validation must be
    // off — otherwise no submit event is fired at all when a field is invalid.
    assert.equal(nativeOf(form).noValidate, true);
  });

  it('puts the author children inside the native form, summary first', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');

    assert.equal(nativeOf(form).firstElementChild, summaryOf(form));
    assert.equal(nativeOf(form).contains(fieldNamed(form, 'email')), true);
  });

  it('discovers fields by name and ignores the unnamed ones', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');

    assert.deepEqual(
      form.fields.map((field) => field.getAttribute('name')),
      ['email', 'nickname']
    );
  });

  it('leaves fields of a nested ui-form to that form', () => {
    const form = mount(`
      <ui-form id="outer">
        <ui-input name="email" required></ui-input>
        <ui-form id="inner"><ui-input name="secret" required></ui-input></ui-form>
      </ui-form>
    `).querySelector('#outer');

    assert.deepEqual(
      form.fields.map((field) => field.getAttribute('name')),
      ['email']
    );
  });
});

describe('ui-form validate()', () => {
  afterEach(() => cleanup());

  it('clears a stale error once the field passes', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');
    const field = fieldNamed(form, 'email');

    // The form marked it; now the value is good.
    assert.equal(form.validate().valid, false);
    type(field, 'ada@example.com');

    const result = form.validate();

    assert.equal(result.valid, true, 'the error this form wrote must not mask the fix');
    assert.deepEqual(result.errors, []);
    assert.equal(field.error, '', 'the stale error is dropped');
  });

  it('returns one entry per failing field, in document order', () => {
    const form = mount(`
      <ui-form id="form">
        <ui-input name="email" label="Email" type="email" required></ui-input>
        <ui-input name="password" label="Password" required></ui-input>
      </ui-form>
    `).querySelector('ui-form');

    const { valid, errors } = form.validate();

    assert.equal(valid, false);
    assert.equal(errors.length, 2);
    assert.deepEqual(
      errors.map((error) => error.name),
      ['email', 'password']
    );
    assert.equal(typeof errors[0].message, 'string');
    assert.ok(errors[0].message.length > 0, 'a failure always carries a message');
    assert.equal(errors[0].field, fieldNamed(form, 'email'), 'the field itself is handed back');
  });

  it('marks each failing field with its message', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');
    const field = fieldNamed(form, 'email');

    const { errors } = form.validate();

    assert.equal(field.error, errors[0].message);
    assert.equal(field.querySelector('.ui4u-input__native').getAttribute('aria-invalid'), 'true');
  });

  it('keeps an author-set error as a failure', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');
    const field = fieldNamed(form, 'email');

    field.error = 'That address is already registered.';
    const { valid, errors } = form.validate();

    assert.equal(valid, false);
    assert.equal(errors[0].message, 'That address is already registered.');
  });

  it('reads live values by name', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');

    type(fieldNamed(form, 'email'), 'ada@example.com');
    type(fieldNamed(form, 'nickname'), 'ada');

    assert.deepEqual(form.values, { email: 'ada@example.com', nickname: 'ada' });
  });
});

describe('ui-form submission', () => {
  afterEach(() => cleanup());

  it('emits ui4u:submit with the values and does not block', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');
    type(fieldNamed(form, 'email'), 'ada@example.com');

    /** @type {any[]} */
    const seen = [];
    form.addEventListener('ui4u:submit', (event) => seen.push(event.detail));

    const event = submit(form);

    assert.equal(event.defaultPrevented, false);
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].values, { email: 'ada@example.com', nickname: '' });
    assert.equal(summaryOf(form).hidden, true, 'no summary for a valid submit');
  });

  it('prevents the submit and emits ui4u:invalid when a field fails', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');

    /** @type {any[]} */
    const blocked = [];
    let submitted = 0;
    form.addEventListener('ui4u:invalid', (event) => blocked.push(event.detail));
    form.addEventListener('ui4u:submit', () => submitted++);

    const event = submit(form);

    assert.equal(event.defaultPrevented, true, 'the browser is told no');
    assert.equal(submitted, 0);
    assert.equal(blocked.length, 1);
    assert.equal(blocked[0].errors.length, 1);
    assert.equal(blocked[0].errors[0].name, 'email');
  });

  it('moves focus to the first invalid field', () => {
    const form = mount(`
      <ui-form id="form">
        <ui-input name="nickname" label="Nickname"></ui-input>
        <ui-input name="email" label="Email" type="email" required></ui-input>
        <ui-input name="password" label="Password" required></ui-input>
      </ui-form>
    `).querySelector('ui-form');

    submit(form);

    const firstInvalid = fieldNamed(form, 'email').querySelector('.ui4u-input__native');
    assert.equal(document.activeElement, firstInvalid);
  });

  it('leaves focus alone when nothing is invalid', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');
    type(fieldNamed(form, 'email'), 'ada@example.com');

    submit(form);

    assert.notEqual(
      document.activeElement,
      fieldNamed(form, 'email').querySelector('.ui4u-input__native')
    );
  });

  it('lets the consumer cancel the native submit from the event detail', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');
    type(fieldNamed(form, 'email'), 'ada@example.com');

    form.addEventListener('ui4u:submit', (event) => event.detail.event.preventDefault());

    assert.equal(submit(form).defaultPrevented, true);
  });

  it('submits without validating when noValidate is set', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');

    let submitted = 0;
    form.addEventListener('ui4u:submit', () => submitted++);

    form.noValidate = true;
    const event = submit(form);

    assert.equal(event.defaultPrevented, false);
    assert.equal(submitted, 1);
    assert.equal(fieldNamed(form, 'email').error, '', 'the field is left alone');
    assert.equal(summaryOf(form).hidden, true);
  });
});

describe('ui-form error summary', () => {
  afterEach(() => cleanup());

  it('is a role="alert" region that is hidden while the form is valid', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');
    const summary = summaryOf(form);

    assert.equal(summary.getAttribute('role'), 'alert');
    assert.equal(summary.hidden, true);

    submit(form);
    assert.equal(summary.hidden, false);

    type(fieldNamed(form, 'email'), 'ada@example.com');
    form.validate();
    assert.equal(summary.hidden, true, 'it disappears once everything passes');
  });

  it('lists every failure and links each entry to its field', () => {
    const form = mount(`
      <ui-form id="form">
        <ui-input name="email" label="Email" type="email" required></ui-input>
        <ui-input name="password" label="Password" required></ui-input>
      </ui-form>
    `).querySelector('ui-form');

    submit(form);

    const entries = summaryEntries(form);
    assert.equal(entries.length, 2);
    assert.deepEqual(
      entries.map((entry) => entry.getAttribute('data-field')),
      ['email', 'password']
    );
    for (const entry of entries) {
      assert.equal(entry.localName, 'button');
      assert.equal(entry.getAttribute('type'), 'button');
      assert.ok(entry.textContent.length > 0);
    }

    // Each entry points at the control it describes.
    const controlId = fieldNamed(form, 'email').querySelector('.ui4u-input__native').id;
    assert.equal(entries[0].getAttribute('aria-controls'), controlId);
  });

  it('names the field and the message in each entry', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');

    submit(form);
    const [entry] = summaryEntries(form);

    assert.ok(entry.textContent.startsWith('Email: '));
  });

  it('moves focus to the field when an entry is activated', () => {
    const form = mount(`
      <ui-form id="form">
        <ui-input name="email" label="Email" type="email" required></ui-input>
        <ui-input name="password" label="Password" required></ui-input>
      </ui-form>
    `).querySelector('ui-form');

    submit(form);
    summaryEntries(form)[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));

    assert.equal(
      document.activeElement,
      fieldNamed(form, 'password').querySelector('.ui4u-input__native')
    );
  });

  it('renders messages as text, never markup', () => {
    const form = mount(`
      <ui-form id="form">
        <ui-input name="&lt;img src=x&gt;" label="&lt;b&gt;Field&lt;/b&gt;" required></ui-input>
      </ui-form>
    `).querySelector('ui-form');

    submit(form);

    const [entry] = summaryEntries(form);
    assert.equal(entry.querySelector('img'), null);
    assert.equal(entry.querySelector('b'), null);
    assert.equal(entry.getAttribute('data-field'), '<img src=x>');
    assert.ok(entry.textContent.startsWith('<b>Field</b>: '), entry.textContent);
  });
});

describe('ui-form options', () => {
  afterEach(() => cleanup());

  it('defaults to validating on submit', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');

    assert.equal(form.validateOn, 'submit');
    assert.equal(form.dataset.validateOn, 'submit');
  });

  it('configure() applies options and returns the element', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');

    const returned = form.configure({ validateOn: 'change', noValidate: true });

    assert.equal(returned, form);
    assert.equal(form.validateOn, 'change');
    assert.equal(form.noValidate, true);
  });

  it('configure() leaves untouched options alone', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');
    form.configure({ validateOn: 'blur' });

    form.configure({ noValidate: true });

    assert.equal(form.validateOn, 'blur');
  });

  it('falls back to submit for an unknown validateOn', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');

    form.validateOn = 'whenever';

    assert.equal(form.validateOn, 'submit');
  });

  it('re-validates as fields change', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');
    form.configure({ validateOn: 'change' });
    const field = fieldNamed(form, 'email');

    type(field, 'nope');

    assert.equal(field.error !== '', true, 'the bad address is reported');
    assert.equal(field.querySelector('.ui4u-input__native').getAttribute('aria-invalid'), 'true');

    type(field, 'ada@example.com');

    assert.equal(field.error, '', 'the fixed field clears itself');
    assert.equal(form.validateOn, 'change');
  });

  it('keeps the summary quiet until a submit has been attempted', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');
    form.configure({ validateOn: 'change' });

    type(fieldNamed(form, 'email'), 'nope');
    assert.equal(summaryOf(form).hidden, true, 'no alert while the user is still typing');

    submit(form);
    assert.equal(summaryOf(form).hidden, false);

    type(fieldNamed(form, 'email'), 'ada@example.com');
    assert.equal(summaryOf(form).hidden, true, 'and it clears once the form is fixed');
  });

  it('re-validates on blur', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');
    form.configure({ validateOn: 'blur' });
    const field = fieldNamed(form, 'email');

    const native = field.querySelector('.ui4u-input__native');
    native.value = 'ada@example.com';
    native.dispatchEvent(new Event('focusout', { bubbles: true }));

    assert.equal(field.error, '');
  });

  it('does not re-validate on change by default', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');

    type(fieldNamed(form, 'email'), 'nope');

    assert.equal(fieldNamed(form, 'email').error, '', 'nothing happens before a submit');
  });
});

describe('ui-form resetValidity()', () => {
  afterEach(() => cleanup());

  it('drops every reported error and hides the summary', () => {
    const form = mount(`
      <ui-form id="form">
        <ui-input name="email" label="Email" type="email" required></ui-input>
        <ui-input name="password" label="Password" required></ui-input>
      </ui-form>
    `).querySelector('ui-form');

    submit(form);
    const returned = form.resetValidity();

    assert.equal(returned, form);
    assert.equal(fieldNamed(form, 'email').error, '');
    assert.equal(fieldNamed(form, 'password').error, '');
    assert.equal(summaryOf(form).hidden, true);
  });

  it('lets a live summary reappear after a later submit', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');
    form.configure({ validateOn: 'change' });

    submit(form);
    form.resetValidity();

    type(fieldNamed(form, 'email'), 'nope');

    assert.equal(fieldNamed(form, 'email').error !== '', true);
    assert.equal(summaryOf(form).hidden, true, 'the reset suppressed the alert again');
  });
});

describe('ui-form teardown', () => {
  afterEach(() => cleanup());

  it('puts the author children back and removes the generated form', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');
    const email = fieldNamed(form, 'email');

    form.remove();

    assert.equal(nativeOf(form), null, 'the generated form is gone');
    assert.equal(form.firstElementChild, email, 'the author markup is back where it was');
    assert.equal(form.fields.length, 2, 'the fields are still discoverable');
  });

  it('stops listening to submit once disconnected', () => {
    const form = mount(TWO_FIELDS).querySelector('ui-form');
    let blocked = 0;
    form.addEventListener('ui4u:invalid', () => blocked++);

    form.remove();
    nativeOf(form)?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    assert.equal(blocked, 0);
  });

  it('rebuilds cleanly when reconnected', () => {
    const host = mount(TWO_FIELDS);
    const form = host.querySelector('ui-form');

    form.remove();
    host.appendChild(form);

    assert.ok(nativeOf(form), 'the native form is rendered again');
    assert.equal(nativeOf(form).contains(fieldNamed(form, 'email')), true);
    assert.equal(nativeOf(form).querySelectorAll('.ui4u-form__summary').length, 1);
  });
});
