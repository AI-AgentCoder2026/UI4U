import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { cleanup, click, mount, press, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component module is evaluated — see helpers/dom.js.
setupDom();

const { Dropdown, DropdownOption } = await import('../../src/components/dropdown/dropdown.js');
const { define, isDefined } = await import('../../src/core/registry.js');

define('ui-dropdown', Dropdown);
define('ui-dropdown-option', DropdownOption);

/** @returns {HTMLButtonElement} the trigger button the component rendered */
function triggerOf(field) {
  return field.querySelector('.ui4u-dropdown__trigger');
}

/** @returns {HTMLElement|null} the portalled panel, wherever it currently is */
function panelOf(field) {
  return field.panel;
}

/**
 * The rendered option rows, which live inside the portalled panel while the
 * list is open.
 *
 * @param {HTMLElement} field
 * @returns {HTMLElement[]}
 */
function rowsOf(field) {
  const panel = panelOf(field);
  return panel ? [...panel.querySelectorAll('[role="option"]')] : [];
}

/** @param {HTMLElement} field @param {string} value @returns {HTMLElement|null} */
function rowWithValue(field, value) {
  return rowsOf(field).find((row) => row.getAttribute('data-value') === value) ?? null;
}

const MARKUP = `
  <ui-dropdown label="Country" name="country" placeholder="Choose a country">
    <ui-dropdown-option value="my">Malaysia</ui-dropdown-option>
    <ui-dropdown-option value="sg">Singapore</ui-dropdown-option>
    <ui-dropdown-option value="th" disabled>Thailand</ui-dropdown-option>
    <ui-dropdown-option value="vn">Vietnam</ui-dropdown-option>
  </ui-dropdown>
`;

describe('ui-dropdown registration', () => {
  it('registers both custom elements', () => {
    assert.equal(isDefined('ui-dropdown'), true);
    assert.equal(isDefined('ui-dropdown-option'), true);
  });
});

describe('ui-dropdown rendering', () => {
  afterEach(() => cleanup());

  it('renders a real button trigger, never a select', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    const trigger = triggerOf(field);

    assert.equal(trigger.localName, 'button');
    assert.equal(trigger.type, 'button', 'never submits a form by accident');
    assert.equal(field.querySelector('select'), null);
    assert.equal(field.trigger, trigger, 'the same node is exposed, not a copy');
  });

  it('links the label to the trigger', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    const label = field.querySelector('.ui4u-dropdown__label');

    assert.equal(label.localName, 'label');
    assert.equal(label.getAttribute('for'), triggerOf(field).id);
    assert.equal(label.textContent, 'Country');
  });

  it('never reuses the host id, so the document has no duplicate ids', () => {
    const field = mount('<ui-dropdown id="country" label="Country"></ui-dropdown>').querySelector(
      'ui-dropdown'
    );

    assert.notEqual(triggerOf(field).id, 'country');
    assert.equal(
      field.querySelector('.ui4u-dropdown__label').getAttribute('for'),
      triggerOf(field).id
    );
  });

  it('shows the placeholder while nothing is chosen', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    assert.equal(triggerOf(field).textContent, 'Choose a country');
    assert.equal(triggerOf(field).dataset.placeholder, 'true');
  });

  it('renders the authored value on the trigger', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.value = 'sg';

    assert.equal(field.value, 'sg');
    assert.equal(triggerOf(field).textContent, 'Singapore');
    assert.equal(triggerOf(field).dataset.placeholder, 'false');
  });

  it('reads a value the author set in the markup', () => {
    const field = mount(
      '<ui-dropdown label="Country" value="sg"><ui-dropdown-option value="sg">Singapore</ui-dropdown-option></ui-dropdown>'
    ).querySelector('ui-dropdown');

    assert.equal(field.value, 'sg');
    assert.equal(triggerOf(field).textContent, 'Singapore');
  });

  it('keeps the authored options in the host while closed', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    assert.equal(field.options.length, 4);
    assert.equal(field.querySelectorAll('ui-dropdown-option').length, 4);
  });

  it('hides the label when there is no label text', () => {
    const field = mount('<ui-dropdown></ui-dropdown>').querySelector('ui-dropdown');
    const label = field.querySelector('.ui4u-dropdown__label');

    assert.equal(label.hidden, true);
    assert.equal(label.textContent, '');
  });

  it('visually hides the label with sr-only, keeping it for AT', () => {
    const field = mount('<ui-dropdown label="Country" sr-only></ui-dropdown>').querySelector(
      'ui-dropdown'
    );
    const label = field.querySelector('.ui4u-dropdown__label');

    assert.equal(field.srOnly, true);
    assert.equal(label.classList.contains('ui4u-sr-only'), true);
    assert.equal(label.hidden, false, 'still exposed, only clipped');
  });

  it('falls back to the option label when an option has no value', () => {
    const field = mount(
      '<ui-dropdown label="Country"><ui-dropdown-option>Malaysia</ui-dropdown-option></ui-dropdown>'
    ).querySelector('ui-dropdown');

    assert.deepEqual(field.options[0].value, 'Malaysia');
  });
});

