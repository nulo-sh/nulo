# Phase 1: arc 1 (#1335, #1343)

## Phase 1.1, 2026-10-28

- Reds on the base (`bun --bun vitest run src/popup/windows/execute/fee-figure.test.ts src/popup/windows/execute/index.test.ts --retry=0`): 8 failed. Behavioural, 3 (`index.test.ts`: a sponsor's estimate in flight, an app-paid estimate in flight, a default-entrypoint preview in flight; each `expected undefined to be defined` on Confirm's `disabled`). Structural, 5 (`fee-figure.test.ts` `holdsConfirm` rows: the function is absent). The D38 pin (a failed sponsored estimate leaves Confirm on) and the figure rows pass on both.
- Head: `src/popup/windows/execute` 23 files, 353 tests green.
- Collision resolved: `index.test.ts` "an app that set nothing: Confirm never waits for the figure" pressed while the app-paid estimate ran; it now waits for that run (D10), then never for the figure.
- E2E backstop `tx-sendTx-delegated-authwit` "a sponsored Confirm pressed at its first offer": base (window source reverted, Chrome) red, the playground's sendTx ended `"The wallet could not process the request."`, #1335's symptom; head Chrome green, 60.5 s; the file 142.9 s (2 tests), run 230 s.

## Phase 1.2, 2026-10-28

- Issue #1343 filed (dedupe: no match for snapshot/120 s/ESTIMATE_INCOMPLETE).
- Reds on the base: 8 failed. Behavioural, 6: `preview-snapshots.test.ts` "an unclaimed snapshot lives as long as its window can approve" (missing at 9 min); `estimate-cancel-registry.test.ts` "a settled token can still evict its stash for as long as an authorization snapshot lives" (`['stash-1']` evicted by the 9-min sweep); `dapp-send-executor.test.ts` "a later admission past 120 s leaves a landed snapshot for its approval" (the real wiring through `previewOperationAuthwits`, missing at 150 s); `service.approval-binding.test.ts` the claim before the first await and the release on a refused fence (claim never called). Structural, 2: `claim` absent, and the TTL row reading the not-yet-exported constant.
- Deviation: the claim runs as the first statement INSIDE `executeAndResolve`'s `try` (after the synchronous `approved.set`), not before it, so a throwing claim still cancels the window and the `finally` still runs; it stays in the acceptance tick (no await precedes it).
- Test stubs of `ExecutionService` in `dapp-interaction/service.test.ts` and `service.approval-binding.test.ts` gained `claimPreviews`.
- Head: `src/wallet/services/execution` + `dapp-interaction` 80 files green; `src/wallet/services` + `src/wallet-sdk` 262 files green.

## Arc 1 gates and review round 1, 2026-10-28

- Delegated spec, head: Chrome green (2 tests, 142.9 s; first-offer 60.5 s), Firefox green (2 tests, 149.9 s; first-offer 67.9 s). Base: Chrome only (red); the cause is browser-independent and the component reds show it.
- Chrome gate specs green at retry 0: `authwit-lifecycle` 94.1 s, `scope-refusal` 34.0 s (2 tests), `concurrent-sendtx-approve` 28.2 s, `concurrent-sendtx-confirm` 34.9 s, `tx-sendTx-sponsoredFpc` 23.7 s.
- Approvable timings over these runs (`.e2e-state/exec-approvable-timings.log`, both browsers, the log carries no browser tag): 13 waits, 0 timeouts, slowest five 4.6, 4.6, 4.8, 6.0, 6.1 s, maximum 6.7 s. D7's 120 s stays the documented estimate-gate budget; a local maximum of 6.7 s leaves the old 10 s with a thin margin for CI's colder shards.
- `bun run test:all` run 1: green, every workspace (extension 950 files, 16290 tests).
- Codex round 1 (fresh session, gpt-6.1-sol, high): `findings: 2`, both low comment fixes; no runtime bug in ownership, eviction, the fee re-ask or the Confirm gate. Applied.
- Opus review (`general-purpose`): `findings: 5`, all low or nits, all applied (null-delta tolerance with a test, red without the fix; KL5 and the corrected Security sentence; the `claimPreviews` doc no longer names its caller; the helper doc no longer says every popup waits).

## Arc 1 final gates, after merging `origin/dev` (2026-10-29)

- `origin/dev` merged (the Send picker and the Firefox 158 pin); Firefox 158 installed.
- A first smoke run read a `dist` the network runner had built before the merge, network-flavoured, and went red in unrelated files (`import-dead-rpc`, `backup-migration`'s arming contract, the merged `send-picker-add`). Not a regression: smoke needs its own armed build. Rerun with `_extension-smoke-e2e.yml`'s build env (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<browser>`, then `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 NULO_E2E_RETRY=0 bun run test:e2e`).
- Smoke, retry 0: Chrome 62 files, 274 tests green (34 min); Firefox 66 files, 277 tests green (52 min).
- Delegated spec, retry 0: Chrome green (first offer 47.7 s), Firefox green (59.7 s).
- `bun run test:all` three times at retry 0: green each time (183 s, 206 s, 199 s; extension 16340 tests, the same inventory each run).
- `bun run lint` and `bun run typecheck:all` exit 0.
