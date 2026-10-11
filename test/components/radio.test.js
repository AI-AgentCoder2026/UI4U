import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { cleanup, mount, press, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component module is evaluated — see helpers/dom.js.
setupDom();

const { Radio, RadioGroup } = await import('../../src/components/radio/radio.js');
const { define, isDefined } = await import('../../src/core/registry.js');

define('ui-radio', Radio);
define('ui-radio-group', RadioGroup);

const GROUP = `
  <ui-radio-group label="Plan" name="plan">
    <ui-radio value="free">Free</ui-radio>
    <ui-radio value="pro">Pro</ui-radio>
    <ui-radio value="team">Team</ui-radio>
  </ui-radio-group>
`;

/** @returns {HTMLElement[]} */
function radiosOf(group) {
  return [...group.querySelectorAll('ui-radio')];
}

/** @returns {HTMLInputElement[]} */
function inputsOf(group) {
  return radiosOf(group).map((radio) => radio.querySelector('.ui4u-radio__native'));
}

describe('ui-radio registration', () => {
  it('registers both custom elements', () => {
    assert.equal(isDefined('ui-radio'), true);
    assert.equal(isDefined('ui-radio-group'), true);
  });
});

describe('ui-radio rendering', () => {
  let host;
  let group;

  beforeEach(() => {
    host = mount(GROUP);
    group = host.querySelector('ui-radio-group');
  });

  afterEach(() => cleanup());

  it('wraps the group in a fieldset with a legend', () => {
    const fieldset = group.querySelector('fieldset.ui4u-radio-group__field');
    const legend = fieldset.querySelector('legend.ui4u-radio-group__legend');

    assert.ok(fieldset, 'a real fieldset is rendered');
    assert.equal(legend.textContent, 'Plan');
    assert.equal(legend.parentNode, fieldset);
    assert.equal(group.fieldset, fieldset, 'the same node is exposed, not a copy');
  });

  it('exposes the group as a radiogroup', () => {
    assert.equal(group.querySelector('[role="radiogroup"]'), group.fieldset);
  });

  it('hides the legend when there is no label text', () => {
    const bare = mount('<ui-radio-group></ui-radio-group>').querySelector('ui-radio-group');
    const legend = bare.querySelector('legend');

    assert.equal(legend.hidden, true);
    assert.equal(legend.textContent, '');
  });

  it('visually hides the legend with sr-only, keeping it for AT', () => {
    const hidden = mount('<ui-radio-group label="Plan" sr-only></ui-radio-group>').querySelector(
      'ui-radio-group'
    );
    const legend = hidden.querySelector('legend');

    assert.equal(hidden.srOnly, true);
    assert.equal(legend.classList.contains('ui4u-sr-only'), true);
    assert.equal(legend.hidden, false, 'still exposed, only clipped');
  });

  it('renders a real native radio per option, with the text as its label', () => {
    const [first] = inputsOf(group);
    const label = first.parentNode.querySelector('label');

    assert.equal(first.constructor.name, 'HTMLInputElement');
    assert.equal(first.type, 'radio');
    assert.equal(label.textContent, 'Free');
    assert.equal(label.getAttribute('for'), first.id);
  });

  it('never nests the control inside the label', () => {
    const [first] = inputsOf(group);
    const label = first.parentNode.querySelector('label');

    // A label that wraps other controls swallows their clicks; `for` keeps the
    // two cleanly separated.
    assert.equal(label.querySelector('input'), null);
  });

  it('keeps a unique id per generated control', () => {
    const ids = inputsOf(group).map((input) => input.id);

    assert.ok(ids.every(Boolean), 'all inputs have ids');
    assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  });

  it('shares one name across the group, so the options are one native group', () => {
    assert.deepEqual(
      inputsOf(group).map((input) => input.name),
      ['plan', 'plan', 'plan']
    );
  });

  it('checks the option named by the value attribute', () => {
    const selected = mount(`
      <ui-radio-group label="Plan" name="plan" value="pro">
        <ui-radio value="free">Free</ui-radio>
        <ui-radio value="pro">Pro</ui-radio>
      </ui-radio-group>
    `).querySelector('ui-radio-group');

    assert.equal(selected.value, 'pro');
    assert.deepEqual(
      [...selected.querySelectorAll('.ui4u-radio__native')].map((input) => input.checked),
      [false, true]
    );
  });
});

describe('ui-radio selection', () => {
  let group;
  let inputs;

  beforeEach(() => {
    group = mount(GROUP).querySelector('ui-radio-group');
    inputs = inputsOf(group);
  });

  afterEach(() => cleanup());

  it('reports the selected value, or an empty string', () => {
    assert.equal(group.value, '');

    inputs[1].checked = true;
    inputs[1].dispatchEvent(new Event('change', { bubbles: true }));

    assert.equal(group.value, 'pro');
  });

  it('checking one option clears its siblings', () => {
    inputs[0].checked = true;
    inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
    inputs[2].checked = true;
    inputs[2].dispatchEvent(new Event('change', { bubbles: true }));

    assert.deepEqual(
      inputs.map((input) => input.checked),
      [false, false, true]
    );
    assert.equal(group.value, 'team');
  });

  it('the value setter selects the matching option', () => {
    group.value = 'team';

    assert.deepEqual(
      inputs.map((input) => input.checked),
      [false, false, true]
    );
    assert.equal(group.value, 'team');
  });

  it('an unknown value leaves the group untouched', () => {
    group.value = 'enterprise';

    assert.equal(group.value, '');
    assert.equal(
      inputs.some((input) => input.checked),
      false
    );
  });

  it('reflects the selection back onto the value attribute', () => {
    inputs[2].checked = true;
    inputs[2].dispatchEvent(new Event('change', { bubbles: true }));

    assert.equal(group.getAttribute('value'), 'team');
  });

  it('emits one ui4u:change on the group per selection', () => {
    /** @type {Array<{ value: string, name: string }>} */
    const seen = [];
    group.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    inputs[1].checked = true;
    inputs[1].dispatchEvent(new Event('change', { bubbles: true }));

    assert.deepEqual(seen, [{ value: 'pro', name: 'plan' }]);
  });

  it('a single option emits its own ui4u:change, without bubbling into a group', () => {
    const solo = mount(
      '<ui-radio-group label="Plan" name="plan"><ui-radio value="free">Free</ui-radio></ui-radio-group>'
    ).querySelector('ui-radio-group');
    /** @type {unknown[]} */
    const onGroup = [];
    /** @type {unknown[]} */
    const onRadio = [];
    solo.addEventListener('ui4u:change', (event) => onGroup.push(event.detail));
    solo
      .querySelector('ui-radio')
      .addEventListener('ui4u:change', (event) => onRadio.push(event.detail));

    const input = solo.querySelector('.ui4u-radio__native');
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));

    assert.equal(onRadio.length, 1, 'the option reports itself');
    assert.equal(onGroup.length, 1, 'and the group reports it exactly once');
  });
});