describe('ui-dropdown aria wiring', () => {
  afterEach(() => cleanup());

  it('marks the trigger as a listbox popup', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    const trigger = triggerOf(field);

    assert.equal(trigger.getAttribute('aria-haspopup'), 'listbox');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.ok(trigger.getAttribute('aria-controls'), 'the trigger names the list it controls');

    field.open();
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');

    field.close();
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  });

  it('points aria-controls at the listbox it actually opens', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    const controls = triggerOf(field).getAttribute('aria-controls');

    field.open();

    assert.equal(panelOf(field).id, controls);
    assert.equal(panelOf(field).getAttribute('role'), 'listbox');
  });

  it('gives every option a role, a selected state and an id', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();

    const rows = rowsOf(field);
    assert.equal(rows.length, 4);

    for (const row of rows) {
      assert.equal(row.getAttribute('role'), 'option');
      assert.equal(row.hasAttribute('aria-selected'), true);
      assert.ok(row.id, 'needed by aria-activedescendant');
    }
  });

  it('marks disabled options with aria-disabled', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();

    assert.equal(rowWithValue(field, 'th').getAttribute('aria-disabled'), 'true');
    assert.equal(rowWithValue(field, 'my').hasAttribute('aria-disabled'), false);
  });

  it('sets aria-multiselectable only when multiple', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();
    assert.equal(panelOf(field).getAttribute('aria-multiselectable'), 'false');

    field.close();
    field.multiple = true;
    field.open();
    assert.equal(panelOf(field).getAttribute('aria-multiselectable'), 'true');
  });

  it('describes the trigger with the hint and the error', () => {
    const field = mount(
      '<ui-dropdown label="Country" hint="Pick your billing country."></ui-dropdown>'
    ).querySelector('ui-dropdown');
    const hint = field.querySelector('.ui4u-dropdown__hint');

    assert.equal(triggerOf(field).getAttribute('aria-describedby'), hint.id);

    field.error = 'That country is not served.';
    const error = field.querySelector('.ui4u-dropdown__error');
    assert.equal(
      triggerOf(field).getAttribute('aria-describedby'),
      `${hint.id} ${error.id}`,
      'both messages are chained'
    );

    field.clearValidity();
    assert.equal(triggerOf(field).getAttribute('aria-describedby'), hint.id);
  });

  it('marks aria-invalid only while an error is set', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    assert.equal(triggerOf(field).hasAttribute('aria-invalid'), false);

    field.error = 'Not served';
    assert.equal(triggerOf(field).getAttribute('aria-invalid'), 'true');

    field.error = '';
    assert.equal(triggerOf(field).hasAttribute('aria-invalid'), false);
  });

  it('marks aria-required when required', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    assert.equal(triggerOf(field).hasAttribute('aria-required'), false);

    field.required = true;
    assert.equal(triggerOf(field).getAttribute('aria-required'), 'true');
    assert.equal(field.dataset.required, 'true');
  });

  it('publishes the active option through aria-activedescendant', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();

    assert.equal(
      triggerOf(field).getAttribute('aria-activedescendant'),
      rowWithValue(field, 'my').id
    );

    press(triggerOf(field), 'ArrowDown');
    assert.equal(
      triggerOf(field).getAttribute('aria-activedescendant'),
      rowWithValue(field, 'sg').id
    );

    field.close();
    assert.equal(triggerOf(field).hasAttribute('aria-activedescendant'), false);
  });

  it('mirrors disabled onto the trigger', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    field.disabled = true;
    assert.equal(triggerOf(field).disabled, true);

    field.open();
    assert.equal(field.isOpen, true, 'a programmatic open still works');

    field.disabled = false;
    assert.equal(triggerOf(field).disabled, false);
  });
});

