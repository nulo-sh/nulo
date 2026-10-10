# Phase 1: run isolation (arc 1a)

## 1.1 Host registry client

- Wrote `tests/e2e/port-registry.ts` to the plan's interface, with two additions the tests need: `acquireRegistryLock` (exported so the token-checked release is testable) and `withRegistry` (the generic locked rewrite the three-process case drives). `releaseDeadRows` returns the count dropped (or `undefined` when locked) instead of a boolean, so `e2e:reap` can report it.
- The rewrite goes through a temp file and a rename (the live writers use `writeFileSync` in place); a writer killed mid-write then leaves the other tools' rows whole. The registry's directory is created under `withRegistry`, so a fresh CI runner needs no setup.
- Mutation check: with the lock opened `"w"` instead of `"wx"`, the two held-lock cases and the three-process case go red; restored, all 15 pass.
- Gate: `bun run lint` 0, `bun run typecheck:all` 0, `bun run test` 0 (716 files, 10,730 tests), `bun --bun vitest run scripts/e2e/port-registry.test.ts` 15/15.

## 1.2 Claim the pack, release it at the end

- `resolve-ports.ts`: `reservePort(exclude)` skips listed ports in the static draw and retries the ephemeral fallback while it lands on one (bounded at 16). `resolvePorts()` is exported for the tests; `main()` keeps the CLI and adds `--release <runId>`. The repo root moved to `lockfile.ts` as `REPO_ROOT`, the worktree every registry row names.
- `agent.sh`: the EXIT trap is a function (`on_exit`), since shellcheck reads `$rc` inside a quoted trap string as unassigned (SC2154). An empty run id after `resolve-ports` is a fatal error (exit 2): an agent run always passes an owner pid, so no claim means something is wrong.
- Gate: Fast pass; `resolve-ports.test.ts` + `port-registry.test.ts` 25/25. Network (file) `tests/e2e/network/networks.test.ts`, Chrome, proverless, retry 0: 4/4 pass, exit 0; a 3 s registry watcher saw five `nulo-e2e-*` rows under one run id (`nulo-e2e-1763430-358c5d19`) for the whole run and none after. `NULO_E2E_BROWSER=bogus bun run e2e:agent tests/e2e/network/networks.test.ts`: claimed, `Script not found "build:bogus"`, exit 1, no row left; the 29 foreign rows stayed.

## 1.3 Ownership by marker

- Deviation: the sandbox-level logic (teardown per service, the exit hook, `reapPriorRun`, the dead-run sweep, the run-dir helpers and the data-dir sweep) lives in a new `tests/e2e/sandbox-ownership.ts`, not inside `global-setup.ts`, `lockfile.ts` and `reap.ts`: `global-setup.ts` imports the aztec fixtures and registers exit hooks at import, so its functions cannot be unit-tested, and `reap.ts` needs the same reap. `lockfile.ts` keeps the lock's IO and its shape check.
- Deviation: the lock's `owner` is the `<pid>:<start time>` string the processes carry in `NULO_E2E_OWNER`, not a `{ pid, startTime }` object, so one parser and one liveness rule serve both; its shape is validated.
- "Unreadable environ → unknown" narrowed: a same-uid process can be unreadable too (non-dumpable: on this host `systemd --user`, `sd-pam`), so treating every unreadable environ as `unknown` would make every sweep `unknown`. A sweep is `unknown` only when `/proc` cannot be listed or a process it had already seen as claimed turns unreadable; the unit test stubs that reader, and a control shows pid 1 and the other unreadable strangers never make a sweep unknown.
- A selector says `stop`, `keep` or `ignore`. An orphan sweep `keep`s a marked process whose own owner lives and returns `retained` at once, so a forged lock naming a live run's marker neither signals it nor deletes its run dir. The dead-run sweep `ignore`s a live run's processes (the current run carries the run marker too).
- `lockfile.ts` must not import `fixtures/aztec.ts`, even for a type: the scripts typecheck then follows it into the e2e tree's pre-existing type errors (arc 2's job). `deployedConfig` keeps its own structural type.
- A host without `/proc` (macOS): launches name no owner, sweeps return `unknown`, teardown reports the group's status, and the lock carries no owner, so a prior run's lock is reused (as before) or, if any recorded pid lives, refused with the pids to stop by hand. Before this change a Mac run SIGTERMed those pids itself.
- Mutation check: an orphan selector that ignores the owner turns two cases red (`an orphan sweep never signals…`, `an orphaned record naming a live launch's marker…`).
- Gate: Fast pass (lint 0, typecheck:all 0, test 717 files / 10,750 tests). Unit (file) `owned-processes`, `webdriver-ownership`, `process-group`: 33/33. Smoke (file) `tests/e2e/navigation.test.ts` retry 0: Chrome 5/5, Firefox 5/5. Network (file) `tests/e2e/network/networks.test.ts`, proverless, retry 0: Chrome 4/4, Firefox 4/4. I7 at boot-ready, both browsers: each leader's process tree equals its marker scan (anvil 1 process, aztec 5, playground 2). On Firefox a 2 s sampler saw the run marker on vitest and its forks, the sandbox, geckodriver, `firefox-bin` and every Firefox child. After each run no process carried a service marker or the run marker, `owned.json` was cleared and the registry held no `nulo-e2e-*` row.
- Drills: reuse (bare run on a pinned pack claimed in the registry for the drill, `kill -9` of the vitest group at boot-ready, bare run again): `reusing prior sandbox (identity check passed)`, 4/4, the lock's owner rewritten to the second run. Reap (`e2e:agent` after): `prior lock is for different ports — reaping orphans`, the three survivors stopped by marker, the stamped run dir deleted, 4/4. Fail-loud (`HOME=` on free ports): `FATAL: anvil binary not found` before any spawn, exit 1, lock cleared.

