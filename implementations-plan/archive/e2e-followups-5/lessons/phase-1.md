# Phase 1: #319, the lock route after a password change

Implementer session, 2026-10-12. Base SHA `208f5f4` (the plan commit on `origin/dev` 32b7bf4; no source change between them). Every probe is a throwaway patch under `~/.cache/nulo-backlog/e2e-followups-5/` with the `nulo:probe:` sentinel; probe builds are Chrome, armed for smoke, copied out of `dist/` to their own non-prefixing `EXTENSION_PATH` directories (`dist-probe-chrome`, `dist-base-chrome`), so no run ever loaded a directory a build was writing.

## The probe

- **Background** (`base-service.ts`, profile service only): request entry, the RPC id in flight, each response post and each `onActiveProfileChanged` post; in `service.ts`, queue (`q`), enter (`in`) and leave (`out`) of `getActiveProfile`, `refreshSession` and `lockActiveProfile`, with the RPC id when the call came over a port (id-less entries are other services' in-process reads).
- **Popup**: every profile request sent and response received (by id), every profile event received and handled (with `seq`), the bootstrap's start, core end and final re-read (sent, answered, value), the lock landing (seal, profile list, `isCurrent()`, the route call), every `router.push`/`replace`/`go`/`back` with five stack frames and its result, every guard decision, `beforeResolve` and `afterEach`, every `isLogined` change, every `loadProfile` run, and the lock click's outcome.
- No probe awaits or writes storage on the measured path; buffers are synchronous arrays read once per iteration (popup by `page.evaluate`, background by the worker target's `evaluate`, after the trajectory).
- Probe test `_probe-lock-after-password-change.test.ts`: one launch per test, ten iterations, each in a fresh popup: change the password (two values alternating), wait for the toast and the hash to leave the page, click `header-lock`, wait for the session record to leave, then poll the hash every 50 ms. **Deviation:** the poll stops 3 s after the route lands on `/popup/auth` or `/popup/register` and holds there (that dwell is what catches L5, a route that lands then leaves); it runs the full 75 s only while the route has not landed. A 75 s poll after every landed lock would have cost 50 × 75 s per stage and measures nothing more.

## Step 2: the forced L2 probe

**First design, invalid (logged, not counted).** The plan's hook held the mutex inside `refreshSession` until the background recorded `getActiveProfile` then `lockActiveProfile` queued. It cannot form that queue: the bootstrap's own network and account initialisation reach `getActiveProfile` in-process from other services (the id-less `q` records), so with `refreshSession` holding the mutex the bootstrap never reaches its final re-read. Four iterations: the hold timed out at 30 s every time (`hold-release valid: false`), the bootstrap's re-read queued only after it, and the route landed. `runs/forced-v1-invalid.jsonl`.

**Second design (counted).** The order the mechanism needs is "the bootstrap's re-read holds the mutex, the lock is queued directly behind it". The hook:
- tags the bootstrap's final `getActiveProfile` (a probe-only envelope field carried to the service);
- holds the popup's re-read until the click's `lockActiveProfile` has been sent (so the click's own `readForLock`, which needs the mutex through `refreshInFlight`, is answered first, as in the natural race);
- in the background, holds the tagged read's critical section after it read "active" until a `lockActiveProfile` is queued, and holds `lockActiveProfile` until the tagged read has entered.

Valid when the first `in` after the release is `lockActiveProfile`. Base probe build, four iterations, all valid:

| iter | bg order | popup receipt | `isLogined` after the seal | push `/popup/auth` | final |
|---|---|---|---|---|---|
| 0-3 | lock event posted (119) before the re-read's response (120, "active") | lock event (35) before the response (39) | true (set by the bootstrap's re-read, record 40-41) | redirected by `guard-early` to `popup-general`, `NavigationFailureType.duplicated` (16) | `#/popup/general`, `header-lock` present |

So L2 is sufficient at e2e level: one stale "active" answer received after the seal leaves the popup looking unlocked over a locked worker, and the lock's push is bounced by the guard. `runs/forced-base.jsonl`.

## Step 3: S0, the unmodified test

`security.test.ts -t "change password succeeds"`, no probe, base build (`dist-base-chrome`), `taskset -c 0,1`, ten fresh launches, retry 0. **9 green, 1 red**: run 8 failed in `waitForLockScreen`'s route step (`Waiting failed: 15000ms exceeded`, `helpers.ts:83`) after 25.97 s, the issue's signature (24.5 s on CI). The green runs took 10.0-11.6 s. A natural reproduction on the unmodified base under two cores; no probe, so no mechanism from this run.

## Steps 4-5: S1 and S2, the probe test

**S1** (probe build, `taskset -c 0,1`, 5 launches × 10 locks, retry 0): 50 locks, **44 landed, 6 lost, 0 late**.
- Landed: the route reached `/popup/auth` 0-3 ms after the session record left in 41 of 44, 15 and 23 ms in the other two (median 1 ms). No landed route left again within its 3 s dwell (no L5).
- Lost: 1 cold (launch 1, iteration 0), 5 warm. Every one is **L2** by trace, the same sequence as the forced probe with no hold: the click's `readForLock` resolves as the bootstrap's core finishes, so the bootstrap's final `getActiveProfile` is sent about 1 ms before the click's `lockActiveProfile`; the background queues them back to back (launch 1 iteration 0: read `q` at 1263 ms, lock `q` at 1265 ms, read `in`/`out` "active", lock `in`, lock event posted at record 116, the read's "active" posted at 117); the popup receives the event (seal), then the stale "active" (`isLogined` true), then the profile list, pushes `/popup/auth`, and the guard redirects it (`duplicated`). Final `#/popup/general` with `header-lock`, `lock-current: true` (no L1), no other navigation (no L3), the event arrived (no L4).
- `pageErrors` and `consoleErrors` stayed empty across all 50 locks (but see step 7: the fixture filters the string these could have shown).

**S2** (probe build; vitest, Chrome and three busy loops pinned to one CPU): **10 locks, all landed** (cold 127 ms; warm median 11 ms, max 1,206 ms), none late, none lost. **Deviation:** one launch instead of five. Each lock took about four minutes under that load, so five launches were about three and a half hours of one CPU for a stage whose question (another branch, or a late route, under the heaviest load) ten locks already answer for the classification; #319 had settled by natural reproduction in S1. Under one CPU the click lands long after the bootstrap's re-read, so the L2 window is not hit.

**S3** did not run: S0 and S1 gave natural lost routes (Ask A1).

## Step 7: the benign filter

- The full `security.test.ts`, base build, test filter removed: 4/4 green.
- **Finding from the Opus lens, verified:** the launch fixture already drops "Client disconnected" from both arrays (`fixtures/extension.ts` `recordPageErrors`, `fixtures/page-errors.ts` `pageErrorOf`), so the test's own filter could never match, and the run above could not have seen the string either.
- So the file ran again with the fixture's two drops also removed (a throwaway edit, reverted, `git diff` empty after): 4/4 green, no entry in either array.
- Disposition (D8): the test's filter is dead code over already-filtered arrays and its comment describes a disconnect no code performs; both are removed. The fixture's suite-wide drop of the worker-restart cascade is not this lane's filter and stays.

## Step 9: consults on the classification and the fix

- **Codex** (gpt-6.1-sol, high, session `01a12efb-1ed0-7262-aef9-1e1eb5bb0a49`): **conditional approve.** L2 settled by natural reproduction; closure needs the filter's disposition and step 7's full-file run. Minor: the export's comment overstated the invariant ("began earlier" vs core runs started or joined earlier); the base-copy red is an API red and the fence-removal mutant is the behavioural proof; the composition test does not read `app.vue`'s wiring, which the fix-build forced probe proves. Applied: the comment; step 7 run.
- **Opus lens** (general-purpose, opus): **conditional approve.** Findings: (1) the filter evidence was empty because the fixture filters the string (verified; step 7 rerun unfiltered at the fixture); (2) after the seal a same-profile unlock starts a fresh core whose `initNetworks`/`initAccount` disconnect the clients a superseded boot-path core may still be awaiting, which can turn that stale boot run into `failed`. Not fixed: on base the same window joined the old run, which kept calling the locked worker and failed with "unauthorized", so base was no better, and the window needs an outside lock during a boot bootstrap and an unlock before its pending call returns; recorded in the decision ledger; (3) the `setLastActiveProfileId` assertion could not fail without a flush (fixed: a mutant that gates `isLogined` but not that write is now red); (4) the `app.vue` wiring is proven only by the fix-build forced probe (run, below); (5) superseded-by-any-newer-activation now returns `false`/`null` in every shell, onboarding included, which is more correct and is now stated in the plan; (6) the TSDoc named its caller (rewritten as the contract).

## Steps 10-11: the fix and its proof

- Commits `7d2e5fb` (the fence) and `e9f5b6e` (the dead filter).
- Red on base: the base copy of `useProfileBootstrap.ts` (from 32b7bf4) fails all four new tests (`supersedeProfileActivations is not a function`); a mutant with the fence check removed fails them on their assertions (`expected true to be false`, `expected { id: 'prof-1', … } to be null`, `expected 'popup-general' to be 'popup-auth'`). Restored: 18/18 green.
- **Forced L2 probe on the fix build** (fix + probe, 4 iterations, all valid): the same order as on base (lock event posted before the stale "active", received in that order), and the stale answer committed nothing (`boot-reread stillActive: false, current: false`); the route landed in 0-1 ms every time. This is the e2e proof of the `app.vue` wiring.
- **S1 on the fix build** (fix + probe, `taskset -c 0,1`, three rounds of 5 launches × 10 locks, retry 0): **150 locks, 150 landed**, none lost, none late; the route reached `/popup/auth` at most 64 ms after the session record left. In 13 of them the trace shows the L2 order (the lock event received before the bootstrap's stale "active"), and each such read committed nothing (`current: false`), so the race still occurs and no longer wins.

## Step 12: the gate

- `bun run lint` 0, `bun run test` 0. `bun run typecheck:all` first failed on the new lock-landing test (a deferred `getProfiles` typed `never[]`); typed in `fb3aa70`, then 0.
- **Certification, unpinned** (clean armed fix build, `security.test.ts`, retry 0): 10 of 10 green, 27-34 s per file.
- **Certification, pinned** (vitest, Chrome and three busy loops on one CPU): **the bar is not met, and is not claimed (D15).**
  - Whole file, fix build: 0 of 3 green. Base build, same load: 0 of 3 green. The same steps fail on both, all before any changed path: the input-validation and auto-lock tests exceed the 60 s default test timeout (the per-test registration fixture alone takes 40-50 s there), and the password-change test misses the 5 s toast after the change.
  - The changed test alone (`-t "change password succeeds"`, its own 120 s budget), same pinned load, fix build, 60 attempts: **18 passed through the lock and the unlock, 42 failed before the lock** (41 at the 5 s toast, 1 inside `changePassword`'s own 5 s wait), **0 failed at or after `lockWallet`**.
  - Codex, consulted on this disposition: reject as gate satisfaction (it weakens the stress bar and tolerates failures; a replacement gate needs explicit authorization); a pre-lock timeout is no lock-path evidence, so count reached-lock runs apart (done above); no timing dependency in the diff that only the pinned whole-file run would expose. The bar's acceptance is left to the orchestrator.
  - The whole file on one CPU without the busy loops: 20 of 20 green (61-89 s per file).
- Full smoke at retry 0 on the clean armed fix builds: Chrome 49 files passed, 4 skipped (213 tests, 10 skipped); Firefox 51 passed, 2 skipped (210 tests, 13 skipped).
- The lock-helper callers through `e2e:agent` (proverless, retry 0): Chrome 15 files passed, `firefox-background-restart` skipped (42 tests); Firefox 16 of 16 (43 tests).
- Bundle grep for the probe markers over both clean fix dists and the `e2e:agent` builds: no hits; `git diff 208f5f4 -- apps/extension/src packages` holds only the fix.
