# UI4U roadmap

Delivery plan for the remaining components. Each one ships only when its demo
page and tests exist — see the component contract in [`AGENTS.md`](../AGENTS.md).

## Status

| Phase | Component      | State                                                           |
| ----- | -------------- | --------------------------------------------------------------- |
| 1     | `ui-button`    | ✅ shipped                                                      |
| 1     | `ui-tooltip`   | ✅ shipped (also brought in `core/position.js`)                 |
| 1     | `ui-popup`     | ✅ shipped (also brought in `core/focus-trap.js`)               |
| 2     | `ui-input`     | ✅ shipped                                                      |
| 2     | `ui-form`      | ⏳ next                                                         |
| 3     | `ui-tablegrid` | Browsable data table: sortable columns, keyboard cell nav       |
| 3     | `ui-sidebar`   | ⏳ planned                                                      |
| 3     | `ui-layout`    | ✅ shipped (also brought in `core/pointer.js` + `core/size.js`) |

Shared helpers extracted so far: `core/position.js`, `core/pointer.js`,
`core/size.js`, `core/focus-trap.js`. `dom.js` still owns `focusables()` and
re-exports it; `ui-sidebar` should consume the trap rather than growing a
second one.

## Build order

The order is driven by dependencies, not by importance.

| Phase | Component      | Why here                                                                     |
| ----- | -------------- | ---------------------------------------------------------------------------- |
| 1     | `ui-button`    | Everything interactive needs it; form, popup and input all submit through it |
| 1     | `ui-tooltip`   | First consumer of the positioning helper, which popup then reuses            |
| 1     | `ui-popup`     | Needs the focus trap; sidebar's mobile drawer will reuse it                  |
| 2     | `ui-input`     | Pure presentational field, no behaviour to get wrong                         |
| 2     | `ui-form`      | Depends on `ui-input`'s validity surface                                     |
| 3     | `ui-tablegrid` | Browsable data table: sortable columns, keyboard cell nav                    |
| 3     | `ui-sidebar`   | Reuses popup's drawer behaviour on narrow screens                            |
| 3     | `ui-layout`    | Largest surface; benefits from grid and sidebar being settled                |

## Shared infrastructure to extract first

| Module               | Purpose                                   | Needed by       |
| -------------------- | ----------------------------------------- | --------------- |
| `core/focus-trap.js` | Tab containment + focus restoration       | popup, sidebar  |
| `core/position.js`   | Placement, flipping, clamping to viewport | tooltip, popup  |
| `core/pointer.js`    | Unified pointer/touch drag with capture   | layout, sidebar |
| `core/size.js`       | Clamp a number between a min and max      | layout, sidebar |

`dom.js` already owns `focusables()`; it moves to `core/focus-trap.js` and is
re-exported from `dom.js` so nothing breaks.

---

## 1. `ui-button`

```html
<ui-button variant="primary" size="md" type="submit">Save</ui-button>
<ui-button href="/docs" variant="ghost">Docs</ui-button>
<ui-button loading>Saving…</ui-button>
```

- **API** — `configure({ variant, size, type, disabled, loading, href })`
  Variants: `primary` · `secondary` · `ghost` · `danger` · `subtle`.
  Sizes: `sm` · `md` · `lg`.
- **Renders a native element** — `<button>`, or `<a>` when `href` is set. Never
  a `div` with a click handler.
- **A11y** — `disabled` and `aria-disabled` mirrored; loading sets `aria-busy`
  and blocks activation; the busy state is announced through a polite live region.
- **Events** — `ui4u:press` after activation. Native `click` still fires.

## 2. `ui-tooltip`

```html
<ui-tooltip content="Rebuild the index" placement="top">Rebuild</ui-tooltip>
```

- **API** — `configure({ content, placement, delay, disabled })`
  Placement: `top` · `right` · `bottom` · `left`, flipping automatically.
