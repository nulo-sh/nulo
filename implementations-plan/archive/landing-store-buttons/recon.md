# Recon: landing store buttons

Read against `origin/dev` at `e49e4ce`. One read-only sweep agent plus direct reads.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Store listing URLs | Only as text: `cliff.toml:31-32`, `legal/terms.md:33-34` (both by item id, so a store rename changes nothing). No constant in `packages/*` or `apps/extension/src` (searched `chromewebstore\|addons\.mozilla\|jlmiaokmjoicmclelpiiocdhncddkdmc\|3077967`, `storeUrl\|STORE_URL\|LISTING`). | build new: one module in the landing. The landing depends on `@nulo/design` and `@nulo/legal` only, and neither should own store URLs. |
| Browser detection | `apps/extension/src/utils/browser-surface.ts` `isFirefox()` reads `chrome.runtime.getBrowserInfo`: extension-only, and importing an app's `src/` is a layering violation. `packages/design/src/composables/outside.ts:28` reads the UA for iOS touch only. Nothing uses `userAgentData` or `navigator.brave` (searched `userAgentData\|navigator\.brave\|isFirefox\|navigator\.userAgent` over `packages apps scripts`). | build new: a pure function in the landing, unit-tested in node. |
| DOM wiring by data attribute | `apps/landing/src/feed-dom.ts` `mountPage()` queries `[data-feed]`, `[data-record]`, `[data-clock]` with null guards and enhances server-rendered markup (`startRecord` replaces children, `startClock` sets `textContent`). | adapt: same pattern, own module, called from `main.ts`. |
| Button and CTA styles | `page.css`: `.btn` (:120), `.btn.ghost` (:138), `.cta` flex-wrap row (:160), `.cta small` mono uppercase (:167), `.bar .btn` (:220); `.bar nav a:not(.btn)` hidden at ≤ 900 px (:673). | reuse as-is; add only a link style inside `.cta small`. |
| Unit-test shape | `src/feed.test.ts`, `scripts/headers.test.ts`, `scripts/legal-pages.test.ts`: pure functions, inline fixtures, `environment: "node"` (`vitest.config.ts`). No jsdom in the landing. | reuse: a table test over user-agent strings. No DOM test dependency. |
| Headless browser for checks and the social image | `puppeteer` in `apps/extension/package.json` devDependencies; no Playwright. | reuse ad hoc from a scratch script; never a landing dependency. |

## The release machinery to delete

- `apps/landing/scripts/fetch-latest-release.ts`, `scripts/ensure-release-json.ts`, `scripts/release-html-plugin.ts`, `src/release.ts`, `src/release-resolver.ts`, `src/release-resolver.test.ts`.
- `apps/landing/package.json`: `predev`, `prebuild`, `pretypecheck`, `pretest` call the two release scripts; `build-legal.ts` stays in `predev`/`prebuild`.
- `apps/landing/vite.config.ts:6,33`: the plugin import and use. `apps/landing/.gitignore:3`: `src/generated/release.json`. `src/generated/.gitkeep` stays (legal pages use the folder).
- `apps/landing/index.html:44,70,199,212`: four `{{release_url}}` links.
- `.github/workflows/pr-quick.yml:289-291` (comment) and `:304-305` (the stub step). No `scripts/ci-cd/**` test pins that step.

## Docs that describe the coupling

- `apps/landing/README.md:13,17,18` (file-map rows) and `:42` (a release reaches the page only after a push or a dashboard re-run).
- `CLAUDE.md:538` ("the landing (`nulo.sh`) redeployed"), `:546` (table row, "lags a release"), `:595` (Stable step 7: re-run the landing build), `:637` (prerelease step 7, "links stable releases only"), `:689` (troubleshooting row).
- `CI.md:32` ("against a stub release file"), `:107` ("shows a release after the next push or a dashboard re-run").
- `.claude/skills/aztec-update/SKILL.md:231-234`: lists the landing prebuild as one of two tokenless GitHub API calls.
- Still true, unchanged: `CLAUDE.md:82`, `:567`; `.github/workflows/release.yml:7-8`; `BEFORE-LAUNCH.md:55,79`.

## Live facts checked

- `https://chromewebstore.google.com/detail/jlmiaokmjoicmclelpiiocdhncddkdmc` answers 301 to the `nulo-v6` slug (public).
- `https://addons.mozilla.org/firefox/addon/3077967/` answers 200; AMO's API reports `status: public`, Firefox `min 153.0`, and no Android compatibility. The Firefox manifest declares no `gecko_android`.
