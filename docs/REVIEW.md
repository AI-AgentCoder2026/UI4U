# Review and next features

Status of the library after `ui-tabs`, `ui-disclosure`, `ui-button`, `ui-tooltip`,
`ui-layout`, `ui-popup`, `ui-input` and `ui-tablegrid` shipped. `ui-form` and `ui-sidebar`
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

### 1. ~~CI never runs the e2e suite~~ — fixed

The Pages workflow gated on lint and unit tests only. Every real defect found
during this build was caught by Playwright, not by the unit suite:

- popup had **no positioning at all** (portalled nodes styled by a descendant
  selector that could never match) — unit tests passed throughout
- the mobile bottom sheet inherited `left: 50%` and hung off-screen
- separators never focused on click, so arrow keys did nothing
- `ui-input` copied its host `id`, producing duplicate IDs

None of those are observable to jsdom. `pages.yml` is now one workflow that
runs format, lint, unit **and** Playwright on every push and every pull
request, and only deploys on a push. Chromium is installed with
`--with-deps`, because without the system libraries it launches and then dies
on a missing shared object — which fails as a timeout rather than as the
obvious error.

### 2. The package cannot be tree-shaken

`sideEffects` names `./src/index.js`, but the published entry is a single
`dist/ui4u.esm.js` bundle. Importing one component registers all of them, so
there is nothing for a bundler to drop. Per-component subpath exports
(`ui4u/tabs`, `ui4u/popup`, …) plus per-component CSS files would let a consumer
pay only for what they use.

### 3. ~~Prettier is configured but not enforced~~ — fixed

`npm run format:check` used to fail across the tree. The tree is formatted and
the check is a CI step, so it cannot drift back.

### 4. No namespace escape hatch

Tags are hard-coded as `ui-*`. A consumer whose own markup already uses that
prefix has no way to rename it. A `UI4U.config({ prefix })` applied before
`install()` would fix that.

### 5. No automated accessibility check — fixed

The only audits in this repo were manual sweeps recorded in this file. There is
now `e2e/a11y.spec.js`: axe-core over all eighteen demo pages, in all three
themes, on both viewport projects. 108 checks.

It found five real defects on its first run, three of them in the library
rather than the demos:

- `ui-dropdown` set `aria-required` and `aria-invalid` on its `<button>`
  trigger. ARIA in HTML does not allow either attribute on that role, so a
  screen reader was entitled to ignore both. They now live on the listbox,
  whose role does support them.
- `--ui4u-text-subtle` measured 3.99:1 against `--ui4u-surface-3` — below AA
  for body text. It was introduced by the restyle below, and axe caught it.
- Three light-theme status colours (`--ui4u-warning`, `--ui4u-danger`,
  `--ui4u-success`) failed AA against the darker light surfaces.
- No demo page had a `<main>` landmark, and the per-page `<header>` became a
  `banner` nested inside it.

The lesson worth keeping: every one of these was invisible to 959 jsdom unit
tests and to a screenshot. **Solved, not eyeballed** — the colour values in
`tokens.css` now carry the worst-case ratio in a comment, because "looks
right on my screen" is how all four of them got in.

## Feature shortlist

Ranked by how much of a real interface they unblock.

The previous version of this list pointed at four things that had already
shipped — `ui-checkbox`, `ui-radio`, `ui-select` (that is `ui-dropdown`) and
`ui-calendar` (that is `ui-input type="date"`), plus `ui-pagination`, which is
built into `ui-tablegrid`. A roadmap that names shipped work is worse than no
roadmap, because it makes the real gaps look considered.

### Tier 1 — control gaps

