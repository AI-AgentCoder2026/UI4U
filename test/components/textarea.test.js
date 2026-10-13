import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { cleanup, mount, press, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component module is evaluated — see helpers/dom.js.
setupDom();

const { Textarea } = await import('../../src/components/textarea/textarea.js');
const { define, isDefined } = await import('../../src/core/registry.js');

define('ui-textarea', Textarea);

/** @returns {HTMLTextAreaElement} the native control the component rendered */
function nativeOf(field) {
  return field.querySelector('.ui4u-textarea__native');
}

/** @returns {HTMLLabelElement|null} */
function labelOf(field) {
  return field.querySelector('.ui4u-textarea__label');
}

/** @returns {HTMLElement|null} */
function hintOf(field) {
  return field.querySelector('.ui4u-textarea__hint');
}

/** @returns {HTMLElement|null} */
function errorOf(field) {
  return field.querySelector('.ui4u-textarea__error');
}

/**
 * Types into the native control the way a user would, so the component sees a
 * real `input` event.
 *
 * @param {HTMLTextAreaElement} native
 * @param {string} text
 */
function type(native, text) {
  native.value = text;
  native.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Commits the way the browser does: the native `change` event. */
function commit(native) {
  native.dispatchEvent(new Event('change', { bubbles: true }));
}

/** @param {HTMLTextAreaElement} native */
function focus(native) {
  native.dispatchEvent(new Event('focus', { bubbles: true }));
}

/** @param {HTMLTextAreaElement} native */
function blur(native) {
  native.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * Collects `ui4u:change` payloads in order.
 *
 * @param {EventTarget} target
 * @returns {Array<{ name: string, value: string }>}
 */
function collectChanges(target) {
  /** @type {Array<{ name: string, value: string }>} */
  const seen = [];
  target.addEventListener('ui4u:change', (event) => seen.push(event.detail));
  return seen;
}

describe('ui-textarea registration', () => {
  it('registers the custom element', () => {
    assert.equal(isDefined('ui-textarea'), true);
  });

  it('registers exactly once', async () => {
    const { define: redefine } = await import('../../src/core/registry.js');
    assert.equal(redefine('ui-textarea', Textarea), false);
  });
});

describe('ui-textarea rendering', () => {
  afterEach(() => cleanup());

  it('renders a real native textarea and keeps it', () => {
    const field = mount('<ui-textarea label="Notes"></ui-textarea>').querySelector('ui-textarea');
    const native = nativeOf(field);

    assert.equal(native.localName, 'textarea');
    assert.equal(native.constructor.name, 'HTMLTextAreaElement');
    assert.equal(field.textarea, native, 'the same node is exposed, not a copy');
  });

  it('links the label to the native control', () => {
    const field = mount('<ui-textarea label="Notes"></ui-textarea>').querySelector('ui-textarea');
    const label = labelOf(field);

    assert.equal(label.localName, 'label');
    assert.equal(label.getAttribute('for'), nativeOf(field).id);
    assert.equal(label.textContent, 'Notes');
  });

  it('never reuses the host id, so the document has no duplicate ids', () => {
    const field = mount('<ui-textarea id="notes" label="Notes"></ui-textarea>').querySelector(
      'ui-textarea'
    );

    assert.notEqual(nativeOf(field).id, 'notes');
    assert.equal(labelOf(field).getAttribute('for'), nativeOf(field).id);
  });

  it('defaults to three rows and honours the attribute', () => {
    const field = mount('<ui-textarea label="Notes" rows="6"></ui-textarea>').querySelector(
      'ui-textarea'
    );
    assert.equal(nativeOf(field).rows, 6);

    const fallback = mount('<ui-textarea label="Other"></ui-textarea>').querySelector(
      'ui-textarea'
    );
    assert.equal(nativeOf(fallback).rows, 3);
  });

  it('falls back to the default rows for an unparseable value', () => {
    const field = mount('<ui-textarea label="Notes" rows="lots"></ui-textarea>').querySelector(
      'ui-textarea'
    );

    // `NaN` coerced onto the native property would collapse the field.
    assert.equal(field.rows, 3);
    assert.equal(nativeOf(field).rows, 3);
  });

  it('announces the hint and required state through ARIA', () => {
    const field = mount(
      '<ui-textarea label="Notes" name="notes" required hint="Markdown is fine."></ui-textarea>'
    ).querySelector('ui-textarea');

    const native = nativeOf(field);
    const hint = hintOf(field);

    assert.equal(hint.textContent, 'Markdown is fine.');
    assert.equal(native.getAttribute('aria-describedby'), hint.id);
    assert.equal(native.getAttribute('aria-required'), 'true');
    assert.equal(native.required, true);
    assert.equal(native.name, 'notes');
  });

  it('hides the label from the layout but not the tree with sr-only', () => {
    const field = mount('<ui-textarea label="Notes" sr-only></ui-textarea>').querySelector(
      'ui-textarea'
    );

    const label = labelOf(field);
    assert.equal(label.classList.contains('ui4u-sr-only'), true);
    assert.equal(label.hidden, false, 'still rendered for assistive technology');
    assert.equal(label.textContent, 'Notes');
  });

  it('hides an empty label rather than leaving a blank line', () => {
    const field = mount('<ui-textarea></ui-textarea>').querySelector('ui-textarea');

    assert.equal(labelOf(field).hidden, true);
    assert.equal(hintOf(field).hidden, true);
    assert.equal(errorOf(field).hidden, true);
  });
});

describe('ui-textarea value', () => {
  afterEach(() => cleanup());

  it('renders the authored value into the control', () => {
    const field = mount('<ui-textarea label="Notes" value="Hello"></ui-textarea>').querySelector(
      'ui-textarea'
    );

    assert.equal(nativeOf(field).value, 'Hello');
    assert.equal(field.value, 'Hello');
  });

  it('reads the live control, so typing is never clobbered', () => {
    const field = mount('<ui-textarea label="Notes"></ui-textarea>').querySelector('ui-textarea');
    const native = nativeOf(field);

    type(native, 'Half typed');

    assert.equal(field.value, 'Half typed');
    assert.equal(field.getAttribute('value'), null, 'not written back mid-typing');
  });

  it('reflects the value back onto the attribute', () => {
    const field = mount('<ui-textarea label="Notes" name="notes"></ui-textarea>').querySelector(
      'ui-textarea'
    );
    const native = nativeOf(field);

    type(native, 'Done');
    commit(native);

    assert.equal(field.getAttribute('value'), 'Done');
  });

  it('applies a programmatic value to the control', () => {
    const field = mount('<ui-textarea label="Notes"></ui-textarea>').querySelector('ui-textarea');

    field.value = 'Set from code';

    assert.equal(nativeOf(field).value, 'Set from code');
  });

  it('lets configure() pass options through without resetting the rest', () => {
    const field = mount(
      '<ui-textarea label="Notes" name="notes" hint="Kept" rows="4"></ui-textarea>'
    ).querySelector('ui-textarea');

    field.configure({ rows: 9 });

    assert.equal(field.rows, 9);
    assert.equal(field.hint, 'Kept');
    assert.equal(field.label, 'Notes');
  });
});

describe('ui-textarea change event', () => {
  afterEach(() => cleanup());

  it('does not fire on every keystroke', () => {
    const field = mount('<ui-textarea label="Notes" name="notes"></ui-textarea>').querySelector(
      'ui-textarea'
    );
    const changes = collectChanges(field);

    const native = nativeOf(field);
    type(native, 'A');
    type(native, 'An');
    type(native, 'Any');

    assert.equal(changes.length, 0, 'a paragraph is not three commits');
  });

  it('fires ui4u:input on every keystroke', () => {
    const field = mount('<ui-textarea label="Notes"></ui-textarea>').querySelector('ui-textarea');
    /** @type {unknown[]} */
    const inputs = [];
    field.addEventListener('ui4u:input', (event) => inputs.push(event.detail));

    const native = nativeOf(field);
    type(native, 'A');
    type(native, 'An');

    assert.deepEqual(inputs, [
      { value: 'A', name: '' },
      { value: 'An', name: '' },
    ]);
  });

  it('fires ui4u:change with the name and value on commit', () => {
    const field = mount('<ui-textarea label="Notes" name="notes"></ui-textarea>').querySelector(
      'ui-textarea'
    );
    const changes = collectChanges(field);

    const native = nativeOf(field);
    type(native, 'Shipped');
    commit(native);

    assert.deepEqual(changes, [{ value: 'Shipped', name: 'notes' }]);
  });

  it('commits on Ctrl+Enter without leaving the field', () => {
    const field = mount('<ui-textarea label="Notes" name="notes"></ui-textarea>').querySelector(
      'ui-textarea'
    );
    const changes = collectChanges(field);

    const native = nativeOf(field);
    type(native, 'First line');
    press(native, 'Enter', { ctrlKey: true });

    // Committed from the key itself. The platform does not insert a newline
    // for a modified Enter in a textarea, so there is no later `input` event
    // to commit on — and a reader's next keystroke must not do it instead.
    assert.deepEqual(changes, [{ value: 'First line', name: 'notes' }]);

    type(native, 'First line, second line');
    assert.equal(changes.length, 1, 'the next keystroke does not commit');
  });

  it('commits on Cmd+Enter too, for the macOS idiom', () => {
    const field = mount('<ui-textarea label="Notes" name="notes"></ui-textarea>').querySelector(
      'ui-textarea'
    );
    const changes = collectChanges(field);

    const native = nativeOf(field);
    type(native, 'Done');
    press(native, 'Enter', { metaKey: true });

    assert.deepEqual(changes, [{ value: 'Done', name: 'notes' }]);
  });

  it('lets a change binding veto Ctrl+Enter', () => {
    const field = mount('<ui-textarea label="Notes" name="notes"></ui-textarea>').querySelector(
      'ui-textarea'
    );
    const changes = collectChanges(field);
    field.bind('change', () => false);

    const native = nativeOf(field);
    type(native, 'Rejected');
    press(native, 'Enter', { ctrlKey: true });

    assert.equal(changes.length, 0);
    assert.equal(field.getAttribute('value'), null);
  });

  it('leaves a bare Enter alone, so a newline is not a commit', () => {
    const field = mount('<ui-textarea label="Notes" name="notes"></ui-textarea>').querySelector(
      'ui-textarea'
    );
    const changes = collectChanges(field);

    const native = nativeOf(field);
    type(native, 'Line one');
    press(native, 'Enter');
    type(native, 'Line one\n');

    assert.equal(changes.length, 0);
  });
});

describe('ui-textarea bindings', () => {
  afterEach(() => cleanup());

  it('runs a change binding', () => {
    const field = mount('<ui-textarea label="Notes" name="notes"></ui-textarea>').querySelector(
      'ui-textarea'
    );
    /** @type {unknown[]} */
    const seen = [];

    field.bind('change', (detail) => seen.push(detail));
    const native = nativeOf(field);
    type(native, 'Accepted');
    commit(native);

    assert.deepEqual(seen, [{ value: 'Accepted', name: 'notes' }]);
  });

  it('leaves the component untouched when a change binding returns false', () => {
    const field = mount('<ui-textarea label="Notes" name="notes"></ui-textarea>').querySelector(
      'ui-textarea'
    );
    const changes = collectChanges(field);

    field.bind('change', () => false);
    const native = nativeOf(field);
    type(native, 'Rejected');
    commit(native);

    assert.equal(changes.length, 0, 'a veto suppresses the event');
    assert.equal(field.getAttribute('value'), null, 'and the reflection');
    assert.equal(native.value, 'Rejected', 'but the text stays exactly as typed');
  });

  it('lets a change binding veto through preventDefault() too', () => {
    const field = mount('<ui-textarea label="Notes"></ui-textarea>').querySelector('ui-textarea');
    const changes = collectChanges(field);

    field.bind('change', (detail, event) => event.preventDefault());
    const native = nativeOf(field);
    type(native, 'Rejected');
    commit(native);

    assert.equal(changes.length, 0);
  });

  it('runs the binding before the component mutates anything', () => {
    const field = mount('<ui-textarea label="Notes" name="notes"></ui-textarea>').querySelector(
      'ui-textarea'
    );

    // The attribute is still whatever it was authored as, so a binding reads
    // the state as it was before the commit wrote through it.
    field.value = 'Authored';
    /** @type {string|null} */
    let seen = null;
    field.bind('change', () => {
      seen = field.getAttribute('value');
    });

    const native = nativeOf(field);
    type(native, 'Typed');
    commit(native);

    assert.equal(seen, 'Authored');
    assert.equal(field.getAttribute('value'), 'Typed', 'and the commit writes after');
  });

  it('registers bindings passed through configure()', () => {
    const field = mount('<ui-textarea label="Notes"></ui-textarea>').querySelector('ui-textarea');
    /** @type {unknown[]} */
    const seen = [];

    field.configure({ bindings: { change: (detail) => seen.push(detail) } });
    const native = nativeOf(field);
    type(native, 'Hi');
    commit(native);

    assert.deepEqual(seen, [{ value: 'Hi', name: '' }]);
  });
});

describe('ui-textarea validation', () => {
  afterEach(() => cleanup());

  it('fails an empty required field', () => {
    const field = mount(
      '<ui-textarea label="Notes" name="notes" required></ui-textarea>'
    ).querySelector('ui-textarea');

    const result = field.checkValidity();

    assert.equal(result.valid, false);
    assert.notEqual(result.message, '');
    assert.equal(result.value, '');
    assert.equal(result.name, 'notes');
  });

  it('passes once the required field has text', () => {
    const field = mount(
      '<ui-textarea label="Notes" name="notes" required></ui-textarea>'
    ).querySelector('ui-textarea');

    type(nativeOf(field), 'Something');

    assert.equal(field.checkValidity().valid, true);
  });

  it('treats an optional empty field as valid', () => {
    const field = mount('<ui-textarea label="Notes"></ui-textarea>').querySelector('ui-textarea');

    assert.equal(field.checkValidity().valid, true);
  });

  it('reports an author-set error as invalid', () => {
    const field = mount(
      '<ui-textarea label="Notes" error="Say something."></ui-textarea>'
    ).querySelector('ui-textarea');

    assert.deepEqual(field.checkValidity(), {
      valid: false,
      message: 'Say something.',
      value: '',
      name: '',
    });
  });

  it('drives the invalid state from aria-invalid, not a bespoke class', () => {
    const field = mount(
      '<ui-textarea label="Notes" error="Say something."></ui-textarea>'
    ).querySelector('ui-textarea');
    const native = nativeOf(field);

    assert.equal(native.getAttribute('aria-invalid'), 'true');
    assert.equal(errorOf(field).textContent, 'Say something.');
    assert.equal(
      native.getAttribute('aria-describedby'),
      errorOf(field).id,
      'the message is announced, not just drawn'
    );

    field.error = '';
    assert.equal(native.hasAttribute('aria-invalid'), false);
    assert.equal(errorOf(field).hidden, true);
  });

  it('chains hint and error through aria-describedby', () => {
    const field = mount(
      '<ui-textarea label="Notes" hint="Markdown is fine." error="Say something."></ui-textarea>'
    ).querySelector('ui-textarea');

    assert.equal(
      nativeOf(field).getAttribute('aria-describedby'),
      `${hintOf(field).id} ${errorOf(field).id}`
    );
  });

  it('reportValidity() surfaces the message and marks the field invalid', () => {
    const field = mount('<ui-textarea label="Notes" required></ui-textarea>').querySelector(
      'ui-textarea'
    );

    field.reportValidity();

    assert.notEqual(field.error, '');
    assert.equal(nativeOf(field).getAttribute('aria-invalid'), 'true');
  });

  it('reportValidity() clears the state of a valid field', () => {
    const field = mount('<ui-textarea label="Notes" required></ui-textarea>').querySelector(
      'ui-textarea'
    );

    type(nativeOf(field), 'Fine');
    field.reportValidity();

    assert.equal(field.error, '');
    assert.equal(nativeOf(field).hasAttribute('aria-invalid'), false);
  });

  it('does not treat its own reported error as an author override', () => {
    const field = mount('<ui-textarea label="Notes" required></ui-textarea>').querySelector(
      'ui-textarea'
    );

    field.reportValidity();
    type(nativeOf(field), 'Now answered');

    // The error it is judged by came from the error it produced, so it must not
    // keep the field permanently invalid.
    assert.equal(field.checkValidity().valid, true);
  });

  it('clearValidity() drops the error without validating', () => {
    // No `required` here: the assertion is about the *custom* validity this
    // component sets, and a required-but-empty control keeps the browser's own
    // constraint message no matter what `clearValidity()` does.
    const field = mount(
      '<ui-textarea label="Notes" error="Say something."></ui-textarea>'
    ).querySelector('ui-textarea');

    field.clearValidity();

    assert.equal(field.error, '');
    assert.equal(nativeOf(field).hasAttribute('aria-invalid'), false);
    assert.equal(nativeOf(field).validationMessage, '');
  });
});

describe('ui-textarea disabled and readonly', () => {
  afterEach(() => cleanup());

  it('mirrors disabled onto the native control', () => {
    const field = mount('<ui-textarea label="Notes" disabled></ui-textarea>').querySelector(
      'ui-textarea'
    );

    assert.equal(nativeOf(field).disabled, true);

    field.disabled = false;
    assert.equal(nativeOf(field).disabled, false);
  });

  it('mirrors readonly onto the native control', () => {
    const field = mount(
      '<ui-textarea label="Notes" value="Locked" readonly></ui-textarea>'
    ).querySelector('ui-textarea');

    assert.equal(nativeOf(field).readOnly, true);
    assert.equal(nativeOf(field).value, 'Locked');
  });

  it('still commits from a readonly field, which a copy action may trigger', () => {
    const field = mount(
      '<ui-textarea label="Notes" name="notes" value="Locked" readonly></ui-textarea>'
    ).querySelector('ui-textarea');
    const changes = collectChanges(field);

    commit(nativeOf(field));

    assert.deepEqual(changes, [{ value: 'Locked', name: 'notes' }]);
  });
});

describe('ui-textarea auto-grow', () => {
  afterEach(() => cleanup());

  /**
   * jsdom does not lay out, so `scrollHeight` is always 0. Giving the control
   * a measurable one is what makes the height logic observable here.
   *
   * @param {HTMLTextAreaElement} native
   * @param {number} height
   */
  function measure(native, height) {
    Object.defineProperty(native, 'scrollHeight', { value: height, configurable: true });
  }

  it('marks the host so the stylesheet can cap the growth', () => {
    const field = mount('<ui-textarea label="Notes" grow></ui-textarea>').querySelector(
      'ui-textarea'
    );

    assert.equal(field.dataset.grow, '');
    assert.equal(nativeOf(field).getAttribute('data-grow'), null);
  });

  it('leaves a field without grow at whatever height CSS gives it', () => {
    const field = mount('<ui-textarea label="Notes"></ui-textarea>').querySelector('ui-textarea');
    const native = nativeOf(field);
    measure(native, 320);

    type(native, 'a'.repeat(400));

    assert.equal(native.style.height, '', 'never touched');
  });

  it('grows to fit the content', () => {
    const field = mount('<ui-textarea label="Notes" grow></ui-textarea>').querySelector(
      'ui-textarea'
    );
    const native = nativeOf(field);
    measure(native, 320);

    type(native, 'a paragraph of text');

    assert.equal(native.style.height, '320px');
  });

  it('does not shrink the field out from under a reader mid-typing', () => {
    const field = mount('<ui-textarea label="Notes" grow></ui-textarea>').querySelector(
      'ui-textarea'
    );
    const native = nativeOf(field);
    measure(native, 320);

    focus(native);
    type(native, 'a paragraph of text');
    // Deleting back down: the box must not follow, or the text the reader is
    // editing moves on every keystroke.
    measure(native, 80);
    type(native, 'a para');

    assert.equal(native.style.height, '320px', 'grows only while focused');
  });

  it('tightens back up once the field loses focus', () => {
    const field = mount('<ui-textarea label="Notes" grow></ui-textarea>').querySelector(
      'ui-textarea'
    );
    const native = nativeOf(field);
    measure(native, 320);

    focus(native);
    type(native, 'a paragraph of text');
    measure(native, 80);
    blur(native);

    assert.equal(native.style.height, '80px');
  });

  it('never touches the accessible value', () => {
    const field = mount(
      '<ui-textarea label="Notes" name="notes" grow></ui-textarea>'
    ).querySelector('ui-textarea');
    const native = nativeOf(field);
    measure(native, 320);

    type(native, 'a paragraph of text');

    assert.equal(field.value, 'a paragraph of text');
    assert.equal(native.value, 'a paragraph of text');
    assert.equal(native.rows, field.rows, 'and never the row count');
  });

  it('leaves the field alone on a host that cannot measure it', () => {
    const field = mount('<ui-textarea label="Notes" grow></ui-textarea>').querySelector(
      'ui-textarea'
    );
    const native = nativeOf(field);

    // No `measure()`: jsdom reports 0, and a `height: 0px` would collapse it.
    type(native, 'text');

    assert.equal(native.style.height, '');
  });
});

describe('ui-textarea teardown', () => {
  afterEach(() => cleanup());

  it('removes every generated node on disconnect', () => {
    const host = mount('<ui-textarea label="Notes" hint="Kept"></ui-textarea>');
    const field = host.querySelector('ui-textarea');

    field.remove();

    assert.equal(field.querySelector('.ui4u-textarea__native'), null);
    assert.equal(field.querySelector('.ui4u-textarea__label'), null);
    assert.equal(field.querySelector('.ui4u-textarea__hint'), null);
    assert.equal(field.querySelector('.ui4u-textarea__error'), null);
    assert.equal(field.childNodes.length, 0, 'nothing of its own is left behind');
  });

  it('stops emitting once disconnected', () => {
    const host = mount('<ui-textarea label="Notes" name="notes"></ui-textarea>');
    const field = host.querySelector('ui-textarea');
    const changes = collectChanges(field);
    const native = nativeOf(field);

    field.remove();

    type(native, 'Ignored');
    commit(native);

    assert.equal(changes.length, 0, 'the listeners are gone with the listeners list');
  });

  it('rebuilds on reconnect without duplicating the control', () => {
    const host = mount('<ui-textarea label="Notes" hint="Kept"></ui-textarea>');
    const field = host.querySelector('ui-textarea');

    field.remove();
    host.append(field);

    assert.equal(field.querySelectorAll('.ui4u-textarea__native').length, 1);
    assert.equal(field.textarea, field.querySelector('.ui4u-textarea__native'));
    assert.equal(labelOf(field).textContent, 'Notes');
    assert.equal(field.dataset.size, 'md');
  });

  it('reconnects with a fresh id, never colliding with the old one', () => {
    const host = mount('<ui-textarea label="Notes"></ui-textarea>');
    const field = host.querySelector('ui-textarea');
    const first = nativeOf(field).id;

    field.remove();
    host.append(field);

    assert.notEqual(nativeOf(field).id, first);
    assert.equal(labelOf(field).getAttribute('for'), nativeOf(field).id);
  });
});
