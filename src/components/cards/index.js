/**
 * Public surface of the cards grid.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./cards.js` directly instead.
 *
 * See the `CardsOptions` JSDoc typedef on `Cards.configure()` for the contract.
 */
import css from './cards.css';
import { Cards } from './cards.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const CARDS_STYLE_ID = 'ui-cards';

/** Raw stylesheet text, injected by `src/index.js`. */
export const cardsCss = css;

export { Cards };
export default Cards;
