# Phase 1: store buttons

## Gate

- `bun run --cwd apps/landing test`: 5 files, 63 tests passed (the `detectInstall` table and the `index.html` URL pin included).
- `bun run --cwd apps/landing typecheck`: exit 0. `bun run lint`: exit 0 (27 warnings, the same as the base; the 3 `noDescendingSpecificity` warnings in `page.css` predate this change).
- Build: `vite build` exit 0, run after `ensure-release-json.ts` and `build-legal.ts`. `bun run build` itself failed once in `prebuild` with `GitHub API 403 rate limit exceeded`, the build-time fetch that Phase 2 deletes.
- Puppeteer check against `vite preview` (scratch script, the locked `puppeteer` 25.8.0 from `apps/extension`, `--no-sandbox` as the repo's e2e fixture launches it): Chrome, Edge, Brave (navigator flag injected), Firefox UA, iPhone Safari, JavaScript off at desktop and phone width, and Chrome at 375 px. Each asserts the visible store links per CTA, their text and `href`, the other-store link, that no hidden link takes focus, no console or CSP error, and no horizontal overflow. Result: `ALL ASSERTIONS PASSED`.

## Findings

- **Hidden buttons.** `.btn { display: inline-flex }` outranks the browser's `[hidden]` rule, as the plan audit predicted. `.btn[hidden] { display: none }` fixes it without `!important`, which Biome flags (`noImportantStyles`).
- **Phone hero clipped in the fallback state.** The hero is a fixed 640 px on phones with the plate absolutely positioned at its bottom. A third stacked button pushed the plate's top above the hero, so the headline sat against the nav. Even the one-button state covered the REC label at 375 px, which the CSS comment says stays visible. Fix: on ≤ 900 px the hero is a padded flex column with `min-height: 640px`, and the plate flows at its bottom. The feed resizes with its host through the existing ResizeObserver.
- **Page scrolled sideways on phones (pre-existing).** The record panel's ledger lines are `white-space: pre`; the panel's `overflow: hidden` clips them, but the grid item still takes their width as its minimum, so the page was 494 px wide at 375 px. Fix: `min-width: 0` on `.rec-pan`. Shipped as its own commit for the owner to keep or drop.
- **Check-script trap.** Under Puppeteer's mobile emulation (`isMobile: true`), `innerWidth` grows to the content width, so `scrollWidth > innerWidth` never fires. Compare against the viewport width that was set.