## 1.4 No adoption under a claimed pack

- `tests/e2e/boot-guard.ts` (new, for the same testability reason as 1.3): `assertPackFree` bind-tests each port on the dual-stack wildcard (no host), which a listener on any local address blocks; `mayAdopt` gates every adopt probe on the absence of a run id; `waitWhileAlive` replaces `waitForAnvil`, `waitForHttp` and the setup's use of `waitForLocalNode`, checking the child after every probe. Reuse is also gated on no run id.
- Drill hazard (scratch tooling, not the harness): a background `sleep` holding the drill's registry claim inherited the drill script's stdout, so `drill | grep` never saw EOF and the wrapper hung until the holder was killed. A holder must not inherit a pipe that a caller waits on.
- Gate: Fast pass (lint 0, typecheck:all 0, test 718 files / 10,754 tests). Unit (file) `boot-guard`, `anvil-probe`, `classify-exit`: 14/14. Reuse drill again: `reusing prior sandbox (identity check passed)`, 4/4. Then `bun run e2e:reap` with the adopting run dead: `stopped the sandbox and cleared the lock`, no process left with a service marker, the run dir gone, the drill's five dead registry rows dropped.

## Review round 1 (Codex + Opus), fixes

- A zombie's `/proc/<pid>/environ` refuses the read with EACCES, exactly as a live non-dumpable process's does; only its `stat` state (`Z`) tells them apart. Seen on this host: zombie `anvil` and `bb` processes of another worker's runs. `readEnviron` now reports a zombie as gone, so a SIGKILLed process its parent has not reaped yet cannot make a sweep `unknown`.
- Same-worktree races needed a mutex, not a re-read: re-checking `owned.json` before each service sweep still leaves the window between the check and the signal. `.e2e-state/reconcile.lock` is created with `wx`; a dead holder's lock is removed only if a re-read right before the unlink still shows the same holder, and a holder not fully written is never judged dead.
- Listener ownership on Linux: `/proc/net/tcp{,6}` lists LISTEN sockets (state `0A`) with their inode; `/proc/<pid>/fd/*` links read `socket:[<inode>]`. Every listening inode on the port must belong to a process carrying the service's marker.
- Test flake found and fixed during the round (1 failure in 37 runs, not reproduced in 33 more under 6-way load): a test freed a port for a child to bind, and a busy host can take it in between. The child now binds port 0 and prints its port.
- Mutation checks, each red with the guard removed and green with it: the marked-listener check, the exit race, the reconcile lock (all three cases), the recorded-pid seed (sandbox and Firefox), the zombie rule, the registry mode.
- Chrome never shows a marker: Chromium's process-title code overwrites the environ region, in the browser and every child, so `/proc/<pid>/environ` holds the tail of the command line (a Puppeteer probe with a marker set: none of 8 Chrome processes showed it, nor any other variable). A launch guard added for O11 failed every Chrome test of the first concurrency proof (both worktrees, 8/8 each, after a clean boot that passed the new listener checks). Chrome orphans go back to the extension-path sweep at every setup, plus `e2e:reap`.

