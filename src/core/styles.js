/**
 * Runtime style injection.
 *
 * UI4U ships no global CSS at import time. Each component's stylesheet is
 * injected once, lazily, into `<head>` as a single `<style>` element keyed by
 * component id. Rules are scoped to that component's own tag name, so the
 * library never leaks selectors into consumer markup.
 *
 * Prefer this only in the bundled runtime path. If you link `dist/ui4u.css`
 * directly, skip injection entirely.
 */

/** @type {Set<string>} */
const injected = new Set();

/**
 * @typedef {object} StyleSheetLike
 * @property {string} default CSS source text
 */

/**
 * Injects a component stylesheet once.
 *
 * @param {string} id component id, e.g. `'ui-tabs'`
 * @param {string|{ default: string }} css
 * @returns {boolean} whether the stylesheet was injected by this call
 */
export function injectStyle(id, css) {
  if (typeof document === 'undefined') return false;
  if (injected.has(id)) return false;

  const source = typeof css === 'string' ? css : css?.default;
  if (typeof source !== 'string' || source.trim() === '') return false;

  // `textContent`, never `innerHTML` — CSS is authored, but the rule holds everywhere.
  const style = document.createElement('style');
  style.setAttribute('data-ui4u', id);
  style.textContent = source;

  (document.head || document.documentElement).appendChild(style);
  injected.add(id);
  return true;
}

/**
 * @param {string} id
 * @returns {boolean}
 */
export function hasStyle(id) {
  return injected.has(id);
}

/** Test seam — forgets which ids were injected. */
export function resetStyles() {
  injected.clear();
}