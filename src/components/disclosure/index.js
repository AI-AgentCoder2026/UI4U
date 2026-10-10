/**
 * Public surface of the disclosure component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./disclosure.js` directly instead.
 *
 * See the `DisclosureOptions` JSDoc typedef on `Disclosure.configure()`.
 */
import css from './disclosure.css';
import { Disclosure } from './disclosure.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const DISCLOSURE_STYLE_ID = 'ui-disclosure';

/** Raw stylesheet text, injected by `src/index.js`. */
export const disclosureCss = css;

export { Disclosure };
export default Disclosure;