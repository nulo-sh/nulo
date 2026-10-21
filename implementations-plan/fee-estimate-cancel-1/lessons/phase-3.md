# fee-estimate-cancel-1: arc 1 log (phases 0-3)

Runs live under `~/.cache/nulo-backlog/fee-estimate-cancel-1/runs/`; each through `agent.sh` at retry 0 (`NULO_E2E_RETRY=0`), proverless (`NULO_E2E_PROVERLESS=1`, CI's shard pool, as #989's data was), one at a time in this worktree. The instrument (`patches/node-log.diff`) tees the node's JSON log with `node:public-calls-simulator` at verbose and stamps `authwit-lifecycle`'s steps; a scratch script (`scratch/count-g1.py`) counts the node's public simulations between the `G1 grant` and `G1 consume` stamps, and those in window W (after G1's `Received tx`).

## Arc base

`origin/dev` moved to `2f5a1f659` (#993, docs only) between the plan and the arc; the arc branches from it.

## R1: Firefox, base code, pool age 0, instrumented (2026-10-21 09:13-09:19Z)

- Green (the late simulation fails at the node and reaches a closed window, as #989 says). File time 101.9 s; run wall-clock 5 min 43 s.
- G1: 3 public simulations; 1 in W, 0.79 s after the send's `Received tx`, and the node rejected it (`Simulated tx … fails: Error: AVM simulation f…`). The instrument sees the bug.

## Phase 1 gate (2026-10-21)

- `bun --bun vitest run src/composables`: 1196 passed. Base engine in place: T1 and T2 fail on their assertions (`expected true to be false`, `expected [ {…} ] to deeply equal []`).
- First commit attempt refused by the pre-commit hook: `createFeeEstimationEngine` reached 84 lines (budget 80) and Biome flagged `void | Promise<unknown>` (`noConfusingVoidType`). Fixed by tightening the added lines (`cancelOwnedRemoteFor` returns a filtered map; dispose collects with `flatMap`) and typing `cancelRemote` as `(token) => unknown`. No suppression.

## Phase 2 gate (2026-10-21)

- `bun run test src/popup/windows/execute src/wallet/services/execution`: 1800 passed, 7 todo.
- Base copies, one at a time: `index.vue` fails T3 (3 tests), `service.ts` fails T5's aborted-signal case (2 tests), `fee-strategy.ts` fails T6 (all 15 rows). The cancel-before-admission T5 case passes on the base too, as a control should: there the request is already gone.
- `bun run lint` 0; `bun run typecheck:all` 0.

## Deviation

- The review loop's round 1 started while R2 and R3 ran: the diff was final, and a red run would have reopened it.

## R2: Firefox, arc head, pool age 0, instrumented (2026-10-21 09:27-09:32Z)

- Green. File time 90.0 s; run wall-clock 4 min 28 s.
- G1: 1 public simulation in total, 0 in W, no `fails` line. Fewer than the plan's R1 − 1 estimate: the arc removed two simulations, not one (which two is not attributed; the node log names hashes only).

## R3: Chrome, arc head, default settings, no instrument (2026-10-21 09:32-09:36Z)

- Green. File time 85.5 s; run wall-clock 3 min 42 s. The instrument was reverted first (`git diff --exit-code -- apps/extension/tests/e2e` clean).

## Review loop, round 1 (2026-10-21)

- **Codex** (gpt-6.1-sol high, session 01a15dc9-f7fd-7633-b3cb-2325a6c9367b): conditional approve, no production defect, three low findings, all accepted: (1) T3 let an unawaited `approveInteraction` and a wait on one map only pass: the approval is now held until the test releases it, no dispose may start before, and both release orders run; (2) T1's identity check skipped the first call: it now compares the first promise while the cancel is held; (3) two comments carried history or restated their line: trimmed.
- **Opus** (`general-purpose`, beside round 1): approve, low findings, all accepted: (1) no test closed an accepted approval whose cancels never answer: one now runs on fake timers, the window stays until `END_ACK_TIMEOUT_MS` and the unload rejection is detached; (2) a rejecting `cancelEstimate` had no row: the wired `cancelRemote` resolves; (3) four comments named callers, a stale cause or a sibling's doc: rewritten; (4) the plan's Phase 2 gate claimed every T5 case red on the base: narrowed.
