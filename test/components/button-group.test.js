import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { cleanup, click, mount, press, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component module is evaluated — see helpers/dom.js.
setupDom();

const { ButtonGroup } = await import('../../src/components/button-group/button-group.js');
// The group composes around real buttons, so it needs them registered too.
const { Button } = await import('../../src/components/button/button.js');
const { define, isDefined } = await import('../../src/core/registry.js');

define('ui-button', Button);
define('ui-button-group', ButtonGroup);

const GROUP = `
  <ui-button-group label="View" name="view">
    <ui-button value="grid">Grid</ui-button>
    <ui-button value="table">Table</ui-button>
    <ui-button value="list">List</ui-button>
  </ui-button-group>
`;

/** @returns {HTMLElement[]} the child `ui-button` hosts, in document order */
function buttonsOf(group) {
  return group.buttons;
}

/** @returns {HTMLElement[]} the native control inside each button */
function controlsOf(group) {
  return buttonsOf(group).map((button) => button.control);
}

describe('ui-button-group registration', () => {
  it('registers the custom element', () => {
    assert.equal(isDefined('ui-button-group'), true);
  });
});

describe('ui-button-group rendering', () => {
  let host;
  let group;

  beforeEach(() => {
    host = mount(GROUP);
    group = host.querySelector('ui-button-group');
  });

  afterEach(() => cleanup());

  it('exposes the host as a radiogroup', () => {
    assert.equal(group.getAttribute('role'), 'radiogroup');
  });

  it('keeps the row wrapper transparent, so the radios are owned directly', () => {
    const options = group.querySelector('.ui4u-button-group__options');

    assert.ok(options, 'the joined row is rendered');
    assert.equal(options.getAttribute('role'), 'presentation');
  });

  it('names the group through its label', () => {
    const label = group.querySelector('.ui4u-button-group__label');

    assert.equal(label.textContent, 'View');
    assert.equal(group.getAttribute('aria-labelledby'), label.id);
  });

  it('renders a span, never a label that wraps the buttons', () => {
    // A label wrapping controls swallows their clicks.
    assert.equal(group.querySelector('label'), null);
    assert.equal(group.querySelector('.ui4u-button-group__label').localName, 'span');
  });

  it('keeps the accessible name when the label is visually hidden', () => {
    const hidden = mount(`
      <ui-button-group label="View" sr-only>
        <ui-button value="grid">Grid</ui-button>
      </ui-button-group>
    `).querySelector('ui-button-group');
    const label = hidden.querySelector('.ui4u-button-group__label');

    assert.equal(hidden.srOnly, true);
    assert.equal(label.classList.contains('ui4u-sr-only'), true);
    assert.equal(label.hidden, false, 'still exposed, only clipped');
    assert.equal(hidden.getAttribute('aria-labelledby'), label.id, 'the name survives');
  });

  it('keeps every child a real ui-button wrapping a real native button', () => {
    const [first, ...rest] = buttonsOf(group);
    const control = first.control;

    assert.equal(first.localName, 'ui-button');
    assert.equal(control.localName, 'button');
    assert.equal(control.textContent, 'Grid', 'the label is light DOM');
    assert.ok(rest.every((button) => button.localName === 'ui-button'));
  });

  it('gives every button the radio role and a false aria-checked by default', () => {
    const controls = controlsOf(group);

    assert.ok(controls.every((control) => control.getAttribute('role') === 'radio'));
    assert.deepEqual(
      controls.map((control) => control.getAttribute('aria-checked')),
      ['false', 'false', 'false']
    );
  });

  it('checks the button named by the value attribute', () => {
    const selected = mount(`
      <ui-button-group label="View" name="view" value="table">
        <ui-button value="grid">Grid</ui-button>
        <ui-button value="table">Table</ui-button>
      </ui-button-group>
    `).querySelector('ui-button-group');

    assert.equal(selected.value, 'table');
    assert.deepEqual(
      selected.buttons.map((button) => button.control.getAttribute('aria-checked')),
      ['false', 'true']
    );
  });

  it('the first button is the single tab stop when nothing is selected', () => {
    assert.deepEqual(
      controlsOf(group).map((control) => control.tabIndex),
      [0, -1, -1]
    );
  });

  it('renders hint and error text through aria-describedby', () => {
    const withHint = mount(`
      <ui-button-group label="View" hint="Pick one.">
        <ui-button value="grid">Grid</ui-button>
      </ui-button-group>
    `).querySelector('ui-button-group');
    const hint = withHint.querySelector('.ui4u-button-group__hint');

    assert.equal(hint.textContent, 'Pick one.');
    assert.equal(withHint.getAttribute('aria-describedby'), hint.id);

    withHint.error = 'Pick another.';
    const error = withHint.querySelector('.ui4u-button-group__error');

    assert.deepEqual(withHint.getAttribute('aria-describedby').split(' '), [hint.id, error.id]);
    assert.equal(withHint.getAttribute('aria-invalid'), 'true');
  });

  it('marks aria-required when required', () => {
    assert.equal(group.hasAttribute('aria-required'), false);

    group.required = true;

    assert.equal(group.getAttribute('aria-required'), 'true');
  });
});

describe('ui-button-group selection', () => {
  let group;

  beforeEach(() => {
    group = mount(GROUP).querySelector('ui-button-group');
  });

  afterEach(() => cleanup());

  it('clicking a button selects it', () => {
    click(controlsOf(group)[1]);

    assert.equal(group.value, 'table');
    assert.deepEqual(
      controlsOf(group).map((control) => control.getAttribute('aria-checked')),
      ['false', 'true', 'false']
    );
  });

  it('clicking the selected button keeps it selected — never a toggle-off', () => {
    /** @type {Array<{ value: string }>} */
    const seen = [];
    group.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    click(controlsOf(group)[1]);
    click(controlsOf(group)[1]);

    assert.equal(group.value, 'table');
    assert.deepEqual(
      controlsOf(group).map((control) => control.getAttribute('aria-checked')),
      ['false', 'true', 'false']
    );
    assert.equal(seen.length, 1, 're-selecting is not a change');
  });

  it('a disabled button cannot be selected', () => {
    group.buttons[2].setAttribute('disabled', '');

    click(controlsOf(group)[2]);

    assert.equal(group.value, '');
    assert.equal(controlsOf(group)[2].getAttribute('aria-checked'), 'false');
  });

  it('select() picks a button and reports it once', () => {
    /** @type {Array<{ value: string, name: string }>} */
    const seen = [];
    group.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    assert.equal(group.select('list'), group);

    assert.equal(group.value, 'list');
    assert.deepEqual(seen, [{ value: 'list', name: 'view' }]);
  });

  it('select() ignores a value the group does not have', () => {
    assert.equal(group.select('calendar'), group);

    assert.equal(group.value, '');
    assert.ok(
      controlsOf(group).every((control) => control.getAttribute('aria-checked') === 'false')
    );
  });

  it('the value setter selects silently, and "" clears the selection', () => {
    /** @type {unknown[]} */
    const seen = [];
    group.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    group.value = 'table';
    assert.equal(group.value, 'table');
    assert.deepEqual(seen, [], 'the declarative path is not an event');

    group.value = '';
    assert.equal(group.value, '');
    assert.equal(group.hasAttribute('value'), false, 'a cleared value is a cleared attribute');
  });

  it('reflects a user selection back onto the value attribute', () => {
    click(controlsOf(group)[2]);

    assert.equal(group.getAttribute('value'), 'list');
  });

  it('the tab stop follows the selection', () => {
    click(controlsOf(group)[1]);

    assert.deepEqual(
      controlsOf(group).map((control) => control.tabIndex),
      [-1, 0, -1]
    );
  });

  it('ignores clicks from a button outside the group', () => {
    const outside = mount(`
      <ui-button-group label="View" name="other">
        <ui-button value="solo">Solo</ui-button>
      </ui-button-group>
    `).querySelector('ui-button');

    click(outside.control);

    assert.equal(group.value, '');
  });
});

describe('ui-button-group keyboard model', () => {
  let group;
  let controls;

  beforeEach(() => {
    group = mount(GROUP).querySelector('ui-button-group');
    controls = controlsOf(group);
  });

  afterEach(() => cleanup());

  it('ArrowRight moves to the next button and selects it', () => {
    const event = press(controls[0], 'ArrowRight');

    assert.equal(event.defaultPrevented, true);
    assert.equal(group.value, 'table');
    assert.equal(document.activeElement, controls[1]);
    assert.deepEqual(
      controls.map((control) => control.tabIndex),
      [-1, 0, -1]
    );
  });

  it('ArrowDown moves forward too', () => {
    press(controls[0], 'ArrowDown');

    assert.equal(group.value, 'table');
    assert.equal(document.activeElement, controls[1]);
  });

  it('ArrowLeft moves back and selects', () => {
    press(controls[0], 'ArrowRight');
    press(controls[1], 'ArrowLeft');

    assert.equal(group.value, 'grid');
    assert.equal(document.activeElement, controls[0]);
  });

  it('ArrowUp moves to the previous button and selects it', () => {
    group.select('list');
    press(controls[2], 'ArrowUp');

    assert.equal(group.value, 'table');
    assert.equal(document.activeElement, controls[1]);
  });

  it('clamps at the ends instead of wrapping, and still swallows the key', () => {
    controls[0].focus();
    const up = press(controls[0], 'ArrowUp');

    assert.equal(group.value, '', 'nothing before the first button');
    assert.equal(document.activeElement, controls[0], 'focus does not move');
    // Prevented before the clamp check: Chromium's own handling wraps around,
    // so an unprevented key at the end would move the selection anyway.
    assert.equal(up.defaultPrevented, true);

    group.select('list');
    controls[2].focus();
    const down = press(controls[2], 'ArrowDown');

    assert.equal(group.value, 'list', 'nothing after the last button');
    assert.equal(document.activeElement, controls[2]);
    assert.equal(down.defaultPrevented, true);
  });

  it('Home and End jump to the ends and select them', () => {
    press(controls[0], 'End');
    assert.equal(group.value, 'list');
    assert.equal(document.activeElement, controls[2]);

    press(controls[2], 'Home');
    assert.equal(group.value, 'grid');
    assert.equal(document.activeElement, controls[0]);
  });

  it('skips disabled buttons', () => {
    group.buttons[1].setAttribute('disabled', '');

    press(controls[0], 'ArrowRight');

    assert.equal(group.value, 'list', 'the disabled button in the middle is skipped');
    assert.equal(document.activeElement, controls[2]);
  });

  it('a disabled button never holds the tab stop', () => {
    group.buttons[0].setAttribute('disabled', '');
    group.refresh();

    assert.deepEqual(
      controlsOf(group).map((control) => control.tabIndex),
      [-1, 0, -1]
    );
  });

  it('emits ui4u:change when the arrow keys change the selection', () => {
    /** @type {Array<{ value: string }>} */
    const seen = [];
    group.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    press(controls[0], 'ArrowRight');

    assert.deepEqual(seen, [{ value: 'table', name: 'view' }]);
  });

  it('leaves Tab to the platform, so it leaves the group entirely', () => {
    const event = press(controls[0], 'Tab');

    assert.equal(event.defaultPrevented, false, 'the group must not swallow Tab');
    assert.equal(group.value, '');
    assert.deepEqual(
      controls.map((control) => control.tabIndex),
      [0, -1, -1],
      'the single tab stop is what lets Tab get past the group'
    );
  });

  it('ignores keys it does not own', () => {
    for (const key of ['Enter', ' ', 'Escape', 'a']) {
      const event = press(controls[0], key);

      assert.equal(event.defaultPrevented, false, `${key} is left alone`);
      assert.equal(group.value, '');
    }
  });

  it('ignores keys from outside the group', () => {
    const outside = mount('<button id="outside">Outside</button>').querySelector('#outside');
    const event = press(outside, 'ArrowRight');

    assert.equal(event.defaultPrevented, false);
    assert.equal(group.value, '');
  });
});

describe('ui-button-group event bindings', () => {
  let group;
  let controls;

  beforeEach(() => {
    group = mount(GROUP).querySelector('ui-button-group');
    controls = controlsOf(group);
  });

  afterEach(() => cleanup());

  it('a binding that returns false vetoes the selection, leaving nothing changed', () => {
    /** @type {unknown[]} */
    const seen = [];
    group.bind('change', () => false);
    group.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    click(controls[1]);

    assert.equal(group.value, '', 'the value never changed');
    assert.equal(group.hasAttribute('value'), false, 'and was never reflected either');
    assert.deepEqual(
      controls.map((control) => control.getAttribute('aria-checked')),
      ['false', 'false', 'false'],
      'not half-changed: no segment is checked'
    );
    assert.deepEqual(
      controls.map((control) => control.tabIndex),
      [0, -1, -1],
      'and the tab stop never moved'
    );
    assert.deepEqual(seen, [], 'a vetoed selection reports nothing');
  });

  it('a binding that calls preventDefault vetoes too', () => {
    group.bind('change', (_detail, event) => event.preventDefault());

    controls[0].focus();
    press(controls[0], 'ArrowRight');

    assert.equal(group.value, '');
    assert.equal(document.activeElement, controls[0], 'and focus never moved');
  });

  it('a binding that returns undefined lets the selection through', () => {
    /** @type {Array<{ value: string }>} */
    const details = [];
    group.bind('change', (detail) => {
      details.push(detail);
      return undefined;
    });

    press(controls[0], 'ArrowRight');

    assert.equal(group.value, 'table');
    assert.deepEqual(
      details.map((detail) => detail.value),
      ['table']
    );
  });

  it('a binding receives the value, name, previous value and button', () => {
    /** @type {any[]} */
    const seen = [];
    group.select('grid');
    group.bind('change', (detail) => seen.push(detail));

    group.select('list');

    assert.equal(seen.length, 1);
    assert.equal(seen[0].value, 'list');
    assert.equal(seen[0].name, 'view');
    assert.equal(seen[0].previous, 'grid');
    assert.equal(seen[0].button, group.buttons[2]);
  });

  it('configure({ bindings }) registers a handler', () => {
    /** @type {string[]} */
    const seen = [];
    group.configure({
      bindings: {
        change: (detail) => {
          seen.push(detail.value);
          return false;
        },
      },
    });

    click(controls[1]);

    assert.deepEqual(group.bindingNames, ['change']);
    assert.deepEqual(seen, ['table']);
    assert.equal(group.value, '', 'and the registered binding vetoed it');
  });

  it('unbind() takes a handler back off again', () => {
    /** @type {number} */
    let calls = 0;
    const veto = () => {
      calls += 1;
      return false;
    };
    group.bind('change', veto);

    group.unbind('change', veto);
    click(controls[1]);

    assert.equal(calls, 0);
    assert.equal(group.value, 'table');
  });
});

describe('ui-button-group focus and disabled state', () => {
  afterEach(() => cleanup());

  it('focus() lands on the single tab stop', () => {
    const group = mount(GROUP).querySelector('ui-button-group');
    const controls = controlsOf(group);

    assert.equal(group.focus(), group);
    assert.equal(document.activeElement, controls[0]);

    group.select('list');
    group.focus();

    assert.equal(document.activeElement, controls[2], 'the selected button takes focus');
  });

  it('disabling the group disables every control and removes the tab stop', () => {
    const group = mount(GROUP).querySelector('ui-button-group');

    group.disabled = true;

    assert.ok(
      controlsOf(group).every((control) => control.disabled),
      'the group reaches every native control'
    );
    assert.deepEqual(
      controlsOf(group).map((control) => control.tabIndex),
      [-1, -1, -1],
      'a fully disabled group has no tab stop'
    );
    assert.equal(group.getAttribute('aria-disabled'), 'true');
  });

  it('re-enabling the group leaves a button disabled on its own', () => {
    const group = mount(`
      <ui-button-group label="View" name="view" disabled>
        <ui-button value="grid">Grid</ui-button>
        <ui-button value="table" disabled>Table</ui-button>
      </ui-button-group>
    `).querySelector('ui-button-group');

    group.disabled = false;

    assert.equal(group.buttons[0].control.disabled, false);
    assert.equal(
      group.buttons[1].control.disabled,
      true,
      "its own flag survived the group's disable"
    );
    assert.deepEqual(
      controlsOf(group).map((control) => control.tabIndex),
      [0, -1]
    );
  });

  it('a selected-but-disabled button hands the tab stop back', () => {
    const group = mount(`
      <ui-button-group label="View" name="view" value="grid">
        <ui-button value="grid">Grid</ui-button>
        <ui-button value="table">Table</ui-button>
      </ui-button-group>
    `).querySelector('ui-button-group');

    group.buttons[0].setAttribute('disabled', '');
    group.refresh();

    assert.equal(group.value, 'grid', 'the value is still the answer');
    assert.deepEqual(
      controlsOf(group).map((control) => control.tabIndex),
      [-1, 0],
      'but an unusable button never holds the tab stop'
    );
  });
});

describe('ui-button-group configure()', () => {
  afterEach(() => cleanup());

  it('applies every option and returns the element', () => {
    const group = mount(`
      <ui-button-group>
        <ui-button value="grid">Grid</ui-button>
        <ui-button value="table">Table</ui-button>
      </ui-button-group>
    `).querySelector('ui-button-group');

    const result = group.configure({
      label: 'View',
      name: 'view',
      value: 'table',
      hint: 'Pick one.',
      error: 'Pick another.',
      disabled: true,
      required: true,
      srOnly: true,
    });

    assert.equal(result, group);
    assert.equal(group.label, 'View');
    assert.equal(group.name, 'view');
    assert.equal(group.value, 'table');
    assert.equal(group.hint, 'Pick one.');
    assert.equal(group.error, 'Pick another.');
    assert.equal(group.disabled, true);
    assert.equal(group.required, true);
    assert.equal(group.srOnly, true);
    assert.equal(group.querySelector('.ui4u-button-group__label').textContent, 'View');
  });

  it('leaves untouched options alone', () => {
    const group = mount(GROUP).querySelector('ui-button-group');

    group.configure({ required: true });

    assert.equal(group.required, true);
    assert.equal(group.label, 'View');
    assert.equal(group.name, 'view');
  });
});

describe('ui-button-group validation', () => {
  afterEach(() => cleanup());

  it('is valid with no selection when it is not required', () => {
    const group = mount(GROUP).querySelector('ui-button-group');

    assert.deepEqual(group.checkValidity(), {
      valid: true,
      message: '',
      value: '',
      name: 'view',
    });
  });

  it('is invalid with no selection when required', () => {
    const group = mount(GROUP).querySelector('ui-button-group');
    group.required = true;

    const result = group.checkValidity();

    assert.equal(result.valid, false);
    assert.ok(result.message.length > 0);
    assert.equal(result.value, '');
    assert.equal(result.name, 'view');
  });

  it('is valid once a button is selected', () => {
    const group = mount(GROUP).querySelector('ui-button-group');
    group.required = true;

    group.select('table');

    const result = group.checkValidity();
    assert.equal(result.valid, true);
    assert.equal(result.message, '');
    assert.equal(result.value, 'table');
  });

  it('treats an author-set error as invalid, with that message', () => {
    const group = mount(
      '<ui-button-group label="View" error="Pick a view."></ui-button-group>'
    ).querySelector('ui-button-group');

    assert.deepEqual(group.checkValidity().message, 'Pick a view.');
  });

  it('reportValidity() surfaces an error and focuses the tab stop', () => {
    const group = mount(GROUP).querySelector('ui-button-group');
    const controls = controlsOf(group);
    group.required = true;

    assert.equal(group.reportValidity(), group, 'returns this');
    assert.ok(group.error.length > 0);
    assert.equal(group.getAttribute('aria-invalid'), 'true');
    assert.equal(document.activeElement, controls[0], 'focus lands on the tab stop');

    group.clearValidity();
    assert.equal(group.error, '');
    assert.equal(group.hasAttribute('aria-invalid'), false);

    group.select('list');
    assert.equal(group.error, '', 'a valid group clears the error state');
  });

  it('a self-reported error stops invalidating once the question is answered', () => {
    const group = mount(GROUP).querySelector('ui-button-group');
    group.required = true;

    group.reportValidity();
    group.select('grid');

    // The message stays on screen until the author drops it — the same as every
    // other UI4U field — but it must not keep reporting the group as invalid.
    assert.equal(group.checkValidity().valid, true);

    group.clearValidity();
    assert.equal(group.error, '');
  });
});

describe('ui-button-group text rendering', () => {
  afterEach(() => cleanup());

  it('renders the label, hint and error as text, never as markup', () => {
    const group = mount(
      '<ui-button-group label="&lt;script&gt;x&lt;/script&gt;" hint="&lt;b&gt;hint&lt;/b&gt;" error="&lt;img src=x&gt;"></ui-button-group>'
    ).querySelector('ui-button-group');

    assert.equal(
      group.querySelector('.ui4u-button-group__label').textContent,
      '<script>x</script>'
    );
    assert.equal(group.querySelector('.ui4u-button-group__hint').textContent, '<b>hint</b>');
    assert.equal(group.querySelector('.ui4u-button-group__error').textContent, '<img src=x>');
    assert.equal(group.querySelector('script'), null);
    assert.equal(group.querySelector('img'), null);
  });
});

describe('ui-button-group dynamic children', () => {
  afterEach(() => cleanup());

  it('picks up a button added after connect', () => {
    const group = mount(GROUP).querySelector('ui-button-group');

    const added = document.createElement('ui-button');
    added.setAttribute('value', 'calendar');
    added.textContent = 'Calendar';
    group.append(added);

    group.refresh();

    assert.deepEqual(
      group.buttons.map((button) => button.getAttribute('value')),
      ['grid', 'table', 'list', 'calendar']
    );
    assert.equal(added.control.getAttribute('role'), 'radio', 'the new button is wired up');
    assert.deepEqual(
      group.buttons.map((button) => button.control.tabIndex),
      [0, -1, -1, -1]
    );
  });

  it('drops a button that leaves the group', () => {
    const group = mount(`
      <ui-button-group label="View" name="view" value="list">
        <ui-button value="grid">Grid</ui-button>
        <ui-button value="list">List</ui-button>
      </ui-button-group>
    `).querySelector('ui-button-group');

    group.buttons[1].remove();
    // `ui-button` cannot call back into a group it does not own, so a removal
    // the component cannot see is the author's to report.
    group.refresh();

    assert.deepEqual(
      group.buttons.map((button) => button.getAttribute('value')),
      ['grid']
    );
    assert.equal(group.value, '', 'the selected button went with it');
    assert.equal(group.buttons[0].control.tabIndex, 0, 'the tab stop falls back to the first');
  });

  it('refresh() returns the element and is safe before connect', () => {
    const group = mount(GROUP).querySelector('ui-button-group');
    assert.equal(group.refresh(), group);

    const detached = document.createElement('ui-button-group');
    assert.equal(detached.refresh(), detached);
    assert.deepEqual(detached.buttons, []);
  });
});

describe('ui-button-group teardown', () => {
  afterEach(() => cleanup());

  it('removes generated markup and keeps the authored children', () => {
    const group = mount(GROUP).querySelector('ui-button-group');

    group.remove();

    assert.equal(group.querySelector('.ui4u-button-group__options'), null);
    assert.equal(group.querySelector('.ui4u-button-group__label'), null);
    assert.equal(group.querySelector('.ui4u-button-group__hint'), null);
    assert.equal(group.querySelector('.ui4u-button-group__error'), null);
    assert.equal(group.hasAttribute('role'), false);
    assert.deepEqual(
      [...group.children].map((child) => child.textContent.trim()),
      ['Grid', 'Table', 'List'],
      'the authored buttons are restored, in order'
    );
  });

  it('gives back the group-level disable on disconnect, without touching a button own flag', () => {
    const group = mount(`
      <ui-button-group label="View" name="view" disabled>
        <ui-button value="grid">Grid</ui-button>
        <ui-button value="table" disabled>Table</ui-button>
      </ui-button-group>
    `).querySelector('ui-button-group');
    const controls = controlsOf(group);

    // The group reached the native controls, and never the buttons' own flags.
    assert.ok(controls.every((control) => control.disabled));

    group.remove();

    assert.equal(group.hasAttribute('aria-disabled'), false);
    assert.equal(
      group.querySelectorAll('ui-button')[0].hasAttribute('disabled'),
      false,
      'the group never wrote the attribute it does not own'
    );
    assert.equal(
      group.querySelectorAll('ui-button')[1].hasAttribute('disabled'),
      true,
      "the button's own flag is untouched"
    );
  });

  it('rebuilds correctly when reconnected', () => {
    const group = mount(`
      <ui-button-group label="View" name="view" hint="Later" value="table">
        <ui-button value="grid">Grid</ui-button>
        <ui-button value="table">Table</ui-button>
      </ui-button-group>
    `).querySelector('ui-button-group');

    group.remove();
    document.body.appendChild(group);

    assert.ok(group.querySelector('.ui4u-button-group__options'), 'the row is rebuilt');
    assert.equal(group.getAttribute('role'), 'radiogroup');
    assert.equal(group.value, 'table', 'the authored selection survives');
    assert.deepEqual(
      controlsOf(group).map((control) => control.tabIndex),
      [-1, 0]
    );
  });

  it('is inert before it connects', () => {
    const group = document.createElement('ui-button-group');

    assert.deepEqual(group.buttons, []);
    assert.equal(group.value, '');
    assert.equal(group.checkValidity().valid, true);
    assert.equal(group.focus(), group);
  });
});
