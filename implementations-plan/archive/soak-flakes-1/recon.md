# soak-flakes-1: recon

Base: `origin/dev` at `0e4bec132` (vitest 4.1.10, vite 8.2.1, Node 24.21.0, pool `forks`). Host: 192 logical CPUs (2 × 48-core EPYC 7R13, SMT 2, 4 NUMA nodes); `availableParallelism()` is 188, so vitest's default `maxWorkers` in run mode is 187. Every measurement below ran at retry 0 under the Node launcher the soak's reference uses (`bun --no-install run --cwd apps/extension vitest run`, no `--bun`). Temporary instrumented copies of the two test files sat next to the originals for the runs and were deleted after (`git status` clean). Host load5 was 85 to 120 throughout, from other users of the host.

## Suite contention (one full run, as the soak's reference runs it)

A main-process reporter sampled the event-loop delay and the count of live forks every second (226 s run, 15150 tests, exit 0).

| Phase | Forks | Main loop delay p50 | p99 | max |
|---|---|---|---|---|
| t = 3 to 101 s | 159 to 167 | 10 to 184 ms (median 43) | up to 829 ms | 3035 ms (t = 3 s) |
| t > 101 s | 1 to 27 | 10 ms | 10 to 27 ms | 31 ms |

So for its first 100 s the suite runs about 165 forks on 96 physical cores.

## #1101: the stall is inside the in-body re-import of `background.ts`

The instrumented copy timed 15 iterations of the flag-on path: `vi.stubEnv` + `vi.resetModules()`, the `import("./background")`, `boot`, the discovery approval, the key pair, and the key exchange.

- **Alone:** the import took 290 to 580 ms (median 368). Boot took under 3 ms, approval 51 to 60 ms, key generation under 3 ms, and the exchange 51 to 55 ms: each a `vi.waitFor` interval of 50 ms.
- **Inside the suite, with the import's time against the forks then live:**

  | Forks live | Import (ms) |
  |---|---|
  | 162 to 166 | 1136 to 1835 |
  | 55 to 139 | 440 to 1164 |
  | 4 to 27 | 260 to 557 |

  At the same time the original file's three flag-on tests took 1557, 1735 and 2035 ms. Every step but the import stayed at 51 to 60 ms or under.
- **What the import does.** `vi.resetModules()` (vitest 4.1.10, `dist/chunks/utils.*.js`, `resetModules`) marks every non-vitest module unevaluated and keeps its fetched code. The re-import re-runs 372 inlined modules (436 in the graph). A proxy on the worker's RPC counted 5 or 6 `fetch` calls per import and 2 `onTaskUpdate` calls. At low contention CPU time ≈ wall time (282 to 795 ms CPU, 18 to 43 ms of GC), and each re-evaluation adds about 100 MB of RSS until the next major GC. At 160+ forks the split was not measured: the fork's CPU share and the queueing of those few RPCs behind a main loop delayed up to 3 s both fit, and both sit inside the import.
- **Contention reproduces it.** The original file, its vitest process (main and fork) pinned to one CPU beside 20 busy loops: the three flag-on tests took 3613, 2954 and 2862 ms, and the other 22 took 13 to 282 ms. Beside 40 loops, with only the flag-on tests selected (`-t`): two of the three timed out at 5000 ms, and the third took 4941 ms.
- **A delayed fetch reproduces it deterministically.** A diag copy delays every worker `fetch` RPC inside a flag-on test by 1000 ms. On base, 2 or 3 of the 3 flag-on tests timed out in each of 3 runs: 5, 6 and 5 fetches, the same counts every run. With the D1 trial edit (the read in `admitContentMessage`, `withFlag()` with no re-import), 25 of 25 passed, with 0 fetches inside each flag-on test. At 5000 ms per fetch, any fetch inside a timed body times it out by construction.
- **The read that forces the re-import.** `background.ts:114` reads `import.meta.env?.VITE_NULO_ALLOW_IFRAME_DAPPS` into a module-level const. Its one consumer is the wrapper's subframe check (`:407`), built in `admitContentMessage` (`:379`) when `handler.initialize()` (`:203`) attaches the listener. A test can therefore vary the flag only by re-evaluating the module.
- **Builds.** With the D1 trial edit, all JS in `dist/chrome` and `dist/firefox` was byte-identical to base, for the flag unset and set to 1 (four builds, 485 files each, then reverted). At base the unflagged check compiles to `if(Gb(i))`, and the flagged build drops it. One function-body env read already exists: `runtime.ts:293`, `VITE_NULO_E2E_SEALED_READ`. `.github/workflows/_build-extension.yml:96` and `scripts/ci-cd/build-env-guard.test.ts:31` allowlist the flag in the build environment. No test asserts the bundle's form.

