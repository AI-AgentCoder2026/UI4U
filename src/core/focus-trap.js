/**
 * Focus trapping and restoration.
 *
 * `ui-popup` is the first consumer; `ui-sidebar` reuses it for its mobile
 * drawer. A modal that lets Tab walk out into the page behind it is not modal,
 * so the trap is a hard requirement rather than a nicety.
 */

import { focusables } from './dom.js';

/**
 * @typedef {object} FocusTrap
 * @property {() => void} activate Constrains Tab to `root` from now on.
 * @property {() => void} deactivate Releases the constraint.
 * @property {() => void} restore Returns focus to wherever it was on activate.
 */

/**
 * Traps Tab/Shift+Tab inside `root` while active, and restores focus to the
 * previously focused element on release.
 *
 * Only one trap is meaningful at a time, so a second activation on the same
 * root is a no-op — nested popups must trap from the innermost outward.
 *
 * @param {HTMLElement} root
 * @param {{ initialFocus?: Element | null }} [options]
 * @returns {FocusTrap}
 *
 * @example
 * const trap = focusTrap(dialog);
 * trap.activate();
 * // ...later
 * trap.deactivate();   // focus returns to the trigger
 */
export function focusTrap(root, { initialFocus = null } = {}) {
  let previous = null;
  let active = false;
  /** @type {((event: KeyboardEvent) => void) | null} */
  let onKeydown = null;
  /** @type {((event: Event) => void) | null} */
  let onFocusIn = null;

  /** @returns {HTMLElement|null} */
  const firstStop = () => {
    const stops = focusables(root);
    return stops[0] ?? null;
  };

  return {
    activate() {
      if (active || !root) return;
      active = true;
      previous = root.ownerDocument?.activeElement ?? null;

      // Prefer an explicit target, then the first focusable thing inside, and
      // finally the container itself so focus never lands on <body>.
      const target =
        initialFocus ?? firstStop() ?? /** @type {HTMLElement} */ (root);
      if (typeof target.focus === 'function') {
        target.focus({ preventScroll: true });
      }

      onKeydown = (event) => {
        if (event.key !== 'Tab') return;
        const stops = focusables(root);
        if (stops.length === 0) {
          // Nothing to move to: hold focus where it is.
          event.preventDefault();
          return;
        }

        const first = stops[0];
        const last = stops[stops.length - 1];
        const current = /** @type {HTMLElement|null} */ (root.ownerDocument?.activeElement ?? null);

        if (event.shiftKey && (current === first || !root.contains(current))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && current === last) {
          event.preventDefault();
          first.focus();
        }
      };

      // Catches focus arriving from outside by any route — a click on the
      // backdrop, a programmatic focus, a browser chrome shortcut.
      onFocusIn = (event) => {
        const next = /** @type {Node|null} */ (event.target);
        if (next && root.contains(next)) return;
        const stops = focusables(root);
        (stops[0] ?? /** @type {HTMLElement} */ (root)).focus({ preventScroll: true });
      };

      root.ownerDocument?.addEventListener('keydown', /** @type {any} */ (onKeydown), true);
      root.ownerDocument?.addEventListener('focusin', onFocusIn, true);
    },

    deactivate() {
      if (!active) return;
      active = false;

      const doc = root.ownerDocument;
      if (onKeydown) doc?.removeEventListener('keydown', /** @type {any} */ (onKeydown), true);
      if (onFocusIn) doc?.removeEventListener('focusin', onFocusIn, true);
      onKeydown = null;
      onFocusIn = null;

      // Only pull focus back if it is still inside the trap; if the user has
      // already moved on, yanking it would be worse than leaving it.
      const current = doc?.activeElement ?? null;
      if (previous && current && root.contains(current)) {
        if (typeof previous.focus === 'function') previous.focus({ preventScroll: true });
      }
      previous = null;
    },

    restore() {
      const target = previous;
      previous = null;
      if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
    },
  };
}