/**
 * Gregorian calendar arithmetic.
 *
 * Deliberately plain-Gregorian. A non-Gregorian system does not line up with
 * this one — Hijri and Jalali months drift against solar months — so it needs a
 * conversion layer of its own rather than a flag on this file.
 *
 * Every date here is a **local** `Date` at midnight. Constructing one from an
 * ISO string would go through `Date.parse`, which treats `YYYY-MM-DD` as UTC and
 * silently shifts the day for anyone west of Greenwich — a bug that shows up as
 * a date picker off by one. So dates are always built field by field.
 *
 * Kept free of the DOM so the arithmetic is unit-testable on its own.
 */

/**
 * @typedef {object} DateBounds
 * @property {string} [min] inclusive ISO `YYYY-MM-DD`
 * @property {string} [max] inclusive ISO `YYYY-MM-DD`
 */

/** Days in each month, indexed 0–11. February is corrected per leap year. */
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** A leap year in the Gregorian rule: divisible by 4, except centuries, except 400. */
export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * How many days a month has.
 *
 * @param {number} year
 * @param {number} month 0-based, as `Date.getMonth` uses
 * @returns {number}
 */
export function daysInMonth(year, month) {
  if (month === 1 && isLeapYear(year)) return 29;
  return MONTH_LENGTHS[((month % 12) + 12) % 12] ?? 30;
}

/**
 * Builds a local midnight date without the UTC parsing trap.
 *
 * @param {number} year
 * @param {number} month 0-based
 * @param {number} [day] 1-based
 * @returns {Date}
 */
export function makeDate(year, month, day = 1) {
  const date = new Date(year, month, day);
  // Years 0–99 are mapped into the 1900s by the Date constructor; put them back.
  if (year >= 0 && year < 100) date.setFullYear(year, month, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Serialises to an ISO `YYYY-MM-DD` string in **local** terms.
 *
 * @param {Date|null|undefined} date
 * @returns {string} `''` for no date
 *
 * @example
 * toISO(new Date(2026, 7, 14)); // '2026-08-14'
 */
export function toISO(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses an ISO `YYYY-MM-DD` string as a local midnight date.
 *
 * @param {string|null|undefined} iso
 * @returns {Date|null}
 *
 * @example
 * fromISO('2026-08-14'); // local midnight on 14 August 2026
 */
export function fromISO(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim());
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  // Reject overflow like 2026-02-30, which `makeDate` would roll forward.
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month - 1)) return null;

  return makeDate(year, month - 1, day);
}

/** @param {Date} a @param {Date} b @returns {number} */
export function compareDates(a, b) {
  return a.getTime() - b.getTime();
}

/** @param {Date} a @param {Date} b @returns {boolean} */
export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Adds whole days, returning a fresh local date.
 *
 * Going through `setDate` rather than adding milliseconds keeps this correct
 * across a daylight-saving change, where a "day" is 23 or 25 hours long.
 *
 * @param {Date} date
 * @param {number} days
 * @returns {Date}
 */
export function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  next.setHours(0, 0, 0, 0);
  return next;
}

/**
 * @param {Date} date
 * @param {number} months may be negative
 * @returns {Date} the first of the month, `months` away
 */
export function addMonths(date, months) {
  const target = new Date(date.getTime());
  const day = target.getDate();
  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  // Clamp, so 31 January plus one month lands in February rather than March.
  target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())));
  target.setHours(0, 0, 0, 0);
  return target;
}

/**
 * First day of the month `date` falls in.
 *
 * @param {Date} date
 * @returns {Date}
 */
export function startOfMonth(date) {
  return makeDate(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Day of week for a date, `0` being Sunday.
 *
 * @param {Date} date
 * @returns {number}
 */
export function dayOfWeek(date) {
  return date.getDay();
}

/**
 * Lays out a month as weeks of day numbers, padded so every week is the same
 * width and the first and last weeks are filled with the neighbouring months.
 *
 * @param {Date} month any date within the month to lay out
 * @param {number} [firstDayOfWeek] `0` for Sunday, `1` for Monday. Default `1`,
 *   which is the ISO convention and the majority of locales.
 * @returns {Date[][]} weeks of seven dates
 *
 * @example
 * buildMonthGrid(new Date(2026, 7, 14)).length; // 5 or 6
 */
export function buildMonthGrid(month, firstDayOfWeek = 1) {
  const first = startOfMonth(month);
  const offset = (first.getDay() - firstDayOfWeek + 7) % 7;
  const start = addDays(first, -offset);

  /** @type {Date[][]} */
  const weeks = [];
  const cursor = new Date(start.getTime());

  for (let w = 0; w < 6; w += 1) {
    /** @type {Date[]} */
    const week = [];
    for (let d = 0; d < 7; d += 1) {
      week.push(new Date(cursor.getTime()));
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
    }
    weeks.push(week);
  }

  // Trim a trailing week that is entirely next month, so a month that starts
  // late in the week does not render a useless extra row.
  const last = weeks[weeks.length - 1];
  if (last && last.every((day) => day.getMonth() !== month.getMonth())) weeks.pop();

  return weeks;
}

/**
 * The twelve months of a year, for the year view.
 *
 * @param {number} year
 * @returns {Date[]} the first of each month
 */
export function buildYear(year) {
  return Array.from({ length: 12 }, (_, month) => makeDate(year, month, 1));
}

/**
 * Twelve consecutive years centred on `year`, for the decade view.
 *
 * Starts on a multiple of ten so the labels read `2020 … 2029`, and rounds so
 * the current year is always inside the window.
 *
 * @param {number} year
 * @returns {number[]}
 */
export function buildDecade(year) {
  const start = Math.floor(year / 10) * 10;
  return Array.from({ length: 12 }, (_, i) => start + i);
}

/**
 * Clamps a date into an optional inclusive range.
 *
 * @param {Date} date
 * @param {DateBounds} [bounds]
 * @returns {Date} the same instance when already inside
 */
export function clampToBounds(date, bounds = {}) {
  const min = fromISO(bounds.min);
  const max = fromISO(bounds.max);
  if (min && date < min) return new Date(min.getTime());
  if (max && date > max) return new Date(max.getTime());
  return date;
}

/**
 * Whether a date may be picked under the given bounds.
 *
 * @param {Date} date
 * @param {DateBounds} [bounds]
 * @returns {boolean}
 */
export function isWithinBounds(date, bounds = {}) {
  const min = fromISO(bounds.min);
  const max = fromISO(bounds.max);
  if (min && date < min) return false;
  if (max && date > max) return false;
  return true;
}

/**
 * The weekday headers for a month grid, starting at `firstDayOfWeek`.
 *
 * @param {string [locale] BCP-47 tag. Default `'en-GB'` for ISO short names.
 * @param {number} [firstDayOfWeek]
 * @returns {string[]}
 */
export function weekdayLabels(locale = 'en-GB', firstDayOfWeek = 1) {
  // 2024-01-07 was a Sunday, so these seven dates cover every weekday in order.
  const sunday = new Date(2024, 0, 7);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(sunday.getTime());
    day.setDate(sunday.getDate() + ((i + firstDayOfWeek) % 7));
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(day);
  });
}

/**
 * A human-readable label for the month being shown.
 *
 * @param {Date} month
 * @param {string} [locale]
 * @returns {string}
 */
export function monthLabel(month, locale = 'en-GB') {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month);
}