- **A11y** — the trigger gets `aria-describedby` pointing at the tooltip. Shown
  on hover **and** focus (keyboard users are not an afterthought), hidden on
  `Escape`, blur and pointer leave.
- **Events** — `ui4u:show`, `ui4u:hide`.
- **Tokens** — `--ui4u-tooltip-bg`, `--ui4u-tooltip-radius`.

## 3. `ui-popup`

```html
<ui-popup mode="modal" label="Confirm">Are you sure?</ui-popup>
```

- **API** — `configure({ mode, open, dismissible, placement })`
  Modes: `modal` (focus trap) · `popover` (no trap) · `drawer` (side sheet).
- **A11y** — `role="dialog"`, `aria-modal` for modal, focus trapped inside,
  focus restored to the trigger on close, `Escape` closes when dismissible.
  This is the acceptance criterion AGENTS.md already demands for popups.
- **Events** — `ui4u:open`, `ui4u:close`, `ui4u:cancel`.

## 4. `ui-input`

```html
<ui-input label="Email" type="email" required hint="We never share it."></ui-input>
```

- **API** — `configure({ label, type, value, placeholder, hint, error, size,
required, disabled, readonly, name, autocomplete, decimals, min, max, locale,
firstDayOfWeek, range, view })`
- **Wraps a real `<input>`** — light DOM, so native autofill, IME composition
  and mobile keyboards keep working. Never a controlled imitation.
- **`type="amount"`** — accepts the `k` / `m` / `b` magnitude shortcuts and
  reformats as you type. `5k` becomes `5,000` immediately and the caret moves
  to the end so typing continues; a half-typed decimal (`12.`) is left alone so
  the caret is never moved mid-number. The text stays the user's, and the number
  a consumer should store is on the `amount` getter and in the event detail.
  Thousands separators are read on the way in, and `min` / `max` are reported by
  `checkValidity()` rather than silently clamping what was typed.
- **`type="date"`** — a Gregorian picker with three levels (day, month, year)
  that drill up from the title and back down from the grid, plus an optional
  `range` holding one start and one end. The attribute keeps the ISO
  `YYYY-MM-DD` (or `from/to`) value while the field shows the locale's format,
  so a consumer never stores a display string. `min` / `max` disable days
  outright; a range completed by clicking backwards swaps its ends rather than
  producing a negative range. Gregorian only — a non-Gregorian system needs its
  own conversion layer, since its months do not line up with solar ones.
- **Calendar panel** — portalled to `<body>` and positioned with
  `core/position.js`, because an ancestor with `transform` or `backdrop-filter`
  would otherwise become its containing block. One roving tab stop across the
  grid, arrow keys to move, `PageUp` / `PageDown` by month and year, `Home` /
  `End` within the week, `Escape` to close, and a document listener for a click
  elsewhere — which focus events cannot cover once the panel is outside the
  host.
- **A11y** — `<label for>`, `aria-describedby` chaining hint and error,
  `aria-invalid` when erroring. Label is visually hidden when `srOnly` is set.
  A date field is read-only, since the panel is the only way in and a
  free-typed date has no way to show itself as invalid.
- **Events** — `ui4u:input`, `ui4u:change`. An amount event carries `amount`
  alongside `value`; a date event carries `date` as `{ from, to }`.

## 5. `ui-form`

```html
<ui-form>
  <ui-input name="email" label="Email" type="email" required></ui-input>
  <ui-button type="submit">Save</ui-button>
</ui-form>
```

- **API** — `configure({ validateOn, noValidate })`
  `validateOn`: `submit` · `change` · `blur`.
- **Behaviour** — prevents native submit when invalid, marks each failing field,
  moves focus to the first invalid one, and exposes `validate()` /
  `resetValidity()` for imperative use.
- **A11y** — an error summary region with `role="alert"` listing failures, each
  linking to its field.
- **Events** — `ui4u:submit` (only when valid), `ui4u:invalid`.

## 6. `ui-tablegrid`

