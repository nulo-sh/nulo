---
plan: e2e-harness-gaps
tier: mid
status: approved by the orchestrator 2026-10-09; arc 1a merged (#267); arc 1b in review (#273)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 Explore agents (sonnet); dual audit (Codex gpt-6.1-sol high + one Opus Plan agent); one final fresh Codex pass
base: origin/dev at 4a357b7 (#238 merged as 8099368)
trunk: dev
issues: [169, 155, 161, 162, 163, 194, 186, 164, 153, 165]
not_this_lane: [195, 81, 190]
post_implementation_hardening: not scheduled
---

# e2e-harness-gaps: run isolation, unproven waits, the e2e type gate, missing coverage

The e2e harness is what lets many agents run the network suite on one host and what every PR's two e2e gates rest on. Ten open issues say where it falls short. Arc 1 makes concurrent network runs safe on a shared host (gate G1 for the whole program) and removes the waits and skips nobody has proven. Arc 2 puts the e2e tree under the type checker. Arc 3 adds the coverage the backlog names: concurrent NO_FROM sends, a multicall that reaches public execution, and private transfer rows. Arc 4 loads the extension's configs as ES modules, last, because its soak matrix takes hours and nothing else waits on it.

- **Arc 1a (#169, gate G1).** A run claims its five ports in the host registry `~/.agents/ports.md` and releases them at the end. Every process a run starts carries a random run marker and each sandbox service its own, so teardown and the orphan reaper stop every process the run started, a leaderless group included, and nothing else. A listener on a claimed port is refused, never adopted.
- **Arc 1b (#155, #161, #162, #163).** A stall watchdog and a per-fork heap cap for the network suite; the 5 s anchor sleep goes; the Lock page loads after a worker restart, so the strict-mode opt-out test runs; the passkey backup export case runs on hosted CI.
- **Arc 2 (#194).** A `tsconfig.e2e.json` joins `typecheck`.
- **Arc 3 (#164, #153, #165).** The playground's multicall sends nonce 0, a sponsored NO_FROM control and a transfer-function select join it, and the network tests assert outcomes instead of "ok or error".
- **Arc 4 (#186).** `apps/extension` declares `"type": "module"` and the root base config becomes `vitest.base.mts`, proven by CLAUDE.md's soak matrix.

## Tier and budget

`mid`, as the program fixes. Rubric: novelty low (every mechanism has a precedent in the tree or on the host), blast radius moderate (the harness gates every PR), irreversibility low, migration none, external coupling moderate (the host registry is shared with another repository's tooling), security sensitivity low. One high at most. The lane is split into five PRs instead of raising the tier. Recon: three Explore agents (sonnet). Code review: off; the Codex fix loop is the review.

## Outcome & Quality Bar

**For whom.** Agents and the owner running network e2e on one shared host, often five at a time in separate worktrees; the CI lanes that gate every PR; the next maintainer of the harness.

**What excellent looks like.**
- Two network runs in two worktrees start, pass and stop together, on distinct ports listed in `~/.agents/ports.md`, and neither run signals a process the other started. Killing one run mid-flight leaves the other green, and `bun run e2e:reap` then stops every process the dead run started.
- Every wait and skip this lane touches is either deleted or backed by a retry-0 run that shows it is needed. No sleep is lengthened and no new skip is added; the one skip that may stay is #163's, if hosted CI proves the case cannot fit its budget (§ Arc 1b), and then the issue stays open with the numbers.
- `bun run typecheck:all` fails on a type error in any e2e file, and the type fixes change no runtime behaviour.
- Each new assertion fails on the base commit for the reason the issue names, or the plan records why it cannot.

**What good enough looks like.** The registry client implements the claim, release and liveness reap only, not a general allocator. The stall watchdog fails a stalled run fast with a named test; it does not diagnose the stall. Bare `vitest` runs keep their fixed default ports.

## Scope

**In:** the ten issues above, grouped as the lane map groups them, with two regroups: arc 1 ships as two PRs so #169 can merge alone (D1), and #186 leaves arc 2 for its own top arc so its hours-long soak holds nothing up (D15).

**Not this lane:**
- #195 (a WASM-proving nightly leg): waits on decision page 5 and charter C6; the minutes and the aggregator wiring are the owner's call.
- #81 (a keyed live-transaction smoke on V6): waits on page 5; every run spends funds and is owner-operated (G5).
- #190 (`blocked:external`, a failed vitest fixture setup is never re-run): the fix is the vitest release that ships vitest-dev/vitest#11237. No in-repo half exists: the only lever, `extraTokensFixture`'s scope, already rethrows the first error, which is the truthful one.

**Claims that did not hold or hold narrower:**
- #162: "its navigation is stale" does not hold. The test navigates to `#/popup/settings/lock`, which is the current route (`settings/index.vue:209`). The skip's live cause is the page's config reads never resolving after a worker restart.
- #155: the salt half is done (8099368). No run in the last 60 of `pr-extension-network-e2e.yml` failed, so no recent evidence shows a stall; the watchdog ships only if its calibration says it can save time (Phase 1.9).
- #169: 12 and 13 hold only as the #234 comment narrowed them (in-run teardown of a live leader is fixed; the leaderless group and adoption remain).
- #161: wider than listed: five sleeps in four files, and `sendTransfer` carries one into seven network files.
- #194: about 150 errors remain after the fixture type, not 103.

## Architecture & Implementation

### Arc 1a: run isolation (#169)

**Host registry client** (`apps/extension/tests/e2e/port-registry.ts`, new, side-effect free). It reads and writes the registry's live format (recon § The host registry): rows `| port | service | owner (run) | worktree | pid-hint | claimed |` under the existing header. The path is `NULO_E2E_PORT_REGISTRY` if set, else `~/.agents/ports.md`; tests always set it.

```ts
export class PortClaimConflict extends Error { readonly ports: number[] }
/** Every port the registry lists, any owner, read from each table line's first cell; empty when the file is absent. Read without the lock. */
export function registeredPorts(file?: string): Set<number>
/** Under the lock: drop this repo's rows whose pid-hint is dead, refuse a port any row lists, append one row per service. */
export function claimPorts(claim: { runId: string; ports: Record<string, number>; ownerPid: number; worktree: string }, opts?: RegistryOptions): Promise<void>
/** Under the lock: drop this run's rows. Never throws; false when the lock never came free. */
export function releasePorts(runId: string, opts?: RegistryOptions): Promise<boolean>
/** Under the lock: drop this worktree's `nulo-e2e-*` rows whose pid-hint is dead. For `e2e:reap`. */
export function releaseDeadRows(worktree: string, opts?: RegistryOptions): Promise<boolean>
```

- **Lock.** The same path and creation as the live writers: `<registry>.lock` by `open(..., "wx")`, so they exclude each other. Ours writes `nulo-e2e <pid> <token>` into the lock, and release unlinks only a lock that still holds our token (the other writers' locks are empty, so ours never unlinks theirs). **Ours never breaks a lock.** Any break of a path lock races: a breaker can take a lock someone acquired after it judged staleness, and no check after the fact can undo a third writer entering the emptied path. So a claim waits up to 30 s, longer than the other writers' 15 s break, and then fails closed with `RegistryLocked`, naming the lock, its age and its content (our format names the holder's pid). The other writers keep their own token-free break; that race is theirs and needs a holder that stalled 15 s inside a millisecond critical section. A lock abandoned by a dead writer clears when any of those writers next runs, or by hand, as the error says. The lock's creation and its 15 s judgement are a contract shared with `alejoamiras/unleashed`'s writer; the e2e README records it.
- **Parsing.** Exclusion and the conflict check read the first cell of every table line, as the live writers do, so a foreign row with a `|` inside a later cell still excludes its port. Only rows this client may drop are parsed whole: six cells, a port of 1-65535 and a `nulo-e2e-` service. Every other line is copied through byte for byte. Cells we write are checked to hold no `|` or newline.
- **Reap scope.** The liveness reap drops only rows whose service starts `nulo-e2e-`: our contract is that their pid-hint is the run's owner; another writer's may not be (D3). It reads the pid-hint only through `process.kill(pid, 0)`: `ESRCH` drops the row; `EPERM`, success or a non-positive or non-integer value keep it. Nothing here ever signals a pid read from the registry.
- Service labels are `nulo-e2e-<service>`; the run id is `nulo-e2e-<ownerPid>-<8 random hex>`.

**Claiming the pack** (`apps/extension/scripts/e2e/resolve-ports.ts`, `agent.sh`, `reap.ts`).
- `reservePort(exclude?: Set<number>)` skips any port in `exclude`. `reservePortPack` reads `registeredPorts()` once and passes it.
- `main()` refuses to claim without `NULO_E2E_OWNER_PID` (a bare invocation keeps today's unclaimed behaviour and says so). It creates `~/.agents/` when absent (a CI runner), and a `RegistryLocked` failure exits non-zero before the boot window, so it is never retried as exit 86. It reserves the pack, claims it under the run id, and on `PortClaimConflict` releases the sockets and draws again, at most five times. It then writes `ports.json` with `runId`; if that write fails it releases the claim before exiting non-zero. Then it releases the sockets.
- `agent.sh` exports `NULO_E2E_OWNER_PID=$$` before `resolve-ports` and `NULO_E2E_RUN_ID` from `ports.json` after it. `$$` stays alive through the build, vitest and the `exec` into `classify-exit`, so the rows live as long as the run. Release happens in two places, neither of which signals a process: an `EXIT` trap (`trap 'rc=$?; release || true; exit "$rc"' EXIT`), which covers a failed build or bundle assertion and keeps the exit status, and an explicit release after vitest, just before the `exec` (an `exec` skips the trap). The skill's ban is on INT/TERM traps, which bash defers and which clobber the classified code; an EXIT trap that re-exits with `$?` does neither, and the skill text says so after this change. A run killed by SIGKILL leaves rows that our next claim on the host reaps by liveness.
- `bun run e2e:reap` releases this worktree's `nulo-e2e-*` rows whose owner is dead (`releaseDeadRows`), never a row by the run id `ports.json` names, so it cannot free a live run's ports or, through a tampered `ports.json`, another run's.
- `firefox.ts`'s geckodriver ports pass `registeredPorts()` to `reservePort`, so a launch never takes a port another run has claimed but not yet bound.

**Ownership by marker** (`apps/extension/tests/e2e/owned-processes.ts`, new). The marker primitives move out of `fixtures/browser/ownership.ts`: `newMarker`, `readStartTime`, `ownedProcesses(marker)`, `stopOwned(...)` (re-check before each signal, two empty scans a poll apart to call it stopped). Two changes, which Firefox launches get too:
- A marked process also carries its owner: the spawn env holds `NULO_E2E_LAUNCH=<marker>` and `NULO_E2E_OWNER=<pid>:<start time>` of the process that spawned it. An orphan sweep signals a process only when its own environ names an owner that is no longer alive. A forged record that names a live run's marker therefore stops nothing: those processes name their live owner.
- `/proc` that cannot be listed, or a marked process whose environ cannot be read, makes the result `unknown`, never `stopped`. On a host without `/proc`, marker sweeps return `unknown`; teardown then reports what `killProcessGroup` reports and keeps the lock and data dir whenever that is not `stopped`.

**The run marker** (`agent.sh`, `resolve-ports.ts`, `reap.ts`, `global-setup.ts`). Vitest's main process, its forks, Chrome, geckodriver and Firefox are not sandbox services, and a `kill -9` of the run orphans them too. `resolve-ports` writes a run marker and the owner's identity (`NULO_E2E_OWNER_PID` plus its `/proc` start time) into `ports.json`; `agent.sh` exports them as `NULO_E2E_RUN`, `NULO_E2E_RUN_OWNER` and `NULO_E2E_WORKTREE` (the repo root), and every process of the run inherits them (Puppeteer and the Firefox launcher pass the environment through; Firefox's launch refuses a browser without its launch marker. Chrome inherits them but overwrites its environ region with its process title, in the browser and every child, so no Chrome ever shows a marker: every run's setup and teardown keep the extension-path Chrome sweep, and `e2e:reap` runs it while no live run holds the worktree). `e2e:reap`, and global setup before its boot window, stop every process whose own environ names this worktree and a run owner that is dead, with the same re-check and `unknown` rules, except a process that carries a launch marker: sandbox services and Firefox launches belong to their own sweeps, which honour their records' owners. Setup runs the run sweep after `reconcilePriorLock`, so it never sees a pack before the reuse decision. A live run's processes name a live owner, and a reused pack carries launch markers, so neither path can touch them. Bare runs carry no run marker and keep today's orphan handling (`killOrphanChromes`, scoped by extension path).

The sandbox side (`global-setup.ts`, `lockfile.ts`, `reap.ts`):
- Anvil, the node and the playground get one marker each in their spawn env. `OwnedState` gains `markers: { anvil?, aztec?, playground? }` and `owner: { pid, startTime }` (the vitest main process), written in the provisional lock before the first spawn. `readLock` validates the shape (as `ownership.ts`'s `isRecord` does) and treats anything else as unreadable.
- The node's run dir is created directly under `E2E_DATA_ROOT` with the `nulo-aztec-` prefix and stamped with the node's marker (a `.nulo-launch` file), the way Firefox profiles are; the node gets `<run dir>/data` as its `--data-directory`, so the stamp sits outside anything the node writes or wipes. A path is deleted only after `realpath` shows it directly under the root, with the prefix, holding the stamp that matches the record's marker.
- The synchronous exit hooks (`bestEffortKill`, `global-setup.ts:801`) signal `-pid` today without checking the leader. They signal a group only while its leader is alive (`exitCode` and `signalCode` both null); for an exited leader they run a synchronous marker sweep, SIGTERM only, with the environ re-read before each signal.
- In-run teardown, per service in today's order: `killProcessGroup` as now, then the marker sweep, SIGTERM then SIGKILL. The service's final status is the sweep's (`stopped`, `retained` or `unknown`); without `/proc` it is the group's. The data dir and the lock go only when all three are `stopped`.
- Reconciliation and the provisional lock run under a worktree reconcile lock (`.e2e-state/reconcile.lock`, created exclusively; a dead holder's is broken only by the one waiter that creates its break file), which `e2e:reap` also takes: reading `owned.json`, reaping or adopting what it names and writing a new owner into it is one step, so two runs never act on one dead owner.
- `reconcilePriorLock` returns `fresh`, `reused` or `refused`. A lock whose owner is alive belongs to another run in this worktree: the setup throws before `markBootStarted()` (a usage error, not exit 86) and leaves the lock alone. A lock whose owner is dead is reaped by marker; if a service is not `stopped`, the setup also throws before the boot window and keeps the lock and the data dir. Only a fully stopped prior run's lock is cleared.
- **Reuse** (bare runs only: an agent run's fresh ports never match a prior lock) rewrites the lock's `owner` to the current vitest process before anything else. The reused services still name the dead first owner in their environ, so every sweep of a lock's services also refuses while the lock's own owner lives: `e2e:reap` or a second bare run in the worktree cannot stop a sandbox a live run has adopted.
- `reap.ts`: the same, plus the data-dir sweep deletes a `nulo-aztec-*` dir only when the pid in its name is dead, no process's command line names its path (the node gets it as `--data-directory`), and, for a stamped dir, no live process carries its stamp's marker. An unreadable `/proc` keeps every dir. The command-line check is what lets the dirs runs left before this change go.
- A lock without markers (written before this change) is never signalled. If every pid it records is dead, it is cleared like a stopped run's; if any lives, `reconcilePriorLock` refuses and prints the pids for a manual check, as `e2e:reap` does. Raw pid signalling goes (`killOrphanByPid` is deleted).

**No adoption under a claimed pack** (`global-setup.ts`). When `NULO_E2E_RUN_ID` is set, every port in the pack was claimed for this run moments before, so a listener on one is never this run's.
- After `markBootStarted()`, `assertPackFree(ports)` bind-tests the five ports and throws, naming the service and port, when one is held.
- Readiness then also requires this run's child to be alive: `waitForAnvil`, `waitForLocalNode` and the playground's wait fail as soon as the spawned child has exited, a pending probe included, so a stranger that binds after the check and answers the probe is never taken for ours. On Linux an answer also counts only when every socket listening on the port is held by a process carrying the service's marker, which covers a stranger answering while the child is alive but not yet bound.
- Under `E2E_REQUIRE_SETUP=1`, a playground that fails to come up fails the boot, as anvil and the node do.
- Each throw sits inside the boot window, so `classify-exit` maps it to exit 86 and the CI wrapper retries once on fresh ports.
- The adopt-on-probe paths of `ensureAnvil`, `ensureAztecNode` and `ensureDevServer` run only for a bare run (no run id), where the developer started the services; there adoption still trusts `--slots-in-an-epoch 1`, and the e2e-testing skill says so.

### Arc 1b: waits, skips and the stall (#162, #163, #161, #155)

- **#162, Lock page after a worker restart.** Investigate first: un-skip the test, run it at retry 0 on both browsers, and log the config client's port lifecycle around the hanging `getValue`. The working hypothesis is the one `lessons.md` records: a port that reconnects under a mounted page replays nothing, and a request sent before the reconnect never answers. The expected fix is the settings hub's pattern (`settings/index.vue:49-60`): the page re-reads on each `onConnected` after the first and clears `isLoading` once a read lands, with the hub's read generation and update fence, so a late answer to an older read never overwrites a newer value or an `onUpdate` that arrived since. The test drops its stale three-blocker comment. Stop rule: if the cause sits in the service transport (`packages/extension-messaging`) and the fix exceeds about 50 lines, keep the skip, comment the diagnosis on #162 and leave it open (the arc ships the rest).
- **#163, passkey backup export on every host.** The transient check stops polling. Before the agree click, the test arms an in-page `MutationObserver` (subtree, child list, character data, attributes). On every callback it reads the live DOM and sets a flag once, in one callback, a connected `backup-status-card` reads "Creating your backup" and `download-backup-btn` is disabled and reads "Creating Backup". The test then waits for the existing completion signal (both CTAs enabled) and asserts the flag. Mutation records hold live node references, not snapshots, so the flag is taken from the DOM at callback time, never from a removed node. A card inserted and removed within one batch leaves the flag unset, so the observer can fail but never pass falsely. Vue inserts the card and removes it in separate tasks (the backup chain awaits worker RPCs in between), so a callback runs while the card is connected; the three local runs per browser prove it, and if one fails on a missing flag the fallback is a build-armed hold gate, with its five-place cost, recorded as a decision before it is built. The `skipIf(CI)` goes. The hosted duration is measured before the PR opens: push the arc branch and dispatch `pr-extension-smoke-e2e.yml` and `pr-extension-smoke-e2e-firefox.yml` on it, three times each. CI smoke runs at the config's `retry: 2`, so a slow attempt can cost three times its budget. If an attempt exceeds 240 s there, profile the chain; if it still cannot fit, keep the skip, comment the numbers on #163 and leave it open (the observer half still ships).
- **#161, the anchor sleep.** Delete all five sleeps and the constant with its stale comment. Run every file that reaches one at retry 0, three times each. A file that then fails on a stale anchor gets a condition wait at that one site (the PXE's synced block reaching the transaction's block), never the sleep back. `store-captures` runs with `STORE_CAPTURES=1` on Chrome only; its PNGs under `apps/extension/store/captures/` are tracked store art, so restore them with `git checkout` after the run and never commit them.
- **#155, stall watchdog and heap cap.** Two separate decisions, each calibrated on the signal it acts on, never by guess.
  - **Watchdog.** A reporter (`apps/extension/tests/e2e/stall-watchdog.ts`), added by `e2eReporters({ stall })` to the network and `all` configs only. It arms at the first `onTestModuleStart` (global setup has its own budget and the exit-86 classifier) and records the time of every reporter event: module start and end, `onTestCaseReady`, `onTestCaseResult`, `onHookStart`, `onHookEnd`, `onUserConsoleLog`. It runs in two modes:
    - `observe` (the first commit of the phase): it prints the longest silent gap of the run, per file, at the end, and acts on nothing.
    - `enforce`: after `T` of silence it prints the running tests and their files, writes `.e2e-state/stalled`, sets `process.exitCode = 1`, calls `vitest.cancelCurrentRun("stall")` without awaiting it (so no new file starts), and arms its own escalation timer: 30 s later it SIGKILLs this run's fork processes, found under `/proc` as children of the vitest process whose command line is vitest's fork worker entry, never by any wider rule. Global teardown then stops the sandbox as on any failed run. `classify-exit` sees tests started, so the code passes through as a test failure, never 86. The timers are cleared on `onTestRunEnd`; the sentinel is removed with the other boot markers at `agent.sh` start.
    - Calibration: `observe` runs through N-full on both browsers locally and through the PR's CI network jobs (a first push of the arc branch, dispatched with `workflow_dispatch` before the PR opens). `T = max(10 min, 2 × the longest gap seen)`, rounded up to a minute. If `T ≥ 20 min`, a 30-minute job gains too little: the reporter is deleted, and #155 gets the numbers as a comment.
    - Limit, stated in the reporter's header: a test that logs while it hangs keeps the watchdog quiet; its own timeout is what stops it.
  - **Heap cap.** The same `observe` run logs, from a 1 s sampler in `network-setup.ts` (removed before the PR), each fork's peak `heapUsed` and its default `heap_size_limit`, locally and in the dispatched CI jobs. `C = 2 × the highest peak` MiB, rounded up to 512. The cap ships only if `C` is at least 512 MiB below the lowest default limit a hosted fork reported (on this host the default is 4288 MiB): a cap at or above the default limits nothing. Shipped, it is `test.execArgv: ["--max-old-space-size=C"]` in the network and `all` configs, and one assertion proves a fork started under it reports `heap_size_limit` near `C`. Not shipped, #155 gets the numbers (A3). The cap bounds the V8 heap only; WASM memory, Chrome and the sandbox are outside it, and the config comment says so. This decision is independent of the watchdog's.

### Arc 2: the e2e type gate (#194)

- **#194.** Type the context of `firstTwoAccountsFixture` (`fixtures/extension.ts:484`) as `object`, then fix the remaining errors with type-only edits: annotations, a narrowed cast at a `page.evaluate` boundary, or a typed helper where one pattern repeats (the `chrome.storage.*.get` reads in `fixtures/journal.ts` are the bulk). No edit may change what a test does. Add `apps/extension/tsconfig.e2e.json` with `include: ["tests/e2e/**/*.ts"]` and the scripts config's options except `types`, which is `["node", "vite/client", "chrome-types"]`: e2e runs on Node, and a `Bun` global must stay an error, as the name scan makes it today. It reaches about 27 `src` modules through `@/` imports; if any reports an error under these options that `vue-tsc` does not, the options move toward `tsconfig.json`'s (its `lib` and `esModuleInterop`) until `src` is clean, and no `src` file is edited for the gate. The probe is re-run with this exact config before any fix, and its counts, split `tests/e2e` versus `src`, go in `lessons/phase-2.md`. Append `&& tsc -p tsconfig.e2e.json` to the extension's `typecheck`; `typecheck:all` and CI's `_lint-and-typecheck.yml` pick it up with no workflow edit. `scripts/e2e/unresolved-names.test.ts` filters seven codes (TS2304, 2552, 2305, 2724, 2459, 2614, 18004) out of a program over every `.ts` under `tests/e2e`; the full compiler over a superset of those files reports all seven, so it goes (D10), once the gate's file list is shown to contain the scan's and the diff adds no `@ts-nocheck`, `@ts-ignore` or `@ts-expect-error`. The e2e-testing skill's "outside typecheck" line is rewritten.

### Arc 3: coverage and the playground (#164, #153, #165)

The playground stays generic: every new control reaches the wallet only through `@aztec-labs/wallet-sdk`, and every existing control keeps its behaviour and testid.

- **#164, multicall nonces.** Red first: `tx-sendTx-multicall.test.ts` reads the dApp's `sendTx` result and waits for the record to settle, and asserts success and the recipient's public balance delta (three or seven times the amount). On the base commit that must fail on the Token's nonce refusal; if it passes, the claim did not hold and the issue gets that comment. Then `buildTransferExec` passes nonce 0 for every call where `from` is the sender.
- **#153, NO_FROM sends.** The existing NO_FROM button keeps sending a public call, and its test now asserts the refusal instead of "ok or error": status `error` with exactly `UNCLASSIFIED_ERROR_MESSAGE` (imported from `error-envelope.ts`; the wallet deliberately gives a dApp nothing more for an unclassified throw), and the request's journal record failed. The cause, the private-only rule, is proven where it can be seen: a `tx-request-builder.pins.test.ts` case that a NO_FROM public call throws "DefaultEntrypoint only supports private functions". The dApp-facing text stays constant. A new control, `pg-btn-sendTx-noFrom-sponsored`, sends one private call with `from: "NO_FROM"`: `SponsoredFPC.sponsor_unconditionally()` on the canonical sponsor, which takes no arguments, reads no sender and pays its own fee. The test grants the `transaction-contracts` bundle and the playground registers the sponsor's instance and artifact through `registerContract` first. Two new cases in `tx-sendTx-noFrom.test.ts`: one sponsored send returns `ok` with a transaction hash and its record reaches `succeeded`; two concurrent sponsored sends serialize, return two distinct hashes, and both records reach `succeeded` with a mined receipt (`waitForTxMined`-style node poll, as the fixtures already do). Serialization needs evidence that excludes the gate's timed-out release, as the e2e-testing skill requires: the snapshot that shows the first at `proving` and the second `queued` must be read within `PROOF_GATE_HOLD_MS` of the first record's `enteredProveAt`, as `auto-lock-defers-while-proving.test.ts:62` does, or the test fails; the gate is released in `finally`. Once, locally, the execution mutex is bypassed by a scratch edit to show this case then fails; the red run goes in `lessons/phase-3.md` and the edit is reverted. They spend no notes, so #218's same-source limit does not apply. If the file's measured time grows past 3 min, the concurrent case moves to the heavy-concurrent job with its four workflow lists and the `behavior-gating.test.ts` pin.
- **#165, private transfer rows.** A `pg-select-transferFn` select, an allowlist of four functions (`transfer_public_to_public` by default, so no existing test moves; `transfer_private_to_private`, `transfer_private_to_public`, `transfer_public_to_private`), feeds the default send button only. The NO_FROM, fee-payer and multicall buttons keep building `transfer_public_to_public`, so the NO_FROM refusal stays a refusal whatever the select shows. `tx-transfer-row.test.ts` gains one case per private-touching kind: open the execute window, assert the row's label, `data-intent-kind="transfer"`, the sender kind and the amount, then reject; fund the private balance through the existing mint path if the window needs it. For the discovered-authwit half: run `tx-sendTx-delegated-authwit.test.ts` with `NULO_E2E_STANDARD_CONTRACTS=1` on the local network. If it passes (recon's inference: 6.0.0-rc.1 seeds `PublicChecks` at genesis), delete the env gate, import the rig's pull token into the wallet, and assert `execute-discovered-authwit-structured-args`, its toggle and the transfer row. If it fails, keep the gate, add nothing untestable, and comment on #165 that the discovered half stays open; the PR then says `Refs #165`, not `Closes`.

### Arc 4: ESM configs (#186)

- **#186.** Add `"type": "module"` to `apps/extension/package.json`, as the landing has. Rename the root `vitest.base.ts` to `vitest.base.mts` and update its eleven importers, `biome.json`'s `files.includes` entry (otherwise Biome silently stops linting the file), `ARCHITECTURE.md`'s test table and the `CLAUDE.md` link. Before the switch, list every `.js` file under `apps/extension` outside `src/` and every `__dirname`, `require(` and `module.exports` in configs and scripts that Node loads natively; each must already be ESM-safe (the shim stays `.cjs`). Changing how every unit suite's config loads is a test-runtime change, so the proof is CLAUDE.md's full soak matrix at one clean head commit after `bun install --frozen-lockfile`: `scripts/ci-cd/test-soak/cli.ts soak` at 30 retry-0 runs per suite on both engines (Node reference, Bun candidate) for every workspace whose config imports the base, `compare` per workspace with an exact inventory, `bun run test:all` five times, and a `workflow_dispatch` of `pr-quick.yml` bound to that commit; plus `build`, `build-storybook`, and one smoke and one network file that load the e2e configs (D9). The archived `vitest-on-bun` plan is the procedure.

### File-level change map

| Phase | Production / harness files | Tests |
|---|---|---|
| 1.1 | `apps/extension/tests/e2e/port-registry.ts` (new) | `apps/extension/scripts/e2e/port-registry.test.ts` (new) |
| 1.2 | `scripts/e2e/resolve-ports.ts`, `scripts/e2e/agent.sh`, `tests/e2e/reap.ts`, `tests/e2e/fixtures/browser/firefox.ts` | `scripts/e2e/resolve-ports.test.ts` |
| 1.3 | `tests/e2e/owned-processes.ts` (new), `fixtures/browser/ownership.ts`, `fixtures/browser/firefox.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/lockfile.ts` (`killOrphanByPid` deleted, `readLock` validated), `tests/e2e/reap.ts`, `scripts/e2e/resolve-ports.ts` and `agent.sh` (run marker) | `scripts/e2e/owned-processes.test.ts` (new), `scripts/e2e/webdriver-ownership.test.ts` (owner rule, `unknown`) |
| 1.4 | `tests/e2e/global-setup.ts` | `scripts/e2e/boot-guard.test.ts` (new) |
| 1.5 | `tests/e2e/README.md`, `tests/e2e/FIREFOX.md`, `.claude/skills/e2e-testing/SKILL.md` | — |
| 1.6 | `src/popup/pages/settings/lock.vue` (or the narrowest layer the investigation names) | `src/popup/pages/settings/lock.test.ts`, `tests/e2e/sw-resilience.test.ts` |
| 1.7 | — | `tests/e2e/passkey-backup.test.ts` |
| 1.8 | `tests/e2e/fixtures/helpers.ts` | `network/fee-methods`, `selfpay-phase`, `store-captures` `.test.ts` |
| 1.9 | `tests/e2e/stall-watchdog.ts` (new), `vite.shared.ts`, `vitest.e2e.network.config.ts`, `vitest.e2e.all.config.ts`, `scripts/e2e/agent.sh` (clears `stalled`) | `scripts/e2e/stall-watchdog.test.ts` (new) |
| 2.1 | `apps/extension/tsconfig.e2e.json` (new), `apps/extension/package.json`, `tests/e2e/**` (type-only), `.claude/skills/e2e-testing/SKILL.md` | `scripts/e2e/unresolved-names.test.ts` (deleted) |
| 3.1 | `apps/playground/src/sections/transactions.ts` | `network/tx-sendTx-multicall.test.ts` |
| 3.2 | `apps/playground/src/sections/transactions.ts`, `apps/playground/README.md` | `network/tx-sendTx-noFrom.test.ts` |
| 3.3 | `apps/playground/src/sections/transactions.ts`, `apps/playground/README.md` | `network/tx-transfer-row.test.ts`, `network/tx-sendTx-delegated-authwit.test.ts` |
| 4.1 | `apps/extension/package.json`, `vitest.base.ts` → `vitest.base.mts`, eleven `vitest.config.ts`, `biome.json`, `ARCHITECTURE.md`, `CLAUDE.md` | soak evidence in `lessons/phase-4.md` |

### Trade-offs and alternatives not taken

- **A per-worktree deterministic port range instead of the registry.** Cheaper, but two worktrees can still hash into overlapping windows and no other agent can see what a run holds. The registry is the host's standard and already live.
- **The `my-stack` template's registry format.** Rejected: it uses another lock (`mkdir ports.lock`) and another column order than the file this host actually has, so it would race the live writer.
- **Pgid plus leader start time as ownership.** Rejected for the same reason `ownership.ts` rejects it: once the leader and group are gone, both numbers can be reissued.
- **A build-armed hold gate for the backup export.** Rejected: a new `VITE_NULO_E2E_*` flag touches the build guard, `agent.sh`, two workflows and their pins, for one assertion an observer makes deterministic.
- **Restoring a shorter anchor sleep.** Rejected: the wallet retries stale-anchor reads (`withStaleAnchorRetry`); a wait stays only where a retry-0 run proves it, and then as a condition.
- **A smaller parity soak for #186.** Not taken: CLAUDE.md binds any test-runtime change to the full matrix, and how every unit config loads is part of the test runtime (D9).
- **Keeping `unresolved-names.test.ts` next to the type gate.** Not taken: the compiler reports the same names with no second list to maintain (D10).

### Competing outline (cheapest first)

Sent to both audits as the alternative:
1. #169: a deterministic per-worktree base window plus the bind test; markers for teardown; no registry.
2. #155: close as "no evidence" with the 60-run record, no code.
3. #163: the observer only; keep the CI skip.
4. #194: the tsconfig plus `// @ts-nocheck` on the failing files, removed as files are touched.
5. #186: set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true`.
6. #165: the playground select and private rows only.

The main plan wins on the quality bar: the outline leaves cross-agent visibility out (1), keeps an unproven CI skip (3), creates a ratchet nobody owns (4), hides a loader change Vite says will break (5), and #155's issue asks for code the calibration can either justify or refute with numbers (2).

## Phases

**Shared gate commands.** Run every command from the worktree root unless it names another directory. `<files>` are relative to `apps/extension`.

- **Fast:** `bun run lint`, `bun run typecheck:all`, `bun run test`.
- **Unit (file):** `cd apps/extension && bun --bun vitest run <files>` (the extension's unit config, which includes `scripts/**/*.test.ts`).
- **Smoke build (armed), per browser `<b>` (`chrome` or `firefox`):** `cd apps/extension && VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<b>`. Rebuild it after any plain `build` (including the one `audit:vue` ends with), which disarms the dist.
- **Smoke (file):** after the armed build, `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- <files> --retry=0`; then the Firefox build and the same command with `NULO_E2E_BROWSER=firefox EXTENSION_PATH=$PWD/dist/firefox`.
- **Network (file):** `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 [NULO_E2E_PROVERLESS=1] bun run e2e:agent <files>`, then the same with `NULO_E2E_BROWSER=firefox`. `agent.sh` builds its own armed dist. Use `NULO_E2E_PROVERLESS=1` exactly when the file runs proverless in CI (every network file but the five canary files).
- **N-full (the CI partition, locally, one browser at a time):**
  1. Pool: `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 bun run e2e:agent` with one `--exclude` per file in `pr-extension-network-e2e.yml`'s `exclude_files`.
  2. Heavy: the same env with `tests/e2e/network/fee-methods.test.ts tests/e2e/network/selfpay-phase.test.ts tests/e2e/network/concurrent-sendtx-confirm.test.ts tests/e2e/network/same-token-concurrent-sends.test.ts`.
  3. Canary: `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 bun run e2e:agent` with the five canary files (prover-ON).
- **Setup drills** (the e2e-testing skill's proof for a `global-setup.ts` change): the reuse drill (bare `bun run test:e2e:network` on a pinned pack, `kill -9` the vitest group after deploy, run again: `reusing prior sandbox (identity check passed)`); the reap drill (`e2e:agent` afterwards: the prior pack is reaped by marker); the fail-loud negative (empty `HOME` on free ports: the anvil FATAL before any spawn).
- **Host etiquette.** Never run two `e2e:agent` runs in one worktree at once. Until arc 1a merges, run no network suite while another lane's runs on the host: check `~/.agents/ports.md` for live `nulo-e2e-*` rows and `pgrep -fa 'vitest.e2e.network'` first, and wait while any exist.
- **Pass, for every test command:** exit 0 at retry 0, and vitest's summary shows every target test ran (none skipped, unless the plan names the skip). One rerun is allowed for a failure the e2e-testing skill lists as a known flake; record it in the phase's lessons file.
- **Workflow edits** (only if Phase 3.2 moves a file to a dedicated job): add `bun run lint:actions` and `bun run test:ci-gating`.

### Arc 1a: run isolation (#169)

**Phase 1.1: host registry client.**
1. Write `tests/e2e/port-registry.ts` to the interface above.
2. Write `scripts/e2e/port-registry.test.ts` against a temp registry file, with the lock wait shortened through an options argument. One case each: a claim writes six-cell rows under a written header when the file is absent; a port another row lists is refused with `PortClaimConflict` and nothing is written; a dead `nulo-e2e-*` row is dropped while a live one, a pid-1 one (`EPERM`), a dead row of another label and an unparsed line survive byte for byte; a foreign row with a `|` inside its worktree cell still excludes its port; release drops only this run's rows; `releaseDeadRows` drops only dead rows of the named worktree; a lock of any age makes the claim fail closed after its wait and is left byte for byte as it was; a lock released during the wait lets the claim through; release never unlinks a lock holding another token or an empty one; three claimers in separate processes, each appending its enter and exit times to a shared log inside the critical section, never overlap, and a foreign row written beforehand survives every rewrite; two concurrent claims for one port: exactly one wins.

Validation gate: Fast; Unit (file) `scripts/e2e/port-registry.test.ts`. Pass: exit 0, every case green. Layers: lint, typecheck, unit.

**Phase 1.2: claim the pack, release it at the end.**
1. Add the `exclude` parameter to `reservePort`; make `reservePortPack` exclude registered ports.
2. Add the claim, the bounded re-draw, `runId` and the refusal without an owner pid to `main()`; add the `--release <runId>` mode.
3. Export `NULO_E2E_OWNER_PID` and `NULO_E2E_RUN_ID` in `agent.sh`; add the status-preserving `EXIT` trap and the release line before the `exec`; add `releaseDeadRows` to `reap.ts`.
4. Pass `registeredPorts()` to `reservePort` in `firefox.ts`.
5. Extend `resolve-ports.test.ts`: `reservePort(exclude)` never returns an excluded port (exclude every port of the static window but one; the draw returns that port or an ephemeral fallback); the control, with no exclusions, returns a static-window port. A failed `ports.json` write releases the claim. `main()` without `NULO_E2E_OWNER_PID` writes no row.

Validation gate: Fast; Unit (file) `scripts/e2e/resolve-ports.test.ts`; Network (file) `tests/e2e/network/networks.test.ts` on Chrome, with `~/.agents/ports.md` read during the run (five `nulo-e2e-*` rows under one run id) and after it (none); then `NULO_E2E_BROWSER=bogus bun run e2e:agent tests/e2e/network/networks.test.ts`, whose `build:bogus` fails after the claim, exits with the build's non-zero status and leaves no row. Pass: all as stated.

**Phase 1.3: ownership by marker.**
1. Move the marker primitives to `tests/e2e/owned-processes.ts`; `ownership.ts` imports them; add the `NULO_E2E_OWNER` env and the `unknown` outcome, used by Firefox launches too.
2. Add the markers and the owner to `OwnedState`, the spawn envs and the provisional lock; validate `readLock`'s shape; stamp the node's run dir and pass `<run dir>/data` to the node.
3. Add the marker sweep to teardown, `reapPrior` and `reap.ts`: per-service status from the sweep, `reconcilePriorLock`'s `fresh`/`reused`/`refused`, the owner rewrite on reuse and the lock-owner refusal in every sweep, the throw before `markBootStarted()` on `refused` or a not-stopped prior run, the stamped data-dir deletion, and the legacy rule that signals nothing. Delete `killOrphanByPid`.
4. Add the run marker: `resolve-ports` writes it and the owner identity into `ports.json`, `agent.sh` exports the three variables, and `reap.ts` and global setup sweep dead runs of this worktree, skipping launch-marked processes, after `reconcilePriorLock`.
5. Gate the exit hooks on a live leader, with the synchronous marker sweep for an exited one.
6. Write `scripts/e2e/owned-processes.test.ts`, one case each:
   - a detached group whose leader exits while a marked child lives is stopped by the sweep, and a sibling spawned the same way without the marker is still alive afterwards;
   - a marked process whose `NULO_E2E_OWNER` names a live process is never signalled, even when the record asking for the sweep names its marker;
   - an unreadable environ (a process of another user, or a stubbed reader) makes the result `unknown`, and the caller keeps the lock and the data dir;
   - a data dir outside the root, without the prefix, or with a stamp naming another marker is never deleted;
   - a lock without markers is never signalled: all pids dead clears it, one live pid refuses;
   - an unstamped data dir whose path a live process's command line names is kept, and the same dir is deleted once that process exits;
   - a reused lock (owner rewritten to a live process) refuses the sweep of services whose environ names a dead owner, and the same lock with a dead owner lets it run;
   - a process carrying this worktree's run marker and a dead run owner is stopped; one carrying a live run owner, one naming another worktree, and one also carrying a launch marker are not;
   - the combined path: a service started under an agent run, whose run owner and launch owner then die, is adopted by a bare run's reuse; `e2e:reap` leaves it running; once the adopting owner dies, `e2e:reap` stops it;
   - the exit hook sends no group signal for a handle whose leader has exited (a `process.kill` spy sees no negative pid), and a live leader's group gets its SIGTERM.

Validation gate: Fast; Unit (file) `scripts/e2e/owned-processes.test.ts scripts/e2e/webdriver-ownership.test.ts scripts/e2e/process-group.test.ts` (the Firefox ownership file now asserts the owner rule and `unknown`, not just its imports); Smoke (file) `tests/e2e/navigation.test.ts` on both browsers; Network (file) `tests/e2e/network/networks.test.ts` on both browsers, with a one-off check at boot-ready that each service leader's process tree (`/proc/*/stat` ppid walk) equals its marker scan, recorded in `lessons/phase-1.md` (I7); the three setup drills. Pass: exit 0; after each network run, `grep -l` over `/proc/*/environ` finds no process carrying a marker or the run marker that run recorded; each drill prints what § Shared gate commands says.

**Phase 1.4: no adoption under a claimed pack.**
1. Add `assertPackFree` after `markBootStarted()` when `NULO_E2E_RUN_ID` is set; gate the three adopt probes on its absence; make the three readiness waits fail once the spawned child has exited; make a playground failure fatal under `E2E_REQUIRE_SETUP=1`.
2. `scripts/e2e/boot-guard.test.ts` (new), each a never-happens case with its control:
   - with a run id, a pack whose anvil port is held by a test socket throws naming `anvil` and the port; the same pack with the socket closed passes;
   - with a run id, a stranger answering as chain 31337 on the anvil port fails the boot; without a run id, the same stranger is adopted;
   - a readiness wait whose child exits while a stranger answers the probe fails within one poll; a live child reaches ready.

Validation gate: Fast; Unit (file) `scripts/e2e/boot-guard.test.ts scripts/e2e/anvil-probe.test.ts scripts/e2e/classify-exit.test.ts`; the reuse drill again (a bare run still adopts). Pass: exit 0, drill as stated.

**Phase 1.5: docs and the isolation proof.**
1. Rewrite `tests/e2e/README.md`'s parallel-safety section and isolation table; replace the manual `pkill -f "anvil.*--port"` with `bun run e2e:reap`. Update `FIREFOX.md` for the moved module and the e2e-testing skill's registry, reap and adoption lines.
2. Make a scratch second worktree of this branch outside the repo (`git worktree add`), `bun install --frozen-lockfile` there.
3. Concurrency proof: in both worktrees, within 10 s of each other, start `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/networks.test.ts tests/e2e/network/connect-deny.test.ts tests/e2e/network/sim-methods.test.ts`. Record both port packs and read the registry during the runs.
4. Kill proof: start both again; when both report boot-ready, `kill -9` worktree 2's `agent.sh` and vitest main process. Worktree 1 must finish green. Then run `bun run e2e:reap` in worktree 2 and confirm no process carries its markers or its run marker (Chrome and the forks included), and its registry rows are gone.
5. Remove the scratch worktree (`git worktree remove`).
6. Full suites for the arc: N-full on Chrome and on Firefox, Smoke on both browsers (the whole suite: the armed build, then the Smoke command with no files), `bun run test:ci-gating`.

Validation gate: steps 3 to 6. Pass: distinct packs, both rows sets present during and absent after, both runs green; in the kill proof the survivor is green and the reap leaves zero marked processes; every suite exits 0. Layers: unit, smoke e2e, network e2e (both browsers), CI gating.

### Arc 1b: waits, skips and the stall (#162, #163, #161, #155)

**Phase 1.6: the Lock page after a worker restart (#162).**
1. Un-skip the opt-out test; run it at retry 0 on Chrome; capture the config client's port events around the hanging read.
2. Fix at the layer the capture names (expected: re-read on each later `onConnected` in `lock.vue`). Apply the stop rule in § Arc 1b.
3. `lock.test.ts`: a second `onConnected` re-reads and clears `isLoading`; the control, a first connection, reads once; an answer to the first read that resolves after the re-read's answer is ignored.
4. Delete the three-blocker comment.

Validation gate: Fast; Unit (file) `src/popup/pages/settings/lock.test.ts`; Smoke (file) `tests/e2e/sw-resilience.test.ts` on both browsers, three runs each. Pass: exit 0 in all six runs, with the opt-out test reported as run, not skipped.

**Phase 1.7: the backup export case on every host (#163).**
1. Replace the 15 s poll with the armed observer; assert its record after the CTAs enable.
2. Remove `test.skipIf(process.env.CI === "true")` and its comment.

3. Push the arc branch; dispatch the two smoke workflows on it three times each (`gh workflow run pr-extension-smoke-e2e.yml --ref e2e-harness-gaps-waits`, then the Firefox one); read each attempt's duration from the job log.

Validation gate: Fast; Smoke (file) `tests/e2e/passkey-backup.test.ts` on both browsers, three runs each; step 3. Pass: exit 0 everywhere, the export case reported as run, and no hosted attempt over 240 s; every duration, local and hosted, recorded in `lessons/phase-1.md`. Otherwise § Arc 1b's stop rule.

**Phase 1.8: the anchor sleep (#161).**
1. Delete the five sleeps, the constant and its comment.
2. Run each file that reached one: `fee-methods`, `selfpay-phase` (heavy, proverless), `store-captures` (`STORE_CAPTURES=1`, Chrome), and `sendTransfer`'s callers (`transfers` prover-ON; `profile-switch-sweeps-transfer`, `imported-account-execution`, `account-switch-isolation`, `auto-lock-defers-while-proving`, `in-flight-send-guard`), three times each at retry 0.
3. For a stale-anchor failure, add a condition wait at that site only, and rerun three times.
4. `git checkout -- apps/extension/store/captures` after `store-captures`.

Validation gate: Fast; step 2's runs on Chrome, and one run of each on Firefox except `store-captures`. Pass: all exit 0; `git grep PXE_ANCHOR_SYNC_WORKAROUND_MS` prints nothing; `git status` shows no change under `store/captures`. Three local runs are weak evidence against a timing race, so the issue closes on more: the arc PR's network lanes run every one of these files at retry 0 on both browsers, and their results go in the PR body.

**Phase 1.9: stall watchdog and heap cap (#155).**
1. Write the reporter in `observe` mode and the temporary heap sampler; wire both into the network and `all` configs; commit.
2. Calibrate: N-full on both browsers locally, then push the arc branch (no PR) and dispatch `pr-extension-network-e2e.yml` and `pr-extension-network-e2e-firefox.yml` on it with `gh workflow run --ref e2e-harness-gaps-waits`. Record each job's longest gap, each fork's peak `heapUsed` and its default `heap_size_limit` in `lessons/phase-1.md`. Compute `T` and `C` per § Arc 1b.
3. If `T ≥ 20 min`: delete the reporter, record the comment for #155, keep step 4. Otherwise switch it to `enforce` with `T` and write `scripts/e2e/stall-watchdog.test.ts`. It spawns the nested run with `node` (the e2e runtime), never Bun: vitest runs on a fixture whose test awaits a promise that never settles (test timeout 10 min, `stallMs` 2 s); the run exits non-zero within 90 s, `.e2e-state/stalled` names the test, and no fork of that run remains, while a detached child the fixture's global setup started (not a fork) is still alive; the control, a fixture that logs every second for 5 s, is never cancelled. The fork's command line is pinned to vitest 4.1.10 by this test, so a vitest bump that changes it reds here (I8). Add `stalled` to the markers `agent.sh` clears.
4. Apply the heap rule: ship `C` in `test.execArgv` with its assertion, or record the numbers for #155; delete the sampler either way.

Validation gate: Fast; Unit (file) `scripts/e2e/stall-watchdog.test.ts` (whichever of its two halves shipped); then the arc's full suites with the final configs: N-full on both browsers, Smoke on both browsers, `bun run test:ci-gating`. Pass: all exit 0; no stall report in a green run.

### Arc 2: the e2e type gate (#194)

**Phase 2.1: the e2e type gate (#194).**
1. Write `tsconfig.e2e.json`; run it once as the probe and record the counts, split `tests/e2e` versus `src`; align options until `src` is clean (§ Arc 2).
2. Fix the fixture context type; fix the rest, type-only, file by file.
3. Add the `typecheck` step; delete `unresolved-names.test.ts`; rewrite the skill line.
4. Prove the gate bites and covers: add `const x: number = "a"` to one e2e file, run `bun run typecheck:all`, see it fail, remove it; `tsc -p tsconfig.e2e.json --listFilesOnly` lists every `.ts` under `tests/e2e`; `git diff 4a357b7 -- apps/extension/tests | grep -c '^+.*@ts-'` is 0; a `Bun.sleep(1)` added to an e2e file fails the gate.

Validation gate: Fast; `bun run audit:vue`; `bun run test:ci-gating`; the armed smoke build (after `audit:vue`'s plain build), then Smoke on both browsers (whole suite); N-full pool and heavy on Chrome; Network (file) `tests/e2e/network/concurrent-sendtx-confirm.test.ts tests/e2e/network/networks.test.ts` on Firefox. Pass: all exit 0; step 4's probes fail, then pass once removed.

### Arc 3: coverage and the playground (#164, #153, #165)

**Phase 3.1: multicall nonces (#164).**
1. Strengthen `tx-sendTx-multicall.test.ts`; run it on the base playground; record the red.
2. Pass nonce 0; run again.

Validation gate: Fast; Network (file) `tests/e2e/network/tx-sendTx-multicall.test.ts` (proverless) on both browsers. Pass: red on the base for the nonce reason (or the claim is recorded as not holding), green after.

**Phase 3.2: NO_FROM sends (#153).**
1. Add the sponsored control; tighten the refusal case; add the two cases.
2. Time the file; move the concurrent case only per the 3 min rule.

Validation gate: Fast; Network (file) `tests/e2e/network/tx-sendTx-noFrom.test.ts` (proverless) on both browsers, three runs on Chrome. Pass: exit 0 in every run; both concurrent sends reach `succeeded`.

**Phase 3.3: private transfer rows (#165).**
1. Add the select and the three row cases.
2. Run the delegated file with the env set; branch per § Arc 3.

Validation gate: Fast; Network (file) `tests/e2e/network/tx-transfer-row.test.ts` and, if the gate is retired, `tests/e2e/network/tx-sendTx-delegated-authwit.test.ts` (proverless), on both browsers. Then the arc's full suites: N-full on both browsers. Pass: exit 0.

### Arc 4: ESM configs (#186)

**Phase 4.1: ESM configs (#186).**
1. Inventory and fix any CJS-only construct; add `"type": "module"`; rename and re-point `vitest.base.mts` in its importers, `biome.json`, `ARCHITECTURE.md` and `CLAUDE.md`. Commit, and keep the tree clean from here to the end of the gate.
2. Run the soak matrix the archived `vitest-on-bun` plan records, at that one commit after `bun install --frozen-lockfile`: for each of the eleven workspaces whose `vitest.config.ts` imports the base, `bun scripts/ci-cd/test-soak/cli.ts soak --cwd <ws> --runtime node --runs 30 --out <scratch>/<ws>-node.json` (the reference) and the same with `--runtime script` (the Bun candidate), then `compare <node.json> <script.json>` (outputs in a scratch directory outside the repo); `bun run test:all` five times; `gh workflow run pr-quick.yml --ref e2e-harness-gaps-esm` bound to that commit (push the branch, no PR).
3. Build, Storybook and the e2e configs: `bun run --cwd apps/extension build`, `bun run --cwd apps/extension build-storybook`, then the armed smoke build.

Validation gate: Fast; steps 2 and 3; Smoke (file) `tests/e2e/navigation.test.ts`; Network (file) `tests/e2e/network/networks.test.ts`; from `apps/extension`, `bun --bun vitest run > <scratch>/unit.log 2>&1; echo "vitest=$?"`, then `grep -c 'ESM syntax in a file loaded as CommonJS' <scratch>/unit.log`; from the repo root, `bunx biome check vitest.base.mts` prints `Checked 1 file`, so Biome still lints the renamed base. Pass: every soak `compare` passes with an identical inventory, all runs exit 0, the dispatched `pr-quick.yml` run is green at the soaked SHA, `vitest=0`, and the grep prints 0 (its own exit status 1 is expected).

## Security & Adversarial Considerations

- **Threat model.** Every party is a process of the same user on a shared host: other agents, other repositories' tooling (at least three writers use the registry today), a stale run. None is malicious by intent, but each can write `~/.agents/ports.md`, a lock file, `.e2e-state/owned.json` and the Firefox records. The failure to prevent is one run stopping, or corrupting the state of, another.
- **Hostile registry content.** Rows are never executed or interpolated into a shell; only our own rows are parsed whole, and every port any line lists is excluded. A pid read from the registry is used only for `kill(pid, 0)`; this code never signals it. Lines we cannot parse are kept byte for byte, so a malformed row cannot make us delete another tool's claims.
- **Forged or stale ownership records.** A lock or record names markers to stop. A forged one could name a live run's marker, so the decision to signal never rests on the record: a process is signalled only when its own environ carries the marker and names an owner (pid plus `/proc` start time) that is dead. The environ is re-read immediately before every signal, which narrows pid reuse to one read. An unreadable `/proc` yields `unknown`, which keeps the lock and the data dir. A lock written before markers existed is never signalled. The one exception to "the record never decides" is a sandbox a bare run reused: its processes still name their dead first owner, and the lock's rewritten owner is what guards them, so a lock in another worktree forged to name their markers could stop them. Markers are random per launch and appear only in this worktree's lock and those processes' environ, so only a same-user process that could signal them directly can forge one. `e2e:reap` releases registry rows only when their owner is dead.
- **Validated state.** `owned.json` is parsed against its shape and treated as unreadable otherwise. A data dir is deleted only when its `realpath` sits directly under `~/.cache/nulo-e2e` with the `nulo-aztec-` prefix and its stamp names the record's marker, so a forged path cannot point the delete elsewhere.
- **Marker strength.** Markers are `crypto.randomUUID()` (Node's CSPRNG). Any same-user process can read them from our record or our environ, so markers are a cooperative contract between runs, not authentication: they stop one run's cleanup from hitting another's processes by accident, which is the failure #169 records. A process bent on harm can already signal anything of the same user.
- **Lock races.** Claim and release rewrite the registry only under the `wx` lock; the 15 s stale break matches the live writer, so neither tool deadlocks the other. Ours carries a token, releases only its own lock, and never breaks one: a stale lock fails the claim closed, because no break of a path lock can rule out a third writer entering the emptied path. The other writers' own token-free break is the only remaining race, and it is theirs. Claims are advisory: the bind test and, under a run id, `assertPackFree`, the child-liveness check and, on Linux, the marked-listener check are what stop a run from using a port it does not hold.
- **Release builds.** Nothing here adds a `VITE_*` flag or touches `src/` beyond the Lock page; the e2e-only gates and the build guard in `_build-extension.yml` are unchanged. The stall watchdog and the heap cap live in e2e configs only.
- **Least privilege.** No workflow permission, secret, environment or repository setting changes. #155's watchdog runs inside the existing job.
- **Logging policy.** The watchdog prints test names, elapsed times and fork pids only. The Lock-page fix logs nothing new; any investigation logging is removed before commit.
- **Supply chain.** No new dependency. `@aztec-labs/noir-contracts.js` (SponsoredFPC) is already a playground dependency at the pinned Aztec line.
- **Domain risks.** The sponsored NO_FROM control calls a protocol contract that pays fees on the local network; it is a test dApp control, and the wallet's own classification of fee-method calls (`primary-method.ts`, `fpc-strategy.ts`) is exercised, not changed.

## UI impact

- **Arc 1a, arc 2:** none.
- **Arc 1b:** Settings → Lock stops hanging on "FETCHING SETTINGS" after a worker restart and shows its toggles, as it does on any other open. No layout, copy, row or format changes. Recorded in `OWNER-ASKS.md` as information, with no decision asked.
- **Arc 3:** the playground (a test dApp, not the wallet) gains a select and a button. No wallet surface changes. Whether the playground needs a sign-off is `OWNER-ASKS.md` Ask 1. Arc 3's PR carries a screenshot of the new controls and stays unmerged until the owner signs off or exempts the playground; the PR body quotes that message.

## Assumptions

### Facts

- F1. The host registry's live format and lock are as recon states. At least three writers use it (`bridge-sandbox-*` and `tools-e2e-*` from `alejoamiras/unleashed`, and an ad-hoc `hd-shots-*`); they release their own rows on a clean exit and never reap dead ones, so dead rows from 2026-09-30 to 2026-10-08 sit in the file and every pid-hint in it is dead today.
- F2. `agent.sh`'s `$$` survives the build, vitest and the `exec` into `classify-exit` (`agent.sh:231` uses `exec`).
- F3. `killProcessGroup` never signals a group whose leader exited (`process-group.ts:55-59`), pinned by `process-group.test.ts:71-80`.
- F4. `ensureAnvil` adopts any listener that answers as chain 31337 (`global-setup.ts:343-349`, through `probeAnvil`); `ensureAztecNode` adopts any listener whose health check passes; `ensureDevServer` adopts any HTTP response.
- F5. The network job's budget is 30 min; per-test timeouts reach 50 min; the last 60 network PR runs hold no failure (48 succeeded, 12 cancelled), which is weaker than 60 green runs.
- F6. Five anchor sleeps in four files; `withStaleAnchorRetry` wraps four PXE chain reads (`pxe/service.ts:507`).
- F7. `lock.vue`'s `onBeforeMount` awaits two `getValue` calls with no catch and no re-read (`lock.vue:138-146`); the settings hub re-reads on later connections (`settings/index.vue:49-60`).
- F8. The backup export case skips on `CI === "true"` and polls the transient card every 100 ms for 15 s (`passkey-backup.test.ts:111,144`).
- F9. A probe tsconfig over `tests/e2e` reports 461 errors, 312 from the fixture context type.
- F10. Vite 8.2.1 warns "ESM syntax in a file loaded as CommonJS" for the extension's configs and the root `vitest.base.ts`; eleven configs import that base.
- F11. The multicall builder passes nonce `i` with `from` equal to the sender (`transactions.ts:55-66`); the Token refuses a nonzero nonce then (the artifact's error string; `OperationCard.wire.test.ts:174` only shows the wallet displaying the nonce). Phase 3.1's red run is the proof.
- F12. NO_FROM accepts exactly one private call with embedded fee payment (`tx-request-builder.ts:341-351`, `dapp-send-executor.ts:831`).
- F13. `store-captures` writes the tracked PNGs under `apps/extension/store/captures/`.

### Inferences

- I1. `sponsor_unconditionally` as the only NO_FROM call yields a valid transaction on the local network, and two such transactions do not collide. Verified parts: the function reads no sender and only sets the fee payer and ends setup (the artifact's source), and `TxExecutionRequest` defaults its salt to `Fr.random()`, so two requests hash apart. Unverified: the wallet's NO_FROM path accepts it end to end. Phase 3.2 tests this first.
- I2. The local network at 6.0.0-rc.1 seeds `PublicChecks`, so the delegated-authwit file runs without the testnet (`@aztec-labs/standard-contracts` doc). Phase 3.3 tests this first.
- I3. The Lock page's hang is the port-reconnect pattern of `lessons.md`; Phase 1.6 confirms or refutes it before any fix.
- I4. A stalled fork stops only when killed: `cancelCurrentRun` (vitest 4.1.10, `cli-api` chunk) runs the cancel listeners and then awaits the running promise, so a test stuck on an await keeps it pending. The reporter therefore calls it without awaiting (no new file starts) and kills its own forks after the grace period; the unit test in Phase 1.9 proves the run then ends.
- I5. A V8 heap cap at twice the sampled peak leaves headroom a green run should not exhaust (sampling can miss the true peak, so the final full suites under the cap are the check), and limits something only if it sits below the default limit; WASM and Chrome memory are outside it. The default on this host is 4288 MiB, so Phase 1.9 measures the hosted default before shipping a cap.
- I6. Hosted CI runs the backup export within 240 s today. Unsafe as stated: the skip comment's 96-180 s per attempt is close to the budget, and CI smoke retries twice. Phase 1.7 measures it by dispatch before the PR opens.
- I7. Every descendant of a sandbox service inherits its marker. A child spawned with a scrubbed environment would escape the sweep; Phase 1.3 compares each leader's process tree with its marker scan once at boot-ready.
- I8. Vitest 4.1.10's fork worker is recognisable by its command line; the watchdog's unit test pins it.
- I9. The remaining type errors can be fixed inside `tests/e2e` without editing `src`; Phase 2.1's first probe with the final config checks it.

### Asks (each has a working assumption; none blocks the plan)

- A1. **Host slot for the isolation proof.** Until arc 1a merges, lanes run network e2e one at a time. Assumption: the implementer checks for live `nulo-e2e-*` rows and network vitest processes before Phase 1.5's two-run proof and waits while any exist.
- A2. **Soak scale for #186.** Resolved by rule, not assumed: CLAUDE.md binds any test-runtime change to the full matrix, and Phase 4.1 runs it (D9): about 660 soak runs plus a `pr-quick.yml` dispatch, several hours of host time. #186 is its own top arc (D15) so that cost holds nothing up; the implementer runs it while no other lane's soak or network suite holds the host.
- A3. **An issue whose remedy the evidence refutes.** If #155's calibration says no watchdog, or #165's discovered half cannot run locally, the issue gets a comment with the numbers and stays open, and the arc PR says `Refs`. Assumption: that is the right disposition, per the common brief.
- A4. **Bare-run adoption after #169.** A bare `test:e2e:network` run, on fixed default ports, still adopts services a developer started and still trusts `--slots-in-an-epoch 1` for them. That is the bare run's purpose, not #169's defect, which is about agent runs on a shared host; the closing PR says so in one line, and the e2e-testing skill states the trust.
- A5. **The registry contract is shared with `alejoamiras/unleashed`.** This plan keeps the lock's creation and 15 s judgement exactly as that writer has them and changes nothing in that repository. Its writers never reap dead rows, which slowly shrinks the free window; the final report tells the orchestrator, since a fix belongs to that repository.

## Decision ledger

| # | Decision | Why | Rejected |
|---|---|---|---|
| D1 | Arc 1 ships as two PRs: 1a (#169) then 1b | G1 unblocks every lane's parallel network e2e; it should not wait on the Lock-page investigation or the CI calibration | One arc-1 PR (the lane map's grouping) |
| D2 | The registry client matches the live file and lock | A second lock excludes nothing | The `my-stack` template's format |
| D3 | A claim drops only dead-owner `nulo-e2e-*` rows, by `kill(pid, 0)` returning `ESRCH`; it never signals a registry pid | Only our rows carry our contract that the pid-hint is the run's owner; another writer's pid-hint may name a short-lived helper, and dropping its live claim would hand its ports out | Reaping rows of any label; signalling the pid-hint |
| D4 | Sandbox ownership by environment marker, lifted from `ownership.ts` | Survives a dead leader and a reissued pid; already reviewed for Firefox | Pgid plus start time; a per-spawn `/proc` record |
| D5 | Under a claimed pack, a held port fails the boot (exit 86); bare runs keep adoption | A listener on a freshly claimed port is a stranger; nothing can prove its epoch flag | Adoption with a stronger probe |
| D6 | #163 by an in-page observer | Deterministic for any card that mounts, no build flag | A build-armed hold gate |
| D7 | #155 calibrated from CI logs and a measured peak, with a no-ship rule | No evidence of a stall exists; a guessed threshold kills legit long waits | A fixed 10 min threshold; no change at all |
| D8 | #161 deletes all five sleeps; a condition wait only where retry 0 proves it | The wallet retries stale anchors | A shorter sleep |
| D9 | #186: `"type": "module"` for the extension, `vitest.base.mts`, CLAUDE.md's full soak matrix | Silencing hides a loader change Vite flags; how every unit config loads is part of the test runtime, which the matrix binds | `VITE_CONFIG_NATIVE_IGNORE_WARNING`; root `"type": "module"`; a smaller parity soak |
| D10 | #194: `tsconfig.e2e.json` in `typecheck`; `unresolved-names.test.ts` deleted | One gate, the compiler's | A `@ts-nocheck` ratchet; keeping both |
| D11 | #153 keeps the refusing NO_FROM button, adds a sponsored private one | Two sharp tests: refusal and success | Re-pointing the existing button |
| D12 | #164 sends nonce 0 for every self-call | The Token requires it when sender and `from` match | Varying `from` |
| D13 | #165 adds a select with the old default; the discovered half only if it runs locally | No existing test moves; no assertion nobody can run | A per-kind button set; asserting under a gate CI never sets |
| D14 | Stack order 1a, 1b, 2, 3, 4 | Arc 3's new e2e code lands under arc 2's type gate; arc 4's soak blocks nothing below it | Arc 2 last; #186 inside arc 2 |
| D15 | #186 is its own top arc | Its soak matrix takes hours; inside arc 2 it would hold the type gate and arc 3 | Keeping the lane map's arc-2 grouping |
| D16 | A run marker from `agent.sh` for the orphan path, per-service markers for teardown | Forks, Chrome and geckodriver are orphaned by a `kill -9` too, and only an inherited variable reaches them all | Narrowing the quality bar to sandbox services |
| D17 | Bare-run reuse stays; reuse rewrites the lock's owner, and sweeps refuse while it lives | The reuse drill is the developer loop the skill documents; the owner rewrite closes the window where a reused sandbox looks orphaned | Deleting the reuse path |
| D18 | Our client never breaks the registry lock; a lock held past 30 s fails the claim closed; release by token | Every path-lock break races, with or without a check afterwards; an abandoned lock is rare (a millisecond critical section) and the other writers break theirs | A token check on break; an inode-and-mtime check on break; copying the other writers' unverified break |
| D-orch-1 | No stack: arc 1a opens its own PR against `dev` (`gh pr create --base dev`), title per § Delivery; later arcs branch from 1a's branch and rebase onto `dev` once it lands; the close-out is its own PR after the last arc merges | The orchestrator's call: it merges lanes in order and a stack would tie 1a's merge to later arcs | One `gh stack` per lane (§ Delivery) |
| D-orch-2 | Arc 1a ships alone and first, as gate G1 for every other lane: no 1b work folds in, and it does not wait on `OWNER-ASKS.md` Ask 1 (which holds arc 3 only) | Every other lane's parallel network e2e waits on it | Folding small 1b fixes into the G1 PR |
| D-orch-3 | After a squash merge, an arc branches from `dev`: arc 1b is `e2e-harness-gaps-waits` off `origin/dev` at 6201f8b (#267's squash), not off arc 1a's branch | 1a's branch holds nothing `dev` lacks, and merging `dev` into it after a squash is add/add | Branching from `worktree-e2e-harness-gaps` |
| D-orch-4 | Arc 1b only, every stop rule binding: #162's transport rule, #163's hosted 240 s rule (three dispatches of each smoke workflow), #155's calibration (the watchdog and the cap each ship only on it); nothing of arcs 2-4 is built | The orchestrator's call | — |
| D-orch-5 | Workflow dispatches on the arc's own branch are allowed (`gh workflow run <file> --ref e2e-harness-gaps-waits`); never a release, nightly or publish workflow, a variable, secret, ruleset, tag or release; every run id and result goes in `lessons/phase-1.md` | The orchestrator's call; the calibrations need hosted numbers | — |
| D19 | #162: the fix ships in `lock.vue` although the un-skipped opt-out test passes without it, and one Chrome-only case opens Lock inside a new worker's boot window (stop the worker, then navigate), red 3/3 on the base. Its Firefox skip is named here: Firefox does not end an event page while an extension page is open, so the window cannot occur there | The opt-out test opens Lock after the boot has finished; a probe showed a read rejected by the port drop strands the page, and only an e2e exercises the real reject-and-reconnect transport the fix relies on. Codex: ship the fix, but no timing-only race (it can pass vacuously). Opus: ship, and add the case sequentially, since the window is the whole boot, not milliseconds. The sequential shape is taken; the case cannot see the rejection itself, so its base-red count is recorded and the unit tests are the exact check | A concurrent stop-and-navigate race; the unit tests alone |
| D20 | #155: the watchdog's unit test stalls on a fixture that spins while its file is collected, with a 3 s `stallMs`, and asserts the stall report names the file; a second file must not start and global teardown must run. One reporter, no `observe` switch: every run prints its longest silence, and `stallMs` is required | I4 did not hold: vitest 4.1.10 ends a test awaiting a never-settling promise 3 s after `cancelCurrentRun`, so that fixture never reaches the kill. Only a blocked event loop does, and a blocked fork never reports its test, so the file is what can be named. The printed silence is what a later recalibration reads from CI logs | The plan's awaiting fixture naming the test (it passes with the kill removed) |
| D21 | #155: the heap cap's assertion lives in `network-setup.ts` and runs in every network fork: a limit outside [cap, cap + 512] MiB throws. Teardown reaps browser launches whose owner died | A fork the `execArgv` misses fails where it runs, in every run, not in a test of a copy of the config. A fork the watchdog kills leaves its Firefox, which only the next Firefox launch reaped | A nested-run unit test of the cap |

## Audit verdicts

### Round 1, Codex (gpt-6.1-sol, high, read-only), 2026-10-09

Verdict: **reject** (blocking: unsafe ownership and reaping transitions, the stale-lock race, an invalid soak gate, an incomplete watchdog failure contract). Static findings high confidence; browser and chain behaviour moderate.

| # | Finding | Disposition |
|---|---|---|
| C1 | High. The base-versus-head soak `compare` cannot pass (it requires one `gitSha`, a Node reference and a Bun candidate); CLAUDE.md binds any test-runtime change to the full matrix | Accepted: the full matrix at one head commit (now Phase 4.1); D9, A2 rewritten |
| C2 | High. Two stale-lock breakers do not serialize, and a holder can unlink its successor's lock | Accepted: token in the lock and token-checked release; the break was first hardened, then dropped in the final pass (F1, D18) |
| C3 | High. `reconcilePriorLock` clears and overwrites after a refused reap; the data-dir sweep deletes on a dead name pid while marked services live | Accepted: `fresh`/`reused`/`refused` outcomes, a throw before the boot window, stamped data dirs deleted only when no marked process lives |
| C4 | High. `owned.json` is unchecked JSON that authorizes a recursive delete; a forged dead-owner record can name a live run's marker; unreadable `/proc` must refuse; legacy pid signalling is unsafe | Accepted: validated `readLock`, realpath, prefix and stamp checks, the owner carried in each process's own environ, `unknown` keeps state, `killOrphanByPid` deleted, legacy locks never signalled |
| C5 | Medium. Requiring the group result and the sweep both `stopped` defeats leaderless recovery | Accepted: the final status is the sweep's; without `/proc`, the group's |
| C6 | Medium. No release on a failed build, no rollback after a failed `ports.json` write, no release in `e2e:reap`; reaping all labels assumes another writer's contract | Accepted: status-preserving `EXIT` trap, rollback, `e2e:reap` releases, reap limited to `nulo-e2e-*` (D3), strict cells |
| C7 | High. `cancelCurrentRun` awaits the running promise and cannot stop a hung test; no nonzero exit; forks must be ours | Accepted: non-awaited cancel, `process.exitCode = 1`, a 30 s fork kill scoped by parent pid and fork entry, sentinel cleared at start, a test of exit code and survivors |
| C8 | Medium. CI stdout gaps are not reporter gaps; one heap sample is not a peak; the `T ≥ 20 min` branch skipped the cap too | Accepted: calibration on the reporter's own events in `observe` mode, locally and in dispatched CI; a sampled peak with an effective-limit check; the cap decided separately |
| C9 | Medium. Mutation records are live references; an observer does not settle the hosted duration | Accepted: the flag is read from the live DOM in one callback; the hosted duration is measured on the PR, with a re-skip rule |
| C10 | Medium. The bind preflight closes one moment only; readiness can accept a stranger after a failed child | Accepted: child liveness in every readiness wait, playground fatal under `E2E_REQUIRE_SETUP`, a boot-guard test |
| C11 | Medium. Unit commands lack their cwd; whole smoke needs armed builds; the skill's drills are missing; exit 0 accepts skipped tests | Accepted: § Shared gate commands rewritten, drills in 1.3 and 1.4, a ran-not-skipped pass rule, `lint:actions` on a workflow edit |
| C12 | Medium. Sponsored NO_FROM fee admission unproven; register through a contracts grant; two distinct hashes and receipts; a transfer-function select must not turn the refusal button private | Accepted: bundle grant, hash and receipt assertions, an allowlisted select that feeds the default button only |
| Facts | F4 overstated adoption | Accepted: F4 rewritten per service |
| Inferences | I3: keep the hub's generation and update fences, test a stale reply | Accepted: Phase 1.6 |
| D10 | Prove include coverage and no suppression before deleting the scan | Accepted: Phase 2.1 step 4 |
| Asks | Record owner approval for visible playground controls | Rejected in round 1; raised again in the final pass and parked in `OWNER-ASKS.md` with what ships by default (final pass, K7) |
| Asks | Coordinate the registry's reap semantics and lock with the other repository's writer | Partly accepted: our client reaps only its own rows and never breaks a lock it cannot verify; the other writer's token-free break is recorded for the orchestrator as a host note, not changed from this repository |

### Round 1, Opus Plan agent (same family, read-only), 2026-10-09

Verdict: **conditional approve** (conditions: reconcile the stale sections with the revised architecture; close the reuse-versus-owner reap hole; gate `e2e:reap`'s registry release on owner death; fix `tsconfig.e2e.json`'s types and include; give the heap cap a no-ship rule). It read the plan mid-revision, after Codex's round; every finding was re-checked against the tree before acting.

| # | Finding | Disposition |
|---|---|---|
| O1 | High. Sections contradict the revised architecture (D3, D9, A2, Phase 1.9 and 2.1, Security, the change map) | Accepted: every section rewritten to match; a grep for the stale phrases comes back empty |
| O2 | High. On reuse the lock keeps the dead prior owner and the services name it, so `e2e:reap` or a second bare run would stop a sandbox a live run uses | Accepted, verified at `global-setup.ts:285-312`: reuse rewrites the lock's owner, every sweep refuses while it lives (D17) |
| O3 | Medium. `e2e:reap` releasing by `ports.json`'s run id has no owner gate; `resolve-ports` claims without an owner pid | Accepted: `releaseDeadRows` by worktree and dead owner; no owner pid, no claim |
| O4 | Medium. The break's token check fails against the other writers, whose locks are empty | Accepted, then superseded by the final pass: our client no longer breaks locks at all (D18) |
| O5 | Medium. The six-cell parse misses a foreign row with `|` in a later cell; the live writer excludes by first cell | Accepted: exclusion reads the first cell; the strict parse is only for rows we may drop |
| O6 | Medium. `tsconfig.e2e.json` would carry `bun` types (a `Bun` global would pass), include `tests/helpers`, and check `src` under foreign options | Accepted: `types` without `bun`, `include: tests/e2e/**`, options aligned until `src` is clean without `src` edits, probe re-run first (I9) |
| O7 | Medium. The heap cap is near a no-op: the host's default limit is 4288 MiB and `C ≥ 4096` | Accepted: no floor; ships only if at least 512 MiB under the measured hosted default, else A3 |
| O8 | Medium. The watchdog test runs under Bun while e2e runs on Node; no never-happens case for the fork kill | Accepted: the nested run uses `node`; a detached non-fork child must survive; fork entry pinned to 4.1.10 (I8) |
| O9 | Medium. Missing test pairs for 1.4 (stranger chain-31337 under a run id vs a bare run; dead child vs live child) and 1.3 | Accepted: both pairs in Phase 1.4; Phase 1.3's list already held the rest, plus the reuse and run-marker cases |
| O10 | Medium. "Reap stops every process the dead run started" fails for forks and Chrome | Accepted: a run marker every process of an agent run inherits; the kill proof checks Chrome and forks (D16) |
| O11 | Low. The stamp sits inside the node's data directory | Accepted: stamp the run dir; the node gets `<run dir>/data` |
| O12 | Low. Measure #163's hosted duration by dispatch before the PR; CI smoke retries twice; re-adding the skip contradicts the quality bar | Accepted: dispatch in Phase 1.7; the quality bar names the one skip that may stay |
| O13 | Low. Split #186 off; the rename misses `biome.json:10` and `ARCHITECTURE.md:246` | Accepted, both verified: #186 is arc 4 (D15) and the rename covers both |
| O14 | Low. A machine-specific scratch path in the committed plan | Accepted: scratch locations are described, not named |
| O15 | Low. Three local runs are weak evidence for #161 | Accepted: the PR's retry-0 network lanes are part of the closing evidence |
| Facts | F1 wrong (three writers, rows to 2026-10-08, release on exit); F4 per service; F11's test reference shows display, not refusal | Accepted, F1 verified against the live file |
| Inferences | I5 hides that the cap must sit below the default; I6 unsafe; marker inheritance, fork recognition and `src`-free type fixes unlisted | Accepted: I5, I6 rewritten; I7-I9 added, each with its check |
| Asks | Cost of the full matrix; #169 closing with bare-run adoption; the registry contract shared with unleashed; #163's skip | Accepted: A2 states the cost, A4 and A5 added, the quality bar amended |

### Final pass, Codex (gpt-6.1-sol, high, fresh session), 2026-10-09

Verdict: **reject** (blocking: registry mutual exclusion remains unsafe; cleanup can bypass process ownership and reuse protection). Static findings high confidence.

| # | Finding | Disposition |
|---|---|---|
| K1 | High. Rename-and-verify does not preserve mutual exclusion: a breaker can rename a fresh lock away and a third writer enters the emptied path; no later check undoes it | Accepted: our client never breaks the lock and fails closed after 30 s (D18); a three-process test proves our critical sections never overlap and foreign rows survive |
| K2 | High. The synchronous exit hooks signal `-pid` without checking the leader (`global-setup.ts:801`) | Accepted, verified: group signal only for a live leader, a synchronous marker sweep otherwise, a spy test with its control |
| K3 | High. The run sweep would stop a reused pack whose services name a dead agent run owner, and running it before reconciliation destroys the pack before adoption | Accepted: the run sweep skips launch-marked processes and runs after `reconcilePriorLock`; one test walks agent start, owner death, bare reuse, `e2e:reap`, adopter death |
| K4 | Medium. The dApp sees only `UNCLASSIFIED_ERROR_MESSAGE` (`error-envelope.ts:195-219`), so it cannot name the private-only rule | Accepted, verified: the e2e asserts the constant and a failed record; a builder pin test asserts the cause |
| K5 | Medium. `proving` is journaled before the gate and outlives its 20 s safety release, so the copied ordering check does not prove a hold | Accepted: the snapshot must fall within `PROOF_GATE_HOLD_MS` of `enteredProveAt`, release in `finally`, and a one-off mutex bypass shows the case going red |
| K6 | Medium. An invalid fee multiplier does not reliably fail; `grep -c` exits 1 on zero; the Biome check needs its cwd; `lint:actions` missing before pushes | Accepted: `NULO_E2E_BROWSER=bogus` fails the build after the claim; vitest's status captured apart from the grep; root cwd named; `bun run test` and `lint:actions` before every push |
| K7 | Medium. `Closes #162, #163` listed unconditionally despite their stop rules | Accepted: every conditional `Closes` is earned by its stated evidence, else `Refs` |
| Facts | F5's 60 runs are 48 green and 12 cancelled, not 60 green | Accepted: F5 says so |
| Inferences | I5 "never trips" is stronger than sampled peaks justify | Accepted: I5 speaks of headroom, the capped full suites are the check |
| Asks | CLAUDE.md § UI changes says "any change to what a user sees", with no test-dApp exemption | Accepted after the confirming round: `OWNER-ASKS.md` Ask 1; arc 3's merge waits for an explicit sign-off or exemption |

Confirming round (same session, resumed): **conditional approve**. K1-K7 each judged closed. The condition, that the playground controls need an explicit sign-off or exemption before delivery rather than an opt-out, was accepted as stated above. No other new material problem. That makes three Codex rounds on the plan (round 1, the fresh final pass, its confirmation); none left an open finding.

### Arc 1a implementation, round 1: Codex (gpt-6.1-sol, high, read-only), 2026-10-09

Verdict: **approve with fixes**. Checked and found sound: registry conflict checks under the shared `wx` lock, foreign rows preserved; registry pids only probed with signal 0; release keeps `agent.sh`'s exit status; provisional records before every sandbox spawn; canonical containment and stamp checks before a directory delete; legacy locks never signalled; the conservative fallback without `/proc`.

| # | Finding | Disposition |
|---|---|---|
| C1 | High. The reaper reads the lock's owner once and sweeps for seconds; a bare run can adopt meanwhile, and two fresh setups can both read "no lock" (`sandbox-ownership.ts`, `global-setup.ts`) | Accepted: setup and `e2e:reap` read, reap or adopt, and rewrite `owned.json` under a worktree reconcile lock (`withReconcileLock` in `lockfile.ts`: exclusive create, a dead holder's lock replaced, a live holder waited for 120 s, then refused); setup writes its provisional lock inside it. Test: a reap in progress holds off an adoption, which then reads the cleared lock; with the lock disabled all three cases fail |
| C2 | High. Child liveness does not prove listener ownership: a stranger can bind after the bind test while the child is still starting (`boot-guard.ts`) | Accepted: on Linux a readiness answer counts only when every socket listening on the port is held by a process carrying the service's marker (`/proc/net/tcp{,6}` inodes against the marked processes' fds). Tests: a live, unbound marked child with a stranger answering is refused (fails with the check removed); a marked child's own listener reaches ready |
| C3 | Medium. geckodriver is spawned before its record exists, so a worker killed between them leaves a marked process no record names (`firefox.ts`) | Accepted: the record (pid 0) is written before the spawn, then rewritten with the pid and its start time |
| C4 | Medium. A pending probe is raced against neither child exit nor the deadline, and the node client sets no request timeout (`boot-guard.ts`) | Accepted: each probe races the child's exit and the remaining deadline, with the listener and timer removed after. Tests: a pending probe fails on the exit within 2 s (times out with the exit race removed); a never-settling probe fails at the deadline. The request itself is not aborted: the race bounds the wait, and a failed boot ends the process |
| C5 | Medium. Unreadability protection lasts one sweep: a second reap never saw the process marked and deletes the profile under it (`owned-processes.ts`, `ownership.ts`) | Accepted: the lock records each service pid's start time and a Firefox record its geckodriver's; a recorded process still running (start time matches) and unreadable leaves every sweep `unknown`. A zombie, whose environ refuses the read too, now counts as gone. The data-dir sweep keeps every dir when a command line cannot be read; an unreadable environ cannot gate it, since a same-user `systemd --user` always has one. Tests: a second reap and a second release stay `unknown` (each fails with the seed removed); a zombie reads `gone` (fails without the zombie rule) |
| C6 | Low. Comments still describe an `agent.sh` signal trap reading pids; a module paragraph repeats the contracts below it | Accepted: rewritten and removed |

### Arc 1a implementation: Opus review (same family, read-only), 2026-10-09

Verdict: **sound, one regression and small fixes**; no path on Linux where one run signals or deletes another's processes or files without a stale or forged lock.

| # | Finding | Disposition |
|---|---|---|
| O1 | Medium (macOS). A lock naming no owner clears once its pids are dead but leaves the run dir, and the dir sweep needs `/proc` | Accepted: that path removes the run dir when its stamp matches; the test covers it |
| O2 | Low-medium. "Check and stop them by hand" invites killing a pid since reissued; the setup stays refused with no way out named | Accepted: the message and the README say the pids may belong to unrelated processes, and to delete `owned.json` if they are not this worktree's sandbox |
| O3 | Low. `clearLock()` after an awaited sweep can delete a new run's provisional lock | Accepted: closed by C1's reconcile lock |
| O4 | Low. An `unknown` SIGTERM phase skips SIGKILL | Accepted: only `stopped` ends the sweep after SIGTERM; SIGKILL still re-reads each environ |
| O5 | Low (macOS). Agent runs lost the setup's Chrome sweep where no run sweep exists | Accepted: without `/proc` every run keeps the extension-path sweep |
| O6 | Low. A reused sandbox's processes name their dead first owner, so a forged lock in another worktree naming its markers could stop it | Rejected as code, accepted as text: only a same-user process that could signal them anyway can learn the markers; the Security section now states this exception instead of claiming the record never decides |
| O7 | Low. `readStartTime` turns EMFILE or EIO into "gone", so a live owner can read as dead | Accepted: only ENOENT and ESRCH mean gone; any other error throws, and `identityIsDead`, `ownIdentity` and the record sweep treat it as alive |
| O8 | Low. The registry rewrite resets the file's mode to the umask's | Accepted: the temp file takes the registry's mode before the rename; test with a 0600 registry (fails without it) |
| O9 | Comments: four stale, one naming the wrong parameter | Accepted: all fixed |
| O10 | The README says the next setup stops a dead run's Firefox | Accepted: the next Firefox launch or `e2e:reap` does |
| O11 | No test for "a launched browser carries the run marker"; phase 1.5's proofs not yet recorded | Accepted, and it found a real gap: a launch guard checking Chrome for the run marker failed every Chrome test of the concurrency proof. Chromium overwrites its environ region with its process title in the browser and every child (probed: no Chrome process shows any variable), so the run sweep can never see Chrome, and dropping the extension-path Chrome sweep for agent runs had regressed orphan-Chrome cleanup. The guard is gone; every run's setup sweeps Chromes by extension path again, and `e2e:reap` does while no live run holds the worktree. Firefox's launch already refuses a browser without its launch marker, and its processes show the run marker. Phase 1.5 is recorded in `lessons/phase-1.md` |

### Arc 1a implementation, round 2: Codex (same session, resumed), 2026-10-10

Verdict: **approve with fixes**. C2, C3, C4 and C6 judged closed. Checked and found sound: setup and the reaper share one guard; listener inodes compared on IPv4 and IPv6; the Firefox record precedes the spawn; probe races remove their listener and timer, and a losing probe's rejection is handled; repeated orphan sweeps seed recorded identities; registry mode and the round-1 comments.

| # | Finding | Disposition |
|---|---|---|
| R2-1 | High. C1 still open: two waiters can both read the dead holder twice; one unlinks and takes a fresh lock, the other then unlinks that lock (`lockfile.ts`) | Accepted, fixed rather than failing closed: only the waiter that creates `reconcile.lock.break-<sha256 of the dead holder>` may unlink, after reading the lock again, and it removes the break file only after the unlink, so a later breaker of the same holder reads a different lock. A breaker that dies holding the break file leaves that lock to a person, which the refusal names. Tests: a held break file stops every other waiter from unlinking (fails with the break file check removed); four separate processes that all find one dead holder never overlap (the interleaving itself is too narrow to hit reliably, so this one is not the proof) |
| R2-2 | Medium. An existing lock that cannot be read (`EACCES`, `EIO`) spins without sleeping or checking the deadline | Accepted: only ENOENT means gone; any other read error throws, and every retry path sleeps and checks the deadline. Test: an unreadable lock rejects at once (times out with the old read) |
| R2-3 | Medium. In-run teardown's sweep is not seeded, so a leader that outlives its group stop and is unreadable at the first scan reads `stopped` | Accepted: `stopService` reads the leader's start time while it is unreaped and seeds the sweep with it. Test: a leader whose group stop fails and which reads unreadable is `unknown` and left running (`stopped` with the seed removed) |
| R2-4 | Low. The stranger test checks a marker no process carries, so a check that only counts marked processes would pass | Accepted: one marker for the child and the check |
| R2-5 | Low. The sweep's SIGKILL comment predates the zombie rule; "always" about `systemd --user` is host-specific | Accepted: both reworded |

### Arc 1a implementation, round 3: Codex (same session, resumed), 2026-10-10

Verdict: **approve with fixes**. R2-1 to R2-5 judged closed; the break file per dead holder judged sound against two breakers, a breaker dying before or after the unlink, and a third acquirer after the unlink. Removing the Chrome environ guard judged justified. The findings all concern the Chrome sweep added to `e2e:reap` after the concurrency proof showed Chrome never carries a marker (`e4c421a`).

| # | Finding | Disposition |
|---|---|---|
| R3-1 | High. `e2e:reap` checks the owner and sweeps Chromes outside the reconcile lock, so a setup admitted in between could lose its browser | Accepted: both run inside `withReconcileLock`, after the sandbox reap; the lock's own exclusion is what the reconcile-lock tests prove |
| R3-2 | Medium. On a host without `/proc` a live run's lock names no owner, and `e2e:reap` would kill its Chromes | Accepted: `chromesUnclaimed` keeps a lock naming no owner while any recorded service is alive. Test (fails without the pid rule) |
| R3-3 | Medium. The extension path went into a shell string and an unescaped, unanchored pattern: metacharacters or `dist/chrome-canary` could match another build | Accepted: `pkill` through `execFileSync`, the path escaped for ERE and ended at the argument (`chromePattern`). Test with `pgrep`, no signal: only the exact build matches, not `-canary` nor a path its `.` would match (fails with the old pattern) |
| R3-4 | Low. `reap.ts`'s header claimed every signal needs a marker; setup's comment said no live run holds the worktree though setup holds it | Accepted: both reworded |

The Codex loop stops here at its three-round limit; round 3's fixes went to a same-family verifier instead.

### Arc 1a implementation: round-3 verification, Opus (same family, read-only), 2026-10-10

Verdict: **approve with fixes**. Sound: the ERE escaping (every metacharacter, `]` and `}` literal under glibc, no GNU backslash escapes can form), `( |$)` against procps' space-joined command line, other worktrees' builds never matched, the ordering inside the reconcile lock in every branch, and both new tests fail on the old code.

| # | Finding | Disposition |
|---|---|---|
| V1 | Medium. A smoke run in the same worktree takes no lock and names no owner, so `e2e:reap` kills its Chromes; setup's sweep has always done the same | Accepted for `e2e:reap`: it also keeps Chromes while any vitest of the worktree runs (`vitestRunningIn`, `pgrep` on the worktree's vitest path; unsure counts as running). Test: a fake vitest command line counts for its worktree, not a neighbour's. Setup keeps dev's unconditional sweep, and its comment now says a smoke run in the same worktree loses its Chromes, as the e2e-testing skill's hazard already does. `global-setup-smoke.ts`'s own shell-string `pkill` is unchanged from dev and outside this arc |
| V2 | Low. Without `/proc`, a bare run that adopted every service writes a lock with no owner and no pids, so its Chromes looked unclaimed | Accepted: covered by V1's vitest check, which works without `/proc` |
| V3 | Low. Where `sh` is bash, `sh -c 'sleep 30'` execs sleep and drops the fake Chrome arguments | Accepted: `sleep 30; :` |
| V4 | Nit. `reap.ts`'s step list and the README's reap paragraph predate the Chrome sweep | Accepted: both rewritten |

### Arc 1b implementation, round 1: Codex (gpt-6.1-sol, high, read-only), 2026-10-10

Verdict: **approve with fixes**. Found no path by which the watchdog signals a process that is not this run's fork: discovery and signalling are synchronous, an unreaped child keeps its pid, and another vitest's children fail the parent check. The observer matches its DOM contract; the retry-0 evidence supports removing the sleeps.

| # | Finding | Disposition |
|---|---|---|
| CB1 | Medium. A pending timeout edit is replaced when a reconnect read finds the stored value moved (`lock.vue`) | Rejected: `onSettingUpdate` already replaces the field when the timeout changes elsewhere, and the re-read stands in for the update the dropped port missed. Withdrawn in round 2 |
| CB2 | Medium. The watchdog arms at `onTestModuleStart`, after setup files and import, so a silent first-file collection is never timed | Accepted: it arms at `onTestModuleQueued` (with OB2). Test: the spin fixture spins at import; without the hook the nested run hits its deadline |
| CB3 | Medium. `readdirSync("/proc")` throws from the kill timer where `/proc` is absent | Accepted (with OB1): the kill step logs that the blocked fork is left running |
| CB4 | Low. The watchdog header and the observer's doc narrate | Accepted: both cut to their constraints |

### Arc 1b implementation: Opus review (same family, read-only), 2026-10-10

Verdict: **approve with fixes**, every claim checked against vitest 4.1.10's dist. Sound: the kill scope, the cancel path (the pool queue emptied, a killed fork ends its task, teardown runs before the pool closes), the Lock page's ordering, the observer.

| # | Finding | Disposition |
|---|---|---|
| OB1 | Medium (macOS). The kill timer throws without `/proc` and takes vitest down before teardown | Accepted: see CB3 |
| OB2 | Low-medium. A collection hang of file N is blamed on file N-1; a crashed fork's test stays in the running set | Accepted: the file is set and the running set cleared at `onTestModuleQueued` |
| OB3 | Low. `test-retried` reaches no reporter hook, so a retry after a long silent attempt has only the rest of `STALL_MS` | Accepted: the undeclared `onTaskUpdate` call counts it. Test: a fixture silent 2 s per attempt against a 3 s stall stays green; cancelled without the hook |
| OB4 | Low. A killed Firefox fork leaves Firefox and geckodriver until the next Firefox launch | Accepted: teardown runs the owner-gated `reapOrphanLaunches` on Linux |
| OB5 | Low (process). Phase 1.8's runs are not recorded | Accepted: they were running; recorded in `lessons/phase-1.md` § 1.8 |
| OB6 | Comments: the watchdog header inexact and narrating; the export wait's 45-96 s paragraph contradicted by the hosted runs | Accepted: rewritten |

### Arc 1b implementation, round 2: Codex (same session, resumed), 2026-10-10

Verdict: **approve**, no findings. Teardown's reaper judged safe: it signals only launches whose recorded owner is dead and whose processes carry the record's marker, so a forged record cannot reach a live launch.

## Post-implementation

Run per arc, at each arc boundary, before `gh stack add` opens the next arc; then one final cross-arc pass. `code_review` is `off`, so no `/code-review` step runs.

1. **Codex audit** (`~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`): the arc's diff (`git diff <arc base>...HEAD`), this plan with its decision ledger, the arc map ("this is arc N of 5: 1a, 1b, 2, 3, 4; later arcs build X"), the adversarial ask ("What could go wrong? What would an attacker or a neighbouring run target? What are we trusting that we shouldn't?"), and these two rules verbatim:
   - *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*
   - *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*
2. **Fix loop.** Verify each finding against the tree, apply the accepted ones, commit, log the round in `lessons/phase-N.md`, then resume the same session (`resume-codex.sh`) with the fix diff. Stop when a round has no new material finding. After three rounds with material findings, stop and surface it in the report.
3. **Final cross-arc pass.** A fresh Codex session over `git diff 4a357b7...<top arc>`, asking for seams between arcs, duplication across arcs and drift from this plan, with the same two rules. Same loop.
4. **Delivery** per § Delivery: the first time any PR opens.
5. **Close-out**, as the stack's docs-only top layer:
   - An `## Outcome` block directly after the front matter: date, status, what shipped with PR numbers, each dropped or refuted item with its disposition, an `Open items:` line naming issue numbers or `none`, and a line retiring the `/goal` and `/loop` seeds below.
   - Promote generalizable gotchas to `implementations-plan/lessons.md` (8 KiB budget; dedupe, retire, date tool versions).
   - File open items where CLAUDE.md § Where open work lives says (copied here):

     | Situation | Home |
     |---|---|
     | Work inside the implementation you are on | the active `plan.md` and the PR |
     | Actionable work that outlives the plan | a GitHub issue, with a domain label and a `Record` link to the archived plan |
     | Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` |
     | A suspected exploitable weakness | a private draft security advisory |
     | Rejected, superseded or already done | a disposition line in the Outcome block |
     | Knowledge that prevents a repeat | `implementations-plan/lessons.md` |
     | A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
     | Accepted code work that blocks launch | the `v1.0.0` milestone |

     Dedupe first (`gh issue list --state all --search "<words>"`); an issue body has `## What happens`, `## Where`, `## Impact`, `## Possible fix`, `## Record`. Comment on every lane issue left open with the reason.
   - Merge `origin/dev` into the close-out branch first and read what changed in `index.md` and `lessons.md` (never a union merge).
   - `git mv implementations-plan/e2e-harness-gaps implementations-plan/archive/e2e-harness-gaps` in its own commit; repair links the extra level breaks (`git grep -n e2e-harness-gaps`); move the index line to `archive/index.md`; delete `STATUS.md` in the close-out.
   - Report and wait. Merging is the orchestrator's call.
6. **Teardown after the merge.** Once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-harness-gaps/plan.md` succeeds, leave the worktree (`ExitWorktree` with `keep` if the session entered through `EnterWorktree`) and run `agent-worktree done e2e-harness-gaps --merged --trunk dev`. Relay a refusal and stop; never force. A `/loop` session checks on every firing; a `/goal` session arms one background wait after its report: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-harness-gaps/plan.md; do sleep 300; done`.

## Delivery

Superseded in part by D-orch-1 and D-orch-2: no stack; each arc's PR targets `dev` on its own, later arcs rebase onto `dev` after the arc below lands. One `gh stack` on `dev`. PRs open only after the arc's local gates pass and its Codex loop has converged; open each without labels, then add `e2e:extension-network` or `e2e:extension-smoke` only when the path filter would skip a suite the arc needs.

| Arc | Branch | Phases | Stacks on | Code review | PR title (≤ 93 chars) | Closes |
|---|---|---|---|---|---|---|
| 1a | `worktree-e2e-harness-gaps` (`gh stack init --adopt`) | 1.1-1.5 | `dev` | off | `fix(e2e): claim run ports in the host registry, stop leaderless groups by marker` | #169 |
| 1b | `e2e-harness-gaps-waits` | 1.6-1.9 | 1a | off | `fix(e2e): load the lock page after a restart, drop the anchor sleep, watch for stalls` | #161; #162, #163, #155 each conditional (below) |
| 2 | `e2e-harness-gaps-types` | 2.1 | 1b | off | `build(extension): type-check the e2e tree in typecheck` | #194 |
| 3 | `e2e-harness-gaps-coverage` | 3.1-3.3 | 2 | off | `test(e2e): prove multicall and no_from sends land, cover private transfer rows` | #164, #153; #165 conditional (below) |
| 4 | `e2e-harness-gaps-esm` | 4.1 | 3 | off | `build(extension): load the extension's vite and vitest configs as es modules` | #186 |
| close-out | `e2e-harness-gaps-close-out` | — | 4 | off | `docs(plans): close e2e-harness-gaps` | — |

- Arc 1a's PR is the lane's first and is gate G1. It carries this plan's commit.
- Arc 3's PR stays unmerged until `OWNER-ASKS.md` Ask 1 has an explicit answer; nothing below it waits.
- Each PR body: what changed and why, the validation runs with outcomes, the `Closes` lines.
- Mechanics: `gh stack add <branch>` at each boundary; `gh stack submit --auto`, then `gh pr edit` bodies; `gh stack sync` after `dev` moves. Merging (`gh stack merge --squash`) is the orchestrator's.
- Commits: conventional, lower-case subjects, signed; afterwards `git log --format='%h %G?' -3` shows no `N`.
- Before every push: `bun run test` and `bun run lint:actions`.
- A `Closes` line is earned, not listed: #162 only if the opt-out test runs green on both browsers, #163 only if no hosted attempt exceeds 240 s, #155 only if neither half was refuted, #165 only if the discovered half runs. Otherwise the PR says `Refs #n` and the issue gets the comment its stop rule names.

## Issue → arc

| Issue | Arc | Closes when |
|---|---|---|
| #169 | 1a | its PR merges |
| #162 | 1b | the opt-out test runs green on both browsers, or stays open per the stop rule |
| #163 | 1b | the export case runs on hosted CI within budget, or stays open per § Arc 1b |
| #161 | 1b | the constant is gone and the files hold at retry 0, locally and in the PR's network lanes |
| #155 | 1b | the watchdog and the cap each ship or are refuted by numbers; if either is refuted, stays open per A3 |
| #194 | 2 | the type gate is in `typecheck:all` |
| #164 | 3 | the multicall settles in public execution |
| #153 | 3 | two concurrent NO_FROM sends both confirm |
| #165 | 3 | private rows asserted, and the discovered half runs, or stays open per A3 |
| #186 | 4 | no warning, soak matrix green |
| #195, #81, #190 | not this lane | § Scope |

## Seeds

Retired at close-out. Draft until the orchestrator approves.

```
/goal Every phase in implementations-plan/e2e-harness-gaps/plan.md is marked ✓, each backed by its validation gate reported passing in the transcript; for each phase `LESSONS_FILE=implementations-plan/e2e-harness-gaps/lessons/phase-N.md` is printed; `/code-review` was NOT run (code_review: off); the Codex fix loop converged for each arc (1a, 1b, 2, 3, 4) and for the final cross-arc pass, each convergence a resumed Codex pass with no new material finding quoted in the transcript; the six-layer stack (1a, 1b, 2, 3, 4, close-out) exists on GitHub, created only after the loops converged (`gh stack view` in the transcript), the close-out archiving the plan (`git show --stat` of the archive-move commit); `bun run test` and `bun run lint` both exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/e2e-harness-gaps forward. Never idle waiting for input. Each firing: (1) Reality check: read plan.md and lessons/ from the stack's top layer; if implementations-plan/archive/e2e-harness-gaps/plan.md is on origin/dev, run the teardown in § Post-implementation step 6 and stop; if the plan is delivered and unmerged, babysit CI only. (2) Wait on CI productively. (3) No task in hand: take the next pending step, run the fast gate after each edit, commit, `gh stack push`. (4) Stuck or facing a decision: consult Codex (`run-codex.sh ... high read-only gpt-6.1-sol`) and log it; hard limits stay hard (no merge, no main, no scope beyond plan.md, no host network suite while another lane runs one before arc 1a merges). (5) Same step failed three times: stop and surface. (6) Phase green: run its full gate, mark ✓, write the lessons entry, print LESSONS_FILE; at an arc boundary run the Codex loop before `gh stack add`. (7) All phases ✓: final cross-arc pass, Delivery, close-out, report, stop.
```

Recommended: `/goal` (completion is visible in the transcript).
