/**
 * Public surface of the button-group component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./button-group.js` directly instead.
 *
 * See the `ButtonGroupOptions` JSDoc typedef on `ButtonGroup.configure()` for
 * the options contract.
 */
import css from './button-group.css';
import { ButtonGroup } from './button-group.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const BUTTON_GROUP_STYLE_ID = 'ui-button-group';

/** Raw stylesheet text, injected by `src/index.js`. */
export const buttonGroupCss = css;

export { ButtonGroup };
export default ButtonGroup;
