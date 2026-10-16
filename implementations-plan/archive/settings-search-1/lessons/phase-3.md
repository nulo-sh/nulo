# Phase 3: the smoke e2e and the docs

## The scenario, measured

`tests/e2e/settings-routes.test.ts`, "a settings search opens the row's page with the row outlined", run with `--retry=0` on the armed builds (phase 3's flags):

| Browser | Estimate | Scenario | File (6 tests) |
|---|---|---|---|
| Chrome | 10 s | 1.23 s | 14.9 s |
| Firefox | 10 s | 2.39 s | 16.1 s |

- Firefox offers no side panel, so its result list is Full-height popups alone; the spec branches on `isFirefox` and both lists were asserted.
- Negative control: renaming the animation in `settings-row-highlight.css` (no keyframes resolve) rebuilt Chrome and the scenario failed with `outline: "none"`; the CSS was restored and Chrome rebuilt before the screenshots. That negative run started at load1 153, above the 150 bar the lane sets for e2e runs; every gate run started below it (138, 143).
- The outline colour is read through a 2D canvas filled `transparent` first, so a colour syntax the canvas cannot parse leaves alpha 0 and fails, rather than a regex that misreads `rgb(…, 0)` as alpha 0.

## Screenshots

Chrome, 360 × 600 at 2×, light and dark through `prefers-color-scheme` on the System theme: the empty field (mockup a), "full" typed (mockup b), Display with Full-height popups outlined (mockup c), and Back up profile outlined inset in its box (OA-4), each animation frozen at its first frame. The scratch harness stayed untracked and was deleted.

## Review loop

- Round 1, Codex (session `01a14682…`, gpt-6.1-sol, high, read-only): approve with two P3s, both accepted. A page rendering a registry row twice passed `expectOwnedRows` (it read only the first match), and three comments narrated the code.
- Round 1, Opus 5.5 (final diff, same time): conditional approve, two findings accepted. Captions and row order were not checked against the registry, so a renamed list caption would leave search showing the old one. The field's keydown also took Shift+ArrowUp and Ctrl+Enter. Mutation checks: dropping the modifier guard fails the new `SettingsSearch` case, and swapping two Display rows in the registry fails both Display ownership cases.
