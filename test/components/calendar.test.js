import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { cleanup, mount, setupDom } from '../helpers/dom.js';

setupDom();

const { CalendarPanel } = await import('../../src/components/input/calendar.js');

describe('CalendarPanel.open', () => {
  afterEach(() => cleanup());

  /** A panel wired to nothing; only its mount behaviour is under test. */
  const panel = () => {
    const host = mount('<div></div>');
    const instance = new CalendarPanel({
      onSelect: () => {},
      onClose: () => {},
    });
    host.appendChild(instance.element);
    return instance;
  };

  it('stays invisible until it has been positioned', () => {
    const instance = panel();

    /** @type {string[]} */
    const seen = [];
    instance.open(document.createElement('div'), (_anchor, surface) => {
      // The whole point: it must not be painted at the origin while unplaced.
      seen.push(surface.style.visibility);
    });

    assert.deepEqual(seen, ['hidden'], 'hidden while being measured');
    assert.equal(instance.element.style.visibility, '', 'and revealed once placed');
  });

  it('stays hidden when placing throws', () => {
    const instance = panel();

    assert.throws(() =>
      instance.open(document.createElement('div'), () => {
        throw new Error('no layout');
      })
    );

    // A throw must not leave a stray panel painted in the corner either.
    assert.equal(instance.element.style.visibility, 'hidden');
    instance.destroy();
  });

  it('removes itself on close and on destroy', () => {
    const instance = panel();
    const anchor = document.createElement('div');
    instance.open(anchor, () => {});

    assert.ok(instance.isOpen);

    instance.close();
    assert.equal(instance.isOpen, false);

    instance.open(anchor, () => {});
    instance.destroy();
    assert.equal(instance.isOpen, false);
  });
});
