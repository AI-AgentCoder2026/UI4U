/**
 * Unified pointer dragging.
 *
 * Mouse, touch and pen all go through Pointer Events, so there is one code path
 * instead of three. Pointer capture matters more than it looks: without it a
 * drag that leaves the handle keeps firing `mousemove` on some browsers and
 * stops on others, and a drag that ends outside the window is never cleaned up.
 */

/**
 * @typedef {object} DragHandlers
 * @property {(event: PointerEvent) => void} [onStart]
 * @property {(event: PointerEvent, delta: { x: number, y: number }) => void} [onMove]
 * @property {(event: PointerEvent) => void} [onEnd]
 */

/**
 * Starts tracking a drag when `onDown` fires on `target`.
 *
 * @param {Element} target
 * @param {DragHandlers & { onDown: (event: PointerEvent) => boolean|void }} handlers
 *   `onDown` returns `false` to cancel starting the drag.
 * @returns {() => void} disposer that removes every listener
 */
export function draggable(target, handlers) {
  const { onDown, onStart, onMove, onEnd } = handlers;

  let pointerId = null;
  let originX = 0;
  let originY = 0;

  const handleDown = (event) => {
    if (pointerId !== null) return;
    if (onDown?.(event) === false) return;

    pointerId = event.pointerId;
    originX = event.clientX;
    originY = event.clientY;

    try {
      target.setPointerCapture(pointerId);
    } catch {
      // Not fatal — the window-level listeners below still finish the drag.
    }

    onStart?.(event);
  };

  const handleMove = (event) => {
    if (event.pointerId !== pointerId) return;
    onMove?.(event, { x: event.clientX - originX, y: event.clientY - originY });
  };

  const finish = (event) => {
    if (event.pointerId !== pointerId) return;
    const finishedId = pointerId;
    pointerId = null;

    try {
      target.releasePointerCapture(finishedId);
    } catch {
      /* already released */
    }

    onEnd?.(event);
  };

  target.addEventListener('pointerdown', handleDown);
  target.addEventListener('pointermove', handleMove);
  target.addEventListener('pointerup', finish);
  target.addEventListener('pointercancel', finish);

  // A drag released outside the window still has to clean itself up.
  const handleLost = () => {
    if (pointerId === null) return;
    pointerId = null;
    onEnd?.(/** @type {PointerEvent} */ ({}));
  };
  globalThis.addEventListener?.('blur', handleLost);

  return () => {
    target.removeEventListener('pointerdown', handleDown);
    target.removeEventListener('pointermove', handleMove);
    target.removeEventListener('pointerup', finish);
    target.removeEventListener('pointercancel', finish);
    globalThis.removeEventListener?.('blur', handleLost);
  };
}