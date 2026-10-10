/**
 * Public surface of the layout component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./layout.js` directly instead.
 *
 * See the `LayoutOptions` JSDoc typedef on `Layout.configure()`.
 */
import css from './layout.css';
import { Layout, Panel } from './layout.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const LAYOUT_STYLE_ID = 'ui-layout';

/** Raw stylesheet text, injected by `src/index.js`. */
export const layoutCss = css;

export { Layout, Panel };
export default Layout;