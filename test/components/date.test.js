import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Pure module — no DOM harness needed.
const {
  isLeapYear,
  daysInMonth,
  makeDate,
  toISO,
  fromISO,
  isSameDay,
  addDays,
  addMonths,
  buildMonthGrid,
  buildYear,
  buildDecade,
  clampToBounds,
  isWithinBounds,
  weekdayLabels,
} = await import('../../src/components/input/date.js');

describe('leap years', () => {
  it('follows the Gregorian rule', () => {
    assert.equal(isLeapYear(2024), true, 'divisible by 4');
    assert.equal(isLeapYear(2026), false);
    assert.equal(isLeapYear(1900), false, 'century, not divisible by 400');
    assert.equal(isLeapYear(2000), true, 'divisible by 400');
  });

  it('gives February its extra day', () => {
    assert.equal(daysInMonth(2024, 1), 29);
    assert.equal(daysInMonth(2026, 1), 28);
    assert.equal(daysInMonth(2026, 0), 31);
    assert.equal(daysInMonth(2026, 3), 30);
  });
});

describe('ISO round trip', () => {
  it('serialises a local date', () => {
    assert.equal(toISO(makeDate(2026, 7, 14)), '2026-08-14');
    assert.equal(toISO(makeDate(2026, 0, 1)), '2026-01-01');
  });

  it('pads single-digit months and days', () => {
    assert.equal(toISO(makeDate(2026, 2, 5)), '2026-03-05');
  });

  it('parses back to the same calendar day', () => {
    // The point of building dates field by field: `new Date('2026-08-14')` is
    // parsed as UTC and lands on the 13th for anyone west of Greenwich.
    const parsed = fromISO('2026-08-14');
    assert.equal(parsed.getFullYear(), 2026);
    assert.equal(parsed.getMonth(), 7);
    assert.equal(parsed.getDate(), 14);
    assert.equal(parsed.getHours(), 0);
    assert.equal(toISO(parsed), '2026-08-14');
  });

  it('handles years below 100 without landing in the 1900s', () => {
    const early = makeDate(50, 0, 1);
    assert.equal(early.getFullYear(), 50);
    assert.equal(toISO(early), '0050-01-01');
  });

  it('rejects a date that does not exist', () => {
    assert.equal(fromISO('2026-02-30'), null);
    assert.equal(fromISO('2026-13-01'), null);
    assert.equal(fromISO('2026-00-10'), null);
    assert.equal(fromISO('nonsense'), null);
    assert.equal(fromISO(''), null);
    assert.equal(fromISO(null), null);
  });

  it('accepts a real leap day and rejects a fake one', () => {
    assert.ok(fromISO('2024-02-29'));
    assert.equal(fromISO('2026-02-29'), null);
  });

  it('serialises nothing as an empty string', () => {
    assert.equal(toISO(null), '');
    assert.equal(toISO(new Date('nope')), '');
  });
});

describe('arithmetic', () => {
  it('adds days across a month boundary', () => {
    const next = addDays(makeDate(2026, 7, 31), 1);
    assert.equal(toISO(next), '2026-09-01');
  });

  it('adds days backwards', () => {
    assert.equal(toISO(addDays(makeDate(2026, 0, 1), -1)), '2025-12-31');
  });

  it('does not drift across a daylight-saving change', () => {
    // Adding 86,400,000ms is wrong here; `setDate` keeps calendar days exact.
    const dst = addDays(makeDate(2026, 2, 28), 1);
    assert.equal(dst.getDate(), 29);
    assert.equal(dst.getHours(), 0);
  });

  it('adds months and clamps the day', () => {
    assert.equal(toISO(addMonths(makeDate(2026, 0, 31), 1)), '2026-02-28');
    assert.equal(toISO(addMonths(makeDate(2026, 0, 15), 1)), '2026-02-15');
    assert.equal(toISO(addMonths(makeDate(2026, 11, 10), 1)), '2027-01-10');
    assert.equal(toISO(addMonths(makeDate(2026, 0, 10), -1)), '2025-12-10');
  });

  it('clamps into February on a leap year too', () => {
    assert.equal(toISO(addMonths(makeDate(2024, 0, 31), 1)), '2024-02-29');
  });

  it('compares days', () => {
    assert.equal(isSameDay(makeDate(2026, 7, 14), makeDate(2026, 7, 14)), true);
    assert.equal(isSameDay(makeDate(2026, 7, 14), makeDate(2025, 7, 14)), false);
  });
});

