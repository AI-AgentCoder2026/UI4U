import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { cleanup, mount, press, setupDom } from '../helpers/dom.js';

// The DOM must exist before the component module is evaluated — see helpers/dom.js.
setupDom();

const { Tooltip } = await import('../../src/components/tooltip/tooltip.js');
const { define, isDefined } = await import('../../src/core/registry.js');
const { normalizePlacement, oppositePlacement, PLACEMENTS } = await import(
  '../../src/core/position.js'
);

define('ui-tooltip', Tooltip);

/**
 * jsdom reports zero-size rects and has no layout engine, so these specs assert
 * behaviour — ARIA, visibility, events, teardown, option fallbacks — and leave
 * geometry to the Playwright suite in `e2e/tooltip.spec.js`.
 */

/**
 * The surface is portalled to `<body>` so a `transform`/`filter`/
 * `backdrop-filter` ancestor cannot become the containing block for its
 * `position: fixed` coordinates. Look it up globally, not inside the host.
 *
 * @param {Element} _tooltip
 * @returns {HTMLElement|null} the generated surface
 */
function surfaceOf(_tooltip) {
  return document.querySelector('.ui4u-tooltip__surface');
}

/**
 * Dispatches a pointer event. jsdom has no PointerEvent constructor, so a plain
 * MouseEvent carries the type — the component listens for the type, not the class.
 *
 * @param {Element} target
 * @param {string} type
 * @param {Node|null} [relatedTarget]
 */
function pointer(target, type, relatedTarget = null) {
  const event = new MouseEvent(type, { bubbles: true, relatedTarget });
  target.dispatchEvent(event);
  return event;
}

/**
 * Dispatches a focus event. The harness does not expose jsdom's `FocusEvent`
 * constructor, so a plain `Event` carries the `relatedTarget` the component
 * reads to decide whether focus actually left the trigger.
 *
 * @param {Element} target
 * @param {'focusin'|'focusout'} type
 * @param {Node|null} [relatedTarget]
 */
function focus(target, type, relatedTarget = null) {
  const event = new Event(type, { bubbles: true, cancelable: false });
  Object.defineProperty(event, 'relatedTarget', { value: relatedTarget });
  target.dispatchEvent(event);
  return event;
}

/**
 * Collects `ui4u:show` / `ui4u:hide` payloads in the order they are emitted.
 *
 * @param {Element} target
 * @returns {Array<{ type: string, detail: { placement: string } }>}
 */
function collectEvents(target) {
  /** @type {Array<{ type: string, detail: { placement: string } }>} */
  const seen = [];
  target.addEventListener('ui4u:show', (event) =>
    seen.push({ type: 'ui4u:show', detail: event.detail })
  );
  target.addEventListener('ui4u:hide', (event) =>
    seen.push({ type: 'ui4u:hide', detail: event.detail })
  );
  return seen;
}

const BASIC = `
  <ui-tooltip content="Rebuild the index">
    <button type="button">Rebuild</button>
  </ui-tooltip>
`;

describe('ui-tooltip registration', () => {
  afterEach(() => cleanup());

  it('registers the custom element', () => {
    assert.equal(isDefined('ui-tooltip'), true);
  });
});

