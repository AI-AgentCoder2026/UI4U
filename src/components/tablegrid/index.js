/**
 * Public surface of the tablegrid component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./tablegrid.js` directly instead.
 *
 * See the `TableGridOptions` JSDoc typedef on `TableGrid.configure()`.
 */
import css from './tablegrid.css';
import { TableGrid } from './tablegrid.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const TABLEGRID_STYLE_ID = 'ui-tablegrid';

/** Raw stylesheet text, injected by `src/index.js`. */
export const tablegridCss = css;

export { TableGrid };
export default TableGrid;
