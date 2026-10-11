/**
 * UI4U — a framework-agnostic, mobile-first UI library.
 *
 * This is the only module consumers import. Importing it registers every
 * component as a custom element and injects the design tokens, themes and
 * component stylesheets.
 *
 * Importing an individual component module (`src/components/tabs/tabs.js`)
 * instead has **no side effects** — you then call `define()` yourself.
 *
 * @example
 * import 'ui4u';
 *
 * document.body.innerHTML = `
 *   <ui-tabs label="Sections">
 *     <ui-tab label="One">…</ui-tab>
 *     <ui-tab label="Two">…</ui-tab>
 *   </ui-tabs>
 * `;
 *
 * @example
 * import { Tabs, define, injectStyle } from 'ui4u';
 * define('ui-tabs', Tabs); // opt into individual components
 */

/* ------------------------------------------------------------------ core */
import { UI4UElement } from './core/base.js';
import { Emitter } from './core/emitter.js';
import * as dom from './core/dom.js';
import { define as defineElement, get, isDefined, definedTags } from './core/registry.js';
import { injectStyle as inject, hasStyle } from './core/styles.js';

/* ------------------------------------------------------------- components */
import { Tab, Tabs, TABS_STYLE_ID, tabsCss } from './components/tabs/index.js';
import { Disclosure, DISCLOSURE_STYLE_ID, disclosureCss } from './components/disclosure/index.js';
import { Button, BUTTON_STYLE_ID, buttonCss } from './components/button/index.js';
import { Tooltip, TOOLTIP_STYLE_ID, tooltipCss } from './components/tooltip/index.js';
import { Layout, Panel, LAYOUT_STYLE_ID, layoutCss } from './components/layout/index.js';
import { Popup, POPUP_STYLE_ID, popupCss } from './components/popup/index.js';
import { Input, INPUT_STYLE_ID, inputCss } from './components/input/index.js';
import { TableGrid, TABLEGRID_STYLE_ID, tablegridCss } from './components/tablegrid/index.js';
import { Form, FORM_STYLE_ID, formCss } from './components/form/index.js';
import { Sidebar, SidebarItem, SIDEBAR_STYLE_ID, sidebarCss } from './components/sidebar/index.js';
import { Checkbox, CHECKBOX_STYLE_ID, checkboxCss } from './components/checkbox/index.js';
import { Radio, RadioGroup, RADIO_STYLE_ID, radioCss } from './components/radio/index.js';
import {
  Dropdown,
  DropdownOption,
  DROPDOWN_STYLE_ID,
  dropdownCss,
} from './components/dropdown/index.js';

/* ------------------------------------------------------------ foundations */
import tokensCss from './styles/tokens.css';
import themesCss from './styles/themes.css';
import baseCss from './styles/base.css';

export {
  UI4UElement,
  Emitter,
  dom,
  get,
  isDefined,
  definedTags,
  Tabs,
  Tab,
  TABS_STYLE_ID,
  tabsCss,
  Disclosure,
  DISCLOSURE_STYLE_ID,
  disclosureCss,
  Button,
  BUTTON_STYLE_ID,
  buttonCss,
  Tooltip,
  TOOLTIP_STYLE_ID,
  tooltipCss,
  Layout,
  Panel,
  LAYOUT_STYLE_ID,
  layoutCss,
  Popup,
  POPUP_STYLE_ID,
  popupCss,
  Input,
  INPUT_STYLE_ID,
  inputCss,
  TableGrid,
  TABLEGRID_STYLE_ID,
  tablegridCss,
  Form,
  FORM_STYLE_ID,
  formCss,
  Sidebar,
  SidebarItem,
  SIDEBAR_STYLE_ID,
  sidebarCss,
  Checkbox,
  CHECKBOX_STYLE_ID,
  checkboxCss,
  Radio,
  RadioGroup,
  RADIO_STYLE_ID,
  radioCss,
  Dropdown,
  DropdownOption,
  DROPDOWN_STYLE_ID,
  dropdownCss,
};
export { defineElement as define, inject as injectStyle, hasStyle };

