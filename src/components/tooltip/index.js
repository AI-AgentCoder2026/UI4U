/**
 * Public surface of the tooltip component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./tooltip.js` directly instead.
 *
 * See the `TooltipOptions` JSDoc typedef on `Tooltip.configure()` for the
 * options contract.
 */
import css from './tooltip.css';
import { Tooltip } from './tooltip.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const TOOLTIP_STYLE_ID = 'ui-tooltip';

/** Raw stylesheet text, injected by `src/index.js`. */
export const tooltipCss = css;

export { Tooltip };
export default Tooltip;
