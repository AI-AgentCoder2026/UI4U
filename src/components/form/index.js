/**
 * Public surface of the form component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./form.js` directly instead.
 *
 * See the `FormOptions` and `FormValidityResult` JSDoc typedefs on
 * `Form.configure()` and `Form.validate()` for the contracts.
 */
import css from './form.css';
import { Form } from './form.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const FORM_STYLE_ID = 'ui-form';

/** Raw stylesheet text, injected by `src/index.js`. */
export const formCss = css;

export { Form };
export default Form;