describe('ui-tooltip rendering', () => {
  let host;
  let tooltip;
  let trigger;
  let surface;

  afterEach(() => cleanup());

  const open = () => {
    host = mount(BASIC);
    tooltip = host.querySelector('ui-tooltip');
    trigger = tooltip.querySelector('button');
    surface = surfaceOf(tooltip);
  };

  it('keeps the light DOM child as the trigger and appends the surface', () => {
    open();

    assert.ok(trigger, 'authored button survives');
    assert.equal(trigger.parentElement, tooltip);
    // Portalled to <body>, not nested inside the host.
    assert.equal(surface.parentElement, document.body);
    assert.equal(surface.getAttribute('role'), 'tooltip');
    assert.ok(surface.id, 'surface has an id for aria-describedby');
  });

  it('renders the content as text, never as markup', () => {
    open();

    assert.equal(surface.textContent, 'Rebuild the index');
    assert.equal(surface.children.length, 0, 'no elements were built from the content');
    assert.equal(surface.innerHTML.includes('<'), false, 'content is never parsed as HTML');
  });

  it('escapes markup-looking content', () => {
    host = mount(`<ui-tooltip content="&lt;img src=x onerror=alert(1)&gt;"><b>t</b></ui-tooltip>`);
    tooltip = host.querySelector('ui-tooltip');
    surface = surfaceOf(tooltip);

    assert.equal(surface.textContent, '<img src=x onerror=alert(1)>');
    assert.equal(surface.querySelector('img'), null);
  });

  it('is hidden by default, so it is not in the accessibility tree', () => {
    open();

    assert.equal(surface.hidden, true);
    assert.equal(tooltip.visible, false);
  });

  it('falls back to top for an unknown placement', () => {
    host = mount(`<ui-tooltip content="x" placement="sideways"><b>t</b></ui-tooltip>`);
    tooltip = host.querySelector('ui-tooltip');

    assert.equal(tooltip.placement, 'top');
    assert.equal(tooltip.dataset.placement, 'top');
  });

  it('accepts every documented placement', () => {
    for (const placement of PLACEMENTS) {
      const container = mount(`<ui-tooltip content="x" placement="${placement}"><b>t</b></ui-tooltip>`);
      const element = container.querySelector('ui-tooltip');
      assert.equal(element.placement, placement);
      cleanup();
    }
  });

  it('does nothing observable with no content', () => {
    host = mount('<ui-tooltip><button type="button">Rebuild</button></ui-tooltip>');
    tooltip = host.querySelector('ui-tooltip');

    tooltip.show();

    assert.equal(tooltip.visible, false, 'an empty tooltip never opens');
    assert.equal(surfaceOf(tooltip).hidden, true);
  });
});

describe('ui-tooltip accessibility wiring', () => {
  afterEach(() => cleanup());

  it('describes the trigger with aria-describedby while connected', () => {
    const host = mount(BASIC);
    const tooltip = host.querySelector('ui-tooltip');
    const trigger = tooltip.querySelector('button');
    const surface = surfaceOf(tooltip);

    assert.equal(trigger.getAttribute('aria-describedby'), surface.id);
  });

  it('removes aria-describedby again on disconnect', () => {
    const host = mount(BASIC);
    const tooltip = host.querySelector('ui-tooltip');
    const trigger = tooltip.querySelector('button');

    tooltip.remove();

    assert.equal(trigger.hasAttribute('aria-describedby'), false);
    assert.equal(surfaceOf(tooltip), null, 'generated surface removed');
  });

  it('restores an aria-describedby the author had already set', () => {
    const host = mount(`
      <ui-tooltip content="hint">
        <button type="button" aria-describedby="author-owned">Rebuild</button>
      </ui-tooltip>
    `);
    const tooltip = host.querySelector('ui-tooltip');
    const trigger = tooltip.querySelector('button');

    assert.notEqual(trigger.getAttribute('aria-describedby'), 'author-owned');

    tooltip.remove();

    assert.equal(trigger.getAttribute('aria-describedby'), 'author-owned');
  });

  it('makes a non-focusable trigger focusable so the keyboard has a way in', () => {
    const host = mount('<ui-tooltip content="hint">Plain text trigger</ui-tooltip>');
    const tooltip = host.querySelector('ui-tooltip');

    assert.equal(tooltip.tabIndex, 0);
    assert.equal(tooltip.getAttribute('aria-describedby'), surfaceOf(tooltip).id);

    tooltip.remove();

    assert.equal(tooltip.hasAttribute('tabindex'), false, 'tabindex removed again');
  });

  it('shows on keyboard focus', () => {
    const host = mount(BASIC);
    const tooltip = host.querySelector('ui-tooltip');

    focus(tooltip.querySelector('button'), 'focusin');

    assert.equal(tooltip.visible, true);
    assert.equal(surfaceOf(tooltip).hidden, false);
  });

  it('hides on blur', () => {
    const host = mount(BASIC);
    const tooltip = host.querySelector('ui-tooltip');
    const trigger = tooltip.querySelector('button');

    focus(trigger, 'focusin');
    focus(trigger, 'focusout');

    assert.equal(tooltip.visible, false);
    assert.equal(surfaceOf(tooltip).hidden, true);
  });

  it('stays open when focus moves between the trigger and the surface', () => {
    const host = mount(BASIC);
    const tooltip = host.querySelector('ui-tooltip');
    const trigger = tooltip.querySelector('button');
    const surface = surfaceOf(tooltip);

    focus(trigger, 'focusin');
    focus(trigger, 'focusout', surface);

    assert.equal(tooltip.visible, true);
  });

  it('never traps focus inside the surface', () => {
    const host = mount(BASIC);
    const tooltip = host.querySelector('ui-tooltip');
    const surface = surfaceOf(tooltip);

    tooltip.show();

    // A tooltip is a description, not a dialog: nothing in it is focusable.
    assert.equal(surface.querySelector('a, button, input, select, textarea, [tabindex]'), null);
    assert.equal(surface.getAttribute('role'), 'tooltip');
    assert.equal(surface.getAttribute('aria-modal'), null);
  });
});

