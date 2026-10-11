/**
 * Public surface of the sidebar component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./sidebar.js` directly instead.
 *
 * See the `SidebarOptions` JSDoc typedef on `Sidebar.configure()` for the
 * options contract.
 */
import css from './sidebar.css';
import { Sidebar, SidebarItem } from './sidebar.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const SIDEBAR_STYLE_ID = 'ui-sidebar';

/** Raw stylesheet text, injected by `src/index.js`. */
export const sidebarCss = css;

export { Sidebar, SidebarItem };
export default Sidebar;