describe('ui-radio-group keyboard model', () => {
  let group;
  let radios;
  let inputs;

  beforeEach(() => {
    group = mount(GROUP).querySelector('ui-radio-group');
    radios = radiosOf(group);
    inputs = inputsOf(group);
  });

  afterEach(() => cleanup());

  it('the checked option is the single tab stop', () => {
    inputs[1].checked = true;
    inputs[1].dispatchEvent(new Event('change', { bubbles: true }));

    assert.deepEqual(
      inputs.map((input) => input.tabIndex),
      [-1, 0, -1]
    );
  });

  it('with nothing checked, the first option is the single tab stop', () => {
    assert.deepEqual(
      inputs.map((input) => input.tabIndex),
      [0, -1, -1]
    );
  });

  it('a disabled first option hands the tab stop to the next enabled one', () => {
    group = mount(`
      <ui-radio-group label="Plan" name="plan">
        <ui-radio value="free" disabled>Free</ui-radio>
        <ui-radio value="pro">Pro</ui-radio>
      </ui-radio-group>
    `).querySelector('ui-radio-group');
    inputs = inputsOf(group);

    assert.deepEqual(
      inputs.map((input) => input.tabIndex),
      [-1, 0]
    );
  });

  it('ArrowDown moves to the next option and checks it', () => {
    const event = press(inputs[0], 'ArrowDown');

    assert.equal(event.defaultPrevented, true);
    assert.equal(radios[1].checked, true);
    assert.equal(document.activeElement, inputs[1]);
    assert.equal(group.value, 'pro');
    assert.deepEqual(
      inputs.map((input) => input.tabIndex),
      [-1, 0, -1],
      'the tab stop follows the selection'
    );
  });

  it('ArrowRight moves forward and ArrowLeft moves back', () => {
    press(inputs[0], 'ArrowRight');
    assert.equal(group.value, 'pro');

    press(inputs[1], 'ArrowLeft');
    assert.equal(group.value, 'free');
  });

  it('ArrowUp moves to the previous option and checks it', () => {
    inputs[2].checked = true;
    inputs[2].dispatchEvent(new Event('change', { bubbles: true }));

    press(inputs[2], 'ArrowUp');

    assert.equal(radios[1].checked, true);
    assert.equal(group.value, 'pro');
  });

  it('clamps at the ends instead of wrapping', () => {
    inputs[0].focus();
    const up = press(inputs[0], 'ArrowUp');

    assert.equal(group.value, '', 'nothing before the first option');
    assert.equal(document.activeElement, inputs[0], 'focus does not move');
    // The key is swallowed even when nothing moved: the platform's own radio
    // handling would wrap around, which jsdom does not implement.
    assert.equal(up.defaultPrevented, true);

    inputs[2].checked = true;
    inputs[2].dispatchEvent(new Event('change', { bubbles: true }));
    const down = press(inputs[2], 'ArrowDown');

    assert.equal(group.value, 'team', 'nothing after the last option');
    assert.equal(down.defaultPrevented, true);
  });

  it('Home and End jump to the first and last option and check them', () => {
    press(inputs[0], 'End');
    assert.equal(group.value, 'team');
    assert.equal(document.activeElement, inputs[2]);

    press(inputs[2], 'Home');
    assert.equal(group.value, 'free');
    assert.equal(document.activeElement, inputs[0]);
  });

  it('skips disabled options', () => {
    radios[1].disabled = true;

    press(inputs[0], 'ArrowDown');

    assert.equal(group.value, 'team', 'the disabled option in the middle is skipped');
  });

  it('emits ui4u:change when the arrow keys change the selection', () => {
    /** @type {Array<{ value: string }>} */
    const seen = [];
    group.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    press(inputs[0], 'ArrowDown');

    assert.deepEqual(seen, [{ value: 'pro', name: 'plan' }]);
  });

  it('leaves Tab to the platform, so it leaves the group entirely', () => {
    const event = press(inputs[0], 'Tab');

    assert.equal(event.defaultPrevented, false, 'the group must not swallow Tab');
    assert.equal(group.value, '', 'Tab never moves between options');
    assert.deepEqual(
      inputs.map((input) => input.tabIndex),
      [0, -1, -1],
      'the single tab stop is what lets Tab get past the group'
    );
  });

  it('ignores keys it does not own', () => {
    const event = press(inputs[0], 'Enter');

    assert.equal(event.defaultPrevented, false);
    assert.equal(group.value, '');
  });

  it('ignores keys from outside the group', () => {
    const outside = mount('<input type="text" id="outside">').querySelector('#outside');
    // A keydown that never came from an option must not move the selection.
    const event = press(outside, 'ArrowDown');

    assert.equal(event.defaultPrevented, false);
    assert.equal(group.value, '');
  });
});

