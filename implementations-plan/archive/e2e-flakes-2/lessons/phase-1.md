# Phase 1: move the gap behind the stop

## Implementation

- Spec reordered as the change map says (`bf7db153`); lint and `typecheck:all` exit 0.
- Branch `e2e-flakes-2-a1` off `origin/dev` at 767789b7, which had moved past the plan base
  (24c68cb4) without touching the spec, its fixtures, the token-balance service or the lockfile.
- Negative control (unlock reconcile call removed at `token-balance/service.ts:472`, Firefox,
  proverless, `taskset -c 0,1`): red at `waitForFreshBalanceRow` with `rows: []` after 0
  refreshes, as planned. Line restored; `git diff --stat apps/extension/src` empty.
- Harness note: a foreground Bash call is capped at 10 min, and a loop moved to the background
  by that cap is stopped 10 min later. The run loop now runs detached (`setsid nohup`) and is
  polled in calls under 10 min. Run ff-3 survived the hand-over and passed.

## Review round 1 (diff 767789b7..bf7db153)

- **Codex** (gpt-6.1-sol, high, session 01a15077): conditional approve, 2 comment findings.
  #1 the retry clause overstates which failures leave the wallet locked: accepted (Opus's wording).
  #2 "Prove the gap is real" narrates the next assertion, and the `maxRefreshes` paragraph
  repeats the header's scope note: accepted (deleted, shortened to one line).
- **Opus diff review**: conditional approve. #1 the same retry clause: accepted. #2 the test title
  still says "on the next worker boot": kept (renaming changes its identity in reports; the
  header is accurate). Confirmed: `openPopup` waits for Ready, which follows `restore`, so the
  session record is gone at the first `waitForLockScreen` poll; a failed stop would keep it and red.
- The comment fixes wait for the end of the 15-run batch: the e2e-testing skill forbids editing
  the file while a batch runs. They change no behaviour.

## Validation (bf7db153; 78b82faa changes comments only)

Every run: `NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 … taskset -c 0,1 bun run e2e:agent
tests/e2e/network/balance-row-reconciliation.test.ts`, started at load under 150, `1 passed`.

| Browser | Runs | Spec time (s) |
|---|---|---|
| Firefox | 10/10 | 81.4, 89.1, 162.0, 81.5, 81.2, 131.2, 108.9, 124.4, 73.4, 67.5 |
| Chrome | 5/5 | 76.6, 89.2, 60.6, 49.9, 50.7 |

Base (unchanged spec, prover-ON, one run each): Firefox 112.9 s, Chrome 52.1 s. The spread
follows host load (the same steps run in both orders).

## Review round 2

- **Codex** (resume, session 01a15077): approve, no new finding. The loop converged.
