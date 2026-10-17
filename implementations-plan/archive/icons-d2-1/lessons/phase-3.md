# Phase 3: private and public marks, the rename row

## Base

Branch `icons-d2-1-marks` from `origin/dev` 1b93cbfa (arc 1 merged as 111fe020); `bun.lock` unchanged, no install needed.

## Review loop

- **Round 1, Codex** (`gpt-6.1-sol`, high, session `01a14a3a`, over `847ff1ea`): `conditional approve`, 3 low findings; 2 accepted, 1 accepted in part (`4b312602`). The first launch passed the prompt as text; `run-codex.sh` takes a prompt file and exited 2 before reaching Codex.
- **Round 2, Codex** (resumed, over `4b312602`): `approve`, no new finding. Loop converged at round 2.
- **Cross-arc, Codex** (fresh session `01a14a41`, over `111fe020` and `1b93cbfa..2e0d9ede`): `conditional approve`, 3 low findings; 2 accepted (`2e0d9ede`, the plan's Phase 3), 1 rejected (the glossary pin's comment states its invariant; OA-6's sign-off precedes the merge).

## Gates

On `847ff1ea`: `bun run lint`, `typecheck:all`, `test:all` (every workspace), `test:ci-gating` (576 pass), `test:release` (319 pass, 10 skip), `audit:vue` (13 389 tests) and `build-storybook` exit 0. The touched suites again after each fix commit.

## e2e

Every run at retry 0, Chrome, load1 under 150 at its start, armed build before the smoke batch.

| Run | Before (`1b93cbfa`) | After (`847ff1ea`) |
|---|---|---|
| Smoke: `home-links`, `token-list`, `endpoints` (+ `send-keyboard` after) | 71 s, 10/10 | 107 s, 15/15 (5 are `send-keyboard`) |
| Network: `fee-methods` (incl. build and boot) | 357 s, 8/8 | 379 s, 8/8 |

- **Captures**: `NULO_E2E_SHOT_DIR` on the same runs. The marks show on `token-list`'s flagged captures (Home's token row at 9 px, the token page's balance line at 12 px), not on `home-links`, whose account holds no token; the Send review rows on `fee-methods`' sheet, strip and tag captures; the Chain group on `endpoints`' `network-detail`. Before and after, and 4× nearest-neighbour crops of the 9 and 12 px marks, are in `screenshots/arc2/`.
- **Sheet**: the `Core / Icon` sheet story captured from `storybook-static` as in Phase 2; `sheet-pair.png` is its private and public row at 24, 12, 10 and 9 px.
