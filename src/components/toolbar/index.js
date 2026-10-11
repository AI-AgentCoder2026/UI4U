/**
 * Public surface of the toolbar component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./toolbar.js` directly instead.
 *
 * See the `ToolbarOptions` JSDoc typedef on `Toolbar.configure()` for the
 * contract.
 */
import css from './toolbar.css';
import { Toolbar } from './toolbar.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const TOOLBAR_STYLE_ID = 'ui-toolbar';

/** Raw stylesheet text, injected by `src/index.js`. */
export const toolbarCss = css;

export { Toolbar };
export default Toolbar;
