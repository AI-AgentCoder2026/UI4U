/**
 * Amount parsing and formatting.
 *
 * A plain-number field cannot express "5k" and a formatted field cannot hand
 * the consumer a number, so this module does both and keeps them separate: text
 * goes in and out for the user, a `number` comes out for everyone else.
 *
 * Kept apart from the component so the tricky parts — suffix maths, caret
 * preservation, rounding — are unit-testable without a DOM.
 */

/** Suffix → multiplier. */
const SCALES = /** @type {const} */ ([
  ['k', 1e3],
  ['m', 1e6],
  ['b', 1e9],
]);

/** Short aliases so a bare `k` cannot be read as a number, or `5kk` as `5000k`. */
const SUFFIX_KEYS = SCALES.map(([key]) => key);

/** Sign, digits-with-separators, and one optional magnitude suffix. */
const AMOUNT_RE = /^([+-]?)([\d.,]*)([kmb])?$/i;

/** `1,234` / `12,345,678` — unambiguously grouped thousands. */
const GROUPED = /^\d{1,3}(?:,\d{3})+$/;

/** Grouped thousands with a fractional part: `8,421.00`. */
const GROUPED_DECIMAL = /^\d{1,3}(?:,\d{3})+(?:\.\d*)?$/;

/**
 * A group the user is halfway through typing: `5,0005`.
 *
 * The field formats on every keystroke, so between "5,000" and "5,000,500"
 * there is a moment where the last group has four digits. Reading that as
 * digits — rather than rejecting it — is what lets typing continue at all.
 */
const PARTIAL_GROUP = /^\d{1,3}(?:,\d{3})*,\d{3,}$/;

/**
 * Decides what a separator between digits actually means.
 *
 * A comma is a decimal separator in much of the world and a thousands separator
 * in much more of it, and this module refuses to guess from locale. The two
 * shapes are distinguishable by width: three digits after the comma is a group,
 * one or two is a decimal.
 *
 * @param {string} body
 * @returns {{ digits: string, ok: boolean }}
 */
function resolveSeparators(body) {
  if (body === '') return { digits: '', ok: false };
  if (!/[,.]/.test(body)) return { digits: body, ok: /^\d+$/.test(body) };

  if (GROUPED.test(body)) return { digits: body.replace(/,/g, ''), ok: true };
  // `8,421.00` is the field's own output format, so it has to read back as a
  // number — otherwise a formatted value would fail its own validation.
  if (GROUPED_DECIMAL.test(body)) return { digits: body.replace(/,/g, ''), ok: true };
  // `5,0005` is a group mid-typing; treat the digits as one run.
  if (PARTIAL_GROUP.test(body)) return { digits: body.replace(/,/g, ''), ok: true };
  // `1,5` and `1,50` are decimal commas; `12,` is a half-typed one.
  if (/^\d{1,3},\d{0,2}$/.test(body)) return { digits: body.replace(',', '.'), ok: true };
  // A dot is always a decimal point here, including a half-typed `12.`.
  if (/^\d*\.\d*$/.test(body)) return { digits: body, ok: true };

  // Anything else is a separator in a position grouping never uses — refusing is
  // safer than picking a reading that would silently change the number.
  return { digits: '', ok: false };
}

/**
 * @typedef {object} ParsedAmount
 * @property {number|null} value `null` when the text is not an amount.
 * @property {string} suffix the magnitude letter that was consumed, `''` when none.
 * @property {boolean} complete `true` when the text is a finished number with no
 *   half-typed decimal or dangling separator — i.e. safe to reformat in place.
 */

/**
 * Parses amount text into a number.
 *
 * Thousands separators are tolerated on the way in (`8,421`) but never required,
 * and the value has to survive the round trip: what the user typed must mean the
 * same number on the way back out.
 *
 * @param {string} text
 * @returns {ParsedAmount}
 *
 * @example
 * parseAmount('5k');   // { value: 5000, suffix: 'k', complete: true }
 * parseAmount('12.');  // { value: 12,   suffix: '',   complete: false }
 */
