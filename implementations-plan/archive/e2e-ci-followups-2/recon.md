# Recon: e2e-ci-followups-2

Base: `d59459ab` (origin/dev). Read with one Sonnet reuse sweep, one Sonnet CI-log search (#322), and the planner's own reads and timings. Paths are repo-relative.

## Reuse map

| Capability needed | Existing code found | Verdict |
|---|---|---|
| Fresh module state per case | `vi.resetModules()` + `await import()` in `beforeEach`: `content-message-relay.test.ts:17-28`, `presto/client.test.ts:10-16`; in the test body: `e2e/config.test.ts:18-93` (with a 30 s `FRESH_IMPORT` timeout), `wallet-sdk/background.transport.test.ts:254-256`. No `vi.isolateModules`, no query-string imports, no test-only reset export (searched `isolateModules`, `?case`, `\?[a-z]+=`, `__reset` in `*.test.ts`). | reuse-as-is; add a static import beside it |
| Load a module outside every timed budget | vitest 4.1.10 imports a test file in `importFile(filepath, "collect")` with no `withTimeout` (`@vitest/runner/dist/chunk-artifact.js:2457`); tests and hooks run under `withTimeout` (`:1787`, `:724`). | reuse-as-is (static import) |
| A build's fee multiplier per speed | `PRIORITY_MULTIPLIERS` (`packages/wallet-bridge/src/fee.ts:28`), `DEFAULT_FEE_MULTIPLIER` (`fee/fee-strategy.ts:73-76`), `feeMultiplierFor` (`execution/estimate-reuse-shared.ts:125-127`), read by `service.ts:1247`, `transfer-estimate-reuse.ts:207`, `operation-estimate-reuse.ts:139`; fallbacks `fee-strategy.ts:299`, `fpc-strategy.ts:146,230`. | adapt (`feeMultipliers` beside `DEFAULT_FEE_MULTIPLIER`) |
| Proof the env override reached the bundle | `apps/extension/scripts/e2e/agent.sh:202-214` greps `dist` for ``parseFloat(`<value>`)``. PR #477 edits `agent.sh`. | reuse-as-is; keep the `Number.parseFloat(VITE_FEE_MULTIPLIER_RAW)` line |
| Chaos seed replay | `CI.md` § Two fixed chaos seeds; `.github/workflows/pr-extension-network-e2e-firefox.yml:206-225`; `_extension-network-e2e.yml:117,137-153`; `tests/e2e/FIREFOX.md:76`. | reuse-as-is |
| Firefox window-miss diagnostics | `tests/e2e/fixtures/browser/firefox.ts:150-156` (close prints `[firefox] the add-on's latest exceptions:`), `:636-686` (`waitForTarget` inventory), `firefox-page-errors.ts:342-374` (from #328, #325). | reuse-as-is |

## #500: the cold load

- vitest 4.1.10 runs each worker's first import of a module through `transport.fetchModule` → `rpc().fetch` to the one main vitest process (`vitest/dist/chunks/startVitestModuleRunner.DB-7oCpn.js:668-711`). A module the worker already fetched answers `{ cache: true }` locally (`:709`).
- `vi.resetModules()` clears `promise`, `exports`, `evaluated` and `importers`, never `meta` (`vitest/dist/chunks/utils.BX5Fg8C4.js:29-43`). So a re-import after a reset re-evaluates the module with no RPC (`vite/dist/node/module-runner.js:1202-1210`).
- zod is externalized (`apps/extension/vitest.config.ts` inlines only `^@nulo/`). `tests/vitest.setup.ts` does not import zod. `content-script-validator.ts:29` is the relay graph's only import of zod.
- The extension suite has 798 files. The soak runs it on the `forks` pool at the default worker count (the soak JSON's `meta.pool` and `meta.maxWorkers: null`) on a 188-core host.
- Timing, `bun --bun vitest run` on this host:
  - Alone, at load 135: `zod-jitless` 44 ms; relay case 1 78 ms, cases 2-7 2-6 ms.
  - Full suite, load 160-190, 2 m 28 s: `zod-jitless` 63 ms; relay case 1 336 ms, cases 2-7 2.6-7 ms.
  - A test's duration includes its `beforeEach`. Case 1 is the only one that pays the first fetch.
- Soak records at `685b032` (e2e-harness-gaps arc 4, its local soak JSON): Node run 2 and Bun runs 19 and 20 fail `zod-jitless` on its test timeout (`zod-jitless.test.ts:3`). Node run 20 fails the relay's first case in `beforeEach` (`content-message-relay.test.ts:17`). Node re-run 25 fails `zod-jitless` again.
- The same shape exists in `presto/client.test.ts` (first fetch of `./client` and `./config` in `beforeEach`) and `e2e/config.test.ts` (first fetch of `./config` in the first case). The latter's 30 s timeout says it "has outlasted the 5 s default under a full parallel run". `background.transport.test.ts` statically imports `./background` (line 27), so its re-import does not fetch.

## #405: the ladder

- `feeMultiplierFor(p)` returns `PRIORITY_MULTIPLIERS[p]` for a named speed and `DEFAULT_FEE_MULTIPLIER` for none. The Send page omits `priorityLevel` for Normal (`popup/components/modules/send/fee-helpers.ts` `buildSettings`). So with `VITE_NULO_FEE_MULTIPLIER=10`, Normal is 10, Fast 3 and Urgent 5.
- Tests that mock `./fee/fee-strategy` spread `importOriginal`: `transfer-estimate-reuse.pins.test.ts:32` and `operation-estimate-reuse.pins.test.ts:27` set `DEFAULT_FEE_MULTIPLIER: 7`; `view-executor.test.ts:32` and `dapp-send-executor.test.ts:66` stub functions only.
- The unknown-priority pins (`transfer-estimate-reuse.pins.test.ts:283-291`, `operation-estimate-reuse.pins.test.ts:364-387`) expect the exact throw of `GasFees.mul` on `PRIORITY_MULTIPLIERS["bogus"]` (undefined) and `["constructor"]` (`Object`).
- One e2e case picks Fast and Urgent to dodge the inversion: `tests/e2e/network/same-token-concurrent-sends.test.ts:663-674`. Its comment at 669-670 states the inversion. The chaos test draws no speed. `.claude/skills/e2e-testing/SKILL.md:200` states the inversion with `(#405)`.
- `transfer-executor.ts` reports a `feeJuiceShortfall` when the cap exceeds the balance (`transfer-executor.test.ts:681`). Fast and Urgent caps rise 5× in the e2e build.

## #322: the chaos seed

- `creator-*.js` is the chunk named after `src/components/JsonViewer/creator.js`, a CodeMirror theme. In a Firefox build at base it is 316 KB and carries `@codemirror/view` and `@codemirror/state`. `dist/firefox/src/popup/index.html` loads it as one of 134 module scripts, so every `#/windows/*` window evaluates it at boot.
- `JsonViewer` mounts only inside `Popup`'s `v-if="show"` (`components/Popup/Popup.vue:106`), so no window builds an `EditorView` at boot. The capabilities window's only contact with the chunk is its evaluation.
- `creator.js` has no recursion. The build emits no sourcemaps, so line 5 of the CI chunk is not mapped.
- CI logs 2026-10-11 to 10-15 (243 runs, 2,148 network job logs; 236 of the Firefox network workflow, 7 nightlies): #328 merged at 2026-10-12 21:14Z (`6fa45c03`). Since then 192 Firefox network runs, 297 green and 23 cancelled chaos jobs, no failed chaos job, no `waitForTarget` timeout, no `creator-` exception.
- Run 38205877849 (the original) keeps no artifact (`total_count: 0`); its attempt-1 log shows three `creator-DQZXbG1H.js, line 5: InternalError: too much recursion` at 05:01:18.59Z and the 60 s miss at 05:02:19Z.
- One other recursion: run 38487656060, job 115606193769 (2026-10-14, `backup-import-stalled-network.test.ts`, passed): `client-CKLqdVDW.js, line 1: InternalError: too much recursion`, and at close `[firefox] the add-on's latest exceptions: no context: InternalError: too much recursion at self-hosted:3602:21`.
- The relay keeps only `callFrames[0]` per exception (`tests/e2e/fixtures/browser/firefox-page-errors.ts:231`) after dropping `chrome:` and `resource:` frames (`:136-138`), so a recursion whose top frame is a SpiderMonkey self-hosted builtin prints `self-hosted:…`. `no context` means the window's top `BrowsingContext` had no BiDi id when the record arrived: gone or never announced (`:222-226`).

## Collision risks

- PR #477 (`e2e-harness-gaps-esm`) edits every `vitest.config.ts`, `vitest.base.ts` → `.mts`, `apps/extension/scripts/e2e/agent.sh` and `tests/e2e/stall-watchdog.ts`. This lane edits none of them.
- `fee-strategy.ts` is mocked in four test files. The plan keeps every export they spread or stub.
