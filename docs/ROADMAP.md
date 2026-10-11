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

- **API** — `configure({ label, type, value, placeholder, hint, error, size, required, disabled, readonly })`
- **Wraps a real `<input>`** — light DOM, so native autofill, IME composition
  and mobile keyboards keep working. Never a controlled imitation.
- **A11y** — `<label for>`, `aria-describedby` chaining hint and error,
  `aria-invalid` when erroring. Label is visually hidden when `srOnly` is set.
- **Events** — `ui4u:input`, `ui4u:change`.

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
