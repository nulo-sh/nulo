# Phase 2: docs, e2e, "after" shots

## Review loop

- **Round 1, Codex** (`gpt-6.1-sol`, high, session `01a1473a`, started with Phase 2 over the arc diff at `6860b443`): `conditional approve`, 2 findings, both accepted (`27bc817f`).
- **Round 1, Opus** (general-purpose, same diff): `conditional approve`, 8 findings, all accepted, one as OA-5 (`08d42bd1`). The useful catch: a glyph that was a Material `<span>` now matches `svg`-only hover rules, so RowAction's hover colour reached two glyphs it never touched.
- **Round 2, Codex** (resumed, over `6860b443..5b18cc75`): `approve`, no new material finding. Loop converged at round 2.

## Sheet capture

The `Core / Icon` sheet story overflowed Storybook's popup-width wrapper; `width: max-content` on its grid. Captured from `storybook-static` through puppeteer request interception (no port), light and dark at device scale 2.
- **After the loop**: `bun run audit:vue` failed once on `a11y-css.test.ts`, which pins `DetailsTable`'s `--nulo-outline` selector by text; the round 1 fix had raised it to three classes. The pin follows (`5bda52de`). The fix round had run only the touched files' tests.

## e2e

Before from `f86407dd` (base `dev` 3dc5a06a); after from `5b18cc75`; the code is unchanged through `5bda52de`, which only moved a test pin. Every run was at retry 0 with load1 under 150 at its start. Commands are as in the plan's arc 1 preamble; the armed build preceded each browser's batch.

| Suite | Before | After |
|---|---|---|
| Smoke, Chrome (266 tests, 14 skipped) | 1816 s, green | 1838 s, green |
| Smoke, Firefox | 2510 s, green | 2296 s, 1 failure (#630); full rerun 2253 s, green |
| Network, the three capture files (incl. build) | 396 s, 11/11 | 311 s, 11/11 |

- **Firefox failure**: `security-reset.test.ts` › "reset purges within the same budget while the node refuses connections". `waitForProfilePurged` ran out at 15 s with the tombstone still present. Three isolated reruns passed, at 15.3, 22.7 and 15.3 s for the whole test. Nothing on the purge path changed, so this is a timing flake under host load, filed as #630.
- **Captures**: `NULO_E2E_SHOT_DIR` on `home-links`, `holdings-add-token`, `send-keyboard`, `settings-routes`, `accounts` and `endpoints` (smoke, 28/28) and the three network files. The eight pairs, the Accounts popup, the network page and the sheet are in `screenshots/`.

## CI

- **`test:ci-gating`** (CI's unit job runs it after vitest; `audit:vue` does not) failed on the first push. `workflow-refs.test.ts`'s milestone pattern `\b[MA][0-9]+\.[0-9]+\b` matched 56 path strings like `"M4.25 …`. Fix: a space after every `M` command (valid SVG, sheet capture byte-identical), and a header line saying why. Exempting the file would have loosened the gate. Run `bun run test:ci-gating` and `bun run test:release` locally before pushing.
