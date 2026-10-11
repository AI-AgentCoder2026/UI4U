import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Pure module — no DOM harness needed, and nothing here touches `document`.
const { parseAmount, formatAmount, withScale, AMOUNT_SUFFIXES } =
  await import('../../src/components/input/amount.js');

describe('parseAmount', () => {
  it('reads a plain number', () => {
    assert.equal(parseAmount('42').value, 42);
    assert.equal(parseAmount('42').complete, true);
  });

  it('applies the k, m and b shortcuts', () => {
    assert.equal(parseAmount('5k').value, 5000);
    assert.equal(parseAmount('2.5k').value, 2500);
    assert.equal(parseAmount('3m').value, 3_000_000);
    assert.equal(parseAmount('1.5b').value, 1_500_000_000);
  });

  it('accepts either case for the shortcut', () => {
    assert.equal(parseAmount('5K').value, 5000);
    assert.equal(parseAmount('2M').value, 2_000_000);
    assert.equal(parseAmount('1B').value, 1_000_000_000);
  });

  it('reports which shortcut it consumed', () => {
    assert.equal(parseAmount('5k').suffix, 'k');
    assert.equal(parseAmount('5').suffix, '');
    assert.equal(parseAmount('5K').suffix, 'k');
  });

  it('tolerates thousands separators on the way in', () => {
    assert.equal(parseAmount('8,421').value, 8421);
    assert.equal(parseAmount(' 1,000 ').value, 1000);
  });

  it('treats a comma between digits as a separator, not a decimal', () => {
    // Guessing here would corrupt a value, and the field must round-trip: what
    // the user typed has to mean the same number on the way back out.
    assert.equal(parseAmount('1,234').value, 1234);
  });

  it('reads a group the user is halfway through typing', () => {
    // The field reformats on every keystroke, so `5,000` + `5` passes through
    // `5,0005` on the way to `5,000,500`. Rejecting that would freeze the field.
    assert.equal(parseAmount('5,0005').value, 50005);
    assert.equal(parseAmount('5,00050').value, 500050);
    assert.equal(parseAmount('5,000500').value, 5000500);
  });

  it('still reads a short group as a decimal comma', () => {
    // The same shape with fewer than three digits is a decimal, not a group.
    assert.equal(parseAmount('1,5').value, 1.5);
    assert.equal(parseAmount('1,50').value, 1.5);
  });

  it('reads a decimal point', () => {
    assert.equal(parseAmount('12.5').value, 12.5);
    assert.equal(parseAmount('.5').value, 0.5);
  });

  it('handles a sign', () => {
    assert.equal(parseAmount('-5k').value, -5000);
    assert.equal(parseAmount('+42').value, 42);
  });

  it('treats a half-typed decimal as unfinished, not invalid', () => {
    assert.equal(parseAmount('12.').value, 12);
    assert.equal(parseAmount('12.').complete, false, 'must not reformat under the caret');
    assert.equal(parseAmount('12,').complete, false);
  });

  it('reports an empty field as empty, not invalid', () => {
    assert.equal(parseAmount('').value, null);
    assert.equal(parseAmount('   ').value, null);
    assert.equal(parseAmount('').complete, true);
  });

  it('rejects text that is not an amount', () => {
    for (const bad of ['abc', '5kk', '1e5', '0x10', '5 5', '$5']) {
      assert.equal(parseAmount(bad).value, null, `expected ${bad} to be rejected`);
    }
  });

  it('does not read a bare suffix as a number', () => {
    assert.equal(parseAmount('k').value, null);
  });
});

describe('formatAmount', () => {
  it('groups thousands', () => {
    assert.equal(formatAmount(5000), '5,000');
    assert.equal(formatAmount(1234567), '1,234,567');
  });

  it('leaves small numbers alone', () => {
    assert.equal(formatAmount(42), '42');
    assert.equal(formatAmount(0), '0');
  });

  it('keeps a fraction that carries information', () => {
    assert.equal(formatAmount(12.5), '12.5');
  });

  it('honours a fixed decimal count', () => {
    assert.equal(formatAmount(8421, { decimals: 2 }), '8,421.00');
    assert.equal(formatAmount(12.5, { decimals: 0 }), '13');
  });

  it('clamps into range', () => {
    assert.equal(formatAmount(999, { min: 0, max: 100 }), '100');
    assert.equal(formatAmount(-5, { min: 0 }), '0');
  });

  it('returns an empty string for a non-number', () => {
    assert.equal(formatAmount(Number.NaN), '');
    assert.equal(formatAmount(Number.POSITIVE_INFINITY), '');
  });
});

describe('withScale', () => {
  it('adds a suffix once the number is big enough to want one', () => {
    assert.equal(withScale(5000), '5k');
    assert.equal(withScale(1_500_000), '1.5m');
    assert.equal(withScale(2_000_000_000), '2b');
  });

  it('leaves numbers below a thousand unsuffixed', () => {
    assert.equal(withScale(999), '999');
  });

  it('handles negatives and zero', () => {
    assert.equal(withScale(-5000), '-5k');
    assert.equal(withScale(0), '0');
  });

  it('round-trips back through parseAmount', () => {
    for (const value of [5000, 1_500_000, 2_000_000_000, -5000, 999]) {
      assert.equal(parseAmount(withScale(value)).value, value, `round trip for ${value}`);
    }
  });
});

describe('AMOUNT_SUFFIXES', () => {
  it('lists the shortcuts in ascending order', () => {
    assert.deepEqual([...AMOUNT_SUFFIXES], ['k', 'm', 'b']);
  });
});