export function parseAmount(text) {
  const raw = String(text ?? '').trim();
  if (raw === '') return { value: null, suffix: '', complete: true };

  // Internal whitespace is a typo, not a separator. Stripping it would turn
  // "5 5" into 55.
  if (/\s/.test(raw)) return { value: null, suffix: '', complete: false };

  const match = AMOUNT_RE.exec(raw);
  if (!match) return { value: null, suffix: '', complete: false };

  const [, sign = '', body, suffixRaw] = match;
  const suffix = (suffixRaw ?? '').toLowerCase();

  const { digits, ok } = resolveSeparators(body);
  if (!ok) return { value: null, suffix: '', complete: false };

  // A trailing separator is a half-typed decimal: the number is real but the
  // text is not finished, so the caller must not reformat under the caret.
  const complete = !/[.,]$/.test(body);

  const base = Number.parseFloat(digits);
  if (!Number.isFinite(base)) return { value: null, suffix: '', complete: false };

  const magnitude = SCALES.find(([key]) => key === suffix);
  const value = base * (magnitude ? magnitude[1] : 1);

  return {
    value: sign === '-' ? -value : value,
    suffix: magnitude ? magnitude[0] : '',
    complete,
  };
}

/**
 * @typedef {object} AmountFormatOptions
 * @property {number} [decimals] Fixed decimal places. Omit to keep whatever the
 *   number naturally needs.
 * @property {string} [locale] BCP-47 tag for the separators. Default `'en'` so
 *   output is deterministic in tests and on a machine with no locale set.
 * @property {number} [min] Clamped lower bound.
 * @property {number} [max] Clamped upper bound.
 */

/**
 * Formats a number for display: grouped thousands, bounded, fixed precision.
 *
 * @param {number} value
 * @param {AmountFormatOptions} [options]
 * @returns {string}
 *
 * @example
 * formatAmount(5000); // '5,000'
 * formatAmount(8421, { decimals: 2 }); // '8,421.00'
 */
export function formatAmount(value, options = {}) {
  if (!Number.isFinite(value)) return '';

  const min = Number.isFinite(options.min) ? /** @type {number} */ (options.min) : -Infinity;
  const max = Number.isFinite(options.max) ? /** @type {number} */ (options.max) : Infinity;
  const bounded = Math.min(Math.max(value, min), max);

  const formatter = new Intl.NumberFormat(options.locale ?? 'en', {
    ...(Number.isInteger(options.decimals) ? { maximumFractionDigits: options.decimals } : {}),
    ...(Number.isInteger(options.decimals) ? { minimumFractionDigits: options.decimals } : {}),
    useGrouping: true,
  });

  return formatter.format(bounded);
}

/**
 * Applies a magnitude suffix back onto a number, for the "keep typing" case
 * where a user types `1500000` and we want to offer `1.5m`.
 *
 * @param {number} value
 * @param {AmountFormatOptions} [options]
 * @returns {string}
 *
 * @example
 * withScale(1500000); // '1.5m'
 */
export function withScale(value, options = {}) {
  if (!Number.isFinite(value) || value === 0) return formatAmount(value, options);

  const magnitude = Math.abs(value);
  // Largest scale first: 1,500,000 is `1.5m`, not `1,500k`. Walking upwards
  // would settle on the first scale the number clears and stop there.
  for (let i = SCALES.length - 1; i >= 0; i -= 1) {
    const [key, scale] = SCALES[i];
    if (!key || !scale || magnitude < scale) continue;

    const scaled = value / scale;
    // Keep one decimal only when it carries information — `1.5m`, not `2.0m`.
    const decimals = Number.isInteger(scaled) ? 0 : 1;
    return `${formatAmount(scaled, { ...options, decimals })}${key}`;
  }

  return formatAmount(value, options);
}

/** The suffix letters this module understands, for UI and docs. */
export const AMOUNT_SUFFIXES = SUFFIX_KEYS;
