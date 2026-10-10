/**
 * U14U — a framework-agnostic, mobile-first UI library.
 *
 * This is the only module consumers import. Importing it registers every
 * component as a custom element and injects the design tokens, themes and
 * component stylesheets.
 *
 * Importing an individual component module (`src/components/tabs/tabs.js`)
 * instead has **no side effects** — you then call `define()` yourself.
 *
 * @example
 * import 'u14u';
 *
 * document.body.innerHTML = `
 *   <ui-tabs label="Sections">
 *     <ui-tab label="One">…</ui-tab>
 *     <ui-tab label="Two">…</ui-tab>
 *   </ui-tabs>
 * `;
 *
 * @example
 * import { Tabs, define, injectStyle } from 'u14u';
 * define('ui-tabs', Tabs); // opt into individual components
 */

/* ------------------------------------------------------------------ core */
import { U14UElement } from './core/base.js';
import { Emitter } from './core/emitter.js';
import * as dom from './core/dom.js';
import { define as defineElement, get, isDefined, definedTags } from './core/registry.js';
import { injectStyle as inject, hasStyle } from './core/styles.js';

/* ------------------------------------------------------------- components */
import { Tab, Tabs, TABS_STYLE_ID, tabsCss } from './components/tabs/index.js';

/* ------------------------------------------------------------ foundations */
import tokensCss from './styles/tokens.css';
import themesCss from './styles/themes.css';
import baseCss from './styles/base.css';

export { U14UElement, Emitter, dom, get, isDefined, definedTags, Tabs, Tab, TABS_STYLE_ID, tabsCss };
export { defineElement as define, inject as injectStyle, hasStyle };

/** Library version, inlined by the bundler (`__U14U_VERSION__`). */
export const version = typeof __U14U_VERSION__ !== 'undefined' ? __U14U_VERSION__ : '0.1.0';

/**
 * Component manifest. Every entry pairs a tag name with its class, plus the
 * stylesheet that must be injected before the element renders.
 *
 * @type {Array<{ tag: string, ctor: CustomElementConstructor, styleId?: string, css?: string }>}
 */
export const components = [
  { tag: 'ui-tab', ctor: Tab },
  { tag: 'ui-tabs', ctor: Tabs, styleId: TABS_STYLE_ID, css: tabsCss },
];

/**
 * Registers every component and injects every stylesheet.
 * Idempotent — safe to call more than once.
 *
 * @returns {string[]} tag names defined after this call
 */
export function install() {
  if (typeof document !== 'undefined') {
    inject('u14u-tokens', tokensCss);
    inject('u14u-themes', themesCss);
    inject('u14u-base', baseCss);
  }

  for (const { tag, ctor, styleId, css } of components) {
    if (styleId && css) inject(styleId, css);
    defineElement(tag, ctor);
  }

  return components.map(({ tag }) => tag);
}

install();

/** Namespace object, for UMD consumers and `window.U14U` in the global build. */
export const U14U = {
  version,
  components,
  install,
  Tabs,
  Tab,
  U14UElement,
  Emitter,
  define: defineElement,
  injectStyle: inject,
  dom,
};

export default U14U;