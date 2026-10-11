/**
 * Public surface of the input component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./input.js` directly instead.
 *
 * See the `InputOptions` and `InputValidityResult` JSDoc typedefs on
 * `Input.configure()` and `Input.checkValidity()` for the contracts.
 */
import css from './input.css';
import { Input } from './input.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const INPUT_STYLE_ID = 'ui-input';

/** Raw stylesheet text, injected by `src/index.js`. */
export const inputCss = css;

export { Input };
export default Input;
