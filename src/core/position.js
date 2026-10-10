/**
 * Shared positioning helper — placement, flipping and viewport clamping.
 *
 * `ui-tooltip` is the first consumer; `ui-popup` reuses it unchanged. Nothing
 * here touches `document` or `window` at module scope, and every geometry read
 * is defensive: SSR, `display: none` and the node:test jsdom harness all report
 * zero-size rects, and in that case the helper returns the requested placement
 * without writing a single style rather than throwing.
 */

/**
 * @typedef {'top' | 'right' | 'bottom' | 'left'} Placement
 */

/** @type {Placement[]} every placement, in flip order for a given preference. */
export const PLACEMENTS = ['top', 'right', 'bottom', 'left'];

/**
 * Breathing room kept between the surface and the viewport edge. A plain
 * constant because this is geometry, not theming — colours and spacing belong
 * to `--ui4u-*` tokens.
 */
export const EDGE_PADDING = 8;

/**
 * Coerces any value into a known placement.
 *
 * @param {unknown} value
 * @param {Placement} [fallback]
 * @returns {Placement}
 */
export function normalizePlacement(value, fallback = 'top') {
  return PLACEMENTS.includes(/** @type {Placement} */ (value))
    ? /** @type {Placement} */ (value)
    : fallback;
}

/**
 * The placement on the opposite side of the trigger.
 *
 * @param {Placement} placement
 * @returns {Placement}
 */
export function oppositePlacement(placement) {
  switch (normalizePlacement(placement)) {
    case 'top':
      return 'bottom';
    case 'bottom':
      return 'top';
    case 'left':
      return 'right';
    default:
      return 'left';
  }
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * @typedef {object} PositionOptions
 * @property {Placement} [placement] Preferred side. Default `'top'`.
 * @property {number} [gap] Distance between trigger and surface. Default `8`.
 */

/**
 * Positions `surface` relative to `trigger` with `position: fixed`, flipping to
 * the opposite side when the preferred one would overflow the viewport, and
 * clamping inside the viewport when no side fits.
 *
 * Returns the placement that was actually used. When there is no layout to
 * measure (SSR, zero-size rects) it returns the requested placement and leaves
 * the surface untouched, so a caller can position later without special-casing.
 *
 * @param {Element|null|undefined} trigger
 * @param {HTMLElement|null|undefined} surface
 * @param {PositionOptions|string} [options] Options object, or a bare placement.
 * @param {number} [gap] Distance between trigger and surface, when `options` is a placement.
 * @returns {Placement} the resolved placement
 *
 * @example
 * const side = position(trigger, surface, { placement: 'top', gap: 8 });
 * surface.dataset.placement = side;
 */
export function position(trigger, surface, options = {}, gap = 8) {
  const settings = typeof options === 'string' ? { placement: options, gap } : options;
  const requested = normalizePlacement(settings.placement);
  const offset = Number.isFinite(settings.gap) ? settings.gap : gap;

  if (!trigger || !surface || typeof trigger.getBoundingClientRect !== 'function') {
    return requested;
  }

  const view = surface.ownerDocument?.defaultView;
  if (!view) return requested;

  const viewportWidth = view.innerWidth;
  const viewportHeight = view.innerHeight;
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)) return requested;

  /** @type {DOMRect} */
  let anchor;
  /** @type {DOMRect} */
  let box;

  try {
    anchor = trigger.getBoundingClientRect();
    box = surface.getBoundingClientRect();
  } catch {
    // A detached or non-rendered element throws in some engines.
    return requested;
  }

  // No layout yet: leave the surface alone and report what was asked for.
  if (!anchor || (anchor.width === 0 && anchor.height === 0)) return requested;

  const width = box.width || 0;
  const height = box.height || 0;

  /** @param {Placement} side @returns {number} free pixels on that side */
  const room = (side) => {
    switch (side) {
      case 'top':
        return anchor.top - offset - EDGE_PADDING;
      case 'bottom':
        return viewportHeight - anchor.bottom - offset - EDGE_PADDING;
      case 'left':
        return anchor.left - offset - EDGE_PADDING;
      default:
        return viewportWidth - anchor.right - offset - EDGE_PADDING;
    }
  };

  /** @param {Placement} side @returns {number} pixels the surface needs */
  const needed = (side) => (side === 'top' || side === 'bottom' ? height : width);

  const flipped = oppositePlacement(requested);
  const candidates = [requested, flipped];

  // Preferred side first, then its opposite. If neither fits outright, take the
  // roomier of the two and let the clamp below keep it on screen.
  let resolved = requested;
  const fits = candidates.some((side) => room(side) >= needed(side));
  if (!fits) {
    resolved = room(requested) >= room(flipped) ? requested : flipped;
  } else {
    resolved = candidates.find((side) => room(side) >= needed(side)) ?? requested;
  }

  let left;
  let top;

  switch (resolved) {
    case 'top':
      left = anchor.left + anchor.width / 2 - width / 2;
      top = anchor.top - offset - height;
      break;
    case 'bottom':
      left = anchor.left + anchor.width / 2 - width / 2;
      top = anchor.bottom + offset;
      break;
    case 'left':
      left = anchor.left - offset - width;
      top = anchor.top + anchor.height / 2 - height / 2;
      break;
    default:
      left = anchor.right + offset;
      top = anchor.top + anchor.height / 2 - height / 2;
      break;
  }

  const maxLeft = Math.max(EDGE_PADDING, viewportWidth - width - EDGE_PADDING);
  const maxTop = Math.max(EDGE_PADDING, viewportHeight - height - EDGE_PADDING);

  surface.style.position = 'fixed';
  surface.style.left = `${Math.round(clamp(left, EDGE_PADDING, maxLeft))}px`;
  surface.style.top = `${Math.round(clamp(top, EDGE_PADDING, maxTop))}px`;

  return resolved;
}