describe('ui-tooltip pointer behaviour', () => {
  afterEach(() => cleanup());

  it('shows on hover and hides on leave', async () => {
    const host = mount(BASIC);
    const tooltip = host.querySelector('ui-tooltip');
    const trigger = tooltip.querySelector('button');

    pointer(trigger, 'pointerover');
    // Zero delay still schedules on a timer, so let the macrotask run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(tooltip.visible, true);

    pointer(trigger, 'pointerout');
    assert.equal(tooltip.visible, false, 'leaving hides immediately');
  });

  it('ignores pointer movement between children of the same trigger', async () => {
    const host = mount(`
      <ui-tooltip content="hint">
        <span id="outer"><span id="inner">trigger</span></span>
      </ui-tooltip>
    `);
    const tooltip = host.querySelector('ui-tooltip');
    const inner = host.querySelector('#inner');
    const outer = host.querySelector('#outer');

    pointer(inner, 'pointerover');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(tooltip.visible, true);

    pointer(outer, 'pointerout', inner);
    assert.equal(tooltip.visible, true, 'still inside the trigger');
  });

  it('honours the delay attribute before showing', async () => {
    const host = mount(`
      <ui-tooltip content="hint" delay="60">
        <button type="button">Rebuild</button>
      </ui-tooltip>
    `);
    const tooltip = host.querySelector('ui-tooltip');
    const trigger = tooltip.querySelector('button');

    pointer(trigger, 'pointerover');
    assert.equal(tooltip.visible, false, 'not shown synchronously');

    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(tooltip.visible, false, 'still waiting out the delay');

    await new Promise((resolve) => setTimeout(resolve, 90));
    assert.equal(tooltip.visible, true, 'shown once the delay elapsed');
  });

  it('cancels a pending show when the pointer leaves first', async () => {
    const host = mount(`
      <ui-tooltip content="hint" delay="60">
        <button type="button">Rebuild</button>
      </ui-tooltip>
    `);
    const tooltip = host.querySelector('ui-tooltip');
    const trigger = tooltip.querySelector('button');

    pointer(trigger, 'pointerover');
    pointer(trigger, 'pointerout');

    await new Promise((resolve) => setTimeout(resolve, 90));
    assert.equal(tooltip.visible, false, 'the pending show was cancelled');
  });
});

describe('ui-tooltip show / hide / toggle', () => {
  let host;
  let tooltip;
  let surface;

  afterEach(() => cleanup());

  const open = () => {
    host = mount(BASIC);
    tooltip = host.querySelector('ui-tooltip');
    surface = surfaceOf(tooltip);
  };

  it('show() opens and returns the element', () => {
    open();

    assert.equal(tooltip.show(), tooltip);
    assert.equal(tooltip.visible, true);
    assert.equal(surface.hidden, false);
  });

  it('hide() closes and returns the element', () => {
    open();
    tooltip.show();

    assert.equal(tooltip.hide(), tooltip);
    assert.equal(tooltip.visible, false);
    assert.equal(surface.hidden, true);
  });

  it('toggle() flips the visible state', () => {
    open();

    tooltip.toggle();
    assert.equal(tooltip.visible, true);

    tooltip.toggle();
    assert.equal(tooltip.visible, false);
  });

  it('is idempotent — no duplicate events for a redundant call', () => {
    open();
    const events = collectEvents(tooltip);

    tooltip.show();
    tooltip.show();
    tooltip.hide();
    tooltip.hide();

    assert.deepEqual(
      events.map((e) => e.type),
      ['ui4u:show', 'ui4u:hide']
    );
  });

  it('records the resolved placement on the surface while open', () => {
    open();

    tooltip.show();

    // jsdom has no layout, so the helper keeps the requested placement.
    assert.equal(surface.dataset.placement, 'top');
  });

  it('drops the resolved placement again when closed', () => {
    open();
    tooltip.show();
    tooltip.hide();

    assert.equal(surface.hasAttribute('data-placement'), false);
  });
});