/** Library version, inlined by the bundler (`__UI4U_VERSION__`). */
export const version = typeof __UI4U_VERSION__ !== 'undefined' ? __UI4U_VERSION__ : '0.1.0';

/**
 * Component manifest. Every entry pairs a tag name with its class, plus the
 * stylesheet that must be injected before the element renders.
 *
 * @type {Array<{ tag: string, ctor: CustomElementConstructor, styleId?: string, css?: string }>}
 */
export const components = [
  { tag: 'ui-tab', ctor: Tab },
  { tag: 'ui-tabs', ctor: Tabs, styleId: TABS_STYLE_ID, css: tabsCss },
  {
    tag: 'ui-disclosure',
    ctor: Disclosure,
    styleId: DISCLOSURE_STYLE_ID,
    css: disclosureCss,
  },
  { tag: 'ui-button', ctor: Button, styleId: BUTTON_STYLE_ID, css: buttonCss },
  { tag: 'ui-tooltip', ctor: Tooltip, styleId: TOOLTIP_STYLE_ID, css: tooltipCss },
  { tag: 'ui-panel', ctor: Panel },
  {
    tag: 'ui-layout',
    ctor: Layout,
    styleId: LAYOUT_STYLE_ID,
    css: layoutCss,
  },
  { tag: 'ui-popup', ctor: Popup, styleId: POPUP_STYLE_ID, css: popupCss },
  { tag: 'ui-input', ctor: Input, styleId: INPUT_STYLE_ID, css: inputCss },
  {
    tag: 'ui-tablegrid',
    ctor: TableGrid,
    styleId: TABLEGRID_STYLE_ID,
    css: tablegridCss,
  },
  { tag: 'ui-form', ctor: Form, styleId: FORM_STYLE_ID, css: formCss },
  {
    tag: 'ui-sidebar-item',
    ctor: SidebarItem,
  },
  {
    tag: 'ui-sidebar',
    ctor: Sidebar,
    styleId: SIDEBAR_STYLE_ID,
    css: sidebarCss,
  },
  { tag: 'ui-checkbox', ctor: Checkbox, styleId: CHECKBOX_STYLE_ID, css: checkboxCss },
  { tag: 'ui-radio', ctor: Radio },
  { tag: 'ui-radio-group', ctor: RadioGroup, styleId: RADIO_STYLE_ID, css: radioCss },
  { tag: 'ui-dropdown-option', ctor: DropdownOption },
  {
    tag: 'ui-dropdown',
    ctor: Dropdown,
    styleId: DROPDOWN_STYLE_ID,
    css: dropdownCss,
  },
];

/**
 * Registers every component and injects every stylesheet.
 * Idempotent — safe to call more than once.
 *
 * @returns {string[]} tag names defined after this call
 */
export function install() {
  if (typeof document !== 'undefined') {
    inject('ui4u-tokens', tokensCss);
    inject('ui4u-themes', themesCss);
    inject('ui4u-base', baseCss);
  }

  for (const { tag, ctor, styleId, css } of components) {
    if (styleId && css) inject(styleId, css);
    defineElement(tag, ctor);
  }

  return components.map(({ tag }) => tag);
}

install();

/** Namespace object, for UMD consumers and `window.UI4U` in the global build. */
export const UI4U = {
  version,
  components,
  install,
  Tabs,
  Tab,
  Disclosure,
  Button,
  Tooltip,
  Layout,
  Panel,
  Popup,
  Input,
  TableGrid,
  Form,
  Sidebar,
  SidebarItem,
  Checkbox,
  Radio,
  RadioGroup,
  Dropdown,
  DropdownOption,
  UI4UElement,
  Emitter,
  define: defineElement,
  injectStyle: inject,
  dom,
};

export default UI4U;
