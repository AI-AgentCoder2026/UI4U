import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { cleanup, mount, press, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component modules are evaluated.
setupDom();

const { Card } = await import('../../src/components/card/card.js');
const { Cards } = await import('../../src/components/cards/cards.js');
const { define, isDefined } = await import('../../src/core/registry.js');

define('ui-card', Card);
define('ui-cards', Cards);

describe('ui-card registration', () => {
  it('registers as a custom element', () => {
    assert.equal(isDefined('ui-card'), true);
    assert.equal(isDefined('ui-cards'), true);
  });
});

describe('ui-card', () => {
  afterEach(() => cleanup());

  it('renders a heading from the heading attribute', () => {
    const card = mount('<ui-card heading="ui-checkbox"></ui-card>').querySelector('ui-card');

    const title = card.querySelector('.ui4u-card__title');
    assert.equal(title.textContent, 'ui-checkbox');
    assert.equal(title.localName, 'h3', 'a heading, not a div');
  });

  it('honours a custom heading level', () => {
    const card = mount('<ui-card heading="Title" heading-level="2"></ui-card>').querySelector(
      'ui-card'
    );
    assert.equal(card.querySelector('.ui4u-card__title').localName, 'h2');
  });

  it('renders an eyebrow when asked for one', () => {
    const card = mount('<ui-card heading="T" eyebrow="Forms"></ui-card>').querySelector('ui-card');
    assert.equal(card.querySelector('.ui4u-card__eyebrow').textContent, 'Forms');
  });

  it('moves the author text into the body', () => {
    const card = mount('<ui-card heading="T">Some description.</ui-card>').querySelector('ui-card');

    assert.equal(card.querySelector('.ui4u-card__body').textContent.trim(), 'Some description.');
  });

  it('keeps the author own markup inside the body', () => {
    const card = mount('<ui-card heading="T"><p>First.</p><p>Second.</p></ui-card>').querySelector(
      'ui-card'
    );

    const body = card.querySelector('.ui4u-card__body');
    assert.equal(body.querySelectorAll('p').length, 2);
  });

  it('lets the author supply their own heading element', () => {
    const card = mount(
      '<ui-card><h3 data-part="title">Custom</h3>Body text.</ui-card>'
    ).querySelector('ui-card');

    const title = card.querySelector('h3.ui4u-card__title');
    assert.ok(title, 'their own element is the title, wrapper and all');
    assert.equal(title.textContent, 'Custom');
  });

  it('separates actions from the body', () => {
    const card = mount(
      '<ui-card heading="T">Body.<div data-part="actions"><ui-button>Open</ui-button></div></ui-card>'
    ).querySelector('ui-card');

    const actions = card.querySelector('.ui4u-card__actions');
    assert.ok(actions.querySelector('ui-button'), 'the button stayed in the actions row');
    assert.ok(!actions.textContent.includes('Body.'), 'and the body did not follow it in');
  });

  /* --- link mode ---------------------------------------------------------- */

  it('wraps the heading in one link when href is set', () => {
    const card = mount('<ui-card heading="ui-tabs" href="tabs.html"></ui-card>').querySelector(
      'ui-card'
    );

    const link = card.querySelector('.ui4u-card__link');
    assert.equal(link.localName, 'a', 'a real anchor, so middle click and focus work');
    assert.equal(link.getAttribute('href'), 'tabs.html');
    assert.equal(link.textContent, 'ui-tabs', 'and it is named by the card title');
  });

  it('keeps one link for the whole card', () => {
    const card = mount('<ui-card heading="T" href="x.html">Body.</ui-card>').querySelector(
      'ui-card'
    );

    assert.equal(card.querySelectorAll('a').length, 1);
  });

  it('forwards target and rel onto the anchor', () => {
    const card = mount(
      '<ui-card heading="T" href="x.html" target="_blank" rel="noopener noreferrer"></ui-card>'
    ).querySelector('ui-card');

    const link = card.querySelector('a');
    assert.equal(link.getAttribute('target'), '_blank');
    assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
  });

  it('has no link without href', () => {
    const card = mount('<ui-card heading="T"></ui-card>').querySelector('ui-card');
    assert.equal(card.querySelector('a'), null);
  });

  /* --- decoration --------------------------------------------------------- */

  it('exposes the variant and padding as data attributes', () => {
    const card = mount(
      '<ui-card heading="T" variant="glass" padding="lg"></ui-card>'
    ).querySelector('ui-card');

    assert.equal(card.dataset.variant, 'glass');
    assert.equal(card.dataset.padding, 'lg');
  });

  it('falls back to the default for an unknown variant', () => {
    const card = mount('<ui-card heading="T" variant="sparkle"></ui-card>').querySelector(
      'ui-card'
    );
    assert.equal(card.dataset.variant, 'default');
  });

  it('treats a card with href as interactive without being told', () => {
    const card = mount('<ui-card heading="T" href="x.html"></ui-card>').querySelector('ui-card');
    assert.equal(card.interactive, true);
    assert.equal(card.dataset.interactive, '');
  });

  it('does not mark a static card interactive', () => {
    const card = mount('<ui-card heading="T"></ui-card>').querySelector('ui-card');
    assert.equal(card.interactive, false);
    assert.equal(card.dataset.interactive, undefined);
  });

  /* --- configure and teardown --------------------------------------------- */

  it('applies every option through configure', () => {
    const card = mount('<ui-card></ui-card>').querySelector('ui-card');

    card.configure({
      heading: 'ui-card',
      eyebrow: 'Layout',
      href: 'card.html',
      variant: 'outline',
      padding: 'sm',
      interactive: true,
      headingLevel: 2,
    });

    assert.equal(card.heading, 'ui-card');
    assert.equal(card.eyebrow, 'Layout');
    assert.equal(card.href, 'card.html');
    assert.equal(card.variant, 'outline');
    assert.equal(card.querySelector('.ui4u-card__link').getAttribute('href'), 'card.html');
  });

  it('restores the author markup on disconnect', () => {
    const host = mount(
      '<ui-card heading="T"><p>Body.</p><div data-part="actions">A</div></ui-card>'
    );
    const card = host.querySelector('ui-card');
    card.remove();

    // The author's own nodes come back exactly as written, unstyled and
    // ungrouped, so reconnecting is not a lossy round trip.
    assert.equal(card.querySelector('.ui4u-card__frame'), null);
    assert.equal(card.querySelector('p').textContent, 'Body.');
    assert.equal(card.children.length, 2);
  });

  it('survives the heading changing while connected', () => {
    const card = mount('<ui-card heading="First"><p>Body.</p></ui-card>').querySelector('ui-card');

    card.heading = 'Second';

    assert.equal(card.querySelector('.ui4u-card__title').textContent, 'Second');
    assert.equal(card.querySelector('p').textContent, 'Body.', 'the body was not lost');
  });

  /* --- events and bindings ------------------------------------------------ */

  it('emits ui4u:press with the href when the link is clicked', () => {
    const card = mount('<ui-card heading="T" href="x.html"></ui-card>').querySelector('ui-card');
    /** @type {any[]} */
    const seen = [];
    card.addEventListener('ui4u:press', (event) => seen.push(event.detail));

    card.querySelector('a').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    assert.equal(seen.length, 1);
    assert.equal(seen[0].href, 'x.html');
  });

  it('a binding vetoes the press and the navigation', () => {
    const card = mount('<ui-card heading="T" href="x.html"></ui-card>').querySelector('ui-card');
    let fired = 0;
    card.addEventListener('ui4u:press', () => (fired += 1));

    card.bind('press', () => false);
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    card.querySelector('a').dispatchEvent(event);

    assert.equal(fired, 0);
    assert.equal(event.defaultPrevented, true, 'the browser must not navigate either');
  });

  it('registers a press binding through configure', () => {
    const card = mount('<ui-card heading="T" href="x.html"></ui-card>').querySelector('ui-card');
    let calls = 0;

    card.configure({ bindings: { press: () => (calls += 1) } });
    card.querySelector('a').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    assert.equal(calls, 1);
  });

  it('does not emit anything for a static card', () => {
    const card = mount('<ui-card heading="T">Body.</ui-card>').querySelector('ui-card');
    let fired = 0;
    card.addEventListener('ui4u:press', () => (fired += 1));

    card
      .querySelector('.ui4u-card__frame')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    assert.equal(fired, 0);
  });
});

describe('ui-cards', () => {
  afterEach(() => cleanup());

  const GRID = `<ui-cards label="Components" id="grid">
    <ui-card heading="One"></ui-card>
    <ui-card heading="Two"></ui-card>
    <ui-card heading="Three"></ui-card>
  </ui-cards>`;

  it('is a list, and every card is a list item', () => {
    const grid = mount(GRID).querySelector('ui-cards');

    assert.equal(grid.getAttribute('role'), 'list');
    assert.equal(grid.getAttribute('aria-label'), 'Components');
    assert.equal(grid.querySelectorAll('ui-card[role="listitem"]').length, 3);
  });

  it('auto-fills by default, so the track count follows the width', () => {
    const grid = mount(GRID).querySelector('ui-cards');

    assert.equal(grid.columns, null);
    assert.match(
      grid.style.getPropertyValue('--ui4u-cards-columns'),
      /auto-fill/,
      'no fixed track count without being asked for one'
    );
  });

  it('uses the requested minimum track width', () => {
    const grid = mount('<ui-cards label="C" min="24rem"></ui-cards>').querySelector('ui-cards');
    assert.match(grid.style.getPropertyValue('--ui4u-cards-columns'), /24rem/);
  });

  it('takes a fixed track count when asked', () => {
    const grid = mount(GRID).querySelector('ui-cards');
    grid.configure({ columns: 4 });

    assert.equal(grid.columns, 4);
    assert.match(grid.style.getPropertyValue('--ui4u-cards-columns'), /repeat\(4,/);
  });

  it('lists its cards', () => {
    const grid = mount(GRID).querySelector('ui-cards');
    assert.deepEqual(
      grid.cards.map((c) => c.heading),
      ['One', 'Two', 'Three']
    );
  });

  it('gives a card added later list semantics', () => {
    const grid = mount(GRID).querySelector('ui-cards');

    const late = document.createElement('ui-card');
    late.setAttribute('heading', 'Late');
    grid.appendChild(late);

    return new Promise((resolve) => {
      setTimeout(() => {
        assert.equal(late.getAttribute('role'), 'listitem');
        assert.equal(grid.cards.length, 4);
        resolve(undefined);
      }, 0);
    });
  });

  it('moves between cards with the arrow keys', () => {
    const grid = mount(GRID).querySelector('ui-cards');
    const cards = grid.querySelectorAll('ui-card');

    press(cards[0], 'ArrowRight');
    // Focus lands *inside* the card — on its link where it has one — rather
    // than on the card element itself.
    assert.ok(cards[1].contains(document.activeElement), 'moved into the second card');

    press(document.activeElement, 'ArrowLeft');
    assert.ok(cards[0].contains(document.activeElement), 'and back into the first');
  });

  it('lands on the card link when there is one', () => {
    const grid = mount(
      '<ui-cards label="C"><ui-card heading="One"></ui-card><ui-card heading="Two" href="two.html"></ui-card></ui-cards>'
    ).querySelector('ui-cards');
    const cards = grid.querySelectorAll('ui-card');

    press(cards[0], 'ArrowRight');

    assert.equal(document.activeElement.localName, 'a', 'the link a reader would press');
    assert.equal(document.activeElement.getAttribute('href'), 'two.html');
  });

  it('clamps at the ends rather than wrapping', () => {
    const grid = mount(GRID).querySelector('ui-cards');
    const cards = grid.querySelectorAll('ui-card');

    press(cards[0], 'ArrowLeft');
    assert.ok(
      cards[0].contains(document.activeElement) || document.activeElement === document.body,
      'stayed in the first card'
    );

    press(cards[2], 'ArrowRight');
    assert.equal(document.activeElement, document.body, 'nothing past the last card');
  });

  it('leaves Tab alone so the grid is never a keyboard trap', () => {
    const grid = mount(GRID).querySelector('ui-cards');
    const event = press(grid.querySelector('ui-card'), 'Tab');
    assert.equal(event.defaultPrevented, false);
  });

  it('ignores arrows that come from outside a card', () => {
    const grid = mount(GRID).querySelector('ui-cards');
    const event = press(grid, 'ArrowRight');
    assert.equal(event.defaultPrevented, false);
  });

  it('drops list semantics on disconnect', () => {
    const grid = mount(GRID).querySelector('ui-cards');
    grid.remove();

    assert.equal(grid.getAttribute('role'), null);
    assert.equal(grid.querySelector('ui-card[role="listitem"]'), null);
  });
});