describe('ui-tooltip events', () => {
  afterEach(() => cleanup());

  it('emits ui4u:show with the placement on open', () => {
    const host = mount(`
      <ui-tooltip content="hint" placement="right"><button type="button">t</button></ui-tooltip>
    `);
    const tooltip = host.querySelector('ui-tooltip');
    const events = collectEvents(tooltip);

    tooltip.show();

    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'ui4u:show');
    assert.equal(events[0].detail.placement, 'right');
  });

  it('emits ui4u:hide on close', () => {
    const host = mount(BASIC);
    const tooltip = host.querySelector('ui-tooltip');
    const events = collectEvents(tooltip);

    tooltip.show();
    tooltip.hide();

    assert.deepEqual(
      events.map((e) => e.type),
      ['ui4u:show', 'ui4u:hide']
    );
  });

  it('hides on Escape and emits ui4u:hide', () => {
    const host = mount(BASIC);
    const tooltip = host.querySelector('ui-tooltip');
    const trigger = tooltip.querySelector('button');
    const events = collectEvents(tooltip);

    tooltip.show();
    press(trigger, 'Escape');

    assert.equal(tooltip.visible, false);
    assert.deepEqual(
      events.map((e) => e.type),
      ['ui4u:show', 'ui4u:hide']
    );
  });

  it('ignores Escape when nothing is open', () => {
    const host = mount(BASIC);
    const tooltip = host.querySelector('ui-tooltip');
    const events = collectEvents(tooltip);

    press(tooltip.querySelector('button'), 'Escape');

    assert.deepEqual(events, []);
  });

  it('ignores other keys', () => {
    const host = mount(BASIC);
    const tooltip = host.querySelector('ui-tooltip');

    tooltip.show();
    press(tooltip.querySelector('button'), 'a');

    assert.equal(tooltip.visible, true);
  });
});

describe('ui-tooltip disabled', () => {
  afterEach(() => cleanup());

  it('prevents showing', () => {
    const host = mount(`
      <ui-tooltip content="hint" disabled><button type="button">t</button></ui-tooltip>
    `);
    const tooltip = host.querySelector('ui-tooltip');

    assert.equal(tooltip.disabled, true);
    tooltip.show();

    assert.equal(tooltip.visible, false);
    assert.equal(surfaceOf(tooltip).hidden, true);
  });

  it('closes an open surface when disabled is set', () => {
    const host = mount(BASIC);
    const tooltip = host.querySelector('ui-tooltip');

    tooltip.show();
    assert.equal(tooltip.visible, true);

    tooltip.setAttribute('disabled', '');

    assert.equal(tooltip.visible, false);
  });

  it('treats disabled="false" as enabled', () => {
    const host = mount(`
      <ui-tooltip content="hint" disabled="false"><button type="button">t</button></ui-tooltip>
    `);
    const tooltip = host.querySelector('ui-tooltip');

    assert.equal(tooltip.disabled, false);
    tooltip.show();
    assert.equal(tooltip.visible, true);
  });
});

describe('ui-tooltip configure()', () => {
  afterEach(() => cleanup());

  it('applies every option and returns the element', () => {
    const host = mount('<ui-tooltip><button type="button">t</button></ui-tooltip>');
    const tooltip = host.querySelector('ui-tooltip');

    const result = tooltip.configure({
      content: 'Rebuild the index',
      placement: 'bottom',
      delay: 150,
      disabled: false,
    });

    assert.equal(result, tooltip);
    assert.equal(tooltip.content, 'Rebuild the index');
    assert.equal(tooltip.placement, 'bottom');
    assert.equal(tooltip.delay, 150);
    assert.equal(tooltip.disabled, false);
    assert.equal(surfaceOf(tooltip).textContent, 'Rebuild the index');
  });

  it('falls back to safe defaults for unknown values', () => {
    const host = mount('<ui-tooltip><button type="button">t</button></ui-tooltip>');
    const tooltip = host.querySelector('ui-tooltip');

    tooltip.setAttribute('placement', 'nonsense');
    tooltip.setAttribute('delay', 'not-a-number');

    assert.equal(tooltip.placement, 'top');
    assert.equal(tooltip.delay, 0);
  });

  it('defaults delay to zero so the surface opens immediately', () => {
    const host = mount('<ui-tooltip><button type="button">t</button></ui-tooltip>');
    assert.equal(host.querySelector('ui-tooltip').delay, 0);
  });

  it('closing when configure() sets disabled', () => {
    const host = mount(BASIC);
    const tooltip = host.querySelector('ui-tooltip');

    tooltip.show();
    tooltip.configure({ disabled: true });

    assert.equal(tooltip.visible, false);
  });
});