describe('ui-dropdown options()', () => {
  afterEach(() => cleanup());

  it('reports value, label, disabled and selected for every option', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    assert.deepEqual(field.options, [
      { value: 'my', label: 'Malaysia', disabled: false, selected: false },
      { value: 'sg', label: 'Singapore', disabled: false, selected: false },
      { value: 'th', label: 'Thailand', disabled: true, selected: false },
      { value: 'vn', label: 'Vietnam', disabled: false, selected: false },
    ]);
  });

  it('follows the committed selection', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    field.value = 'vn';

    assert.deepEqual(
      field.options.map((option) => option.selected),
      [false, false, false, true]
    );
  });
});

describe('ui-dropdown configure()', () => {
  afterEach(() => cleanup());

  it('applies every option and returns the element', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    const result = field.configure({
      label: 'Country',
      name: 'country',
      value: 'sg',
      placeholder: 'Choose a country',
      hint: 'Pick your billing country.',
      error: 'Not served',
      disabled: false,
      required: true,
      multiple: false,
      open: true,
    });

    assert.equal(result, field);
    assert.equal(field.label, 'Country');
    assert.equal(field.name, 'country');
    assert.equal(field.value, 'sg');
    assert.equal(field.placeholder, 'Choose a country');
    assert.equal(field.hint, 'Pick your billing country.');
    assert.equal(field.error, 'Not served');
    assert.equal(field.required, true);
    assert.equal(field.isOpen, true);
    assert.equal(field.panel.getAttribute('role'), 'listbox');
    assert.equal(triggerOf(field).textContent, 'Singapore');
  });

  it('leaves untouched options alone', () => {
    const field = mount(
      '<ui-dropdown label="Country" placeholder="Pick"></ui-dropdown>'
    ).querySelector('ui-dropdown');

    field.configure({ required: true });

    assert.equal(field.required, true);
    assert.equal(field.label, 'Country');
    assert.equal(field.placeholder, 'Pick');
  });

  it('closes through configure({ open: false })', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();

    field.configure({ open: false });

    assert.equal(field.isOpen, false);
    assert.equal(field.panel, null);
  });
});

describe('ui-dropdown attribute syncing', () => {
  afterEach(() => cleanup());

  it('re-syncs the trigger when an attribute changes', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    field.setAttribute('placeholder', 'Where to?');
    assert.equal(triggerOf(field).textContent, 'Where to?');

    field.setAttribute('required', '');
    assert.equal(triggerOf(field).getAttribute('aria-required'), 'true');
  });

  it('re-reads a value the author sets', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    field.setAttribute('value', 'vn');

    assert.equal(field.value, 'vn');
    assert.equal(triggerOf(field).textContent, 'Vietnam');
  });

  it('does not discard the selection when an unrelated attribute changes', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.value = 'sg';

    field.setAttribute('hint', 'Changed');

    assert.equal(field.value, 'sg', 'the committed value survives');
  });

  it('opens and closes from the open attribute', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    field.setAttribute('open', '');
    assert.equal(panelOf(field).getAttribute('role'), 'listbox');
    assert.equal(triggerOf(field).getAttribute('aria-expanded'), 'true');

    field.removeAttribute('open');
    assert.equal(field.panel, null);
    assert.equal(triggerOf(field).getAttribute('aria-expanded'), 'false');
  });
});

