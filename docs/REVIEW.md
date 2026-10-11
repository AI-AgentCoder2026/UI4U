# Review and next features

Status of the library after `ui-tabs`, `ui-disclosure`, `ui-button`, `ui-tooltip`,
`ui-layout`, `ui-popup`, `ui-input` and `ui-grid` shipped. `ui-form` and `ui-sidebar`
complete the original roadmap.

## What the audits found

I ran four mechanical audits across the codebase. Three came back clean; the
results are recorded here so the next change does not have to repeat them.

| Audit                                                | Result                                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Portalled nodes styled via host-descendant selectors | **Clean.** No `ui-*[data-x] .portalled` rules remain — the bug that disabled all popup styling. |
| Raw `<select>` in demo controls                      | **Clean.** Every demo drives its options through UI4U components.                               |
| Hardcoded colours in component CSS                   | **Clean.** The one `rgba()` hit was inside a JSDoc example, not a rule.                         |
| UTF-8 integrity                                      | **Clean.** No double-encoded characters in any tracked file.                                    |

### Accessibility sweep

Every demo was loaded in Chromium and each interactive control resolved for an
accessible name, plus heading-order and `lang` checks. Two flags, both benign:

- `ui-tooltip`: the host is given a `tabindex` when its children are not
  focusable — it then _is_ the trigger and carries `aria-describedby`. A
  description, not a name, is correct for a tooltip.
- `ui-layout`: an `h1 → h3` heading jump, now `h2`.

## Findings worth acting on

### 1. CI never runs the e2e suite

The Pages workflow gates on lint and unit tests only. Every real defect found
during this build was caught by Playwright, not by the unit suite:

- popup had **no positioning at all** (portalled nodes styled by a descendant
  selector that could never match) — unit tests passed throughout
- the mobile bottom sheet inherited `left: 50%` and hung off-screen
- separators never focused on click, so arrow keys did nothing
- `ui-input` copied its host `id`, producing duplicate IDs

None of those are observable to jsdom. `npm run test:e2e` should be a CI gate,
with `npx playwright install --with-deps chromium` added to the build job.

### 2. The package cannot be tree-shaken

`sideEffects` names `./src/index.js`, but the published entry is a single
`dist/ui4u.esm.js` bundle. Importing one component registers all of them, so
there is nothing for a bundler to drop. Per-component subpath exports
(`ui4u/tabs`, `ui4u/popup`, …) plus per-component CSS files would let a consumer
pay only for what they use.

### 3. Prettier is configured but not enforced

`npm run format:check` currently fails across the tree. ESLint is clean, so this
is cosmetic — but a declared tool that always fails will be ignored, then
respected by nobody. Run `prettier --write` once and gate on it.

### 4. No namespace escape hatch

Tags are hard-coded as `ui-*`. A consumer whose own markup already uses that
prefix has no way to rename it. A `UI4U.config({ prefix })` applied before
`install()` would fix that.

## Feature shortlist

Ranked by how much of a real interface they unblock.

### Tier 1 — control gaps

| Feature                    | Why it is next                                                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui-select`                | Demos currently use `ui-tabs` as a segmented control, which is fine for two or three options and wrong for fifteen. Needs the listbox pattern, typeahead and `aria-activedescendant` or roving focus. |
| `ui-switch`                | `role="switch"` with `aria-checked`. `ui-input` has no boolean control and the input demo keeps reaching for raw checkboxes.                                                                          |
| `ui-checkbox` / `ui-radio` | Same reasoning: wrap the native control so validation and theming stay consistent.                                                                                                                    |
| `ui-accordion`             | Near-free on top of `ui-disclosure`, and one of the most requested patterns.                                                                                                                          |

### Tier 2 — navigation and feedback

| Feature                                                             | Notes                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `ui-menu`                                                           | Dropdown/context menu with roving focus and typeahead. Reuses `core/position.js`.                 |
| `ui-toast`                                                          | Transient messages with correct live-region politeness. Absent from any UI library of this scope. |
| `ui-table`                                                          | Sortable, selectable data grid; `ui-grid` covers layout but not semantics.                        |
| `ui-pagination`, `ui-breadcrumb`                                    | Small, common, low-risk.                                                                          |
| `ui-progress`, `ui-spinner`, `ui-skeleton`, `ui-badge`, `ui-avatar` | Cheap primitives that round out a design system.                                                  |

### Tier 3 — showcase pieces

These are not gaps, but they are what the "modern, futuristic" brief is
actually asking for.

- **`ui-command`** — a ⌘K command palette. It would compose `ui-popup`,
  `core/focus-trap.js`, `ui-input` and a listbox into a single demo, and it is
  the most recognisably "futuristic" component in a design system.
- **Theme studio** — a demo page that live-edits every `--ui4u-*` token and
  exports copy-paste CSS. Right now "fully themeable" is asserted in the docs
  and demonstrated by four coloured buttons; a studio would prove it.
- **`ui-calendar`** — genuinely useful, and a large surface. Only worth it once
  the tier 1 and 2 gaps are closed.
