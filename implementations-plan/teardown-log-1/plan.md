---
plan: teardown-log-1
tier: light (thinned: no plan audit round, no Opus leg; one Codex pass over the plan and the net diff)
status: in progress
issues: "closes #1858"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon inline (runtime probes, no Explore agent); Codex gpt-6.1-sol high, read-only
base: origin/dev at 91887c4c3
trunk: dev
post_implementation_hardening: not scheduled
---

# teardown-log-1: mounts left standing log after their file ends, and vitest exits 1 on a green suite

#1858: one `bun run test:all` passed every test and exited 1 on two `EnvironmentTeardownError: [vitest-worker]: Closing rpc while "onUserConsoleLog" was pending`, attributed to `apps/extension/src/popup/windows/execute/OperationCard.wire.test.ts`. The issue's claims hold: the file makes no `console` call, and alone it passes with no error.

## Reproduction (demonstrated)

A probe (a scratch setup file appended to the extension's vitest config, kept outside the repo) records every real timer still pending at the file's last `afterAll`, then holds the worker 1.2 s and records every console call made after the last test.

- **Base, the file alone:** 47 `ContractChip` hold timers (1000 ms, armed by the watcher in `apps/extension/src/components/composite/ContractChip.vue`) are pending when the last test ends, and 94 `console.warn` calls follow it: `[Vue warn]: Failed to resolve component: Skeleton` and `… Popover`, from `ContractChip`'s re-render.
- **Path.** The file mounts 47 `OperationCard`s and unmounts none. Their chips have `level === null` (the test supplies no level reader), so each arms its `HOLD_MS` hold on first paint. The last tests end within a second of their mounts, so the holds fire after the file's last test, set `released`, and re-render chips nobody owns. That render resolves `Skeleton` and `Popover`, which the test does not register, and Vue warns through `console.warn`. Vitest 4.1.12's worker awaits the RPC calls pending when the run ends (`rpcDone`), then rejects whatever is still pending (`$rejectPendingCalls` in its `execute` cleanup). When the host is loaded, environment teardown stretches into the holds' second and a warn's `onUserConsoleLog` is still in flight at that rejection: an unhandled `EnvironmentTeardownError`, exit 1.
- **Invariant broken:** a test file's work ends with the file. **Consequence:** a green suite fails `quality-status`, and holds the 1.3.0 promote, which needs `bun run test` green on the dev tip.
- **The product is right.** `ContractChip` clears its hold in `onBeforeUnmount(stopHold)`, pinned by `ContractChip.test.ts` ("unmounting a held chip leaves no timer"). The leak is the test's.

## The class across the suite

The same probe over the whole extension suite at base (1047 files, 1.2 s hold): six files log after they end, each because it leaves mounts standing whose product timer is cleared only on unmount.

| File (under `apps/extension/src/`) | Timer that outlives it | Late logs |
|---|---|---|
| `popup/windows/execute/OperationCard.wire.test.ts` | `ContractChip` hold, 1000 ms | 94 |
| `popup/windows/execute/SendTxSummary.test.ts` | same | 86 |
| `popup/windows/execute/OperationCard.fallback.test.ts` | same | 50 |
| `popup/windows/execute/OperationCard.discovered.test.ts` | same | 36 |
| `popup/windows/execute/OperationCard.selfpay.test.ts` | same | 14 |
| `popup/components/modules/general/RecentActivityView.test.ts` | `useSendReview` arm, 800 ms (cleared by `onScopeDispose(disarm)`, pinned by `useSendReview.test.ts`, "disposing the scope clears the pending wait") | 1 |

- **Longer timers.** The 34 files that leave a 2 to 12 s timer pending were rerun with a 12.5 s hold: none of them logs. Longer ones (the 30 s ticker interval, 60 s request timeouts, 65 to 300 s) would need a teardown that outlives them; each file runs in its own worker, which exits after it. No path.
- **Other workspaces.** `packages/design`, the other jsdom suite, swept the same way: no late log. No other workspace mounts Vue.

## Decision ledger

- **D1, per file, not suite-wide.** Each of the six files calls `enableAutoUnmount(afterEach)`, the idiom 21 extension test files already use (`OperationCard.rail.test.ts` beside these). Turning it on once in `tests/vitest.setup.ts` would change teardown for about 290 test files, 149 of which never unmount, and run every leaked component's `onBeforeUnmount` (service `disconnect()`s among them) in files never written for it. That is a suite-wide change for a six-file defect. Codex asked (Audit verdicts).
- **D2, no stubs for `Skeleton` or `Popover`.** Registering them would silence the warn and leave the late re-render running. Any other log on that path would still race the close. The warn is the symptom.
- **D3, no new committed test.** The change is test-only, and both product halves are already pinned (see "The product is right" and the table). The proof is the probe, red on base and green on the fix, plus the 50-run and `test:all` gates. A committed guard that fails any file leaving a mount standing would be a new suite-wide gate with about 149 current violators, outside this lane.
- **D4, `RecentActivityView`'s own unmounts.** The last test's trailing `w.unmount()` goes: auto-unmount does it. The `w.unmount()` in "an unmount while the mount awaits its task snapshot…" stays, since it is the act under test. Auto-unmount's second unmount there prints Vue's "Cannot unmount an app that is not mounted." inside that test's `afterEach`, which settles before the file ends. Seven existing files mix both the same way.

## Assumptions

- **Ask (orchestrator):** the five other files are inside #1858's scope. They are the same defect with the same consequence, found by the sweep the lane's Codex question asks for. Working assumption: yes; the PR names them.

## Phase 1: the six files unmount what they mount (single arc)

**Change map** (all under `apps/extension/src/`):

- `popup/windows/execute/OperationCard.wire.test.ts`, `OperationCard.fallback.test.ts`, `OperationCard.discovered.test.ts`, `OperationCard.selfpay.test.ts`, `SendTxSummary.test.ts`: import `enableAutoUnmount` (and `afterEach` where missing) and call `enableAutoUnmount(afterEach)` at module level, with a one-line why on the first.
- `popup/components/modules/general/RecentActivityView.test.ts`: the same, plus D4.

**Validation gate** (retry 0, in order; each must pass before the next):

1. `bun run lint` and `bun run typecheck:all`: exit 0.
2. The six files: `cd apps/extension && bun --bun vitest run <the six> --retry=0`: all green.
3. The probe over the whole extension suite on the fix: no file logs after it ends, and no `ContractChip` or `useSendReview` timer is pending at any file's end (base: six files, table above).
4. `OperationCard.wire.test.ts` alone, 50 runs: 50 of 50 green, none reporting an error.
5. `bun run test:all` once at the final head: every workspace green and exit 0.
6. `bun run check:plans` after staging: exit 0.

No e2e: no product code changes, so no spec drives anything new.

## Security & Adversarial Considerations

Test files only. No product code, stored shape, permission, dependency, log line or CI gate changes. The attacker surface is unchanged; what the change trusts is `@vue/test-utils`' `enableAutoUnmount`, a dev dependency 21 files already rely on. What could go wrong: a test that reads a wrapper after its own test ends would now see it unmounted. None of the six does (no `beforeAll` mount, no wrapper shared across tests), and gate 2 proves it.

## UI impact

None: no surface changes. Only test files change.

## Delivery

- Branch `teardown-log-1-a1` off `origin/dev`, carrying the plan commit. One PR to `dev`, ready, titled `test(extension): six suites unmount their cards, so nothing logs after a file ends` (82 characters). Body: the cause, the fix, the gates with outcomes, the Codex verdict, "nothing users see changes", `Closes #1858`. No label: the change triggers no e2e lane.
- Close-out in the same PR's final commits: Outcome, lessons promotion if one generalizes, `STATUS.md` deleted, `git mv` to `archive/` in its own commit, index line moved. Merge `origin/dev` in first and reread `index.md` and `lessons.md`.

## Post-implementation

The execution contract is `implementations-plan/README.md` § Post-implementation standard at 91887c4c3, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2, bounded work: ONE Codex pass (`run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`) over this plan and the net diff against `origin/dev`, with the two verbatim rules and the adversarial ask, plus the lane's two questions: is this the cause or a symptom, and can any other test file in the suite still log after it ends the same way. A second round only on a material finding; targeted verification of each accepted fix. Log it in `lessons/phase-1.md` and below.
- Step 3 as written, `gh pr checks <n> --watch` to the end. Steps 4 and 5: close-out as above; merging and teardown are the orchestrator's.

## Seeds

- `/goal` — "teardown-log-1: PR closing #1858 open on teardown-log-1-a1, every Phase 1 gate green, the Codex pass logged, close-out committed, checks green."
- `/loop 30m` — "teardown-log-1: read plan.md and STATUS.md, run the next unpassed Phase 1 gate or delivery step, record it; stop when the PR's checks are green."

## Audit verdicts

(The Codex pass is recorded here after the build.)
