# Phase 1: the page

## Gate (2026-10-17)

All green at `ca57d85c`: `lint` (exit 0; the three `noDescendingSpecificity` warnings on `page.css` are pre-existing, same count on the base file), `typecheck:all`, `test:all` (landing 61 tests), the landing build, the dist loop (exit 0) and its failing control (exit 1), `deploy:dry`, `test:ci-gating`, `test:release`, `lint:actions`. The extended store-URL pin was proved red by changing the Firefox link on the new page, then green after restoring it.

Browser check (scratch script, registry-claimed port, `vite preview --strictPort` in its own process group, torn down and released in `finally`): desktop 1440×900 and phone 375×812 both show the page's own title, `h1`, `aria-current` link and three cards in order, the grain drawn, no console error and no CSP violation; desktop narrows the button to "Add to Chrome", the phone keeps "Get Nulo" with `scrollWidth` 375; `h1` 54 px and 40 px.

Two attempts failed before that, neither in the page:
- Chrome aborted at launch: this host has no usable user-namespace sandbox. The repo's own e2e launches Chrome with `--no-sandbox --disable-setuid-sandbox` (`apps/extension/tests/e2e/fixtures/browser/chrome.ts:56-57`); the check uses the same flags for this local page.
- The second visit got a 304 from the browser cache; the check now disables the cache per visit, so each navigation is a fresh 200.

## Review fixes (2026-10-17)

Codex approved with one comment nit; the Opus diff review approved with three low findings. All four landed in `829350fe`; Codex round 2 approved them with no findings.
- A card heading's hidden number ran into its title in the text content ("01Private balances"), which is what indexers, reader mode and copy see; the accessible name was already right. A space inside the `aria-hidden` mono span fixes the text. At 13 px JetBrains Mono that space is 0.6 em plus 0.08 em tracking, about 8.8 px, so the margin went from 14 to 5 px. Measured in Chrome, the title moved 0.16 px.
- The brief asked for `robots.txt` to be updated. It is `Allow: /` with no per-page lines, so it already admits the page and is unchanged.
- onboarding-3's issue #722 asks for the page with its clips and the wallet repoint. Arc 1 ships neither, so the PR refs it and does not close it.