| Feature        | Why it is next                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui-switch`    | **Shipped.** `role="switch"` with `aria-checked`. The distinction from `ui-checkbox` is semantic, not cosmetic: a checkbox is part of a submission, a switch applies at once.     |
| `ui-accordion` | Near-free on top of `ui-disclosure`, and one of the most requested patterns.                                                                                                      |
| `ui-textarea`  | **Shipped.** `ui-input` is single-line only, so every "notes" field in this repo was a `<p>` inside a disclosure. Bare Enter inserts a newline; commit is Ctrl/Cmd+Enter or blur. |

### Tier 2 — navigation and feedback

| Feature                      | Notes                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `ui-menu`                    | Dropdown/context menu with roving focus and typeahead. Reuses `core/position.js`.                 |
| `ui-toast`                   | Transient messages with correct live-region politeness. Absent from any UI library of this scope. |
| `ui-breadcrumb`              | Small, common, low-risk.                                                                          |
| `ui-skeleton`, `ui-progress` | The async primitives. Also the answer to the grid's missing loading state — see below.            |
| `ui-badge`, `ui-avatar`      | Cheap primitives that round out a design system.                                                  |

### Tier 2.5 — holes in components that already exist

Not new components: missing capability in shipped ones, which is a different
kind of debt.

- ~~**`ui-tablegrid` has no loading, empty or error state.**~~ **Fixed.** `loading`
  and `error` are authored; **empty is derived**, because an `empty` attribute
  would have to be set by hand and would be forgotten on exactly the pages that
  need it — the ones where a search just returned nothing. The three get three
  different messages, since they ask three different things of a reader: "no
  rows" invites creating one, "nothing matches" invites changing the search,
  and an error says what went wrong. While loading or failed the table is
  `aria-busy`/`aria-disabled` and both the toolbar and the header sort buttons
  go inert, because sorting rows that have not arrived is a lie about what is
  on screen.
- ~~**`ui-tablegrid` could not page, sort or search server-side.**~~ **Fixed.**
  `dataSource` is a seam, not a second grid: the same columns, toolbar and pager
  either way. The grid sends `{ offset, limit, sort, query, filters }` and
  renders the `rows` it gets back, so `total` — not the rows on screen — drives
  the pager. Stale responses are dropped by request id, because typing fires a
  request per keystroke and they do not come back in order. The source returns
  `<tr>` elements rather than data objects: how a date or a currency should look
  is the author's call.
- ~~**Only one sort column.**~~ **Fixed.** `sort="channel,downloads:desc"` is a
  priority list, each entry carrying its own direction; shift-click adds and
  removes keys. `aria-sort` stays on the primary header alone — putting it on
  every sorted column would announce three unsorted columns for one sort — and
  the rest get a visible `data-sort-rank` badge instead.
- **No virtualisation.** Fine at 200 rows, unusable at 10k. The data source is
  the answer for remote data; a large _local_ set still needs windowing.
- **No icon system.** Only `ui-sidebar` has an `icon` attribute, and it takes a
  text glyph. Every icon button in a real app needs an SVG slot.
- **No inline editing**, no column reorder or resize, no summary row, and no
  grid state persistence — column widths, order and search are forgotten on
  every page load.

### Encoding: do not edit files through the PowerShell shell

`Get-Content` in PowerShell 5.1 decodes with the system ANSI code page, so
reading a UTF-8 file and writing it back mangles every non-ASCII character —
`—` becomes `â€”`, `◈` becomes `â—ˆ`. It has silently corrupted three test
files in this repo's history, and the mangling survives a round-trip through
`git` because the result is still valid UTF-8.

Use the `Edit` tool, or `node scripts/fix-encoding.mjs <files…>`, which
reverses a Windows-1252 mis-read and is safe to run twice.

### Tier 3 — showcase pieces

These are not gaps, but they are what the "modern, futuristic" brief is
actually asking for.

- **`ui-command`** — a ⌘K command palette. It would compose `ui-popup`,
  `core/focus-trap.js`, `ui-input` and a listbox into a single demo, and it is
  the most recognisably "futuristic" component in a design system.
- **Theme studio** — a demo page that live-edits every `--ui4u-*` token and
  exports copy-paste CSS. Right now "fully themeable" is asserted in the docs
  and demonstrated by four coloured buttons; a studio would prove it.

Deliberately _not_ on this list, though they were on the previous one:
`ui-calendar` (shipped, inside `ui-input type="date"`), `ui-select` (that is
`ui-dropdown`) and `ui-pagination` (built into `ui-tablegrid`). A ⌘K palette is
also worth saying plainly: it is the most impressive item here and the least
useful. It composes components that already exist into a demo, and it adds no
capability.

## The visual identity

Restyled at the token layer: `tokens.css` and `themes.css` rewritten, with a small
retiering of the four components that were reading the translucent surface where a flat
one belongs.

**Indigo-slate ground, not neutral black.** Glass only reads as glass when there is colour
underneath it to refract, so every surface from `--ui4u-bg` up carries a blue cast. A
neutral ground makes the glass tier look like a grey smudge.

**Two accents that mean something.** Ice (`--ui4u-primary`) is structural; amber
(`--ui4u-warning`) is signal — the colour operations already assign to "degraded". Success,
danger and info are a separate axis from brand and stay quiet until something is wrong.
The trap here is near-black plus one acid accent, which is where "futuristic" defaults to
and where this went instead.

**Surface tiering.** This was the actual defect, and it was a token problem rather than a
component problem: `ui-tablegrid`, `ui-tabs`, `ui-disclosure` and `ui-input` were all
reading `--ui4u-surface-glass`, so a table, a tab strip, a section and a text field were all
translucent. A data surface cannot be translucent — its contrast ratio shifts with whatever
scrolls underneath it — so those four now read `--ui4u-surface*` and the translucent tier is
spent only on things that genuinely float. Glass on everything stops meaning anything.

**Two type voices.** `--ui4u-font-label` is the mono stack, applied to captions, eyebrows,
legends, table column heads and figures a reader compares against each other. Prose, button
text, tab labels and nav items stay in the sans. Zero cost: no webfont, no request, no
dependency, and it falls through to whatever monospace the platform has.

Four e2e tests were pinning literal token values (`--ui4u-radius-lg` is `16px`, the primary
is `rgb(56, 189, 248)`). They now compare the rendered value against the token, which tests
the contract — _the component reads the token_ — and survives the next palette change.

## Fixed while building the demo app

`demo/app.html` is a whole application built from the library, and putting a
`ui-sidebar` inside a `ui-layout` — the arrangement almost every real console
has — turned up a defect the unit tests could not see.

### A drawer trapped under its own backdrop

`ui-layout` is a glass surface, so it carries `backdrop-filter`. That makes it a
containing block for `position: fixed` descendants _and_ a stacking context. A
drawer-mode `ui-sidebar` inside one therefore had its `fixed` panel positioned
against the layout instead of the viewport, and — because the backdrop was
already portalled to `<body>` — painted **below** it. The drawer was visible but
completely inert: every click on its own links landed on the backdrop.

Two changes fix it:

- `UI4UElement.moveTo(parent)` relocates an element without firing
  `disconnectedCallback`/`connectedCallback`. `appendChild` on a connected node
  fires both, which would have rebuilt the sidebar from scratch — listeners,
  bindings, focus and all — every time the viewport crossed the breakpoint.
- `ui-sidebar` now moves its **host** to `<body>` in drawer mode, not just its
  backdrop. The host rather than the panel, so `ui-sidebar .ui4u-sidebar__*`
  keeps describing a sidebar wherever it is and no consumer selector breaks.

Focus-expansion was narrowed at the same time: a docked rail still springs open
when focus enters it (a collapsed rail is unreadable without labels), but a
closed drawer no longer does. Nothing a reader does can put focus inside a
closed drawer — its items are out of the tab order — so the only thing that
could trigger it was programmatic activation, and that should not slam a modal
sheet with a focus trap over the page.
