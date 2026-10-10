/**
 * Public surface of the popup component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./popup.js` directly instead.
 *
 * See the `PopupOptions` JSDoc typedef on `Popup.configure()`.
 */
import css from './popup.css';
import { Popup } from './popup.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const POPUP_STYLE_ID = 'ui-popup';

/** Raw stylesheet text, injected by `src/index.js`. */
export const popupCss = css;

export { Popup };
export default Popup;