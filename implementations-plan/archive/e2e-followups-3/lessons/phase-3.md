# Phase 3: the full runs

On 841dd63 (the relay re-landed, D3 applied), Firefox 153.0.4, puppeteer-core 25.8.0, every run at retry 0. Smoke runs on the armed build made right before each run; network runs through `agent.sh`, one at a time. Logs and per-run stderr under the scratch directory.

## Smoke

| run | result | `dist` hash before / after |
|---|---|---|
| control (`page-error-capture`), Firefox | 1/1 | unchanged |
| control, Chrome | 1/1 | unchanged |
| full, Firefox (30.5 min) | 51 passed, 1 skipped of 52 files; 210 passed, 12 skipped of 222 tests (the archived counts) | unchanged |
| full, Chrome, alone (21.5 min) | 49 passed, 3 skipped of 52 files; 213 passed, 9 skipped of 222 tests (the archived counts) | unchanged |
| full, Firefox, run 2, with the entry log (30.3 min) | 51 passed, 1 skipped of 52 files; 210 passed, 12 skipped of 222 tests | unchanged |

Every launch's close check passed (no run failed at a close).

### Triage, smoke

Firefox's stderr is a proxy: it prints script errors of every context, including frames the relay never sees, and a native `console.error` never reaches it. So run 2 carried a temporary diagnostic (an env-gated append in `recordPageErrors`' two listeners, before their own body, logging every entry they receive with its test and page URL; removed before the commit). That log is the record of what the relay delivered.

