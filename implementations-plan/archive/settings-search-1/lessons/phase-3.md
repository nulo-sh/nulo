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

## Final head

On `daa01c1b` (after merging `origin/dev` at `a433c20b`): `bun run lint` 0, `bun run typecheck:all` 0, `bun run test:all` 0 (extension 13117 passed), `bun run check:plans` 0; armed builds and `settings-routes.test.ts --retry=0` 0 on Chrome (scenario 1.46 s, file 12.9 s, load1 107) and on Firefox (scenario 3.09 s, file 20.2 s, load1 121).

## Follow-up: P32-01 B

The owner answered decision page 32: a result for a Settings-list row opens that row's page and outlines nothing (D8).
- The 16 list rows took their links into the registry, so the list and its results share one source. Their old `to=` literals matched the new entries one for one, checked by script.
- The list dropped the highlight directive. The tests that pinned A now pin B; reverting `settingsResultTo` to the A form fails four of them.
- Codex (session `01a146be…`, gpt-6.1-sol, high, the follow-up diff only): approve with three P3s, all applied. `useSettingsRowHighlight` no longer returns `target`, which had no consumer left, and three comments were removed.

Gates on `414d0970`:

| Gate | Result |
|---|---|
| `bun run lint` | 0 |
| `bun run typecheck:all` | 0 |
| `bun run test:all` | 0 (extension 13122 passed) |
| Smoke, Chrome | 0: scenario 1.64 s, file 13.0 s, load1 87 |
| Smoke, Firefox | 0: scenario 2.97 s, file 20.8 s, load1 118 |

The two screenshots of an outlined list row were replaced by Lock now outlined inset and a list result opening the backup page.