Wraps a plain `<table>`; the author keeps writing native markup.

```html
<ui-tablegrid label="Releases" searchable per-page="10" navigate>
  <table>
    <thead>
      <!-- Optional group row; only the LAST row carries the columns. -->
      <tr>
        <th scope="colgroup" colspan="2">Release</th>
        <th scope="col" rowspan="2">Channel</th>
      </tr>
      <tr>
        <th scope="col" data-sort="version" data-type="text">Version</th>
        <th scope="col" data-sort="downloads" data-type="number">Downloads</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1.2.0</td>
        <td data-value="8421">8,421</td>
        <td>stable</td>
      </tr>
    </tbody>
  </table>
</ui-tablegrid>
```

- **API** — `configure({ navigate, striped, dense, searchable, advancedSearch,
selectable, multi, selectAllHeader, copyable, perPage, search, filters, sort,
direction, searchPlaceholder })`. Every option maps one-for-one onto an
  attribute (`advancedSearch` ↔ `advanced-search`, `perPage` ↔ `per-page`), and
  every feature stays off until it is asked for.
- **Column groups** — the `<thead>` may open with group headers that span
  columns with `colspan` / `rowspan`. Only the **last** header row describes real
  columns, so that is the row sort keys, `aria-sort` and the roving cursor read
  from. A `rowspan` group header shifts the columns after it, which the
  component measures rather than assuming header indices match body indices.
  A column living entirely under a `rowspan` has no header cell of its own;
  search and "any column" still reach it.
- **Sorting** — `data-sort` marks a column sortable; `data-type="number"`
  compares numerically; `data-value` carries the real number behind formatted
  text such as `8,421`. Sorts are stable and `resetSort()` restores the
  authored order.
- **Search** — `searchable` renders a filter field. Matching is a
  case-insensitive substring test against `data-value` **or** cell text in any
  column, so `8421` finds the row rendered as `8,421`.
- **Advanced search** — `advanced-search` adds a field / operator / value
  builder. Operators are `contains`, `not-contains`, `equals`, `not-equals`,
  `starts-with`, `ends-with`, `gt`, `gte`, `lt`, `lte`; a field is a `data-sort`
  key or `*` for any column. Criteria combine with AND, a numeric column
  compares as numbers rather than text, and a criterion with no value imposes no
  constraint — so "Add filter" never empties the table. Drive it with
  `setFilters()`, `addFilter()`, `removeFilter()`, `clearFilters()` or the
  `filters` attribute (JSON).
- **Selection** — `selectable` inserts a checkbox column: one checkbox per row
  plus a header checkbox spanning every header row. Without `multi` a click
  replaces the selection; with it, Ctrl adds and Shift extends from the anchor
  (and a range replaces, as in a file list). API: `selectRow()`, `toggleRow()`,
  `isSelected()`, `selectAll()`, `clearSelection()`, plus the `selectedRows`,
  `selectedData` and `selectedText` getters.
- **Copy** — `copyable` renders a button that puts `selectedText` on the
  clipboard as tab-separated values with a header row, which pastes straight
  into a spreadsheet. It falls back to `document.execCommand('copy')` where the
  async clipboard API is unavailable, and emits `ui4u:copy` with
  `{ text, rows, copied }` either way so a host can offer its own fallback.
- **Pagination** — `per-page` splits the rows and renders a pager. The status is
  a `role="status"` live region and the buttons disable at each end.
- **Composition** — search, then the advanced criteria, then sort, then page.
  Changing the query or a criterion resets to page one.
- **A11y** — each sortable header holds a real `<button>` so sorting is
  keyboard reachable, and `aria-sort` is applied to exactly one header at a
  time. Selection uses real `<input type="checkbox">` elements and marks rows
  `aria-selected`; the header checkbox reports a partial selection with
  `indeterminate`. In `navigate` mode <kbd>Space</kbd> toggles the row under the
  cursor and <kbd>Ctrl</kbd>+<kbd>A</kbd> selects every match. Search and paging
  **hide** rows rather than deleting them, so the arrow keys skip rows that are
  not on screen. `navigate` is opt-in: it switches the table to `role="grid"`
  with a roving tab stop across cells, because a plain `<table>` is already
  navigable and turning every cell into a tab stop would be a downgrade. Every
  header row gets its grid roles, group rows included.
