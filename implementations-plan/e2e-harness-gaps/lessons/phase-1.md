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
- `display.vue`, `privacy.vue` and `developer/index.vue` have the same hang (`await getProps()` in `onBeforeMount`, no catch, no re-read); out of this arc, filed as an issue.
- zsh does not split an unquoted `$B`, so `env $B bun run build:chrome` set one variable holding every flag and built an unarmed dist; every smoke test then failed on the CSP recorder check. The armed build now goes through a bash script.
- Gate: Fast pass (lint 0, typecheck:all 0, test 725 files / 10,970 tests). Unit `lock.test.ts` 11/11. Smoke `sw-resilience.test.ts` at retry 0: Chrome 3/3 (6 tests each), Firefox 3/3 (4 run, the two Chrome-only cases skipped).

## 1.7 The backup export case on every host (#163), local half

- The 15 s poll became an in-page `MutationObserver` armed before the agree click; the flag is read after both CTAs enable. `full.vue` sets `progress` (`:309`), awaits worker calls, then sets `finished` (`:332`), so the card's insert and removal never share a mutation batch.
- Mutation check: with the observer's text changed to one the card never shows, the case fails on the observer's message.
- Local runs at retry 0, `passkey-backup.test.ts`: Chrome 3/3 (export case 14.0, 14.2, 17.0 s), Firefox 3/3 (18.9, 19.0, 23.4 s).
