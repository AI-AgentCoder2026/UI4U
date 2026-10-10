/**
 * Public surface of the tabs component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./tabs.js` directly instead.
 *
 * See the `TabsOptions` JSDoc typedef on `Tabs.configure()` for the options
 * contract.
 */
import css from './tabs.css';
import { Tabs, Tab } from './tabs.js';

/** Style id used for runtime injection and for `style[data-u14u]`. */
export const TABS_STYLE_ID = 'ui-tabs';

/** Raw stylesheet text, injected by `src/index.js`. */
export const tabsCss = css;

export { Tabs, Tab };
export default Tabs;