describe('ui-dropdown selection', () => {
  afterEach(() => cleanup());

  it('commits an option on click and closes', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();

    click(rowWithValue(field, 'sg'));

    assert.equal(field.value, 'sg');
    assert.equal(triggerOf(field).textContent, 'Singapore');
    assert.equal(field.isOpen, false);
    assert.equal(field.getAttribute('value'), 'sg', 'mirrored onto the attribute');
  });

  it('emits ui4u:change with value and name', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    /** @type {Array<{ value: string, name: string }>} */
    const seen = [];
    field.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    field.open();
    click(rowWithValue(field, 'vn'));

    assert.equal(seen.length, 1);
    assert.equal(seen[0].value, 'vn');
    assert.equal(seen[0].name, 'country');
  });

  it('reflects the committed value as aria-selected', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    field.open();
    click(rowWithValue(field, 'my'));
    field.open();

    assert.equal(rowWithValue(field, 'my').getAttribute('aria-selected'), 'true');
    assert.equal(rowWithValue(field, 'sg').getAttribute('aria-selected'), 'false');
  });

  it('does not commit a disabled option', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();

    click(rowWithValue(field, 'th'));

    assert.equal(field.value, '');
    assert.equal(field.isOpen, true, 'a dead option does not close the list either');
  });

  it('toggles the list when the trigger is clicked', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    click(triggerOf(field));
    assert.equal(field.isOpen, true);

    click(triggerOf(field));
    assert.equal(field.isOpen, false);
  });

  it('closes when clicking outside, and stays open when clicking inside', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();

    // The host itself, not the label: a <label for> forwards its click to the
    // button it labels, which correctly toggles the list — that is what a click
    // on a real label does, not an "outside" click.
    click(field);
    assert.equal(field.isOpen, true, 'a click inside the host is not outside');

    click(document.body);
    assert.equal(field.isOpen, false);
  });

  it('stops listening for outside clicks once closed', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    field.open();
    click(document.body);
    assert.equal(field.isOpen, false);

    // A stale document listener would try to close an already closed list and,
    // worse, keep firing on every later click. Nothing should throw or toggle.
    click(document.body);
    assert.equal(field.isOpen, false);
  });
});

describe('ui-dropdown keyboard', () => {
  afterEach(() => cleanup());

  it('opens on Enter, Space, ArrowDown and ArrowUp', () => {
    for (const key of ['Enter', ' ', 'ArrowDown', 'ArrowUp']) {
      const field = mount(MARKUP).querySelector('ui-dropdown');
      press(triggerOf(field), key);
      assert.equal(field.isOpen, true, `${key} should open the list`);
      field.remove();
    }
  });

  it('stops the browser synthesising a second toggle for Space', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    const event = press(triggerOf(field), ' ');

    assert.equal(event.defaultPrevented, true);
    assert.equal(field.isOpen, true, 'opened once, not opened and closed again');
  });

  it('opens Home onto the first option and End onto the last', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    press(triggerOf(field), 'End');
    assert.equal(
      triggerOf(field).getAttribute('aria-activedescendant'),
      rowWithValue(field, 'vn').id
    );

    press(triggerOf(field), 'Home');
    assert.equal(
      triggerOf(field).getAttribute('aria-activedescendant'),
      rowWithValue(field, 'my').id
    );
  });

  it('moves the active option with the arrow keys', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    press(triggerOf(field), 'ArrowDown');

    press(triggerOf(field), 'ArrowDown');
    assert.equal(
      triggerOf(field).getAttribute('aria-activedescendant'),
      rowWithValue(field, 'sg').id
    );
  });

  it('wraps around at the end', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();

    press(triggerOf(field), 'ArrowUp');

    assert.equal(
      triggerOf(field).getAttribute('aria-activedescendant'),
      rowWithValue(field, 'vn').id
    );
  });

  it('skips disabled options while navigating', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();

    press(triggerOf(field), 'ArrowDown');
    press(triggerOf(field), 'ArrowDown');

    assert.equal(
      triggerOf(field).getAttribute('aria-activedescendant'),
      rowWithValue(field, 'vn').id,
      'Thailand is disabled, so it is never the active option'
    );
  });

  it('commits and closes on Enter', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    press(triggerOf(field), 'ArrowDown');
    press(triggerOf(field), 'ArrowDown');

    press(triggerOf(field), 'Enter');

    assert.equal(field.value, 'sg');
    assert.equal(field.isOpen, false);
  });

  it('commits and closes on Space', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    press(triggerOf(field), 'ArrowDown');

    press(triggerOf(field), ' ');

    assert.equal(field.value, 'my');
    assert.equal(field.isOpen, false);
  });

  it('returns focus to the trigger on Escape', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    triggerOf(field).focus();

    press(triggerOf(field), 'ArrowDown');
    press(triggerOf(field), 'Escape');

    assert.equal(field.isOpen, false);
    assert.equal(document.activeElement, triggerOf(field));
  });

  it('closes on Tab without swallowing the key', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();

    const event = press(triggerOf(field), 'Tab');

    assert.equal(field.isOpen, false);
    assert.equal(event.defaultPrevented, false, 'the user must still be able to leave');
  });

  it('jumps to the option whose label starts with what was typed', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();

    press(triggerOf(field), 'v');

    assert.equal(
      triggerOf(field).getAttribute('aria-activedescendant'),
      rowWithValue(field, 'vn').id
    );
  });

  it('cycles through options sharing a first letter', () => {
    const field = mount(
      `<ui-dropdown label="Country">
         <ui-dropdown-option value="a">Argentina</ui-dropdown-option>
         <ui-dropdown-option value="b">Australia</ui-dropdown-option>
       </ui-dropdown>`
    ).querySelector('ui-dropdown');
    field.open();

    // Search starts after the active option, so a repeated letter walks the
    // matches instead of getting stuck on the one already active.
    assert.equal(rowWithValue(field, 'a').getAttribute('data-active'), 'true');

    press(triggerOf(field), 'a');
    assert.equal(rowWithValue(field, 'b').getAttribute('data-active'), 'true');

    press(triggerOf(field), 'a');
    assert.equal(rowWithValue(field, 'a').getAttribute('data-active'), 'true');
  });

  it('opens a closed list onto the matching option', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    press(triggerOf(field), 's');

    assert.equal(field.isOpen, true);
    assert.equal(
      triggerOf(field).getAttribute('aria-activedescendant'),
      rowWithValue(field, 'sg').id
    );
  });

  it('never type-aheads onto a disabled option', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();

    press(triggerOf(field), 't');

    assert.equal(
      rowWithValue(field, 'th').hasAttribute('data-active'),
      false,
      'Thailand is disabled, so "t" has nowhere to go'
    );
    assert.equal(
      triggerOf(field).getAttribute('aria-activedescendant'),
      rowWithValue(field, 'my').id,
      'the active option is left where it was'
    );
  });

  it('moves focus to the trigger', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    assert.equal(field.focus(), field);
    assert.equal(document.activeElement, triggerOf(field));
  });
});

