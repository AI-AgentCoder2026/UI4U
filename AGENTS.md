# AGENTS.md

UI4U — a framework-agnostic UI library for mobile and desktop web, built from vanilla ES6 modules and bundled with esbuild. Modern, futuristic design, fully themeable.

## Setup commands

- Install deps: `npm install`
- Build: `npm run build` — esbuild: `src/index.js` → `dist/` (ESM, CJS, global, minified ESM, combined CSS)
- Build (site): `npm run build:pages` — static demo site in `.pages/` for GitHub Pages
- Dev: `npm run dev` — esbuild watch + static demo server
- Test: `npm test` — node:test unit specs
- Test (browser): `npm run test:e2e` — Playwright smoke tests over `demo/`
- Lint: `npm run lint` — ESLint flat config

## Project layout

- `src/index.js` — public entry point; the only module consumers import
- `src/core/` — framework primitives: DOM helpers, base class, event bus, component registry, tokens
- `src/components/<name>/` — one folder per component: `<name>.js`, `<name>.css`, `index.js`
- `src/styles/` — design tokens, themes, opt-in reset
- `demo/` — one playground page per component, doubling as living documentation
- `test/` — node:test unit specs mirroring `src/`, plus `test/helpers/` for the DOM harness
- `e2e/` — Playwright smoke specs (kept out of `test/` so `node --test` never discovers them)
- `scripts/` — esbuild build/dev scripts, including the static Pages site builder
- `.github/workflows/` — Pages deployment, gated on lint + unit tests
- `docs/` — long-form component docs and screenshots

## Component contract

Every component follows the same shape — keep new ones consistent:

- Custom element `ui-<kebab-name>`, registered through `src/core/registry.js`; importing a module must have no side effects
- Zero runtime dependencies; no global CSS — styles live in the component folder, scoped to the element
- One options object, never long positional argument lists; every option documented in JSDoc
- Theming only through CSS custom properties prefixed `--ui4u-`; never hardcode color, spacing, radius, or shadow values in component CSS
- Anything positioned with `position: fixed` (tooltip, popup) must be portalled to `<body>` — an ancestor with `transform`, `filter` or `backdrop-filter` otherwise becomes its containing block. When a component _has_ to move itself for that reason, use `UI4UElement.moveTo(parent)`: plain `appendChild` fires `disconnectedCallback`/`connectedCallback` and rebuilds the component from scratch
- Mobile-first: base styles target small screens, desktop refinements go in container/`@media` queries
- Public API carries JSDoc `@param`/`@returns` plus one runnable `@example`
- **A control that acts immediately is a `ui-switch`, not a `ui-checkbox`.** The difference is `role="switch"` with `aria-checked`, and it is semantic rather than cosmetic: a checkbox is part of a submission, a switch is not
- **A new field type joins `ui-form`'s `FIELD_SELECTOR` in the same commit.** The form discovers fields by that list, and a control missing from it is silently unvalidated — the worst kind of failure, because the form looks like it is working

## Required components (roadmap, ongoing)

Shipped: `tabs` · `disclosure` · `button` · `button-group` · `tooltip` · `layout` · `popup` · `input` · `textarea` · `checkbox` · `switch` · `radio` · `dropdown` · `tablegrid` · `form` · `sidebar` · `toolbar` · `card` · `cards`

Roadmap: none outstanding. Next candidates and the audit findings live in `docs/REVIEW.md`.

`demo/app.html` (**Beacon**) is not a component — it is the whole library wired
into one console. `e2e/app.spec.js` asserts that every component above appears
somewhere in it, so a component that cannot be expressed there is a gap in the
component, not a licence to hand-roll something.

The delivery plan, with per-component API and acceptance criteria, lives in `docs/ROADMAP.md`.

Ship a component only when its demo page and tests exist; add the rest as the project grows.

- Never use `innerHTML` — build nodes or set `textContent`. An error summary renders
  field labels and validation messages, which can contain user input.

## Demo pages

