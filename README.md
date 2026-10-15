# UI4U

A framework-agnostic, mobile-first UI library for modern web apps.

Vanilla ES6 modules. Zero runtime dependencies. Custom elements throughout, so it drops
into any stack — or none. Every visual value is a `--ui4u-*` custom property, which makes
theming a token override rather than a CSS fork.

```
Nineteen components · 284.9 kB minified (~91.2 kB gzip) including tokens and themes
```

## Status

Early, and deliberately incremental. Shipped:

| Component         | Demo                                               | Notes                                                                                                                          |
| ----------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `ui-tabs`         | [`demo/tabs.html`](demo/tabs.html)                 | Keyboard nav, automatic + manual activation, 3 variants                                                                        |
| `ui-disclosure`   | [`demo/disclosure.html`](demo/disclosure.html)     | Collapsible sections, real `<button>` trigger, `aria-expanded`, nesting                                                        |
| `ui-button`       | [`demo/button.html`](demo/button.html)             | 5 variants, 3 sizes, loading and disabled states                                                                               |
| `ui-tooltip`      | [`demo/tooltip.html`](demo/tooltip.html)           | Hover + focus, viewport flipping, `Escape` to dismiss                                                                          |
| `ui-layout`       | [`demo/layout.html`](demo/layout.html)             | All five regions resizable, recursive, keyboard + pointer splitters                                                            |
| `ui-popup`        | [`demo/popup.html`](demo/popup.html)               | Modal with a real focus trap, plus popover and drawer modes                                                                    |
| `ui-input`        | [`demo/input.html`](demo/input.html)               | Native input preserved, plus `amount` (k/m/b) and `date` (picker) modes                                                        |
| `ui-form`         | [`demo/form.html`](demo/form.html)                 | Validation, inline errors, `role="alert"` error summary                                                                        |
| `ui-sidebar`      | [`demo/sidebar.html`](demo/sidebar.html)           | Collapsible regions, off-canvas drawer on narrow screens                                                                       |
| `ui-tablegrid`    | [`demo/tablegrid.html`](demo/tablegrid.html)       | Column groups, multi-column sort, search, filters, selection, copy, paging, loading/empty/error, and a server-side data source |
| `ui-checkbox`     | [`demo/checkbox.html`](demo/checkbox.html)         | Real `<input type="checkbox">`, `indeterminate`, shared validation                                                             |
| `ui-radio`        | [`demo/radio.html`](demo/radio.html)               | Radio group with one tab stop and arrow-key movement                                                                           |
| `ui-dropdown`     | [`demo/dropdown.html`](demo/dropdown.html)         | Listbox with type-ahead, arrow-key navigation and multi-select                                                                 |
| `ui-toolbar`      | [`demo/toolbar.html`](demo/toolbar.html)           | A bar of controls that is one tab stop; plugs into a layout or a grid                                                          |
| `ui-button-group` | [`demo/button-group.html`](demo/button-group.html) | Segmented control: buttons acting as one choice, one tab stop                                                                  |
| `ui-card`         | [`demo/card.html`](demo/card.html)                 | One item in a grid: eyebrow, heading, body, actions, stretched link                                                            |
| `ui-cards`        | [`demo/card.html`](demo/card.html)                 | The responsive grid those cards sit in — several per row, one on a phone                                                       |
| `ui-switch`       | [`demo/switch.html`](demo/switch.html)             | `role="switch"`: a setting that applies at once, not on submit                                                                 |
| `ui-textarea`     | [`demo/textarea.html`](demo/textarea.html)         | Multiline text, optional auto-grow, `ui4u:change` on commit                                                                    |

![ui-tablegrid with column groups, selection and advanced search](docs/screenshots/tablegrid-desktop-dark.png)

### Beacon — the demo app

[`demo/app.html`](demo/app.html) is not a component page. It is a working release-and-incident
console — layout shell, sidebar, four views, a data grid, a validated form, a confirm modal —
built from every component above and nothing else. No framework, no build step for the page, and
no `innerHTML`: the views are assembled with `document.createElement`, because a release title
is data.