describe('ui-radio-group focus', () => {
  afterEach(() => cleanup());

  it('focus() lands on the tab stop', () => {
    const group = mount(GROUP).querySelector('ui-radio-group');
    const inputs = inputsOf(group);

    assert.equal(group.focus(), group);
    assert.equal(document.activeElement, inputs[0]);

    inputs[2].checked = true;
    inputs[2].dispatchEvent(new Event('change', { bubbles: true }));

    group.focus();
    assert.equal(document.activeElement, inputs[2], 'the selected option takes focus');
  });

  it('a single option can be focused and blurred on its own', () => {
    const radio = mount('<ui-radio value="free">Free</ui-radio>').querySelector('ui-radio');

    assert.equal(radio.focus(), radio);
    assert.equal(document.activeElement, radio.input);

    assert.equal(radio.blur(), radio);
    assert.notEqual(document.activeElement, radio.input);
  });
});

describe('ui-radio-group disabled state', () => {
  afterEach(() => cleanup());

  it('disables every option at once', () => {
    const group = mount(GROUP).querySelector('ui-radio-group');
    const radios = radiosOf(group);

    group.disabled = true;

    assert.ok(
      radios.every((radio) => radio.disabled),
      'the effective state of every option is disabled'
    );
    assert.ok(
      radios.every((radio) => radio.input.disabled),
      'and it reaches the native controls'
    );
    assert.deepEqual(
      inputsOf(group).map((input) => input.tabIndex),
      [-1, -1, -1],
      'a fully disabled group has no tab stop'
    );
  });

  it('re-enabling the group leaves an option disabled on its own', () => {
    const group = mount(`
      <ui-radio-group label="Plan" name="plan" disabled>
        <ui-radio value="free">Free</ui-radio>
        <ui-radio value="pro" disabled>Pro</ui-radio>
      </ui-radio-group>
    `).querySelector('ui-radio-group');
    const radios = radiosOf(group);

    group.disabled = false;

    assert.equal(radios[0].disabled, false);
    assert.equal(radios[1].disabled, true);
    assert.deepEqual(
      inputsOf(group).map((input) => input.tabIndex),
      [0, -1]
    );
  });
});