## #1102: the restart happens in the dead worker's millisecond

The instrumented copy repeated the test's own sequence 120 times: `atStage(first, q, "simulating")`, `rawJournal`, `boot(api)` (which takes `bootCutoff = Date.now()`), then unlock with the sweep's promise kept.

| Where | gap = bootCutoff − qDead.createdAt | Outcome | Sweep finished after unlock |
|---|---|---|---|
| alone | 0 ms in 39/120, 1 ms in 77, 2 to 3 ms in 4 | all 39 at gap 0 `simulating`; all 81 others `failed` | 1.5 to 10.5 ms |
| in the suite | 0 ms in 17/120, 1 ms in 91, 2 to 11 ms in 12 | all 17 at gap 0 `simulating`; all 103 others `failed` | 1.5 to 24 ms |

- A gap of 0 makes `shouldSkipRecord` (`reaper.ts:250`, `createdAt >= bootCutoff`) skip the record. It is then never failed, which is exactly #1102's `expected 'simulating' to be 'failed'` after the poll's 1000 ms. The failing run took 2128 ms against 738 to 781 ms for its siblings: the time to line 134 plus the poll's 1000 ms.
- **Mechanism 1 of the issue (a slow sweep) was not seen:** 240 sweeps finished 1.5 to 24 ms after the unlock, against a 1000 ms poll. The failing soak run kept no sweep state, so its cause is the reproduced path by inference, not by capture. Load widens the gap, so the red is rarer under the suite than alone.
- **In production.** `runtime.ts:285` takes `journalBootCutoff` at the new worker's start, after the browser restarted the service worker and evaluated its bundle. Nothing guarantees that a millisecond passed: a backward clock step, or a clock coarser than a restart, can give a dead record `createdAt >= bootCutoff` (plausible, not measured). The record is then failed by the minute tick once its stage's grace window has passed on `updatedAt` (`reaper.ts:73-83`: simulating 10 min, proving 35 min), with its keys held and the alarm delivered. That is the documented conservative rule (`reaper.ts:242-246`). `>=` is required: the cutoff is taken before `services.start()`, so a record created in the cutoff's own millisecond can be live.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Vary a build flag without re-import | `runtime.ts:293` reads env in a function body; no test stubs a call-time read (every `vi.stubEnv` caller resets modules: `e2e/config.test.ts`, `estimate-reuse-shared.test.ts:90-99`, this file) | adapt the pattern |
| Control only `Date` in a composition test | `dapp-session/service.composition.test.ts:83-89` uses `vi.useFakeTimers({ toFake: ["Date"] })`, but with fake timers on, `expect.poll` and `vi.waitFor` advance the clock by their interval after each failed attempt (vitest `test.*.js`, `vi.isFakeTimers()` then `advanceTimersByTime`). `vi.setSystemTime` with no fake timers mocks `Date` alone (`mockDate`), and `vi.useRealTimers()` restores it | adapt: `vi.setSystemTime` alone |
| Shared clock helper | `packages/wallet-core/src/testing/mock-clock.ts` (`MockClock`) drives injected clocks; the journal reads `Date.now()` directly | none fits |
| COMPOSITION-TESTS.md clock rule | searched `clock\|timer\|Date\|timing\|millisecond`: none | — |
| Reaper boundary pin (`createdAt === bootCutoff`) | `reaper.test.ts:146,159,305` use offsets of 1 s to 60 s, never equality | none (the fixed composition test pins it) |
| Other in-body `resetModules` + import | `estimate-reuse-shared.test.ts:99-101`, `e2e/config.test.ts`: leaf graphs, ≤ 60 ms in the suite run; `content-message-relay.test.ts:19` and `presto/client.test.ts:13-16` in hooks | out of scope, measured small |

Open issues (`gh issue list --search "soak OR resetModules OR bootCutoff OR reaper"`, and `--label flake`): #1101 and #1102, this lane's. The others are deps-audit-1's (#987, #1032) and #174, the interop stopgap; none collides. Closed known limits searched (`soak OR flake OR reaper OR bootCutoff`): none apply.
