import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { setupDom } from '../helpers/dom.js';

setupDom();

const { UI4UElement } = await import('../../src/core/base.js');

/**
 * A minimal element that exercises the base class directly — the binding
 * contract is shared by every component, so it is cheapest to pin here.
 */
class Probe extends UI4UElement {}
customElements.define('ui4u-probe', Probe);

/** @returns {Probe} */
function mountProbe() {
  const host = document.createElement('div');
  host.innerHTML = '<ui4u-probe></ui4u-probe>';
  document.body.appendChild(host);
  return /** @type {Probe} */ (host.firstElementChild);
}

describe('UI4UElement.bind', () => {
  it('registers and runs a handler before the action', () => {
    const probe = mountProbe();
    /** @type {any[]} */
    const seen = [];

    probe.bind('change', (detail) => seen.push(detail));
    assert.equal(probe.runBinding('change', { value: 1 }), true);
    assert.deepEqual(seen, [{ value: 1 }]);

    probe.remove();
  });

  it('accepts the ui4u: prefixed spelling too', () => {
    const probe = mountProbe();
    let called = 0;

    probe.bind('ui4u:change', () => (called += 1));
    probe.runBinding('change');
    probe.runBinding('ui4u:change');

    // Both spellings land in the same bucket, so either call site reaches it.
    assert.equal(called, 2);
    assert.deepEqual(probe.bindingNames, ['change']);

    probe.remove();
  });

  it('lets a handler override the action by returning false', () => {
    const probe = mountProbe();

    probe.bind('change', () => false);
    assert.equal(probe.runBinding('change'), false, 'the component must be told to stop');

    probe.remove();
  });

  it('lets a handler override by calling preventDefault', () => {
    const probe = mountProbe();

    probe.bind('change', (_detail, event) => event.preventDefault());
    assert.equal(probe.runBinding('change'), false);

    probe.remove();
  });

  it('passes the action when the handler returns anything else', () => {
    const probe = mountProbe();

    probe.bind('change', () => true);
    assert.equal(probe.runBinding('change'), true);

    probe.bind('change', () => undefined);
    assert.equal(probe.runBinding('change'), true);

    probe.bind('change', () => 'handled');
    assert.equal(probe.runBinding('change'), true);

    probe.remove();
  });

  it('gives the handler both the detail and a cancellable event', () => {
    const probe = mountProbe();
    /** @type {any[]} */
    const args = [];

    probe.bind('change', (...received) => args.push(received));
    probe.runBinding('change', { value: 'x' });

    assert.equal(args.length, 1);
    assert.deepEqual(args[0][0], { value: 'x' });
    assert.equal(args[0][1].type, 'ui4u:change');
    assert.equal(args[0][1].cancelable, true);

    probe.remove();
  });

  it('runs several handlers for one name in order', () => {
    const probe = mountProbe();
    /** @type {number[]} */
    const order = [];

    probe.bind('change', () => order.push(1));
    probe.bind('change', () => order.push(2));
    probe.runBinding('change');

    assert.deepEqual(order, [1, 2]);
    probe.remove();
  });

  it('stops at the first handler that overrides', () => {
    const probe = mountProbe();
    let reached = 0;

    probe.bind('change', () => false);
    probe.bind('change', () => (reached += 1));
    probe.runBinding('change');

    assert.equal(reached, 0, 'a veto ends the chain');
    probe.remove();
  });

  it('survives a handler that throws', () => {
    const probe = mountProbe();
    let reached = 0;

    probe.bind('change', () => {
      throw new Error('boom');
    });
    probe.bind('change', () => (reached += 1));

    assert.equal(probe.runBinding('change'), true);
    assert.equal(reached, 1, 'the next handler still runs');

    probe.remove();
  });

  it('survives a handler that unbinds itself mid-run', () => {
    const probe = mountProbe();
    let calls = 0;

    const once = () => {
      calls += 1;
      probe.unbind('change', once);
    };
    probe.bind('change', once);

    probe.runBinding('change');
    probe.runBinding('change');

    assert.equal(calls, 1);
    probe.remove();
  });

  it('reports no bindings until one is registered', () => {
    const probe = mountProbe();

    assert.deepEqual(probe.bindingNames, []);
    assert.equal(probe.runBinding('change'), true, 'unbound costs one lookup and stops');

    probe.remove();
  });

  it('ignores a non-function handler', () => {
    const probe = mountProbe();

    probe.bind('change', /** @type {any} */ ('nope'));
    assert.deepEqual(probe.bindingNames, []);

    probe.remove();
  });
});

describe('UI4UElement.unbind', () => {
  it('removes one handler and leaves the others', () => {
    const probe = mountProbe();
    let a = 0;
    let b = 0;

    const first = () => (a += 1);
    probe.bind('change', first);
    probe.bind('change', () => (b += 1));

    probe.unbind('change', first);
    probe.runBinding('change');

    assert.equal(a, 0);
    assert.equal(b, 1);
    probe.remove();
  });

  it('removes every handler for a name when given no handler', () => {
    const probe = mountProbe();
    let calls = 0;

    probe.bind('change', () => (calls += 1));
    probe.bind('change', () => (calls += 1));

    probe.unbind('change');
    probe.runBinding('change');

    assert.equal(calls, 0);
    probe.remove();
  });

  it('is safe for a name that was never bound', () => {
    const probe = mountProbe();
    probe.unbind('nothing');
    assert.deepEqual(probe.bindingNames, []);
    probe.remove();
  });
});

describe('UI4UElement.bindAll', () => {
  it('registers several names at once', () => {
    const probe = mountProbe();
    /** @type {string[]} */
    const seen = [];

    probe.bindAll({
      change: () => seen.push('change'),
      input: () => seen.push('input'),
    });

    probe.runBinding('change');
    probe.runBinding('input');

    assert.deepEqual(seen.sort(), ['change', 'input']);
    probe.remove();
  });

  it('ignores anything that is not a record', () => {
    const probe = mountProbe();
    probe.bindAll(null);
    probe.bindAll('nope');
    assert.deepEqual(probe.bindingNames, []);
    probe.remove();
  });
});