## 1.5 Docs and the isolation proof

- Scratch second worktree of this branch outside the repo (`git worktree add --detach`), `bun install --frozen-lockfile`, synced to each tested head.
- Concurrency proof (`e4c421a`, both worktrees 4 s apart, `networks`, `connect-deny`, `sim-methods`, Chrome, proverless, retry 0): worktree 1 8/8 on anvil 23631, aztec 17530, admin 30901, p2p 29051, playground 31604; worktree 2 8/8 on 23749, 26723, 30697, 29399, 14601. A 4 s registry watcher saw both run ids' five rows together in 55 of 57 samples, and neither run id's rows after the runs. Both boots passed the marked-listener check on all three services.
- The first attempt (`ae7c9ed`) booted both clean and failed every test (8/8 each) on the Chrome run-marker guard; see review round 1.
- Kill proof (`e4c421a`), second attempt: at the moment worktree 2 had a Chrome up, `kill -9` of its `agent.sh`, the `bun run vitest` wrapper and the node vitest main. Worktree 1 finished 8/8. Left behind: the three services' processes (anvil, the node with its `bb` and `aztec-wsdb` children, the playground), reparented to pid 1, and worktree 2's five registry rows; its forks, Chrome and crashpad handlers were already gone. `bun run e2e:reap` in worktree 2: `stopped the sandbox and cleared the lock`, 5 dead rows dropped; afterwards no process carried its run marker or any service marker, no Chrome loaded its build, and no row named it.
- The first kill attempt killed the `bun run vitest` wrapper instead of the node process under it: vitest finished normally and tore down by itself, so only the row release was exercised. The vitest main is the wrapper's child whose command line runs `vitest run`; vitest's own processes and forks report `MainThread` as their comm.

## Review round 2 (Codex), fixes

- Breaking a stale path lock by re-read-then-unlink is unsafe with two breakers; the registry avoids breaking at all. The reconcile lock is ours alone, so it breaks through a per-holder break file created with `wx` and removed only after the unlink. The race is too narrow for a multi-process test to hit; the deterministic test holds the break file and shows nobody else unlinks.
- Mutation checks this round: the break file check, the read-error throw, the teardown seed; each red without its fix.

## Review round 3 (Codex), fixes

