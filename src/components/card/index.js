/**
 * Public surface of the card component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./card.js` directly instead.
 *
 * See the `CardOptions` JSDoc typedef on `Card.configure()` for the contract.
 */
import css from './card.css';
import { Card } from './card.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const CARD_STYLE_ID = 'ui-card';

/** Raw stylesheet text, injected by `src/index.js`. */
export const cardCss = css;

export { Card };
export default Card;
