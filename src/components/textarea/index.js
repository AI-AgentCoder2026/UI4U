/**
 * Public surface of the textarea component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./textarea.js` directly instead.
 *
 * See the `TextareaOptions` and `TextareaValidityResult` JSDoc typedefs on
 * `Textarea.configure()` and `Textarea.checkValidity()` for the contracts.
 */
import css from './textarea.css';
import { Textarea } from './textarea.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const TEXTAREA_STYLE_ID = 'ui-textarea';

/** Raw stylesheet text, injected by `src/index.js`. */
export const textareaCss = css;

export { Textarea };
export default Textarea;
