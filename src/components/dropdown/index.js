/**
 * Public surface of the dropdown component.
 *
 * NOTE: this module imports CSS as text, which only the bundler understands.
 * Unit tests import `./dropdown.js` directly instead.
 *
 * See the `DropdownOptions` and `DropdownValidityResult` JSDoc typedefs on
 * `Dropdown.configure()` and `Dropdown.checkValidity()` for the contracts.
 */
import css from './dropdown.css';
import { Dropdown, DropdownOption } from './dropdown.js';

/** Style id used for runtime injection and for `style[data-ui4u]`. */
export const DROPDOWN_STYLE_ID = 'ui-dropdown';

/** Raw stylesheet text, injected by `src/index.js`. */
export const dropdownCss = css;

export { Dropdown, DropdownOption };
export default Dropdown;
