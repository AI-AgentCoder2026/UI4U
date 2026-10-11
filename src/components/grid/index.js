/**
 * Public surface of the grid component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./grid.js` directly instead.
 *
 * See the `GridOptions` JSDoc typedef on `Grid.configure()`.
 */
import css from './grid.css';
import {
  ALIGN_VALUES,
  DEFAULT_GAP,
  DEFAULT_MIN,
  GAP_NAMES,
  GAP_TOKENS,
  Grid,
  resolveGap,
} from './grid.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const GRID_STYLE_ID = 'ui-grid';

/** Raw stylesheet text, injected by `src/index.js`. */
export const gridCss = css;

export { Grid, GAP_TOKENS, GAP_NAMES, DEFAULT_GAP, DEFAULT_MIN, ALIGN_VALUES, resolveGap };
export default Grid;