It is also the library's regression suite in disguise. Putting a `ui-sidebar` inside a
`ui-layout` — the arrangement almost every real console has — found a drawer trapped under its
own backdrop, which is written up in [`docs/REVIEW.md`](docs/REVIEW.md#a-drawer-trapped-under-its-own-backdrop).

Every component from the original roadmap has shipped. What to build next, and what the
audits found, is written up in [`docs/REVIEW.md`](docs/REVIEW.md).

## Install

```bash
npm install
```

## Use

### ES modules

```js
import 'ui4u';
```

```html
<ui-tabs label="Project sections">
  <ui-tab label="Overview">…</ui-tab>
  <ui-tab label="Activity">…</ui-tab>
  <ui-tab label="Settings">…</ui-tab>
</ui-tabs>

<ui-disclosure summary="Advanced">
  <p>Anything can go in here.</p>
</ui-disclosure>

<ui-button variant="primary" type="submit">Save</ui-button>
```

```html
<ui-layout>
  <ui-panel slot="top" label="Header" size="3.5rem" min="2rem" max="10rem" resizable>…</ui-panel>
  <ui-panel slot="left" size="16rem" min="10rem" resizable>…</ui-panel>
  <ui-panel slot="center">…</ui-panel>
  <ui-panel slot="bottom" label="Status" size="4rem" resizable>…</ui-panel>
</ui-layout>
```

Every region gets its own handle. Column separators (left / centre / right) are
`aria-orientation="vertical"` and respond to <kbd>←</kbd> <kbd>→</kbd>; row separators
(top / centre / bottom) are `aria-orientation="horizontal"` and respond to
<kbd>↑</kbd> <kbd>↓</kbd>. Both carry `aria-valuenow` plus `aria-valuemin`/`aria-valuemax`
when a bound is actually enforced. <kbd>Home</kbd>/<kbd>End</kbd> jump to the limits,
<kbd>Enter</kbd> collapses, double-click resets.

Layouts nest — any slot can hold another `ui-layout`, so a sidebar can be a
workspace of its own with its own centre, left/right and top/bottom:

```html
<ui-layout>
  <ui-layout slot="left" label="Explorer" size="260" min="180" resizable>
    <ui-panel slot="left" size="92" resizable>Rail</ui-panel>
    <ui-panel slot="center">Explorer body</ui-panel>
    <ui-panel slot="bottom" size="44">Filters</ui-panel>
  </ui-layout>

  <ui-panel slot="center">Editor</ui-panel>
  <ui-panel slot="bottom" size="4rem">Status</ui-panel>
</ui-layout>
```

Each nested layout keeps its own separators, sizes and keyboard step, and
`reset()` restores only that subtree. Events bubble, so `ui4u:resize` and
`ui4u:collapse` each carry the `layout` that emitted them:

```js
layout.addEventListener('ui4u:resize', (e) => {
  if (e.detail.layout !== layout) return; // a nested layout resized
});
```

### Script tag

```html
<link rel="stylesheet" href="/node_modules/ui4u/dist/ui4u.css" />
<script src="/node_modules/ui4u/dist/ui4u.global.js"></script>
```

### Individual components

Component modules have no import side effects, so you can register only what you use:

```js
import { Tabs, Tab, define, injectStyle } from 'ui4u';
import tabsCss from 'ui4u/src/components/tabs/tabs.css'; // bundler only

injectStyle('ui-tabs', tabsCss);
define('ui-tab', Tab);
define('ui-tabs', Tabs);
```

## API

Every component is a custom element configured through attributes and one options
object. Options are documented with JSDoc on the class; every public event is prefixed
`ui4u:`.

```js
const tabs = document.querySelector('ui-tabs');

tabs.configure({ variant: 'underline', activation: 'manual', active: 1 });

tabs.addEventListener('ui4u:change', ({ detail }) => {
  console.log(detail.index, detail.label);
});
```

## Theming

Themes are token overrides. Set `data-theme` on `<html>` to switch, or override any token
directly.

````html
<html data-theme="dark"></html>

Built-in themes: `light`, `dark`, `contrast`, plus an automatic `prefers-color-scheme`
fallback when no `data-theme` is set.

### Accents and grounds

The theme decides light or dark; the **accent** decides what "our" means. Set it on
`<html>` alongside the theme:

```html
<html data-theme="dark" data-accent="mint"></html>
```

| `data-accent` | Reads as                                                             |
| ------------- | -------------------------------------------------------------------- |
| `ice`         | A pale, desaturated blue. The default — structural, never a beacon.  |
| `mint`        | Green-teal. Calm, and it reads as "healthy" without claiming status.  |
| `violet`      | Indigo-purple. The more expressive of the colourful options.           |
| `rose`        | Pink-red. Warm, and still distinct from `--ui4u-danger`.             |
| `graphite`    | No hue at all, for a product that wants the chrome to disappear.      |

There is deliberately **no gold**. `--ui4u-warning` is amber, and an amber
"selected" state beside an amber "degraded" state makes both mean nothing — so
offering one here would undo the rule the rest of the library keeps.

Each accent publishes a dark-side and a light-side value and the theme picks,
because a dark-mode ice blue on a white page is unreadable. You do not have to
think about it; you do have to be able to see all five, which is why the demo
shell carries swatches for them rather than a menu.

The **ground** is neutral by default. `data-ground="tinted"` tints every surface
with the accent's hue, which is what makes glass read as glass — and is a lot of
hue to look at over a long page, so it is a setting rather than a default.

```html
<html data-theme="dark" data-accent="rose" data-ground="tinted"></html>
```

Every accent, on every surface, in both themes, is proved to clear WCAG AA by
`scripts/check-palette.mjs`, which prints the worst-case ratio for each and exits
non-zero on a miss. That is what keeps the guarantee true as colours change.

### The palette

| Token                                              | Role                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--ui4u-primary`                                   | Structural — chosen, selected, active. Desaturated on purpose: an accent that saturates turns every selected state into a beacon.   |
| `--ui4u-warning`                                   | **Signal.** Live, degraded, needs attention. Borrowed from the colour operations already assigns to "degraded".                            |
| `--ui4u-success` / `--ui4u-danger` / `--ui4u-info` | Status, a separate axis from brand. Quiet until something is actually wrong.                                                               |
| `--ui4u-accent`                                    | The second brand voice. Structural, never loud.                                                                                            |

Surfaces are tiered, and the tier is the thing that keeps it from reading as a template:

- **Flat and opaque** (`--ui4u-surface`, `--ui4u-surface-2`) for anything you read _into_ — a table, a section, a text field. A translucent data surface changes its own contrast ratio as content scrolls under it.
- **Translucent** (`--ui4u-surface-glass*`) for anything that genuinely floats above the page — a popup, a tooltip, a dropdown panel, a secondary button. Glass on everything stops meaning anything.

Type has two voices, and which one a string gets is a decision, not a default. Prose is the
system sans. Captions, eyebrows, legends, table column heads and any figure a reader has to
compare against another figure use `--ui4u-font-label`, which is the mono stack — console
vernacular, and free: no webfont, no network request, no dependency. Button text, tab labels
and nav items stay in the sans, because a sentence set in mono is a costume rather than a
choice.

Motion honours `prefers-reduced-motion` — every `--ui4u-duration-*` token collapses to
`0ms` in one place, and components read those tokens rather than hardcoding timings.

## Development

```bash
npm install
npm run dev        # esbuild watch + demo server → http://localhost:5173
npm run build      # dist/: ESM, CJS, global build, minified ESM, combined CSS
npm run build:pages # static demo site in .pages/ for GitHub Pages
npm test           # node:test
npm run test:e2e   # Playwright + axe-core a11y gate (run `npx playwright install` once first)
npm run lint       # ESLint flat config
```

## Demo

The demo is published at **https://ai-agentcoder2026.github.io/UI4U/** — the `demo/` pages are served straight from `main` via the `Deploy demo to GitHub Pages` workflow, which runs lint and unit tests before every deploy.

Build outputs:

| File                   | For                                              |
| ---------------------- | ------------------------------------------------ |
| `dist/ui4u.esm.js`     | bundlers, `import`                               |
| `dist/ui4u.cjs`        | Node `require`                                   |
| `dist/ui4u.global.js`  | `<script>` tags, exposes `window.UI4U`           |
| `dist/ui4u.esm.min.js` | bundlers, minified                               |
| `dist/ui4u.css`        | optional stylesheet instead of runtime injection |

## Contributing

Read [`AGENTS.md`](AGENTS.md) first — it defines the component contract, code style,
theming rules and testing expectations. A component is not done until it has a demo page
and tests.

## License

MIT
````