describe('ui-dropdown multiple', () => {
  afterEach(() => cleanup());

  const MULTIPLE = `
    <ui-dropdown label="Regions" name="regions" multiple>
      <ui-dropdown-option value="eu">Europe</ui-dropdown-option>
      <ui-dropdown-option value="ap">Asia Pacific</ui-dropdown-option>
      <ui-dropdown-option value="la">Latin America</ui-dropdown-option>
    </ui-dropdown>
  `;

  it('toggles an option with Space and stays open', () => {
    const field = mount(MULTIPLE).querySelector('ui-dropdown');
    press(triggerOf(field), 'ArrowDown');

    press(triggerOf(field), ' ');
    assert.deepEqual(field.value, ['eu']);
    assert.equal(field.isOpen, true, 'Space toggles without closing');

    press(triggerOf(field), ' ');
    assert.deepEqual(field.value, []);
    assert.equal(field.isOpen, true);
  });

  it('commits every selected option on the trigger', () => {
    const field = mount(MULTIPLE).querySelector('ui-dropdown');
    press(triggerOf(field), 'ArrowDown');
    press(triggerOf(field), ' ');
    press(triggerOf(field), 'ArrowDown');
    press(triggerOf(field), ' ');

    assert.deepEqual(field.value, ['eu', 'ap']);
    assert.equal(triggerOf(field).textContent, 'Europe, Asia Pacific');
  });

  it('extends the selection with Ctrl+ArrowDown', () => {
    const field = mount(MULTIPLE).querySelector('ui-dropdown');
    press(triggerOf(field), 'ArrowDown');
    press(triggerOf(field), ' ');
    assert.deepEqual(field.value, ['eu']);

    press(triggerOf(field), 'ArrowDown', { ctrlKey: true });

    assert.deepEqual(field.value, ['eu', 'ap'], 'the selection grows, it does not reset');
  });

  it('keeps Enter as commit-and-close', () => {
    const field = mount(MULTIPLE).querySelector('ui-dropdown');
    press(triggerOf(field), 'ArrowDown');

    press(triggerOf(field), 'Enter');

    assert.deepEqual(field.value, ['eu']);
    assert.equal(field.isOpen, false);
  });

  it('reads a comma separated value attribute', () => {
    const field = mount(
      '<ui-dropdown label="Regions" multiple value="eu,la"><ui-dropdown-option value="eu">Europe</ui-dropdown-option><ui-dropdown-option value="la">Latin America</ui-dropdown-option></ui-dropdown>'
    ).querySelector('ui-dropdown');

    assert.deepEqual(field.value, ['eu', 'la']);
  });

  it('accepts an array through the value setter', () => {
    const field = mount(MULTIPLE).querySelector('ui-dropdown');

    field.value = ['ap', 'la'];

    assert.deepEqual(field.value, ['ap', 'la']);
    assert.equal(triggerOf(field).textContent, 'Asia Pacific, Latin America');
  });
});

