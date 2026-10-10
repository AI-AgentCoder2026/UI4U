/**
 * Minimal DOM helpers.
 *
 * Everything here is a pure function so components stay declarative, and none
 * of it touches the document at module scope — that keeps importing a
 * component module safe in SSR and in the node test harness.
 */

/**
 * @typedef {Record<string, string|number|boolean|null|undefined>} Attrs
 * @typedef {Node|Node[]|string|null|undefined} Child
 */

let uidCounter = 0;

/**
 * Generates a stable, collision-free id with a readable prefix.
 * Deterministic (a counter, not randomness) so tests stay reproducible.
 *
 * @param {string} [prefix]
 * @returns {string}
 */
export function uid(prefix = 'u14u') {
  uidCounter += 1;
  return `${prefix}-${uidCounter}`;
}

/**
 * Creates an element. Attributes are set with `setAttribute` and properties are
 * assigned directly when they already exist on the element instance, so
 * `el('input', { type: 'text', value: 'hi' })` behaves as expected.
 *
 * `dataset`, `style` and `aria`/`data` prefixes are handled explicitly.
 *
 * @param {string} tag
 * @param {Attrs} [attrs]
 * @param {Child|Child[]} [children]
 * @returns {HTMLElement}
 *
 * @example
 * const button = el('button', { class: 'cta', type: 'button' }, ['Save']);
 * button.addEventListener('click', onSave);
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'dataset' || key === 'style') {
      for (const [subKey, subValue] of Object.entries(value)) {
        if (subValue === null || subValue === undefined) continue;
        if (key === 'style') node.style.setProperty(subKey, String(subValue));
        else node.dataset[subKey] = String(subValue);
      }
      continue;
    }

    if (key in node) {
      node[key] = value;
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }

  append(node, children);
  return node;
}

/**
 * Appends children to a parent, skipping `null`/`undefined` and coercing
 * strings to text nodes. Never uses `innerHTML`.
 *
 * @param {Node} parent
 * @param {Child|Child[]} children
 * @returns {Node} the parent
 */
export function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];

  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return parent;
}

/**
 * Creates a `DocumentFragment` from a list of children.
 *
 * @param {Child|Child[]} [children]
 * @returns {DocumentFragment}
 */
export function frag(children = []) {
  return append(document.createDocumentFragment(), children);
}

/**
 * Removes every child of a node.
 *
 * @param {Node} node
 * @returns {Node} the emptied node
 */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/**
 * Replaces the entire content of a node with plain text. This is the only
 * supported way to render user-supplied strings — never `innerHTML`.
 *
 * @param {Node} node
 * @param {unknown} text
 * @returns {Node} the node
 */
export function setText(node, text) {
  node.textContent = text === null || text === undefined ? '' : String(text);
  return node;
}

/**
 * Adds a DOM listener and returns a disposer, so component teardown is a
 * single call and never leaks listeners.
 *
 * @param {EventTarget} target
 * @param {string} type
 * @param {EventListener} handler
 * @param {AddEventListenerOptions|boolean} [options]
 * @returns {() => void} disposer
 */
export function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/**
 * Delegated listener. Calls `handler(event, matchedElement)`.
 *
 * @param {EventTarget} root
 * @param {string} type
 * @param {string} selector
 * @param {(event: Event, matched: Element) => void} handler
 * @param {AddEventListenerOptions|boolean} [options]
 * @returns {() => void} disposer
 */
export function delegate(root, type, selector, handler, options) {
  const listener = (event) => {
    const target = /** @type {Element|null} */ (event.target);
    if (!target || typeof target.closest !== 'function') return;
    const matched = target.closest(selector);
    if (matched && root instanceof Node && root.contains(matched)) handler(event, matched);
  };

  return on(root, type, /** @type {EventListener} */ (listener), options);
}

/**
 * Visible, focusable descendants in tab order. Used by popup focus trapping.
 *
 * @param {Element} root
 * @returns {HTMLElement[]}
 */
export function focusables(root) {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  return /** @type {HTMLElement[]} */ (
    [...root.querySelectorAll(selector)].filter((node) => {
      if (node.hasAttribute('disabled') || node.getAttribute('aria-hidden') === 'true') return false;
      return node.offsetWidth > 0 || node.offsetHeight > 0 || node === document.activeElement;
    })
  );
}

/**
 * Whether the user asked for reduced motion. Components should read this in
 * addition to the `--u14u-duration-*` tokens, for JS-driven animation.
 *
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  return (
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Reads `querySelector` defensively, returning `null` instead of throwing.
 *
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {Element|null}
 */
export function qs(root, selector) {
  return root.querySelector(selector);
}