- `demo/*.html` doubles as local playground **and** the published GitHub Pages site
- Demos must drive themselves with UI4U components wherever one exists — never raw `<select>` or hand-rolled widgets. `e2e/tabs.spec.js` asserts the tabs demo contains zero `<select>` elements
- Shared demo chrome lives in `demo/demo.css` and `demo/demo.js` — do not duplicate page styles per demo
- **The demo shell is itself built from UI4U.** The navigation bar is a `ui-toolbar` of `ui-button`s, the index catalogue is a `ui-cards` grid, and every chrome control is a `ui-button`. The site is the library's own showcase — if the chrome can be expressed as a component, it must be. `e2e/shell.spec.js` and `e2e/index.spec.js` assert this, so a regression to hand-written markup fails the build. A component that cannot yet express something the shell needs is a gap in the component, not a licence to hand-roll it
- **A demo's own action buttons are `ui-button` too** — "Toggle required", "Validate", "Reset" and friends. The one exception is a control that is _itself the subject_: the `data-accent` swatches demonstrating the platform's native `accent-color`, and the native targets a tooltip or popup demo attaches to. Wrapping those in `ui-button` would erase what the page is demonstrating
- Class names carry the `ui4u-` prefix (`ui4u-tabs__list`, `ui4u-disclosure__summary`), matching the CSS custom property prefix
- Add a `<figure class="demo-code">` with `<code data-highlight="html|js|css">` for copyable samples; `demo.js` tokenises and injects them with no dependency
- Reference assets with absolute paths (`/dist/…`, `/src/…`); `scripts/build-pages.mjs` flattens and rewrites them to relative for Pages
- If you add a new asset reference, add it to `REWRITES` in `scripts/build-pages.mjs` or it will 404 on the published site
- `<script>` content is raw text — write `=>` literally. `=&gt;` belongs only inside `<pre>` samples, and getting it wrong breaks every import in the block with no visible error
- Never wrap an interactive component in a `<label>`; labels must not contain buttons or other controls
- `e2e/tabs.spec.js` asserts demo pages raise no script errors; keep that assertion green
- Verify a new demo locally with `npm run build:pages`, then confirm it renders before pushing

## Code style

- ES2022 modules only in `src/` (`import`/`export`); no CommonJS, no transpiler-only syntax
- Types come from JSDoc typedefs — the repo ships types via JSDoc, not TypeScript
- ESLint flat config + Prettier: single quotes, 2-space indent, semicolons, 100-col width
- Never touch `document`/`window` at module top level; defer to component lifecycle so import and SSR stay safe
- Run `npm run lint` before committing

## Theming & design language

- Tokens live in `src/styles/tokens.css` as CSS custom properties; components reference tokens, never literals
- A theme is a token override (`[data-theme="dark"]`), never a fork of component CSS
- **Surface tiering** — a _data_ surface (something you read into: `ui-tablegrid`, `ui-disclosure`, `ui-input`) reads `--ui4u-surface`/`--ui4u-surface-2` and stays flat and opaque, so its contrast ratio does not shift with what scrolls underneath. A _float_ (something genuinely above the page: `ui-popup`, `ui-tooltip`, `ui-dropdown`'s panel, secondary `ui-button`) reads `--ui4u-surface-glass*`. Glass on everything is the reason a design system reads as a template; keep the translucent tier scarce or it stops meaning anything
- **The palette is chromatic, not neutral.** The ground is indigo-slate at every step so the glass tier has a hue to refract. Two accents carry meaning: **ice** (`--ui4u-primary`) is structural, **amber** (`--ui4u-warning`) is signal. Everything else is status, a separate axis from brand, and stays quiet until something is actually wrong
- **Type has two voices.** Prose is the system sans. Captions, eyebrows, legends, column heads and figures a reader compares against each other use `--ui4u-font-label`, which is the mono stack. Never mono for button text, tab labels or nav items — a sentence in mono is a costume, not a choice
- Visual language: modern/futuristic — glass surfaces, restrained glow, generous spacing — expressed through tokens
- Motion stays under 200ms and honors `prefers-reduced-motion`

## Testing instructions

- Unit: `npm test` — bare `node --test`; discovers `test/**/*.test.js` against a jsdom harness
- E2E/browser: `npm run test:e2e` (Playwright against `demo/`, mobile + desktop projects)
- Run `npx playwright install chromium` once before the first e2e run
- Component modules under `src/components/` must not import CSS — only their `index.js` does, so node:test can import the module directly
- `UI4UElement` captures `globalThis.HTMLElement` at module evaluation, so tests must call `setupDom()` before dynamically importing any component
- New behavior needs a test that mirrors the source path — `test/components/tabs.test.js` for `src/components/tabs/`
- Accessibility is part of done: keyboard navigation, focus trapping in popups, and correct ARIA roles must be asserted in tests
- **A colour is solved, not eyeballed.** Any `--ui4u-*` colour that renders text must clear 4.5:1 against _every_ surface it can land on. Put the worst-case ratio in a comment beside the value, because "it looks fine on my screen" is how the first four of these got in
- `e2e/a11y.spec.js` runs axe-core over every demo page in all three themes on both viewports. It is a CI gate, and it is not advisory — it has caught ARIA attributes on roles that do not allow them, which no screenshot and no jsdom test will ever show
- All tests pass before a PR opens

## PR & commit conventions

- Branch from `main`; never push to `main` directly
- Conventional commits: `feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`
- Keep one component per PR where practical, and update its demo page in the same PR
- Open the PR with `gh pr create` once CI is green (note: `gh` is not installed on this machine — install it or push branches and open PRs in the web UI)

## Security

- Never commit secrets — `.env` stays in `.gitignore`
- No `innerHTML` with untrusted input: build DOM nodes or set `textContent`. Popup, tooltip, and grid cell content may come from users
- `dist/` is build output; commit it only as part of the release process