describe('ui-tooltip teardown', () => {
  afterEach(() => cleanup());

  it('removes generated DOM and generated attributes', () => {
    const host = mount(BASIC);
    const tooltip = host.querySelector('ui-tooltip');
    const trigger = tooltip.querySelector('button');

    assert.ok(surfaceOf(tooltip), 'surface exists while connected');

    tooltip.remove();

    assert.equal(surfaceOf(tooltip), null);
    assert.equal(trigger.hasAttribute('aria-describedby'), false);
    assert.equal(trigger.parentElement, tooltip, 'authored trigger is left alone');
  });

  it('cancels a pending show on disconnect', async () => {
    const host = mount(`
      <ui-tooltip content="hint" delay="60"><button type="button">t</button></ui-tooltip>
    `);
    const tooltip = host.querySelector('ui-tooltip');
    const trigger = tooltip.querySelector('button');

    pointer(trigger, 'pointerover');
    tooltip.remove();

    await new Promise((resolve) => setTimeout(resolve, 90));
    assert.equal(tooltip.visible, false, 'no surface reappears after teardown');
  });

  it('rebuilds correctly when reconnected', () => {
    const host = mount(BASIC);
    const tooltip = host.querySelector('ui-tooltip');
    const trigger = tooltip.querySelector('button');

    tooltip.remove();
    document.body.appendChild(tooltip);

    const surface = surfaceOf(tooltip);
    assert.ok(surface, 'surface rebuilt');
    assert.equal(trigger.getAttribute('aria-describedby'), surface.id);
    assert.equal(surface.hidden, true, 'rebuild starts closed');
  });

  it('stops responding to events after disconnect', async () => {
    const host = mount(BASIC);
    const tooltip = host.querySelector('ui-tooltip');
    const trigger = tooltip.querySelector('button');
    const events = collectEvents(tooltip);

    tooltip.remove();
    focus(trigger, 'focusin');
    pointer(trigger, 'pointerover');

    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(events, []);
  });
});

describe('core/position', () => {
  afterEach(() => cleanup());

  it('normalizes a placement, falling back to top', () => {
    assert.equal(normalizePlacement('bottom'), 'bottom');
    assert.equal(normalizePlacement('sideways'), 'top');
    assert.equal(normalizePlacement(undefined, 'left'), 'left');
  });

  it('resolves every opposite pairing', () => {
    assert.equal(oppositePlacement('top'), 'bottom');
    assert.equal(oppositePlacement('bottom'), 'top');
    assert.equal(oppositePlacement('left'), 'right');
    assert.equal(oppositePlacement('right'), 'left');
  });

  it('returns the requested placement when there is no layout', async () => {
    const { position } = await import('../../src/core/position.js');
    const host = mount('<button type="button">trigger</button><span id="surface">s</span>');

    // jsdom reports zero-size rects, so this is the SSR/no-layout path.
    assert.equal(position(host.querySelector('button'), host.querySelector('#surface'), {
      placement: 'left',
    }), 'left');
  });

  it('does not throw on missing elements', async () => {
    const { position } = await import('../../src/core/position.js');
    assert.equal(position(null, null, 'bottom'), 'bottom');
  });

  it('leaves the surface untouched when it cannot measure', async () => {
    const { position } = await import('../../src/core/position.js');
    const host = mount('<button type="button">trigger</button><span id="surface">s</span>');
    const surface = host.querySelector('#surface');

    position(host.querySelector('button'), surface, 'top');

    assert.equal(surface.style.left, '', 'no position written without layout');
  });
});