describe('ui-radio-group aria wiring', () => {
  let group;

  beforeEach(() => {
    group = mount(`
      <ui-radio-group label="Plan" name="plan" hint="Change it any time.">
        <ui-radio value="free">Free</ui-radio>
        <ui-radio value="pro">Pro</ui-radio>
      </ui-radio-group>
    `).querySelector('ui-radio-group');
  });

  afterEach(() => cleanup());

  it('describes the group with the hint', () => {
    const hint = group.querySelector('.ui4u-radio-group__hint');

    assert.equal(hint.textContent, 'Change it any time.');
    assert.equal(group.fieldset.getAttribute('aria-describedby'), hint.id);
  });

  it('chains hint and error so both are announced', () => {
    const hint = group.querySelector('.ui4u-radio-group__hint');
    group.error = 'Pick a plan to continue.';

    const error = group.querySelector('.ui4u-radio-group__error');
    assert.deepEqual(group.fieldset.getAttribute('aria-describedby').split(' '), [
      hint.id,
      error.id,
    ]);
  });

  it('marks aria-invalid only while an error is set', () => {
    assert.equal(group.fieldset.hasAttribute('aria-invalid'), false);

    group.error = 'Pick a plan to continue.';
    assert.equal(group.fieldset.getAttribute('aria-invalid'), 'true');

    group.error = '';
    assert.equal(group.fieldset.hasAttribute('aria-invalid'), false);
  });

  it('marks aria-required when required', () => {
    assert.equal(group.fieldset.hasAttribute('aria-required'), false);

    group.required = true;

    assert.equal(group.fieldset.getAttribute('aria-required'), 'true');
    assert.ok(
      radiosOf(group).every((radio) => radio.input.required),
      'the native controls carry it too, so the form is blocked'
    );
  });
});

describe('ui-radio-group configure()', () => {
  afterEach(() => cleanup());

  it('applies every option and returns the element', () => {
    const group = mount(`
      <ui-radio-group>
        <ui-radio value="free">Free</ui-radio>
        <ui-radio value="pro">Pro</ui-radio>
      </ui-radio-group>
    `).querySelector('ui-radio-group');

    const result = group.configure({
      label: 'Plan',
      name: 'plan',
      value: 'pro',
      hint: 'Change it any time.',
      error: 'Pick a plan to continue.',
      disabled: true,
      required: true,
      srOnly: true,
    });

    assert.equal(result, group);
    assert.equal(group.label, 'Plan');
    assert.equal(group.name, 'plan');
    assert.equal(group.value, 'pro');
    assert.equal(group.hint, 'Change it any time.');
    assert.equal(group.error, 'Pick a plan to continue.');
    assert.equal(group.disabled, true);
    assert.equal(group.required, true);
    assert.equal(group.srOnly, true);
    assert.equal(group.querySelector('legend').textContent, 'Plan');
  });

  it('leaves untouched options alone', () => {
    const group = mount(GROUP).querySelector('ui-radio-group');

    group.configure({ required: true });

    assert.equal(group.required, true);
    assert.equal(group.label, 'Plan');
    assert.equal(group.name, 'plan');
  });
});

