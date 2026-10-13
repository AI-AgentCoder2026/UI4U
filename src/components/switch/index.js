/**
 * Public surface of the switch component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./switch.js` directly instead.
 *
 * See the `SwitchOptions` and `SwitchValidityResult` JSDoc typedefs on
 * `Switch.configure()` and `Switch.checkValidity()` for the contracts.
 */
import css from './switch.css';
import { Switch } from './switch.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const SWITCH_STYLE_ID = 'ui-switch';

/** Raw stylesheet text, injected by `src/index.js`. */
export const switchCss = css;

export { Switch };
export default Switch;