describe('ui-dropdown validation', () => {
  afterEach(() => cleanup());

  it('is valid when empty and not required', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    assert.deepEqual(field.checkValidity(), {
      valid: true,
      message: '',
      value: '',
      name: 'country',
    });
  });

  it('is invalid when empty and required', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.required = true;

    const result = field.checkValidity();

    assert.equal(result.valid, false);
    assert.ok(result.message.length > 0);
    assert.equal(result.value, '');
    assert.equal(result.name, 'country');
  });

  it('is valid once a value is chosen', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.required = true;
    field.open();

    click(rowWithValue(field, 'sg'));

    assert.deepEqual(field.checkValidity(), {
      valid: true,
      message: '',
      value: 'sg',
      name: 'country',
    });
  });

  it('treats an author-set error as invalid, with that message', () => {
    const field = mount(
      '<ui-dropdown label="Country" error="That country is not served."></ui-dropdown>'
    ).querySelector('ui-dropdown');

    const result = field.checkValidity();

    assert.equal(result.valid, false);
    assert.equal(result.message, 'That country is not served.');
  });

  it('reportValidity() surfaces an error and clearValidity() drops it', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.required = true;

    assert.equal(field.reportValidity(), field, 'returns this');
    assert.ok(field.error.length > 0);
    assert.equal(triggerOf(field).getAttribute('aria-invalid'), 'true');

    field.clearValidity();
    assert.equal(field.error, '');
    assert.equal(triggerOf(field).hasAttribute('aria-invalid'), false);
  });

  it('does not stay invalid forever after reportValidity()', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.required = true;
    field.reportValidity();

    field.open();
    click(rowWithValue(field, 'my'));

    assert.equal(field.checkValidity().valid, true, 'valid once corrected');
  });

  it('still treats an author-supplied error as a deliberate override', () => {
    const field = mount(
      '<ui-dropdown label="Country" value="my" error="Nope"></ui-dropdown>'
    ).querySelector('ui-dropdown');

    assert.equal(field.checkValidity().valid, false);
  });

  it('reports an empty multiple selection as missing', () => {
    const field = mount(
      '<ui-dropdown label="Regions" multiple required><ui-dropdown-option value="eu">Europe</ui-dropdown-option></ui-dropdown>'
    ).querySelector('ui-dropdown');

    assert.equal(field.checkValidity().valid, false);
    field.value = ['eu'];
    assert.equal(field.checkValidity().valid, true);
  });
});

describe('ui-dropdown portalled panel', () => {
  afterEach(() => cleanup());

  it('portals the panel to body instead of rendering it in the host', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();

    assert.equal(field.querySelector('.ui4u-dropdown__panel'), null, 'not inside the host');
    assert.equal(panelOf(field).parentNode, document.body);
  });

  it('carries its own class and data attributes for styling', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();

    // The panel cannot be styled through a selector rooted at the host, so its
    // state has to live on the panel node itself.
    assert.equal(panelOf(field).classList.contains('ui4u-dropdown__panel'), true);
    assert.equal(panelOf(field).hasAttribute('data-placement'), true);
  });

  it('moves the authored options into the panel and back on close', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    field.open();
    assert.equal(panelOf(field).querySelectorAll('ui-dropdown-option').length, 4);

    field.close();
    assert.equal(panelOf(field), null);
    assert.equal(field.querySelectorAll('ui-dropdown-option').length, 4, 'back in the host');
  });

  it('removes the panel from body on close', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();
    const panel = panelOf(field);

    field.close();

    assert.equal(panel.parentNode, null);
    assert.equal(document.querySelector('.ui4u-dropdown__panel'), null);
  });

  it('re-positions on scroll and resize while open', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();

    // jsdom reports zero-size rects, so only the write itself is observable —
    // which is the part the component is responsible for.
    assert.doesNotThrow(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    });
  });

  it('releases the scroll and resize listeners on close', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();
    const panel = panelOf(field);

    field.close();
    panel.remove();

    assert.doesNotThrow(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    });
  });
});