- **Events** — `ui4u:sort` with `detail: { column, direction, rows }`,
  `ui4u:search` with `detail: { query, rows }`, `ui4u:page` with
  `detail: { page, pageCount, rows }`, `ui4u:select` with
  `detail: { rows, data, count }` and `ui4u:copy` with
  `detail: { text, rows, copied }`.
- **Teardown** — every rebuild-triggering attribute undoes its own DOM. Leaving
  an empty wrapper behind stacks a fresh gap per toggle, so the search toolbar,
  filter bar, copy button, pager and the whole selection column are all removed
  and rebuilt together.

## 7. `ui-sidebar`

```html
<ui-sidebar expanded>
  <ui-sidebar-item label="Overview" active></ui-sidebar-item>
</ui-sidebar>
```

- **API** — `configure({ expanded, side, width, rail })`
- **Rail mode** — collapses to icons under `rail` width, expanding on hover or
  focus so keyboard users are never trapped in a collapsed rail.
- **A11y** — `aria-expanded` on the toggle, `aria-current="page"` on the active
  item, roving arrow-key navigation between items, landmark role with a label.
- **Events** — `ui4u:change`, `ui4u:navigate`.
- **Narrow screens** — becomes a drawer backed by the popup focus trap.

## 8. `ui-layout`

```html
<ui-layout>
  <ui-panel slot="top" size="4rem">…</ui-panel>
  <ui-panel slot="left" size="16rem" min="10rem" resizable>…</ui-panel>
  <ui-panel slot="center">…</ui-panel>
  <ui-panel slot="right" size="18rem" resizable>…</ui-panel>
  <ui-panel slot="bottom" size="6rem" resizable>…</ui-panel>
</ui-layout>
```

- **API** — `configure({ gutter, resizable, collapsible })`; per panel
  `size` / `min` / `max` / `resizable`.
- **Recursive** — any slot accepts a nested `ui-layout` as well as a `ui-panel`,
  so a sidebar can be a workspace of its own with its own centre, left/right and
  top/bottom. Each level keeps its own separators, sizes and keyboard step;
  `reset()` restores only that subtree. Events bubble, and both `ui4u:resize` and
  `ui4u:collapse` carry the emitting `layout` in `detail`.
- **Splitters** — every region gets a handle. Column separators
  (left | centre | right) are `role="separator" aria-orientation="vertical"` and
  respond to <kbd>←</kbd> <kbd>→</kbd>; row separators (top | centre | bottom) are
  `aria-orientation="horizontal"` and respond to <kbd>↑</kbd> <kbd>↓</kbd>. Both
  carry `aria-valuenow`, plus `aria-valuemin`/`aria-valuemax` only when a bound is
  actually enforced. `Home`/`End` jump to the limits, `Enter` collapses and restores,
  double-click resets to the authored size.
- **Pointer input** — unified mouse/touch/pen drag through pointer capture, so
  a drag that leaves the splitter does not stick. A pointer-down focuses the handle,
  so the arrow keys work straight after clicking it.
- **A11y** — panels carry `aria-label` from their `label` attribute; the layout
  is a labelled `region`.
- **Responsive** — mobile-first: narrow viewports stack the panels and disable
  dragging rather than offering a 4px-wide unusable handle.

---

## 9. `ui-checkbox`

```html
<ui-checkbox label="Email me about releases" name="releases"></ui-checkbox>
<ui-checkbox label="Select all" indeterminate></ui-checkbox>
```

- **API** — `configure({ label, name, value, checked, indeterminate, hint,
error, disabled, required, readonly })`, `focus()`, `blur()`,
  `checkValidity()`, `clearValidity()`, `reportValidity()`.
