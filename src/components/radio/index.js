/**
 * Public surface of the radio components.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./radio.js` directly instead.
 *
 * See the `RadioOptions`, `RadioGroupOptions` and `RadioValidityResult` JSDoc
 * typedefs on `Radio.checkValidity()`, `RadioGroup.configure()` and
 * `RadioGroup.checkValidity()` for the contracts.
 */
import css from './radio.css';
import { Radio, RadioGroup } from './radio.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const RADIO_STYLE_ID = 'ui-radio';

/** Raw stylesheet text, injected by `src/index.js`. */
export const radioCss = css;

export { Radio, RadioGroup };
export default Radio;
