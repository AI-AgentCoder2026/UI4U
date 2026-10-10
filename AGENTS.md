# AGENTS.md

UI4U — a framework-agnostic UI library for mobile and desktop web, built from vanilla ES6 modules and bundled with esbuild. Modern, futuristic design, fully themeable.

## Setup commands

- Install deps:  `npm install`
- Build:         `npm run build`     — esbuild: `src/index.js` → `dist/` (ESM + UMD, minified)
- Dev:           `npm run dev`       — esbuild watch + static demo server
- Test:          `npm test`          — node:test unit specs
- Test (browser): `npm run test:e2e` — Playwright smoke tests over `demo/`
- Lint:          `npm run lint`      — ESLint flat config

## Project layout

- `src/index.js` — public entry point; the only module consumers import
- `src/core/` — framework primitives: DOM helpers, base class, event bus, component registry, tokens
- `src/components/<name>/` — one folder per component: `<name>.js`, `<name>.css`, `index.js`
- `src/styles/` — design tokens, themes, opt-in reset
- `demo/` — one playground page per component, doubling as living documentation
- `test/` — node:test unit specs mirroring `src/`, plus `test/helpers/` for the DOM harness
- `e2e/` — Playwright smoke specs (kept out of `test/` so `node --test` never discovers them)
- `scripts/` — esbuild build/dev scripts
- `docs/` — long-form component docs and screenshots

## Component contract

Every component follows the same shape — keep new ones consistent:

- Custom element `ui-<kebab-name>`, registered through `src/core/registry.js`; importing a module must have no side effects
- Zero runtime dependencies; no global CSS — styles live in the component folder, scoped to the element
- One options object, never long positional argument lists; every option documented in JSDoc
- Theming only through CSS custom properties prefixed `--ui4u-`; never hardcode color, spacing, radius, or shadow values in component CSS
- Mobile-first: base styles target small screens, desktop refinements go in container/`@media` queries
- Public API carries JSDoc `@param`/`@returns` plus one runnable `@example`

## Required components (roadmap, ongoing)

`layout` (resizable Top/Left/Right/Middle/Bottom panels) · `tabs` · `sidebar` · `grid` · `input` · `form` (validation) · `popup` (modal/dialog) · `tooltip`

Ship a component only when its demo page and tests exist; add the rest as the project grows.

## Code style

- ES2022 modules only in `src/` (`import`/`export`); no CommonJS, no transpiler-only syntax
- Types come from JSDoc typedefs — the repo ships types via JSDoc, not TypeScript
- ESLint flat config + Prettier: single quotes, 2-space indent, semicolons, 100-col width
- Never touch `document`/`window` at module top level; defer to component lifecycle so import and SSR stay safe
- Run `npm run lint` before committing

## Theming & design language

- Tokens live in `src/styles/tokens.css` as CSS custom properties; components reference tokens, never literals
- A theme is a token override (`[data-theme="dark"]`), never a fork of component CSS
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