describe('ui-dropdown text rendering', () => {
  afterEach(() => cleanup());

  it('renders option labels as text, never as markup', () => {
    const field = mount(
      '<ui-dropdown label="Country"><ui-dropdown-option value="x">&lt;img src=x onerror=alert(1)&gt;</ui-dropdown-option></ui-dropdown>'
    ).querySelector('ui-dropdown');
    field.open();

    const row = rowWithValue(field, 'x');
    assert.equal(row.textContent, '<img src=x onerror=alert(1)>');
    assert.equal(row.querySelector('img'), null);
  });

  it('renders hint and error as text, never as markup', () => {
    const field = mount(
      '<ui-dropdown label="Country" hint="&lt;b&gt;hint&lt;/b&gt;" error="&lt;script&gt;x&lt;/script&gt;"></ui-dropdown>'
    ).querySelector('ui-dropdown');

    assert.equal(field.querySelector('.ui4u-dropdown__hint').textContent, '<b>hint</b>');
    assert.equal(field.querySelector('.ui4u-dropdown__hint').querySelector('b'), null);
    assert.equal(field.querySelector('.ui4u-dropdown__error').textContent, '<script>x</script>');
    assert.equal(field.querySelector('.ui4u-dropdown__error').querySelector('script'), null);
  });
});

describe('ui-dropdown teardown', () => {
  afterEach(() => cleanup());

  it('removes the portalled panel from body on disconnect', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();
    const panel = panelOf(field);

    field.remove();

    assert.equal(panel.parentNode, null, 'the panel must never outlive the element');
    assert.equal(document.querySelector('.ui4u-dropdown__panel'), null);
  });

  it('removes generated markup and restores the authored children', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');

    field.remove();

    assert.equal(field.querySelector('.ui4u-dropdown__label'), null, 'label removed');
    assert.equal(field.querySelector('.ui4u-dropdown__trigger'), null, 'trigger removed');
    assert.equal(field.querySelector('.ui4u-dropdown__hint'), null, 'hint removed');
    assert.equal(field.querySelector('.ui4u-dropdown__error'), null, 'error removed');
    assert.equal(field.querySelectorAll('ui-dropdown-option').length, 4, 'author markup restored');
    assert.equal(field.hasAttribute('data-open'), false, 'style hook cleared');
  });

  it('strips the roles it added to the options', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();
    assert.equal(rowsOf(field)[0].getAttribute('role'), 'option');

    field.remove();

    for (const option of field.querySelectorAll('ui-dropdown-option')) {
      assert.equal(option.hasAttribute('role'), false);
      assert.equal(option.hasAttribute('aria-selected'), false);
      assert.equal(option.hasAttribute('aria-disabled'), false);
      assert.equal(option.hasAttribute('id'), false);
    }
  });

  it('rebuilds correctly when reconnected', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.value = 'sg';
    field.remove();
    document.body.appendChild(field);

    assert.equal(triggerOf(field).localName, 'button');
    assert.equal(triggerOf(field).textContent, 'Singapore');
    assert.equal(field.value, 'sg');

    field.open();
    assert.equal(panelOf(field).parentNode, document.body);
  });

  it('does not react to keys after disconnect', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    const trigger = triggerOf(field);
    /** @type {unknown[]} */
    const seen = [];
    field.addEventListener('ui4u:change', (event) => seen.push(event.detail));

    field.remove();
    press(trigger, 'ArrowDown');
    press(trigger, 'Enter');

    assert.equal(seen.length, 0, 'tracked listeners were disposed');
    assert.equal(document.querySelector('.ui4u-dropdown__panel'), null);
  });

  it('is inert before it connects', () => {
    const field = document.createElement('ui-dropdown');

    assert.equal(field.trigger, null);
    assert.equal(field.panel, null);
    assert.equal(field.isOpen, false);
    assert.equal(field.value, '');
    assert.deepEqual(field.options, []);
    assert.equal(field.checkValidity().valid, true);
  });

  it('opens when connected with the open attribute already set', () => {
    const field = document.createElement('ui-dropdown');
    field.setAttribute('label', 'Country');
    field.setAttribute('open', '');
    document.body.appendChild(field);

    assert.equal(field.panel.getAttribute('role'), 'listbox');
    field.remove();
  });
});