- **Delivered to the listeners, run 2 (32 entries):** the control's own ×9 (`page-error-capture`, 6 `pageerror` and 3 `console` error, all expected), and `Error: Client disconnected` as a `pageerror` ×23 in 15 files: `passkey-retry` 4, `settings-crud` 3, `duplicate-phrase-import`, `rows`, `security` 2 each, `backup-imported-account`, `imported-account-lifecycle`, `keyboard-guards`, `legal-acceptance`, `passkey-backup`, `passkey-paths`, `passkey-toolbar-panel`, `profile-rename`, `security-backup`, `send-keyboard` 1 each. Every one comes from a popup page (`#/popup/…`).
- **`Client disconnected`: absorbed by a pre-existing filter, both browsers.** `pageErrorOf` (`fixtures/page-errors.ts`, since #292, before the relay's archived runs) drops it before `ctx.pageErrors`; the `console` listener drops it too. It is the port-close cascade the product treats as benign (`isClientDisconnectRejection`). Counted per file above, as the plan requires, so no Firefox entry hides behind it unseen. Disposition: pre-existing, benign, no change.
- **Printed on stderr, never delivered** (so never recorded): `NS_ERROR_NOT_INITIALIZED` from `assets/client-*.js` (16 in run 1, 49 in run 2), `uncaught exception: Object` with no file (60 and 73, all in `migration.test.ts`) and from Firefox's `AsyncShutdown.sys.mjs`, one `uncaught exception: undefined` with no file (`sw-resilience`, run 1), and two `Script terminated by timeout` warnings. They come from frames with no BiDi context or no window, the documented gap (FIREFOX.md). Disposition: outside the arrays, as archived.
- **Newly recorded: none.** No `error loading dynamically imported module`, no `Unable to preload CSS`, no `DataCloneError` (0 in both runs' stderr).

## N-full, Chrome (18:00-19:44)

CI's partition, one run at a time, the entry log on. `dist` listing hash constant within every run.

| run | files | tests |
|---|---|---|
| pool 1/5 | 19 passed, 3 skipped (`store-captures`: `STORE_CAPTURES` unset; `send-chaos`: chaos not enabled; `tx-sendTx-delegated-authwit`: no standard contracts) of 22 | 25 passed, 3 skipped |
| pool 2/5 | 21 passed, 1 skipped (`firefox-background-restart`, Firefox-only) of 22 | 37 passed, 1 skipped |
| pool 3/5 | 22/22 | 30 passed, 1 skipped (`stale-anchor-recovery`'s reorg case, reorg not armed) |
| pool 4/5 | 22/22 | 36 passed, 1 skipped (`window-placement`'s Firefox-only refocus case) |
| pool 5/5 | 20 passed, 1 skipped (`_probe-warmup-effect`, unless `NULO_E2E_PROBE=1`) of 21 | 31 passed, 1 skipped |
| heavy | 2/2 | 9/9 |
| heavy-concurrent | 2/2 | 15/15 |
| canary, prover-ON | 5/5 | 7/7 |

Every skip is a pre-existing `skipIf` whose condition holds. Entries delivered to the listeners at error level (`pageerror`, `console` error): **0** in all eight runs.

## N-full, Firefox (19:44-21:51)

CI's partition, one run at a time, the entry log on. `dist` listing hash constant within every run. No launch's close check failed.

| run | files | tests | archived (39f3dda) |
|---|---|---|---|
| pool 1/5 | 19 passed, 3 skipped (the same three as Chrome) of 22 | 25 passed, 3 skipped | 19 passed, 3 skipped |
| pool 2/5 | 22/22 | 37 passed, 1 skipped (`cap-window`'s Chrome-only case) | 22/22 |
| pool 3/5 | 21 passed, 1 skipped (`backup-restore-sw-restart`, Chrome-only) of 22 | 27 passed, 4 skipped (that file's 3, `stale-anchor-recovery`'s reorg case) | 21 passed, 1 skipped |
| pool 4/5 | 22/22 | 37/37 | 22/22 |
| pool 5/5 | 20 passed, 1 skipped (`_probe-warmup-effect`) of 21; `account-balance-orphans` green in 69 s | 31 passed, 1 skipped | **2 failed** (`popup-escape-layered`'s `DataCloneError`, fixed by #300; `account-balance-orphans`'s `auth-*.js`, the lock helper's reload, fixed here) |
| heavy | 2/2 | 9/9 | 2/2 |
| heavy-concurrent | 2/2 | 15/15 | 2/2 |
| canary, prover-ON | 5/5 | 7/7 | 5/5 |

### Triage, network

- **Delivered to the listeners at error level, all eight runs (17):** `Error: Client disconnected` as a `pageerror` from popup pages, in `backup-migration-roundtrip`, `fee-methods` (3), `fee-sponsor-funding`, `import-handshake-note-matrix` (4), `incoming-arrival`, `incoming-transfers`, `receive-unregistered`, `same-token-concurrent-sends` (3), `scope-refusal`, `transfers`. Absorbed by the pre-existing filter, as in the smoke runs. Nothing else. Chrome's eight runs delivered **0**.
- **Newly recorded: none.** No `error loading dynamically imported module`, no `Unable to preload CSS` in any run of either browser.
- **`DataCloneError`: 0** in every Firefox run's stderr (I2 holds; #297 fixed by #300).
- **Printed on stderr, never delivered:** `NS_ERROR_NOT_INITIALIZED` from `assets/client-*.js` (33 over the eight runs, 20 of them in heavy), `Client disconnected` from frames the relay does not see, `uncaught exception: Object` (4, pool 1), slow-script warnings from offscreen chunks, and `Invalid window ID: N` ×6 (`cap-request-reject`, `connect-unserved-chain` ×2, `connect-deny`, `snack-placement`, one in `sim-from-selfpay`'s window). Disposition: outside the arrays (no BiDi context or no window); `Invalid window ID` attributed below.

## P3a: `Invalid window ID`

`_probe-p3a.test.ts` (scratch, deleted): the `cap-request-reject` flow on Firefox with `chrome.windows.remove` wrapped in the background and in the approval page, each wrapper posting its call-time stack and window id to a sibling page, then calling the original unchanged and returning its promise with no handler. Run 1: 5 trials, 1/1 test; run 2: 20 trials, 1/1 test.

- **25/25 trials remove the approval window twice, same id:** the background first (`remove` ← `_settle` ← `cancel` ← `rejectInteraction`, 49-303 ms after the click), then the approval page (`close-current-window`) 0-2 ms later.
- **Run 2: 4 of 20 trials printed `Invalid window ID: N`**, N each time that trial's window id (95, 135, 207, 223), 1-5 ms after the page's remove. Run 1 printed none (the race is lost only sometimes).
- `_settle`'s remove carries `.catch` (`window-manager.ts:250`); `closeCurrentWindow`'s does not (`utils/close-current-window.ts`). So the printed rejection is the page's: **product, I4 holds.**
- **Disposition (D-orch-5): filed, not fixed.** Deduped (`gh issue list --state all --search "Invalid window ID"`, `"closeCurrentWindow"`, `"close-current-window"`: only #281). Opened **#312**, labelled `bug`, with the files and this probe's evidence. It does not block: no array records it. The e2e-testing skill's flake ledger carries it as row 52 (open, #312), and the `auth-*.js` fingerprint as row 51 (fixed).

## Phase 3 gate (PASS)

- Fast: `lint`, `typecheck:all`, `test` exit 0 (740 files passed, 3 skipped). Relay units 96/96. `bun run test:all` exit 0. `bun run test:ci-gating` exit 0 (517 tests, 27 files). Run on the tree with every temporary edit reverted.
- Every run in steps 2-5 exited 0 at retry 0, every targeted test ran, every skip a pre-existing `skipIf` whose condition held (counts above, equal to the archived ones where they exist).
- `page-error-capture.test.ts` green in both control runs and in all three full smoke runs; no launch's close check failed.
- Every recorded entry has a disposition; none is open. `DataCloneError` 0. P3a's disposition logged with #312.
- Clean-up: the diagnostic reverted, `_probe/` deleted; `git status` shows only the plan's files and the skill.