- **Wraps a real `<input type="checkbox">`** — styled with `accent-color` rather
  than a hidden input and a drawn box, because the native control is what keeps
  focus, form submission and assistive technology working.
- **`indeterminate`** — a property with no content attribute, so the attribute
  is the source of truth and is mirrored onto the control. The `change` handler
  mirrors the browser's own clearing back onto the attribute, so a tick and a
  half-tick cannot drift apart.
- **`readonly`** is meaningless natively, so it is enforced: the authored
  `checked` is the state, a user toggle is reverted, `aria-readonly` is set and
  nothing is emitted.
- **Validity** — valid unless `required` and unticked, matching the native rule.
  An unticked optional checkbox is not an error.
- **A11y** — `<label for>`, `aria-describedby` chaining hint and error,
  `aria-invalid` when erroring. Touch target clears 44px.
- **Events** — `ui4u:change` with `detail: { value, name, checked }`.

## 10. `ui-radio` and `ui-radio-group`

```html
<ui-radio-group label="Plan" name="plan" value="pro">
  <ui-radio value="free">Free</ui-radio>
  <ui-radio value="pro">Pro</ui-radio>
</ui-radio-group>
```

- **API** — `ui-radio` exposes `value`, `name`, `checked`, `disabled`,
  `required`, `input`, `group`, `sync()`, `focus()`, `blur()`,
  `checkValidity()`. `ui-radio-group` adds `radios`, `label`, `hint`, `error`,
  `srOnly`, `fieldset`, `configure({…})`, `refresh()`, `focus()` and the same
  three validity methods.
- **Group semantics** — a real `<fieldset>` with a `<legend>`, carrying
  `role="radiogroup"`. The group owns selection and the group's `name` is what
  goes on the natives, so checking one clears its siblings natively.
- **One tab stop, not N** — only the selected radio (or the first, when none is
  selected) keeps `tabindex="0"`; the rest are `-1`. Arrow keys move **and**
  check, `Home`/`End` jump to the ends, and movement clamps rather than wraps.
  `Tab` leaves the group entirely and is never prevented.
- **The clamp needs an explicit `preventDefault()`** — Chromium's native radio
  handling wraps on arrow keys, so returning early at the end of the group would
  let the browser move the selection anyway. jsdom has no native arrow
  behaviour, so this is only observable in a browser; the unit test asserts
  `defaultPrevented` so the contract is pinned in both.
- **Effective properties** — `disabled`, `required` and `name` on a radio resolve
  to its own attribute **or** its group's, so a radio behaves correctly even
  before the group has built.
- **Validity is computed, not delegated** — hosts disagree about whether a radio
  group reports `valueMissing`, so the group works it out itself.
- **Dynamic children** — a radio registers with its group through the lifecycle
  hooks and calls `group.refresh()`; `refresh()` is public for anything the
  component cannot see.
- **Events** — `ui-radio` emits a non-bubbling `ui4u:change`, so a selection
  inside a group surfaces exactly one event. The group emits one bubbled
  `ui4u:change` with `detail: { value, name }`.

## 11. `ui-dropdown`

```html
<ui-dropdown label="Country" name="country" placeholder="Choose a country">
  <ui-dropdown-option value="my">Malaysia</ui-dropdown-option>
  <ui-dropdown-option value="sg">Singapore</ui-dropdown-option>
</ui-dropdown>
```

- **API** — `configure({ label, name, value, placeholder, hint, error, disabled,
required, multiple, open })`, `open()`, `close()`, `toggle()`, `focus()`,
  `checkValidity()`, `clearValidity()`, `reportValidity()`, and getters for
  `label`, `name`, `value`, `options`, `isOpen`, `trigger` and `panel`.
  `isOpen` is the boolean state because `open` is a method.
