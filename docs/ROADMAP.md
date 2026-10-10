# UI4U roadmap

Delivery plan for the remaining components. Each one ships only when its demo
page and tests exist — see the component contract in [`AGENTS.md`](../AGENTS.md).

## Status

| Phase | Component | State |
| --- | --- | --- |
| 1 | `ui-button` | ✅ shipped |
| 1 | `ui-tooltip` | ✅ shipped (also brought in `core/position.js`) |
| 1 | `ui-popup` | ⏳ next — needs `core/focus-trap.js` |
| 2 | `ui-input` | ⏳ planned |
| 2 | `ui-form` | ⏳ planned |
| 3 | `ui-grid` | ⏳ planned |
| 3 | `ui-sidebar` | ⏳ planned |
| 3 | `ui-layout` | ✅ shipped (also brought in `core/pointer.js` + `core/size.js`) |

Shared helpers extracted so far: `core/position.js`, `core/pointer.js`,
`core/size.js`. Still to extract: `core/focus-trap.js` (`ui-popup`, then
`ui-sidebar`). `dom.js` currently still owns `focusables()`; it moves when
`ui-popup` lands.

## Build order

The order is driven by dependencies, not by importance.

| Phase | Component | Why here |
| --- | --- | --- |
| 1 | `ui-button` | Everything interactive needs it; form, popup and input all submit through it |
| 1 | `ui-tooltip` | First consumer of the positioning helper, which popup then reuses |
| 1 | `ui-popup` | Needs the focus trap; sidebar's mobile drawer will reuse it |
| 2 | `ui-input` | Pure presentational field, no behaviour to get wrong |
| 2 | `ui-form` | Depends on `ui-input`'s validity surface |
| 3 | `ui-grid` | CSS-only, low risk, useful in every other demo |
| 3 | `ui-sidebar` | Reuses popup's drawer behaviour on narrow screens |
| 3 | `ui-layout` | Largest surface; benefits from grid and sidebar being settled |

## Shared infrastructure to extract first

| Module | Purpose | Needed by |
| --- | --- | --- |
| `core/focus-trap.js` | Tab containment + focus restoration | popup, sidebar |
| `core/position.js` | Placement, flipping, clamping to viewport | tooltip, popup |
| `core/pointer.js` | Unified pointer/touch drag with capture | layout, sidebar |
| `core/size.js` | Clamp a number between a min and max | layout, sidebar |

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

## 6. `ui-grid`

```html
<ui-grid columns="3" min="18rem" gap="md">…</ui-grid>
```

- **API** — `configure({ columns, min, gap, align, justify })`
- **CSS-first** — auto-fit columns, so it is fluid without JS. Optional fixed
  `columns` for grids that genuinely need a column count.
- **A11y** — a plain container; no roles imposed on consumer content.

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
- **Splitters** — `role="separator"` with `aria-orientation`,
  `aria-valuenow/min/max`, and full keyboard support: arrows resize by step,
  `Home`/`End` jump to the limits, `Enter` collapses and restores.
  Double-click resets to the default size.
- **Pointer input** — unified mouse/touch/pen drag through pointer capture, so
  a drag that leaves the splitter does not stick.
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