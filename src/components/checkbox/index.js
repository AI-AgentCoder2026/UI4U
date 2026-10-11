/**
 * Public surface of the checkbox component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./checkbox.js` directly instead.
 *
 * See the `CheckboxOptions` and `CheckboxValidityResult` JSDoc typedefs on
 * `Checkbox.configure()` and `Checkbox.checkValidity()` for the contracts.
 */
import css from './checkbox.css';
import { Checkbox } from './checkbox.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const CHECKBOX_STYLE_ID = 'ui-checkbox';

/** Raw stylesheet text, injected by `src/index.js`. */
export const checkboxCss = css;

export { Checkbox };
export default Checkbox;
