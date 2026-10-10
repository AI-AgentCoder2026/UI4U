/**
 * Size helpers shared by the resizable components.
 *
 * Panel sizes arrive from authors as CSS lengths (`16rem`, `240px`, `30%`), but
 * a drag produces plain pixels. These convert between the two without pulling
 * in a dependency.
 */

/**
 * Converts a CSS length into pixels.
 *
 * Percentages cannot be resolved without knowing the container, so they are
 * returned as `null` and callers handle them separately.
 *
 * @param {string|number|null|undefined} value e.g. `'16rem'`, `'240px'`, `240`
 * @returns {number|null} pixels, or `null` when the value is not a usable length
 */
export function toPx(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.endsWith('%')) return null;

  const context = globalThis.document;
  if (!context?.createElement) return null;

  // A unitless number is already pixels — no measurement needed.
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number.parseFloat(trimmed);

  // Resolving through a real element is the only reliable way to turn `rem`
  // into pixels without re-implementing the cascade.
  const probe = context.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;height:0;';
  probe.style.width = trimmed;
  context.body.appendChild(probe);

  const measured = probe.getBoundingClientRect().width;
  probe.remove();

  return measured > 0 ? measured : null;
}

/**
 * Clamps a number into an inclusive range.
 *
 * @param {number} value
 * @param {number|null} [min]
 * @param {number|null} [max]
 * @returns {number}
 */
export function clamp(value, min = null, max = null) {
  let next = value;
  if (typeof min === 'number' && Number.isFinite(min)) next = Math.max(next, min);
  if (typeof max === 'number' && Number.isFinite(max)) next = Math.min(next, max);
  return next;
}

/**
 * Normalises a size string for use as a CSS grid track.
 *
 * @param {string|number|null|undefined} value
 * @param {string} fallback
 * @returns {string}
 */
export function toTrack(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`;
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return fallback;
}