describe('ui-radio-group validation', () => {
  afterEach(() => cleanup());

  it('is valid with no selection when it is not required', () => {
    const group = mount(GROUP).querySelector('ui-radio-group');

    assert.deepEqual(group.checkValidity(), {
      valid: true,
      message: '',
      value: '',
      name: 'plan',
    });
  });

  it('is invalid with no selection when required', () => {
    const group = mount(GROUP).querySelector('ui-radio-group');

    group.required = true;
    const result = group.checkValidity();

    assert.equal(result.valid, false);
    assert.ok(result.message.length > 0);
    assert.equal(result.value, '');
  });

  it('is valid once an option is selected', () => {
    const group = mount(GROUP).querySelector('ui-radio-group');
    group.required = true;

    group.value = 'pro';

    const result = group.checkValidity();
    assert.equal(result.valid, true);
    assert.equal(result.message, '');
    assert.equal(result.value, 'pro');
  });

  it('treats an author-set error as invalid, with that message', () => {
    const group = mount(
      '<ui-radio-group label="Plan" error="Pick a plan to continue."></ui-radio-group>'
    ).querySelector('ui-radio-group');

    assert.deepEqual(group.checkValidity().message, 'Pick a plan to continue.');
  });

  it('reportValidity() surfaces an error and clearValidity() drops it', () => {
    const group = mount(GROUP).querySelector('ui-radio-group');
    group.required = true;

    assert.equal(group.reportValidity(), group, 'returns this');
    assert.ok(group.error.length > 0);
    assert.equal(group.fieldset.getAttribute('aria-invalid'), 'true');
    assert.equal(document.activeElement, inputsOf(group)[0], 'focus lands on the tab stop');

    group.clearValidity();
    assert.equal(group.error, '');
    assert.equal(group.fieldset.hasAttribute('aria-invalid'), false);

    group.value = 'team';
    group.reportValidity();
    assert.equal(group.error, '', 'a valid group clears the error state');
  });

  it('a single option validates on its own', () => {
    const radio = mount('<ui-radio value="free" required>Free</ui-radio>').querySelector(
      'ui-radio'
    );

    const missing = radio.checkValidity();
    assert.equal(missing.valid, false);
    assert.ok(missing.message.length > 0);
    assert.equal(missing.value, 'free');

    radio.checked = true;
    assert.equal(radio.checkValidity().valid, true);
  });
});

describe('ui-radio-group text rendering', () => {
  afterEach(() => cleanup());

  it('renders the label, hint and error as text, never as markup', () => {
    const group = mount(
      '<ui-radio-group label="&lt;script&gt;x&lt;/script&gt;" hint="&lt;b&gt;hint&lt;/b&gt;" error="&lt;img src=x&gt;"></ui-radio-group>'
    ).querySelector('ui-radio-group');

    assert.equal(group.querySelector('legend').textContent, '<script>x</script>');
    assert.equal(group.querySelector('.ui4u-radio-group__hint').textContent, '<b>hint</b>');
    assert.equal(group.querySelector('.ui4u-radio-group__error').textContent, '<img src=x>');
    assert.equal(group.querySelector('script'), null);
    assert.equal(group.querySelector('img'), null);
  });

  it('renders the option text as text too', () => {
    const radio = mount('<ui-radio value="free">&lt;b&gt;Free&lt;/b&gt;</ui-radio>').querySelector(
      'ui-radio'
    );

    assert.equal(radio.querySelector('label').textContent, '<b>Free</b>');
    assert.equal(radio.querySelector('label').querySelector('b'), null);
  });
});

