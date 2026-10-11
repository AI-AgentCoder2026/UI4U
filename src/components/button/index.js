/**
 * Public surface of the button component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./button.js` directly instead.
 *
 * See the `ButtonOptions` JSDoc typedef on `Button.configure()` for the options
 * contract.
 */
import css from './button.css';
import { Button } from './button.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const BUTTON_STYLE_ID = 'ui-button';

/** Raw stylesheet text, injected by `src/index.js`. */
export const buttonCss = css;

export { Button };
export default Button;