- **A listbox, not a styled `<select>`** — a real `<button>` trigger and
  `role="listbox"` options, so it can be styled, filtered and given
  `aria-multiselectable` at all.
- **Select-only combobox pattern (APG)** — focus never leaves the trigger and
  the keyboard cursor is published through `aria-activedescendant`. That is what
  makes a portalled panel workable: a focus trap would fight the fact that the
  panel is not a descendant of the trigger, so `core/focus-trap.js` is
  deliberately unused.
- **Portalled** — the panel is appended to `<body>` and placed with
  `core/position.js`, and re-placed on scroll and resize. Options are _moved_
  into the panel on open and returned to the host on close, the way
  `ui-popup` stashes its content, so there is one source of truth for the label
  text and teardown is a plain removal.
- **Keyboard** — Enter/Space/ArrowDown/ArrowUp open; arrows navigate, skipping
  disabled options; Home/End jump; Enter commits; Escape closes; Tab closes
  _without_ being prevented, so the user is never trapped. Type-ahead skips
  disabled options and works while closed.
- **Events** — `ui4u:open`, `ui4u:close`, and `ui4u:change` with
  `detail: { value, name, option }`.
- **`ui-form` integration** — `checkValidity()` returns the same
  `{ valid, message, value, name }` shape as every other field, which is what
  lets one selector in `ui-form` cover all of them.

## 12. `ui-toolbar`

```html
<ui-toolbar label="Filters">
  <ui-input label="Search"></ui-input>
  <ui-dropdown label="Status"></ui-dropdown>
  <ui-button variant="primary" data-toolbar-end>Apply</ui-button>
</ui-toolbar>
```

- **API** — `configure({ label, orientation, srOnly })`, `focus()`,
  `refresh()`, plus `items`, `label`, `orientation` and `srOnly`.
- **One tab stop** — any number of controls inside is a single tab stop, so Tab
  enters and leaves the whole bar in one press. That is the entire point: a row
  of filters is otherwise unusable without tabbing through every field.
- **Arrow keys move within the bar** — Right/Down and Left/Up (following
  `orientation`), clamping at the ends rather than wrapping, and emitting
  `ui4u:navigate`. On a clamp the tab stop still follows the control the user is
  on, so tabbing out and back returns them where they left off. `Tab` is never
  intercepted, so the bar is not a keyboard trap.
- **Light DOM** — children stay where the author put them, so `ui-input`,
  `ui-button`, `ui-dropdown` and anything else keep working exactly as they do
  on their own.
- **In a `ui-layout`** — a toolbar may sit directly in any slot as a thin,
  non-resizable band: an app bar. It takes its height from its controls, is
  never given a splitter, and cannot be collapsed, because there is nothing to
  drag and no closed state.
- **On a `ui-tablegrid`** — a toolbar written before the `<table>` becomes that
  grid's own toolbar, the row of search, filters and bulk actions that belongs to
  the table rather than the page around it. It is left exactly where it was
  written and reached through the `toolbar` getter, never moved or removed by
  the grid.
- **Finding the controls** — a selector plus explicit `disabled` / `hidden` /
  `aria-hidden` checks, deliberately _not_ the geometry-filtering `focusables()`
  helper. That helper returns nothing at all without layout — including in this
  repo's own node:test harness — and a toolbar that cannot see its own controls
  outside a browser would be untestable and unverifiable.
- **A11y** — `role="toolbar"` named by `label`; `sr-only` hides the visible
  caption without losing the name.

## 13. Event bindings

Every component inherits a binding API from `UI4UElement`, so a consumer can
observe _and override_ without a framework.

```js
field.bind('change', (detail) => {
  if (!detail.amount) return false; // veto: the field changes nothing
});

field.configure({ bindings: { change: handler, input: handler } });
field.unbind('change', handler);
field.bindingNames; // ['change']
```

- **Runs before the action** — `runBinding(name, detail)` returns `false` when a
  handler vetoes, and the component skips its own behaviour. The guard sits at
  the top of the action, before any mutation, because a veto that lands after
  the state has already changed leaves the component half-changed — worse than
  no veto at all.