- A path-scoped `pkill -f` is a regex over the joined command line: escape the path for ERE, end it at the argument (`( |$)`), and pass it through `execFileSync`, never a shell string. `pgrep -f` with the same pattern tests it without signalling anything.
- Mutation checks this round: the escaped, anchored pattern; the ownerless-lock pid rule; each red without its fix.
- Proofs re-run on the final head (`42c738b`): concurrency, worktree 1 8/8 (anvil 21158, aztec 31227, admin 31616, p2p 26260, playground 13424) and worktree 2 8/8 (15368, 30475, 20912, 13758, 15914), both run ids' rows together in 60 of 63 samples and neither listed after; kill, worktree 1 8/8, the orphaned sandbox reparented to pid 1 until `e2e:reap` stopped it by marker and dropped its 5 rows, leaving no marked process, no Chrome of that build and no row.
- Whole smoke, retry 0, on code unchanged since `84536d1`: Chrome 47 files, 198 tests passed (3 files and 11 tests skipped by the suite's own gates: Firefox-only files, the opt-in console probe, browser-specific cases); Firefox 49 files, 199 tests passed (1 file, 10 tests skipped). No e2e test file changes in this arc.
- `bun run test:ci-gating`: 448 pass, 0 fail.
- N-full on `42c738b`, retry 0. Chrome: pool 103 files, 156 tests passed (5 files and 7 tests skipped by their own gates: opt-in probes and captures, Firefox-only), heavy 4 files, 23 tests, canary (prover-ON) 5 files, 7 tests. Firefox: pool 102 files, 152 tests passed (6 files and 11 tests skipped, the Chrome-only files among them), heavy 4 files, 23 tests, canary 5 files, 7 tests.
- A stopped background task killed `agent.sh` mid-build with SIGKILL, so its `EXIT` trap never ran and its five rows stayed; `bun run e2e:reap` dropped them as dead. The trap covers every ordinary exit; only a reap covers SIGKILL.

# Arc 1b: waits, skips and the stall

Branched `e2e-harness-gaps-waits` off `origin/dev` 6201f8b (D-orch-3).

## 1.6 The Lock page after a worker restart (#162)

- Un-skipped with no product change, the opt-out test passes at retry 0: Chrome 3/3, Firefox 3/3. It opens Lock after the new worker has booted, so it never meets the hang; #162's "navigation is stale" did not hold either.
- Scratch probe (not committed), Chrome, strict off: from the settings hub, set the hash to the Lock page and stop the worker concurrently, 0-120 ms apart. The page sat on "FETCHING SETTINGS" for 20 s in 8/8, then 3/3. A trace pushed into a window array from `lock.vue` (the console sniffer kept `console.warn` out of Puppeteer's console events) showed `getValue("sessionTtl")` rejected with "Client disconnected", then several disconnect/connect bounces while the worker boots: `ServiceClient.onDisconnect` rejects every pending request and reconnects, and `onBeforeMount` had no catch and no re-read. The transport behaves as designed, so the fix sits in the page and the stop rule does not apply.
- Fix: the settings hub's pattern (`readLockConfig` with a read generation and an update fence, re-read on every `onConnected` after the first). A later read moves the field only when the stored timeout moved, so an edit in progress stays.
- `lock.test.ts`: four new cases, each red with its guard removed (no re-read; a read on the first open; no generation check; no fence; an unconditional field write).
- E2E shape (D19): stop the worker, then navigate to Lock. On the base `lock.vue`: red 3/3, the toggle never rendered in 30 s. With the fix: 2.5 s. The case also passes alone (`-t`), where it opts out of strict mode itself.
- `display.vue`, `privacy.vue` and `developer/index.vue` have the same hang (`await getProps()` in `onBeforeMount`, no catch, no re-read); out of this arc, filed as #268 (read, not run).
- zsh does not split an unquoted `$B`, so `env $B bun run build:chrome` set one variable holding every flag and built an unarmed dist; every smoke test then failed on the CSP recorder check. The armed build now goes through a bash script.
- Gate: Fast pass (lint 0, typecheck:all 0, test 725 files / 10,970 tests). Unit `lock.test.ts` 11/11. Smoke `sw-resilience.test.ts` at retry 0: Chrome 3/3 (6 tests each), Firefox 3/3 (4 run, the two Chrome-only cases skipped).

## 1.7 The backup export case on every host (#163), local half

- The 15 s poll became an in-page `MutationObserver` armed before the agree click; the flag is read after both CTAs enable. `full.vue` sets `progress` (`:309`), awaits worker calls, then sets `finished` (`:332`), so the card's insert and removal never share a mutation batch.
- Mutation check: with the observer's text changed to one the card never shows, the case fails on the observer's message.
- Local runs at retry 0, `passkey-backup.test.ts`: Chrome 3/3 (export case 14.0, 14.2, 17.0 s), Firefox 3/3 (18.9, 19.0, 23.4 s).

## 1.9 Stall watchdog and heap cap (#155)

- One reporter, two modes: without `stallMs` it only reports the run's longest silence and the events around it (the calibration commit wires it that way); with it, it enforces.
- I4 did not hold as stated. A nested vitest 4.1.10 run whose test awaits a promise that never settles ends 3 s after `cancelCurrentRun`: the runner marks the test skipped and the run exits 1. Only a fork that cannot answer the cancel (a blocked event loop) needs the kill. The unit test therefore stalls on a spinning fork, which exercises everything the reporter does: the report, the cancel (a second file must not start), the kill of this run's forks only, global teardown still running, and a detached non-fork child surviving.
- Mutation checks on the nested run: without `cancelCurrentRun` the next file runs; without the kill the run never ends (killed at the 40 s probe limit). Removing `process.exitCode = 1` changes nothing (vitest fails a cancelled run itself), so that line is belt and braces, not pinned.
- A blocked fork never reports its test's start (the runner throttles task updates through a timer on the fork's own event loop), so the stall report names the file and, when known, the tests. 1 of 7 awaiting runs also named only the file, so the test asserts the file.
- `vitest/vitest.mjs` is not an exported subpath: resolve `vitest/package.json` and join `vitest.mjs`. A nested run writes vite's cache under its root's `node_modules/.vite` unless `cacheDir` points elsewhere; the fixture config sends it to the run's state dir.
- Agent-shell slip (no harm done, recorded so it is not repeated): a `pkill -f <pattern>` in the same command as the pattern matched the shell itself and cut the script short; and a `cp` onto a scratch name that turned out to be an existing directory dropped a file inside it, removed again after a byte compare.
- The measuring commit (1945103) was made in a scratch worktree of this branch outside the repo and pushed from there, so the local 1.8 runs kept reading the tree they were started on.

## 1.8 The anchor sleeps (#161)

- `store-captures` is red at retry 0 before the deleted sleep's site, on the branch and on the base (6201f8b): `fillPrivateSend` expects the privacy strip's `you` to read `hidden` under the sandbox sponsor, and it reads `unknown`, since `publish-facts.ts` gives `hidden` only for a protocol-derived fee contract. With that expectation relaxed in a scratch copy (not committed), the branch's file ran through the send that followed the sleep, History, Security and the approval, and failed only on #170's soft `clearAmountLine` check. Commented on #170; the store frame's reading is a store-art decision, not this arc's. So `store-captures` is held out of 1.8's pass rule, with this evidence in its place.
- Local runs at retry 0 on 53c167b, Chrome, three each: `fee-methods` + `selfpay-phase` 3/3 (9 tests each), the five pool files that reached a sleep (`profile-switch-sweeps-transfer`, `imported-account-execution`, `account-switch-isolation`, `auto-lock-defers-while-proving`, `in-flight-send-guard`) 3/3, `transfers` 3/3. `store-captures` 0/3, all before or after the sleep's site for the reasons above: runs 1 and 3 on the strip at `:187`; run 2 passed the strip, went through the deleted sleep in `fillPrivateSend` and failed on #170's `clearAmountLine` at `:262`. `apps/extension/store/captures/` was restored after each run (0 files changed).
- Firefox, once each at retry 0 (gate): every file above but `store-captures` ran green in the Firefox calibration N-full on 1945103, which carries the deletion (below).
- Every file that reached a sleep also ran in the calibration's full suites at retry 0 (below) and green in the hosted network dispatches 38033195688 (Chrome) and 38033196739 (Firefox), which include the heavy lanes and the canary lane with `transfers`.

## 1.7 hosted half

- Each smoke workflow's concurrency group cancels an in-progress `workflow_dispatch` run on the same ref and sha, so the three dispatches per workflow ran one after another.
- Every dispatch succeeded and the export case passed on its first attempt, far under the 240 s rule, so the `skipIf(CI)` stays gone:

| Workflow | Run | Commit | Export case |
|---|---|---|---|
| `pr-extension-smoke-e2e.yml` | 38032287387 | 53c167b | 12.5 s |
| `pr-extension-smoke-e2e.yml` | 38032798079 | 53c167b | 14.3 s |
| `pr-extension-smoke-e2e.yml` | 38033448171 | 1945103 | 13.9 s |
| `pr-extension-smoke-e2e-firefox.yml` | 38032288361 | 53c167b | 18.7 s |
| `pr-extension-smoke-e2e-firefox.yml` | 38033108543 | 53c167b | 14.5 s |
| `pr-extension-smoke-e2e-firefox.yml` | 38033842009 | 1945103 | 16.5 s |

- An unrelated smoke case (`navigation.test.ts`, the compact title bar's opacity wait) passed only on retry in the first two Chrome dispatches; filed as #269.

## 1.9 calibration, hosted

Dispatched on 1945103 (`observe` and the 1 s heap sampler), retry 0 as the workflows run it; every job green.

| Job | Chrome 38033195688: longest silence, file | Firefox 38033196739: longest silence, file | Heap peak C / F (MiB) |
|---|---|---|---|
| shard 1/5 | 65.8 s, profile-switch-sweeps-transfer | 66.9 s, profile-switch-sweeps-transfer | 952 / 951 |
| shard 2/5 | 35.2 s, incoming-arrival | 35.3 s, incoming-arrival | 943 / 953 |
| shard 3/5 | 65.5 s, connect-deny | 65.4 s, connect-deny | 941 / 958 |
| shard 4/5 | 157.2 s, failed-send-check | 156.9 s, failed-send-check | 967 / 998 |
| shard 5/5 | 75.0 s, backup-import-stalled-network | 39.6 s, session-reconnect-flood | 958 / 931 |
| heavy fee-methods + selfpay | 24.3 s, fee-methods | 30.1 s, fee-methods | 968 / 998 |
| heavy concurrent-confirm | 47.9 s, same-token-concurrent-sends | 61.8 s, same-token-concurrent-sends | 1009 / 1019 |
| canary | 32.3 s, delete-after-prove | 34.5 s, delete-after-prove | 917 / 925 |

- Every hosted fork (19-22 per shard) reported a default `heap_size_limit` of 4288 MiB.
- failed-send-check's 157 s gap is by design: the test samples the record every 5 s for 150 s past its terminal time (`OBSERVE_PAST_TERMINAL_MS`) and logs only once the loop ends. Any future silent observation window longer than `T` would need a progress line.

## 1.9 calibration, local

N-full at retry 0 on 1945103 (`observe` and the sampler), the CI partition: the pool proverless, the four heavy files proverless, the five canary files prover-ON.

| Browser | Lane | Result | Longest silence | Heap peak (MiB) |
|---|---|---|---|---|
| Chrome | pool | 103 files passed, 5 skipped (env-gated) | 157.7 s, failed-send-check | 1003 |
| Chrome | heavy | 4/4 | 53.4 s, same-token-concurrent-sends | 1009 |
| Chrome | canary | 5/5 | 32.1 s, delete-after-prove | 920 |
| Firefox | pool | 102 files passed, 6 skipped (Chrome-only and env-gated) | 160.3 s, failed-send-check | 986 |
| Firefox | heavy | 4/4 | 63.1 s, same-token-concurrent-sends | 1022 |
| Firefox | canary | 5/5 | 72.1 s, delete-after-prove | 926 |

Every local fork reported the 4288 MiB default. Across hosted and local: longest silence 160.3 s, so `T` = max(10 min, 2 x 160.3 s) = 10 min; highest peak 1022 MiB (local Firefox heavy), so `C` = 2 x 1022 rounded up to 512 = 2048 MiB, 2240 MiB below the default. Both ship (c40b6dc).

## Final head, smoke

Whole smoke suite at retry 0 on 76de434 (armed builds): Chrome 201 passed, 10 skipped (env-gated files). Firefox: 49 files passed with no failure before the scratch wrapper's own 30 min limit stopped the run ahead of the last file; that file, `passkey-toolbar-panel`, then 5/5 alone.

## Final head, network

N-full at retry 0 on 76de434 (`STALL_MS` 10 min enforced, 2048 MiB cap), same partition:

- Chrome: pool 103 files passed, 5 skipped; heavy 4/4; canary 5/5. Longest silences 157.5 s, 53.7 s, 33.9 s; no `stalled` file. No fork tripped the heap-limit check, so the cap reached every fork.
- Firefox: running at the PR's opening; the result is in the PR body.

## Arc 1b review round 1 (Codex + Opus), on c40b6dc

Both reviewers approved with fixes. Accepted (76de434):

- The watchdog armed at `onTestModuleStart`, which vitest 4.1.10 reports after setup files and import, so a hang while collecting the first file was never timed, and a later file's collection hang was blamed on the previous file (both reviewers). It now arms and sets the file at `onTestModuleQueued` and clears the running set there, so a crashed fork's tests are never named. The spin fixture now spins at import; without the queued hook the nested run hits its 90 s deadline.
- `test-retried` maps to no reporter hook, so a retry after a long silent attempt had only what remained of `STALL_MS` (Opus). The undeclared `onTaskUpdate` call carries it; the control run adds a fixture silent 2 s per attempt against a 3 s stall, cancelled without the hook.
- `readdirSync("/proc")` threw from the kill timer on a host without `/proc` (both). The kill step now logs that the blocked fork is left running.
- A killed Firefox fork left Firefox and geckodriver until the next Firefox launch (Opus). Teardown now runs the owner-gated `reapOrphanLaunches` on Linux.
- Comments: the watchdog header trimmed and made exact; the observer's doc and the export wait's stale 45-96 s paragraph cut to their invariants.

Rejected:

- Codex: a re-read after a reconnect replaces a pending timeout edit when the stored value moved meanwhile. `onSettingUpdate` already replaces the field the same way when the timeout changes elsewhere; the re-read only stands in for the update event the dropped port missed, so the page keeps one rule.
- Opus: 1.8's runs were unrecorded. They were still running; recorded under § 1.8.

## Arc 1b review round 2 (Codex), on 76de434

Approve, no findings. Codex checked that teardown's reaper signals only launches whose recorded owner is dead and whose processes carry the record's marker, and withdrew the Lock-page finding: the re-read follows the rule `onSettingUpdate` already sets.