describe('ui-radio-group dynamic children', () => {
  afterEach(() => cleanup());

  it('picks up an option added after connect', () => {
    const group = mount(`
      <ui-radio-group label="Plan" name="plan">
        <ui-radio value="free">Free</ui-radio>
      </ui-radio-group>
    `).querySelector('ui-radio-group');

    const added = document.createElement('ui-radio');
    added.value = 'pro';
    added.textContent = 'Pro';
    group.append(added);

    group.refresh();

    assert.deepEqual(
      radiosOf(group).map((radio) => radio.value),
      ['free', 'pro']
    );
    assert.equal(added.input.name, 'plan', 'the new option joins the native group');
    assert.deepEqual(
      inputsOf(group).map((input) => input.tabIndex),
      [0, -1]
    );
  });

  it('drops an option that leaves the group', () => {
    const group = mount(`
      <ui-radio-group label="Plan" name="plan" value="pro">
        <ui-radio value="free">Free</ui-radio>
        <ui-radio value="pro">Pro</ui-radio>
        <ui-radio value="team">Team</ui-radio>
      </ui-radio-group>
    `).querySelector('ui-radio-group');

    radiosOf(group)[1].remove();

    assert.deepEqual(
      radiosOf(group).map((radio) => radio.value),
      ['free', 'team']
    );
    assert.equal(group.value, '', 'the selected option went with it');
    assert.deepEqual(
      inputsOf(group).map((input) => input.tabIndex),
      [0, -1],
      'the tab stop falls back to the first enabled option'
    );
  });

  it('refresh() returns the element and is safe before connect', () => {
    const group = mount(GROUP).querySelector('ui-radio-group');
    assert.equal(group.refresh(), group);

    const detached = document.createElement('ui-radio-group');
    assert.equal(detached.refresh(), detached);
  });
});

describe('ui-radio teardown', () => {
  afterEach(() => cleanup());

  it('removes generated markup and keeps the authored children', () => {
    const group = mount(`
      <ui-radio-group label="Plan" name="plan">
        <ui-radio value="free">Free</ui-radio>
        <ui-radio value="pro">Pro</ui-radio>
      </ui-radio-group>
    `).querySelector('ui-radio-group');

    group.remove();

    assert.equal(group.querySelector('fieldset'), null, 'fieldset removed');
    assert.equal(group.querySelector('legend'), null, 'legend removed');
    assert.equal(group.querySelector('.ui4u-radio-group__hint'), null, 'hint removed');
    assert.equal(group.querySelector('.ui4u-radio-group__error'), null, 'error removed');
    assert.deepEqual(
      radiosOf(group).map((radio) => radio.textContent),
      ['Free', 'Pro'],
      'the authored options are restored, in order'
    );
    assert.equal(group.querySelector('ui-radio .ui4u-radio__row'), null, 'row removed');
  });

  it('rebuilds correctly when reconnected', () => {
    const group = mount(`
      <ui-radio-group label="Plan" name="plan" hint="Later" value="pro">
        <ui-radio value="free">Free</ui-radio>
        <ui-radio value="pro">Pro</ui-radio>
      </ui-radio-group>
    `).querySelector('ui-radio-group');

    group.remove();
    document.body.appendChild(group);

    assert.ok(group.querySelector('fieldset'), 'fieldset rebuilt');
    assert.equal(group.value, 'pro', 'the authored selection survives');
    assert.deepEqual(
      inputsOf(group).map((input) => input.tabIndex),
      [-1, 0]
    );
    assert.equal(
      group.fieldset.getAttribute('aria-describedby'),
      group.querySelector('.ui4u-radio-group__hint').id
    );
  });

  it('stops emitting after the group disconnects', () => {
    const group = mount(GROUP).querySelector('ui-radio-group');
    const input = inputsOf(group)[0];
    /** @type {unknown[]} */
    const seen = [];
    group.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    group.remove();
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));

    assert.equal(seen.length, 0, 'tracked listeners were disposed');
  });

  it('is inert before it connects', () => {
    const group = document.createElement('ui-radio-group');
    const radio = document.createElement('ui-radio');

    assert.equal(group.fieldset, null);
    assert.equal(group.value, '');
    assert.deepEqual(group.radios, []);
    assert.equal(group.checkValidity().valid, true);
    assert.equal(radio.input, null);
    assert.equal(radio.checked, false);
    assert.equal(radio.checkValidity().valid, true);
  });
});