- **Two ways to veto** — return `false`, or call `preventDefault()` on the
  cancelable event handed to the handler.
- **Either spelling** — `bind('change', …)` and `bind('ui4u:change', …)` land in
  the same bucket, because both are natural at their call sites and silently
  registering under the wrong key would make a binding that never fires.
- **Robust** — handlers run in registration order and the first veto ends the
  chain; a handler that throws is reported and skipped rather than taking the
  component down; a handler may unbind itself mid-run.
- **Additive** — the existing `ui4u:*` events, their detail shapes and their
  ordering are untouched. A binding that returns anything else lets the default
  proceed and the event still fires, so "tell me" and "I am handling this" are
  both expressible without breaking existing consumers.
- **Honest about the limit** — where a component's default has already happened
  by the time its event fires (a tooltip that has already appeared), there is
  no veto, because pretending otherwise would be worse than saying so.

## 14. `ui-button-group`

A segmented control: several buttons that together represent **one choice**.

```html
<ui-button-group label="View" name="view" value="grid">
  <ui-button value="grid">Grid</ui-button>
  <ui-button value="table">Table</ui-button>
</ui-button-group>
```

- **API** — `configure({ label, name, value, hint, error, disabled, required })`,
  `select(value)`, `focus()`, `refresh()`, `checkValidity()`,
  `clearValidity()`, `reportValidity()`, and getters for `buttons`, `label`,
  `name`, `value`, `hint`, `error`, `disabled`, `required` and `srOnly`.
- **It wraps real `<ui-button>` children** rather than drawing its own, so the
  buttons keep their variant, size, loading and disabled behaviour and can
  carry icons.
- **One tab stop** — only the selected button (or the first enabled one when
  nothing is selected) keeps `tabindex="0"`; the rest are `-1`.
- **Arrow keys move _and_ select** — Right/Down and Left/Up, plus Home/End to
  jump to the ends. Movement **clamps at the ends and never wraps**.
- **The clamp needs an explicit `preventDefault()`** before the boundary check.
  Chromium's native radio handling wraps on arrow keys, so returning early at
  the end without preventing it lets the browser move the selection anyway. A
  unit test asserts `defaultPrevented === true` so the contract is pinned even
  though jsdom itself has no arrow behaviour to observe.
- **`Tab` is never intercepted**, so the group is not a keyboard trap. Clicking
  the selected button keeps it selected rather than toggling it off, because a
  choice is not a switch.
- **A11y** — `role="radiogroup"` on the group and `role="radio"` with
  `aria-checked` on each button. That is precisely what a segmented control is,
  and it is why it differs from `ui-radio-group`: the keyboard model is the
  same, but the presentation is one joined control rather than a stack of
  circles.
- **Validity** — `checkValidity()` returns the same
  `{ valid, message, value, name }` shape every other field uses, so `ui-form`
  discovers it with the same selector.
- **Bindings** — a `change` binding runs before the selection mutates and can
  veto it, leaving the group exactly as it was.
- **Events** — `ui4u:change` with `detail: { value, name }`.

## Definition of done, for every component

- [ ] `src/components/<name>/<name>.js` with JSDoc `@param`/`@returns` and one runnable `@example`
- [ ] `src/components/<name>/<name>.css` using only `--ui4u-*` tokens
- [ ] `src/components/<name>/index.js` exporting the class and its CSS
- [ ] Registered in `src/index.js`
- [ ] `test/components/<name>.test.js` — rendering, API, events, a11y, teardown
- [ ] `demo/<name>.html` driving itself with UI4U components, plus copyable source
- [ ] `e2e/<name>.spec.js` for real-browser behaviour
- [ ] Keyboard path, roles and ARIA state asserted in tests
- [ ] `npm run lint`, `npm test`, `npm run test:e2e` and the Pages deploy all green
