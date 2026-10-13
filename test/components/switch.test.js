import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { cleanup, click, mount, press, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component module is evaluated — see helpers/dom.js.
setupDom();

const { Switch } = await import('../../src/components/switch/switch.js');
const { define, isDefined } = await import('../../src/core/registry.js');

define('ui-switch', Switch);

/** @returns {HTMLButtonElement} the control the component rendered */
function controlOf(sw) {
  return sw.querySelector('.ui4u-switch__control');
}

/** @returns {HTMLElement} */
function labelOf(sw) {
  return sw.querySelector('.ui4u-switch__label');
}

/** @returns {HTMLElement|null} */
function hintOf(sw) {
  return sw.querySelector('.ui4u-switch__hint');
}

/** @returns {HTMLElement|null} */
function errorOf(sw) {
  return sw.querySelector('.ui4u-switch__error');
}

/**
 * @param {string} [attributes]
 * @returns {Element}
 */
function mountSwitch(attributes = '') {
  return mount(
    `<ui-switch label="Dark theme" name="theme" ${attributes}></ui-switch>`
  ).querySelector('ui-switch');
}

describe('ui-switch registration', () => {
  it('registers the custom element', () => {
    assert.equal(isDefined('ui-switch'), true);
  });
});

describe('ui-switch rendering', () => {
  afterEach(() => cleanup());

  it('renders a real button, not a drawn div', () => {
    const sw = mountSwitch();
    const control = controlOf(sw);

    assert.equal(control.localName, 'button');
    assert.equal(control.constructor.name, 'HTMLButtonElement');
    assert.equal(control.type, 'button');
    assert.equal(sw.control, control, 'the same node is exposed, not a copy');
  });

  it('carries the switch role and its state', () => {
    const sw = mountSwitch();
    const control = controlOf(sw);

    assert.equal(control.getAttribute('role'), 'switch');
    assert.equal(control.getAttribute('aria-checked'), 'false');
  });

  it('renders a track and a knob, and hides the track from AT', () => {
    const sw = mountSwitch();

    assert.ok(sw.querySelector('.ui4u-switch__track'));
    assert.ok(sw.querySelector('.ui4u-switch__knob'));
    assert.equal(sw.querySelector('.ui4u-switch__track').getAttribute('aria-hidden'), 'true');
  });

  it('names the control from the label without wrapping it', () => {
    const sw = mountSwitch();

    assert.equal(controlOf(sw).getAttribute('aria-labelledby'), labelOf(sw).id);
    assert.equal(labelOf(sw).textContent, 'Dark theme');

    // The label is a span beside the control, never a <label> around it.
    assert.equal(labelOf(sw).localName, 'span');
    assert.equal(labelOf(sw).querySelector('button'), null);
    assert.equal(labelOf(sw).parentNode.className, 'ui4u-switch__row');
  });

  it('never reuses the host id, so the document has no duplicate ids', () => {
    const sw = mount('<ui-switch id="opt-theme" label="Dark theme"></ui-switch>').querySelector(
      'ui-switch'
    );

    assert.notEqual(labelOf(sw).id, 'opt-theme');
    assert.equal(controlOf(sw).getAttribute('aria-labelledby'), labelOf(sw).id);
  });

  it('keeps a unique label id per component', () => {
    const first = mount('<ui-switch label="One"></ui-switch>').querySelector('ui-switch');
    const second = mount('<ui-switch label="Two"></ui-switch>').querySelector('ui-switch');

    assert.ok(labelOf(first).id);
    assert.notEqual(labelOf(first).id, labelOf(second).id);
  });

  it('hides the label when there is no label text', () => {
    const sw = mount('<ui-switch></ui-switch>').querySelector('ui-switch');

    assert.equal(labelOf(sw).hidden, true);
    assert.equal(controlOf(sw).hasAttribute('aria-labelledby'), false);
  });

  it('mirrors an aria-label onto the control, for an unnamed switch', () => {
    const sw = mountSwitch();

    sw.setAttribute('aria-label', 'Reduce motion');
    assert.equal(controlOf(sw).getAttribute('aria-label'), 'Reduce motion');

    sw.removeAttribute('aria-label');
    assert.equal(controlOf(sw).hasAttribute('aria-label'), false);
  });

  it('renders the authored checked state', () => {
    const sw = mountSwitch('checked');

    assert.equal(sw.checked, true);
    assert.equal(controlOf(sw).getAttribute('aria-checked'), 'true');
  });

  it('visually hides the label with sr-only, keeping it for AT', () => {
    const sw = mountSwitch('sr-only');

    assert.equal(sw.srOnly, true);
    assert.equal(labelOf(sw).classList.contains('ui4u-sr-only'), true);
    assert.equal(labelOf(sw).hidden, false, 'still exposed, only clipped');
    assert.equal(controlOf(sw).getAttribute('aria-labelledby'), labelOf(sw).id);
  });

  it('leaves the author children untouched', () => {
    const sw = mount(
      '<ui-switch label="One"><span class="mine">kept</span></ui-switch>'
    ).querySelector('ui-switch');

    assert.ok(sw.querySelector('span.mine'), 'the author markup is still in the host');
  });

  it('records the size as data-size', () => {
    const plain = mountSwitch();
    const large = mountSwitch('size="lg"');
    const nonsense = mountSwitch('size="enormous"');

    assert.equal(plain.dataset.size, 'md');
    assert.equal(large.dataset.size, 'lg');
    assert.equal(nonsense.dataset.size, 'md', 'an unknown size falls back to md');
    assert.equal(nonsense.size, 'md');
  });
});

describe('ui-switch aria wiring', () => {
  afterEach(() => cleanup());

  it('describes the control with the hint', () => {
    const sw = mountSwitch('hint="Applies immediately."');

    assert.equal(controlOf(sw).getAttribute('aria-describedby'), hintOf(sw).id);
    assert.equal(hintOf(sw).hidden, false);
  });

  it('chains hint and error so both are announced', () => {
    const sw = mountSwitch('hint="Applies immediately." error="Turn this on first."');

    assert.deepEqual(controlOf(sw).getAttribute('aria-describedby').split(' '), [
      hintOf(sw).id,
      errorOf(sw).id,
    ]);
  });

  it('drops aria-describedby when neither hint nor error exists', () => {
    const sw = mountSwitch('hint="Later"');

    sw.hint = '';
    assert.equal(controlOf(sw).hasAttribute('aria-describedby'), false);

    sw.error = 'Boom';
    assert.equal(controlOf(sw).getAttribute('aria-describedby'), errorOf(sw).id);

    sw.clearValidity();
    assert.equal(controlOf(sw).hasAttribute('aria-describedby'), false);
  });

  it('marks aria-invalid only while an error is set', () => {
    const sw = mountSwitch();

    assert.equal(controlOf(sw).hasAttribute('aria-invalid'), false);

    sw.error = 'Turn this on';
    assert.equal(controlOf(sw).getAttribute('aria-invalid'), 'true');

    sw.error = '';
    assert.equal(controlOf(sw).hasAttribute('aria-invalid'), false);
  });

  it('marks aria-required from the option', () => {
    const sw = mountSwitch();

    assert.equal(controlOf(sw).hasAttribute('aria-required'), false);

    sw.required = true;
    assert.equal(controlOf(sw).getAttribute('aria-required'), 'true');

    sw.required = false;
    assert.equal(controlOf(sw).hasAttribute('aria-required'), false);
  });
});

describe('ui-switch checked reflection', () => {
  afterEach(() => cleanup());

  it('reflects the property onto the attribute', () => {
    const sw = mountSwitch();

    sw.checked = true;
    assert.equal(sw.hasAttribute('checked'), true);
    assert.equal(controlOf(sw).getAttribute('aria-checked'), 'true');

    sw.checked = false;
    assert.equal(sw.hasAttribute('checked'), false);
    assert.equal(controlOf(sw).getAttribute('aria-checked'), 'false');
  });

  it('reflects the attribute onto the announced state', () => {
    const sw = mountSwitch();

    sw.setAttribute('checked', '');
    assert.equal(sw.checked, true);
    assert.equal(controlOf(sw).getAttribute('aria-checked'), 'true');

    sw.removeAttribute('checked');
    assert.equal(sw.checked, false);
    assert.equal(controlOf(sw).getAttribute('aria-checked'), 'false');
  });

  it('keeps one source of truth — a user click moves the attribute', () => {
    const sw = mountSwitch();

    click(controlOf(sw));

    // Unlike a checkbox, which keeps the authored attribute untouched, the
    // attribute IS the state here, so a toggle and a read cannot disagree.
    assert.equal(sw.hasAttribute('checked'), true);
    assert.equal(sw.checked, true);
  });

  it('reads a false-y attribute as off, like the rest of the library', () => {
    const sw = mountSwitch('checked="false"');

    assert.equal(sw.checked, false);
    assert.equal(controlOf(sw).getAttribute('aria-checked'), 'false');
  });
});

describe('ui-switch keyboard activation', () => {
  afterEach(() => cleanup());

  it('toggles on Enter', () => {
    const sw = mountSwitch();

    press(controlOf(sw), 'Enter');
    assert.equal(sw.checked, true);

    press(controlOf(sw), 'Enter');
    assert.equal(sw.checked, false);
  });

  it('toggles on Space', () => {
    const sw = mountSwitch();

    press(controlOf(sw), ' ');
    assert.equal(sw.checked, true);

    press(controlOf(sw), ' ');
    assert.equal(sw.checked, false);
  });

  it('cancels the default, so one key press is one toggle and Space cannot scroll', () => {
    const sw = mountSwitch();

    assert.equal(press(controlOf(sw), ' ').defaultPrevented, true);
    assert.equal(press(controlOf(sw), 'Enter').defaultPrevented, true);
    assert.equal(press(controlOf(sw), 'Tab').defaultPrevented, false);
  });

  it('ignores every other key', () => {
    const sw = mountSwitch();

    press(controlOf(sw), 'a');
    press(controlOf(sw), 'ArrowRight');
    press(controlOf(sw), 'Escape');

    assert.equal(sw.checked, false);
  });

  it('keyboard and pointer agree on the outcome', () => {
    const sw = mountSwitch();
    /** @type {any[]} */
    const seen = [];
    sw.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    press(controlOf(sw), 'Enter');
    click(controlOf(sw));
    click(labelOf(sw));

    assert.deepEqual(seen, [
      { name: 'theme', checked: true },
      { name: 'theme', checked: false },
      { name: 'theme', checked: true },
    ]);
  });
});

describe('ui-switch change event', () => {
  afterEach(() => cleanup());

  it('emits ui4u:change with the name and the new state', () => {
    const sw = mountSwitch();
    /** @type {any[]} */
    const seen = [];
    sw.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    click(controlOf(sw));

    assert.deepEqual(seen, [{ name: 'theme', checked: true }]);
  });

  it('reports an empty name when none was set', () => {
    const sw = mount('<ui-switch label="One"></ui-switch>').querySelector('ui-switch');
    /** @type {any[]} */
    const seen = [];
    sw.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    click(controlOf(sw));

    assert.deepEqual(seen, [{ name: '', checked: true }]);
  });
});

describe('ui-switch bindings', () => {
  afterEach(() => cleanup());

  it('runs a change binding with the detail the event carries', () => {
    const sw = mountSwitch();
    /** @type {any[]} */
    const seen = [];
    sw.bind('change', (detail) => seen.push(detail));

    click(controlOf(sw));

    assert.deepEqual(seen, [{ name: 'theme', checked: true }]);
  });

  it('a binding returning false leaves the switch exactly as it was', () => {
    const sw = mountSwitch();
    /** @type {unknown[]} */
    const events = [];
    sw.addEventListener('ui4u:change', () => events.push('change'));
    sw.bind('change', () => false);

    click(controlOf(sw));

    // No native state to undo: the binding runs before the mutation, so nothing
    // moved at all — not the attribute, not the announced state.
    assert.equal(sw.checked, false);
    assert.equal(sw.hasAttribute('checked'), false);
    assert.equal(controlOf(sw).getAttribute('aria-checked'), 'false');
    assert.deepEqual(events, [], 'and a vetoed change is never announced');
  });

  it('a binding vetoes a keyboard activation the same way', () => {
    const sw = mountSwitch();
    sw.bind('change', () => false);

    press(controlOf(sw), 'Enter');
    press(controlOf(sw), ' ');

    assert.equal(sw.checked, false);
  });

  it('a binding calling preventDefault vetoes in exactly the same way', () => {
    const sw = mountSwitch();
    sw.bind('change', (_detail, event) => event.preventDefault());

    click(controlOf(sw));

    assert.equal(sw.checked, false);
    assert.equal(controlOf(sw).getAttribute('aria-checked'), 'false');
  });

  it('the binding runs before the component mutates', () => {
    const sw = mountSwitch();
    /** @type {any[]} */
    const observed = [];

    sw.bind('change', () => {
      observed.push({
        checked: sw.checked,
        announced: controlOf(sw).getAttribute('aria-checked'),
      });
      return false; // refuse to turn it on
    });

    click(controlOf(sw));

    // Inside the binding the switch is still off — neither the attribute nor
    // the announced state has moved. A veto that landed after the mutation
    // would have to undo it; this one has nothing to undo.
    assert.deepEqual(observed, [{ checked: false, announced: 'false' }]);
    assert.equal(sw.checked, false);
  });

  it('a binding returning undefined lets the flip through and the event fires', () => {
    const sw = mountSwitch();
    /** @type {any[]} */
    const events = [];
    sw.addEventListener('ui4u:change', (event) => events.push(event.detail));
    sw.bind('change', () => undefined);

    click(controlOf(sw));

    assert.equal(sw.checked, true);
    assert.deepEqual(events, [{ name: 'theme', checked: true }]);
  });

  it('a vetoed switch is not wedged — the next flip works normally', () => {
    const sw = mountSwitch();
    sw.bind('change', () => false);

    click(controlOf(sw));
    assert.equal(sw.checked, false, 'the first flip was refused');

    sw.unbind('change');
    click(controlOf(sw));
    assert.equal(sw.checked, true, 'and the second was not');
  });

  it('configure({ bindings }) registers a binding', () => {
    const sw = mountSwitch();
    /** @type {unknown[]} */
    const seen = [];
    sw.configure({ bindings: { change: (detail) => seen.push(detail.checked) } });

    click(controlOf(sw));

    assert.deepEqual(seen, [true]);
  });
});

describe('ui-switch configure()', () => {
  afterEach(() => cleanup());

  it('applies every option and returns the element', () => {
    const sw = mount('<ui-switch></ui-switch>').querySelector('ui-switch');

    const result = sw.configure({
      label: 'Dark theme',
      name: 'theme',
      checked: true,
      hint: 'Applies immediately.',
      error: 'Turn this on first.',
      disabled: true,
      required: true,
      size: 'lg',
      srOnly: true,
    });

    assert.equal(result, sw);
    assert.equal(sw.label, 'Dark theme');
    assert.equal(sw.name, 'theme');
    assert.equal(sw.checked, true);
    assert.equal(sw.hint, 'Applies immediately.');
    assert.equal(sw.error, 'Turn this on first.');
    assert.equal(sw.disabled, true);
    assert.equal(sw.required, true);
    assert.equal(sw.size, 'lg');
    assert.equal(sw.srOnly, true);
    assert.equal(labelOf(sw).textContent, 'Dark theme');
    assert.equal(controlOf(sw).getAttribute('aria-checked'), 'true');
    assert.equal(controlOf(sw).disabled, true);
    assert.equal(sw.dataset.size, 'lg');
  });

  it('leaves untouched options alone', () => {
    const sw = mountSwitch('required');

    sw.configure({ hint: 'Applies immediately.' });

    assert.equal(sw.hint, 'Applies immediately.');
    assert.equal(sw.label, 'Dark theme');
    assert.equal(sw.required, true);
  });
});

describe('ui-switch toggle()', () => {
  afterEach(() => cleanup());

  it('flips the state and reports that it did', () => {
    const sw = mountSwitch();

    assert.equal(sw.toggle(), true);
    assert.equal(sw.checked, true);

    assert.equal(sw.toggle(), true);
    assert.equal(sw.checked, false);
  });

  it('does nothing while disabled', () => {
    const sw = mountSwitch('disabled');

    assert.equal(sw.toggle(), false);
    assert.equal(sw.checked, false);
  });

  it('is vetoable like every other activation', () => {
    const sw = mountSwitch();
    sw.bind('change', () => false);

    assert.equal(sw.toggle(), false);
    assert.equal(sw.checked, false);
  });
});

describe('ui-switch disabled state', () => {
  afterEach(() => cleanup());

  it('mirrors disabled onto the native control', () => {
    const sw = mountSwitch();

    sw.disabled = true;
    assert.equal(controlOf(sw).disabled, true);

    sw.disabled = false;
    assert.equal(controlOf(sw).disabled, false);
  });

  it('a click cannot change a disabled switch', () => {
    const sw = mountSwitch('disabled');
    /** @type {unknown[]} */
    const events = [];
    sw.addEventListener('ui4u:change', (event) => events.push(event.detail));

    click(controlOf(sw));
    press(controlOf(sw), 'Enter');
    press(controlOf(sw), ' ');

    assert.equal(sw.checked, false);
    assert.deepEqual(events, []);
  });

  it('a disabled switch keeps its announced state honest', () => {
    const sw = mountSwitch('checked disabled');

    assert.equal(controlOf(sw).getAttribute('aria-checked'), 'true');
    assert.equal(controlOf(sw).disabled, true);
  });
});

describe('ui-switch label activation', () => {
  afterEach(() => cleanup());

  it('the label toggles the switch, because it does not wrap it', () => {
    const sw = mountSwitch();

    click(labelOf(sw));
    assert.equal(sw.checked, true);

    click(labelOf(sw));
    assert.equal(sw.checked, false);
  });

  it('focuses the control, so the label and the switch share one focus position', () => {
    const sw = mountSwitch();

    click(labelOf(sw));

    assert.equal(document.activeElement, controlOf(sw));
  });

  it('a click inside the control is not counted twice', () => {
    const sw = mountSwitch();
    /** @type {unknown[]} */
    const events = [];
    sw.addEventListener('ui4u:change', () => events.push('change'));

    // The track and the knob are inside the button; clicking the track must
    // toggle once, not twice.
    click(sw.querySelector('.ui4u-switch__track'));

    assert.equal(sw.checked, true);
    assert.deepEqual(events.length, 1);
  });

  it('a vetoed label click leaves the switch alone', () => {
    const sw = mountSwitch();
    sw.bind('change', () => false);

    click(labelOf(sw));

    assert.equal(sw.checked, false);
  });
});

describe('ui-switch validation', () => {
  afterEach(() => cleanup());

  it('is valid when off and not required', () => {
    const sw = mountSwitch();

    assert.deepEqual(sw.checkValidity(), {
      valid: true,
      message: '',
      checked: false,
      name: 'theme',
    });
  });

  it('is invalid when off and required', () => {
    const sw = mountSwitch('required');
    const result = sw.checkValidity();

    assert.equal(result.valid, false);
    assert.ok(result.message.length > 0, 'a message is always reported');
  });

  it('is valid once a required switch is on', () => {
    const sw = mountSwitch('required');

    sw.checked = true;

    assert.equal(sw.checkValidity().valid, true);
  });

  it('treats an author-set error as invalid, with that message', () => {
    const sw = mountSwitch('error="Turn this on first."');
    const result = sw.checkValidity();

    assert.equal(result.valid, false);
    assert.equal(result.message, 'Turn this on first.');
  });

  it('reportValidity() surfaces an error and clearValidity() drops it', () => {
    const sw = mountSwitch('required');

    assert.equal(sw.reportValidity(), sw, 'returns this');
    assert.ok(sw.error.length > 0, 'a message became the error');
    assert.equal(controlOf(sw).getAttribute('aria-invalid'), 'true');

    sw.clearValidity();
    assert.equal(sw.error, '');
    assert.equal(controlOf(sw).hasAttribute('aria-invalid'), false);

    sw.checked = true;
    sw.reportValidity();
    assert.equal(sw.error, '', 'a valid field clears the error state');
  });

  it('does not stay invalid forever after reportValidity()', () => {
    const sw = mountSwitch('required');

    sw.reportValidity();
    assert.ok(sw.error !== '');
    assert.equal(sw.checkValidity().valid, false);

    sw.checked = true;

    assert.equal(sw.checkValidity().valid, true, 'valid once corrected');
  });
});

describe('ui-switch text rendering', () => {
  afterEach(() => cleanup());

  it('renders label, hint and error as text, never as markup', () => {
    const sw = mount(
      '<ui-switch label="&lt;script&gt;x&lt;/script&gt;" hint="&lt;b&gt;hint&lt;/b&gt;" error="&lt;img src=x&gt;"></ui-switch>'
    ).querySelector('ui-switch');

    assert.equal(labelOf(sw).textContent, '<script>x</script>');
    assert.equal(hintOf(sw).textContent, '<b>hint</b>');
    assert.equal(errorOf(sw).textContent, '<img src=x>');
    assert.equal(labelOf(sw).querySelector('script'), null);
    assert.equal(hintOf(sw).querySelector('b'), null);
    assert.equal(errorOf(sw).querySelector('img'), null);
  });
});

describe('ui-switch focus and blur', () => {
  afterEach(() => cleanup());

  it('focus() and blur() drive the control and return this', () => {
    const sw = mountSwitch();

    assert.equal(sw.focus(), sw);
    assert.equal(document.activeElement, controlOf(sw));

    assert.equal(sw.blur(), sw);
    assert.notEqual(document.activeElement, controlOf(sw));
  });
});

describe('ui-switch teardown', () => {
  afterEach(() => cleanup());

  it('removes generated markup and keeps the authored children', () => {
    const sw = mount(
      '<ui-switch label="One"><span class="mine">kept</span></ui-switch>'
    ).querySelector('ui-switch');

    sw.remove();

    assert.equal(sw.querySelector('.ui4u-switch__row'), null, 'row removed');
    assert.equal(sw.querySelector('.ui4u-switch__control'), null, 'control removed');
    assert.equal(sw.querySelector('.ui4u-switch__hint'), null, 'hint removed');
    assert.equal(sw.querySelector('.ui4u-switch__error'), null, 'error removed');
    assert.equal(sw.querySelector('span.mine').textContent, 'kept', 'author markup restored');
    assert.equal(sw.dataset.size, undefined);
  });

  it('rebuilds correctly when reconnected', () => {
    const sw = mountSwitch('checked hint="Later" size="lg"');

    sw.remove();
    document.body.appendChild(sw);

    assert.equal(controlOf(sw).localName, 'button');
    assert.equal(controlOf(sw).getAttribute('role'), 'switch');
    assert.equal(controlOf(sw).getAttribute('aria-checked'), 'true');
    assert.equal(controlOf(sw).getAttribute('aria-labelledby'), labelOf(sw).id);
    assert.equal(controlOf(sw).getAttribute('aria-describedby'), hintOf(sw).id);
    assert.equal(sw.dataset.size, 'lg');
  });

  it('does not emit after disconnect', () => {
    const sw = mountSwitch();
    const control = controlOf(sw);
    /** @type {unknown[]} */
    const seen = [];
    sw.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    sw.remove();
    click(control);

    assert.equal(seen.length, 0, 'tracked listeners were disposed');
  });

  it('is inert before it connects', () => {
    const sw = document.createElement('ui-switch');

    assert.equal(sw.control, null);
    assert.equal(sw.checked, false);
    assert.equal(sw.disabled, false);
    assert.equal(sw.checkValidity().valid, true);

    // Nothing to toggle, and no state to corrupt.
    click(sw);
    assert.equal(sw.checked, false);
  });
});
