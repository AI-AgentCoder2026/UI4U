import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { cleanup, mount, press, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component module is evaluated.
setupDom();

const { Toolbar } = await import('../../src/components/toolbar/toolbar.js');
const { define, isDefined } = await import('../../src/core/registry.js');

define('ui-toolbar', Toolbar);

const BAR = `
  <ui-toolbar label="Filters">
    <button type="button" id="one">One</button>
    <button type="button" id="two">Two</button>
    <button type="button" id="three">Three</button>
  </ui-toolbar>
`;

describe('ui-toolbar registration', () => {
  it('registers as a custom element', () => {
    assert.equal(isDefined('ui-toolbar'), true);
  });
});

describe('ui-toolbar', () => {
  let bar;

  beforeEach(() => {
    bar = mount(BAR).querySelector('ui-toolbar');
  });

  afterEach(() => cleanup());

  /** @returns {HTMLElement[]} */
  const buttons = () => [...bar.querySelectorAll('button')];

  it('carries the toolbar role and its accessible name', () => {
    assert.equal(bar.getAttribute('role'), 'toolbar');
    assert.equal(bar.getAttribute('aria-label'), 'Filters');
  });

  it('defaults to a horizontal orientation', () => {
    assert.equal(bar.getAttribute('aria-orientation'), 'horizontal');
    assert.equal(bar.dataset.orientation, 'horizontal');
  });

  it('accepts a vertical orientation', () => {
    bar.configure({ orientation: 'vertical' });
    assert.equal(bar.orientation, 'vertical');
    assert.equal(bar.getAttribute('aria-orientation'), 'vertical');
  });

  it('exposes its controls in visual order', () => {
    assert.deepEqual(
      bar.items.map((item) => item.id),
      ['one', 'two', 'three']
    );
  });

  it('keeps exactly one tab stop across the whole bar', () => {
    const stops = bar.querySelectorAll('[tabindex="0"]');
    assert.equal(stops.length, 1);
    assert.equal(stops[0].id, 'one', 'the first control holds it by default');
  });

  it('moves the tab stop with the arrow keys', () => {
    press(buttons()[0], 'ArrowRight');

    assert.equal(bar.querySelector('[tabindex="0"]').id, 'two');
    assert.equal(bar.querySelectorAll('[tabindex="0"]').length, 1);
  });

  it('stops at the end instead of wrapping', () => {
    press(buttons()[2], 'ArrowRight');
    assert.equal(bar.querySelector('[tabindex="0"]').id, 'three', 'clamped');

    press(buttons()[0], 'ArrowLeft');
    assert.equal(bar.querySelector('[tabindex="0"]').id, 'one', 'clamped');
  });

  it('never handles Tab itself', () => {
    const event = press(buttons()[1], 'Tab');
    assert.equal(event.defaultPrevented, false, 'Tab must leave the bar');
  });

  it('follows its orientation', () => {
    bar.configure({ orientation: 'vertical' });

    press(buttons()[0], 'ArrowDown');
    assert.equal(bar.querySelector('[tabindex="0"]').id, 'two');

    press(buttons()[1], 'ArrowRight');
    assert.equal(bar.querySelector('[tabindex="0"]').id, 'two', 'horizontal key is inert');
  });

  it('skips a control that is not focusable', () => {
    const extra = mount(`
      <ui-toolbar label="Mixed">
        <button type="button" id="a">A</button>
        <button type="button" id="b" disabled>B</button>
        <button type="button" id="c">C</button>
      </ui-toolbar>
    `).querySelector('ui-toolbar');

    press(extra.querySelector('#a'), 'ArrowRight');
    assert.equal(extra.querySelector('[tabindex="0"]').id, 'c', 'the disabled button is skipped');

    cleanup();
  });

  it('emits ui4u:navigate when focus moves', () => {
    /** @type {any[]} */
    const seen = [];
    bar.addEventListener('ui4u:navigate', (event) => seen.push(event.detail));

    press(buttons()[0], 'ArrowRight');

    assert.equal(seen.length, 1);
    assert.equal(seen[0].index, 1);
    assert.equal(seen[0].label, 'Filters');
  });

  it('does not emit when the arrow key is clamped', () => {
    let fired = 0;
    bar.addEventListener('ui4u:navigate', () => (fired += 1));

    press(buttons()[2], 'ArrowRight');
    assert.equal(fired, 0, 'nothing moved');
  });

  it('puts the tab stop on the first control when focus() is called', () => {
    press(buttons()[0], 'ArrowRight');
    assert.equal(bar.querySelector('[tabindex="0"]').id, 'two');

    bar.querySelectorAll('button').forEach((b) => b.removeAttribute('tabindex'));
    bar.focus();

    assert.equal(bar.querySelector('[tabindex="0"]').id, 'one');
  });

  it('survives having no controls at all', () => {
    const empty = mount('<ui-toolbar label="Empty"></ui-toolbar>').querySelector('ui-toolbar');
    assert.deepEqual(empty.items, []);
    empty.focus();
    assert.equal(empty.querySelector('[tabindex="0"]'), null);
  });

  it('picks up a control added after it connected', () => {
    const added = document.createElement('button');
    added.type = 'button';
    added.id = 'late';
    bar.appendChild(added);
    bar.refresh?.();

    assert.equal(bar.items.length, 4);
    assert.equal(bar.querySelectorAll('[tabindex="0"]').length, 1);
  });

  it('shows a visual echo of its label and can hide it', () => {
    assert.equal(bar.getAttribute('data-label'), 'Filters');

    bar.configure({ srOnly: true });
    assert.equal(bar.dataset.srOnly, '');
    // The accessible name survives hiding the echo.
    assert.equal(bar.getAttribute('aria-label'), 'Filters');
  });

  it('drops the name and the echo when the label is cleared', () => {
    bar.configure({ label: '' });
    assert.equal(bar.hasAttribute('aria-label'), false);
    assert.equal(bar.hasAttribute('data-label'), false);
  });
});