describe('ui-dropdown bindings', () => {
  afterEach(() => cleanup());

  it('runs a change binding with the detail the event carries', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    /** @type {any[]} */
    const seen = [];
    field.bind('change', (detail) => seen.push(detail));

    field.open();
    click(rowWithValue(field, 'sg'));

    assert.equal(seen.length, 1);
    assert.equal(seen[0].value, 'sg');
    assert.equal(seen[0].name, 'country');
    assert.equal(seen[0].option, rowWithValue(field, 'sg') ?? seen[0].option);
  });

  it('a binding returning false leaves the selection and the list untouched', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.open();
    click(rowWithValue(field, 'my'));
    field.open();

    /** @type {unknown[]} */
    const events = [];
    field.addEventListener('ui4u:change', () => events.push('change'));
    field.bind('change', () => false);

    click(rowWithValue(field, 'vn'));

    assert.equal(field.value, 'my', 'the previous selection stands');
    assert.equal(field.getAttribute('value'), 'my', 'and the attribute was not rewritten');
    assert.equal(triggerOf(field).textContent, 'Malaysia', 'the trigger still says Malaysia');
    assert.equal(field.isOpen, true, 'the list did not close either');
    assert.equal(rowWithValue(field, 'vn').getAttribute('aria-selected'), 'false');
    assert.deepEqual(events, [], 'and a vetoed change is never announced');
  });

  it('a binding calling preventDefault vetoes in exactly the same way', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.bind('change', (_detail, event) => event.preventDefault());
    field.open();

    click(rowWithValue(field, 'sg'));

    assert.equal(field.value, '');
    assert.equal(field.getAttribute('value'), null);
  });

  it('guards the one shared path: Space toggle and Ctrl+Arrow are vetoed too', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    field.bind('change', () => false);
    field.open();

    press(rowWithValue(field, 'my'), ' ');
    assert.equal(field.value, '', 'the Space toggle was vetoed');

    press(rowWithValue(field, 'my'), 'Enter');
    assert.equal(field.value, '', 'the Enter commit was vetoed');

    press(triggerOf(field), 'ArrowDown');
    press(triggerOf(field), 'ArrowDown', { ctrlKey: true });
    assert.equal(field.value, '', 'the Ctrl+Arrow selection was vetoed');
  });

  it('a binding returning undefined lets the commit through, and ui4u:change still fires', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    /** @type {any[]} */
    const events = [];
    field.addEventListener('ui4u:change', (event) => events.push(event.detail));
    field.bind('change', () => undefined);

    field.open();
    click(rowWithValue(field, 'vn'));

    assert.equal(field.value, 'vn');
    assert.equal(field.isOpen, false, 'still closed after the commit');
    assert.deepEqual(
      events.map((event) => event.value),
      ['vn']
    );
  });

  it('offers the selection the interaction would commit, not the live one', () => {
    const field = mount(
      `<ui-dropdown label="Regions" name="regions" multiple>
         <ui-dropdown-option value="eu">Europe</ui-dropdown-option>
         <ui-dropdown-option value="ap">Asia Pacific</ui-dropdown-option>
       </ui-dropdown>`
    ).querySelector('ui-dropdown');

    /** @type {any[]} */
    const seen = [];
    /** @type {string[][]} */
    const live = [];
    field.bind('change', (detail) => {
      seen.push(detail.value);
      live.push(field.value);
    });

    field.open();
    click(rowWithValue(field, 'eu'));
    field.open();
    click(rowWithValue(field, 'ap'));

    assert.deepEqual(seen, [['eu'], ['eu', 'ap']]);
    assert.deepEqual(
      live,
      [[], ['eu']],
      'the live value is always one commit behind the one being offered'
    );
  });

  it('an open or close binding vetoes the transition', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    /** @type {unknown[]} */
    const events = [];
    field.addEventListener('ui4u:open', () => events.push('open'));
    field.bind('open', () => false);

    field.open();
    assert.equal(field.isOpen, false, 'the list never opened');
    assert.equal(field.panel, null, 'and no panel was built');
    assert.deepEqual(events, []);

    field.unbind('open');
    field.open();
    field.bind('close', () => false);
    click(triggerOf(field));
    assert.equal(field.isOpen, true, 'the list stayed open');

    // Setting the attribute is the unguarded route, deliberately.
    field.removeAttribute('open');
    assert.equal(field.isOpen, false);
  });

  it('configure({ bindings }) registers bindings', () => {
    const field = mount(MARKUP).querySelector('ui-dropdown');
    /** @type {unknown[]} */
    const seen = [];
    field.configure({
      bindings: {
        open: () => seen.push('open'),
        change: (detail) => seen.push(detail.value),
      },
    });

    field.open();
    click(rowWithValue(field, 'sg'));

    assert.deepEqual(seen, ['open', 'sg']);
  });
});