describe('month grid', () => {
  it('lays out whole weeks of seven', () => {
    for (const month of [0, 1, 5, 7, 11]) {
      for (const week of buildMonthGrid(makeDate(2026, month, 15))) {
        assert.equal(week.length, 7, `week in month ${month}`);
      }
    }
  });

  it('starts on the requested first weekday', () => {
    // August 2026 starts on a Saturday.
    const weeks = buildMonthGrid(makeDate(2026, 7, 14), 1);
    assert.equal(weeks[0][0].getDay(), 1, 'Monday-first starts on a Monday');
    assert.equal(toISO(weeks[0][6]), '2026-08-02', 'the week ends on a Sunday');

    const sundayFirst = buildMonthGrid(makeDate(2026, 7, 14), 0);
    assert.equal(sundayFirst[0][0].getDay(), 0);
    assert.equal(toISO(sundayFirst[0][0]), '2026-07-26');
  });

  it('includes every day of the month exactly once', () => {
    const month = makeDate(2026, 7, 1);
    const days = buildMonthGrid(month).flat();
    const inMonth = days.filter((d) => d.getMonth() === 7 && d.getFullYear() === 2026);
    assert.equal(inMonth.length, 31);
    assert.equal(new Set(inMonth.map(toISO)).size, 31);
  });

  it('pads with the neighbouring months', () => {
    const weeks = buildMonthGrid(makeDate(2026, 7, 14), 1);
    const first = weeks[0][0];
    assert.equal(first.getMonth(), 6, 'the leading week reaches back into July');
  });

  it('drops a trailing week that belongs entirely to the next month', () => {
    // June 2026 starts on a Monday and has 30 days, so five weeks cover it.
    const weeks = buildMonthGrid(makeDate(2026, 5, 15), 1);
    assert.equal(weeks.length, 5);
  });
});

describe('year and decade views', () => {
  it('lists twelve months', () => {
    const months = buildYear(2026);
    assert.equal(months.length, 12);
    assert.equal(months[0].getMonth(), 0);
    assert.equal(months[11].getMonth(), 11);
  });

  it('lists a decade aligned to tens, containing the year', () => {
    const years = buildDecade(2026);
    assert.equal(years.length, 12);
    assert.equal(years[0], 2020);
    assert.ok(years.includes(2026));
    assert.equal(years[11], 2031);
  });

  it('rounds down for a year on a decade boundary', () => {
    assert.equal(buildDecade(2020)[0], 2020);
    assert.equal(buildDecade(2029)[0], 2020);
    assert.equal(buildDecade(2030)[0], 2030);
  });
});

describe('bounds', () => {
  it('reports whether a date is pickable', () => {
    const bounds = { min: '2026-01-01', max: '2026-12-31' };
    assert.equal(isWithinBounds(makeDate(2026, 5, 15), bounds), true);
    assert.equal(isWithinBounds(makeDate(2025, 5, 15), bounds), false);
    assert.equal(isWithinBounds(makeDate(2027, 5, 15), bounds), false);
  });

  it('treats the bounds as inclusive', () => {
    const bounds = { min: '2026-01-01', max: '2026-12-31' };
    assert.equal(isWithinBounds(fromISO('2026-01-01'), bounds), true);
    assert.equal(isWithinBounds(fromISO('2026-12-31'), bounds), true);
  });

  it('clamps a date into range', () => {
    const bounds = { min: '2026-01-01', max: '2026-12-31' };
    assert.equal(toISO(clampToBounds(makeDate(2020, 0, 1), bounds)), '2026-01-01');
    assert.equal(toISO(clampToBounds(makeDate(2030, 0, 1), bounds)), '2026-12-31');
  });

  it('allows everything when no bounds are given', () => {
    assert.equal(isWithinBounds(makeDate(1900, 0, 1)), true);
    assert.equal(isWithinBounds(makeDate(2100, 0, 1)), true);
  });
});

describe('labels', () => {
  it('gives seven weekday names in the requested order', () => {
    const labels = weekdayLabels('en-GB', 1);
    assert.equal(labels.length, 7);
    assert.equal(labels[0], 'Mon');
    assert.equal(labels[6], 'Sun');

    const sunday = weekdayLabels('en-GB', 0);
    assert.equal(sunday[0], 'Sun');
    assert.equal(sunday[6], 'Sat');
  });
});
