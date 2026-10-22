---
plan: e2e-stores-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: 5711a1bc3 (origin/dev)
issues: "#1041"
status: closed with its one PR; the merge closes the plan
---

## Outcome

- **Date:** 2026-10-22.
- **Status:** closed with its one PR, #1063 (`worktree-e2e-stores-1` → `dev`, `Closes #1041`), which carries this close-out; the merge closes the plan.
- **Shipped:**
  - **The node's `TMPDIR`** (`apps/extension/tests/e2e/global-setup.ts`, `sandbox-ownership.ts`): `<run dir>/tmp` beside `data`, inherited by every child the node spawns, so teardown and `e2e:reap` remove every store, socket, log and the foundry copy with the run dir.
  - **The socket budget** (`nodeTmpDir`): a run dir whose socket paths would overflow `sun_path` is refused before the boot window, naming `NULO_E2E_DATA_ROOT`.
  - **The boot check** (`nodeStores` in `boot-guard.ts`, called after `markBootReady()` on Linux when the run started the node): exit 1 on a store outside the run dir, a marked process whose fds cannot be read, or no store inside; else `node stores: <n> open, all inside <run dir>`.
  - **The docs:** the e2e README, the `lockfile.ts` comments and the e2e-testing skill (the run dir's `tmp`, the budget, the check, and the two-hour command limit).
  - **The tests:** three `node stores` cases in `boot-guard.test.ts` and the byte-counted budget case in `owned-processes.test.ts`.
- **Dispositions:**
  - The orchestrator approved the plan as committed.
  - Phase 1's red probe exited 1 (not 86) naming `.mdb` paths under its scratch `TMPDIR`; Phase 2's probe exited 0 with `node stores: 26 open` and its run dir removed ([lessons/phase-1.md](lessons/phase-1.md), [lessons/phase-2.md](lessons/phase-2.md)).
  - Phase 3 at retry 0 ([lessons/phase-3.md](lessons/phase-3.md)): network Chrome 122 passed, 6 skipped; network Firefox 121 passed, 7 skipped across two runs (the agent tool's two-hour limit cut the first at 110 of 128 files, none red); smoke Chrome 61 passed, 9 skipped; smoke Firefox 65 passed, 5 skipped.
  - The review loop converged at round 3 of 3: Codex r1 4 low (two fixed, two known limits), Opus 6 (all applied), Codex r2 1 (applied), Codex r3 clean (§ Audit verdicts and decision ledger).
  - The host's existing leftovers stay the owner's ([lessons/phase-0.md](lessons/phase-0.md) § Host one-off, documented and unrun).
- **Lessons:** nothing promoted: `lessons.md` is at its budget, and both gotchas belong to the e2e-testing skill, which records them (the node writes under `TMPDIR` in local-network mode; one browser's network suite can outlast a two-hour command limit). The boot check fails a run if an Aztec bump moves the stores again.
- **Known limits:** #1065 (the budget refuses a bare run that would adopt a hand-started node), #1066 (a pid reused between the scan and the fd read).
- **Open items:** #1064 (the e2e backup helper's `nulo-e2e-backup-*` dirs in `os.tmpdir()`).
- **Seeds retired:** the `/goal` and `/loop` below; they are no live instructions.

# e2e-stores-1: the local network's temp files inside the run dir

In local-network mode the Aztec CLI drops the harness's `--data-directory`, so the node and its IPC children put every store, socket, log and the L1-deploy copy under `os.tmpdir()`, and most outlive the run (#1041). This plan sets the node's `TMPDIR` to `<run dir>/tmp`, which teardown and `e2e:reap` already delete, and adds a boot check that fails a run whose node holds an open store outside its run dir. One arc, one PR against `dev`, `Closes #1041`.

## Outcome & Quality Bar

- **For whom**: an agent or contributor running the network suite on a shared host, and the host's owner, whose disk (or RAM, where `/tmp` is tmpfs) the leftovers fill.
- **Excellent**: (1) after an exit-0 run nothing the run's node wrote remains; after a killed run, `e2e:reap` or the next run removes it. (2) An Aztec bump that moves the node's stores out of the run dir fails the next network run at boot, naming the escaped paths. The check sees the stores open at boot, not every store over the node's life.
- **Good enough**: no cleanup of what is already on a host (the owner's; `lessons/phase-0.md` § Host one-off); the e2e helpers' own temp dirs are a neighbour, filed at close-out.

## Issue claims, verified (#1041)

Every code claim holds at 6.0.0-rc.3 (recon.md § Upstream behaviour): `global-setup.ts:544` passes `--data-directory`, `:551-553` build an env with no `TMPDIR`, the contract the issue cites is `:130-135`. The issue's table is one measured run (pxe-limits-1), not re-measured. The issue undercounts what escapes: the world state runs in a separate `aztec-wsdb` child, and the node and its IPC children also put `cdb-ts-*`, `wsdb-*` and `avm-*` sockets and logs, the `.foundry-deploy-*` copy and (with real proofs) a `bb-batch-*` FIFO under `os.tmpdir()`. This host's `/tmp` holds 6,695 `wsdb-*.log` and 2,664 `avm-*.log` files beside 2,892 `archiver-*` dirs (recon.md § Host evidence).

## Architecture & Implementation

- **Shape**: the run dir gains `tmp` beside `data`; the node's spawn env sets `TMPDIR` to its absolute path (forge changes its working directory). Every child the node spawns inherits it with the launch marker. Teardown and reap do not change: teardown and `reapPriorRun` delete the run dir through `deletableRunDir` (realpath directly under `E2E_DATA_ROOT`, the `nulo-aztec-` prefix, the stamp) once every service is stopped; `sweepOrphanDataDirs` deletes a dir whose named pid is dead, which no command line names and whose stamp no live process carries. `rmSync` unlinks a symlink in the tree and never follows it (checked on Node 24 and Bun 1.4.2).
- **The check**, in `boot-guard.ts` beside `listenerIsOurs`: `nodeStores(dir, marker, read?)` reads the fd targets of every process carrying the node's marker (the node and `aztec-wsdb`), keeps `*.mdb` targets (stripping Linux's ` (deleted)` suffix) and sorts them by whether the real path lies under the real path of `dir` plus a separator. A marked process whose fd dir is gone is skipped; one whose fd dir is unreadable is reported. The private fd reader is shared with `socketInodes`, which keeps treating both cases as empty. `setup()`, after `markBootReady()`, only when this run started the node and only on Linux (as `reapDeadRuns` gates): throws on any outside or unreadable entry, or on none inside; else logs `node stores: <n> open, all inside <run dir>`. After `markBootReady()`, a violation is exit 1, never a retried 86; `setupWithTeardown` tears the sandbox down.
- **Socket budget**: the longest socket the node binds under `TMPDIR` is `cdb-ts-<pid ≤7>-<thread ≤3>-<n ≤3>.sock` (27 bytes plus a separator); `sun_path` takes 107 bytes on Linux, 103 on macOS. A pure `nodeTmpDir(runDir)` in `sandbox-ownership.ts` returns `path.resolve(runDir, "tmp")` and throws, naming `NULO_E2E_DATA_ROOT`, when its UTF-8 length plus 28 exceeds the platform limit. `setup()` calls it on the fresh path before `markBootStarted()`; `createRunDir` makes the dir it returns. This host's worst case is about 100 of 107 bytes.
- **Interfaces** (harness-internal): `createRunDir(dir, marker): { data: string; tmp: string }`; `nodeTmpDir(runDir): string`; `nodeStores(dir, marker, read?): { inside: string[]; outside: string[]; unreadable: number[] }`.
- **File-level change map**: `apps/extension/tests/e2e/sandbox-ownership.ts` (`nodeTmpDir`, `createRunDir`, its doc comment); `apps/extension/tests/e2e/boot-guard.ts` (fd reader, `nodeStores`); `apps/extension/tests/e2e/global-setup.ts` (the budget call, `spawnAztecNode`'s `TMPDIR`, the check, and the comments at `:130-133` and `:479-481`, which call `--data-directory` mandatory for `~/.aztec/data`: in local-network mode the node ignores it, and it stays because it names the run dir on the node's command line, which the orphan sweep reads as liveness); `apps/extension/scripts/e2e/boot-guard.test.ts` and `owned-processes.test.ts` (tests); docs: `apps/extension/tests/e2e/README.md` (`:207`, the row at `:368`), `apps/extension/tests/e2e/lockfile.ts` (`E2E_DATA_ROOT`, `aztecDataDir`), `.claude/skills/e2e-testing/SKILL.md` (`:97`, `:211`).
- **Alternatives not taken**: `DATA_DIRECTORY` in the node's env would honour `--data-directory` but switch to persistent, version-managed stores where upstream's own comment calls ephemeral ones acceptable, and it leaves sockets, logs and the foundry copy in `/tmp`. A before/after diff of the shared `/tmp` cannot tell this run's stores from a concurrent run's. An env-only unit test proves no upstream behaviour.

## Security & Adversarial Considerations

- **Threat model**: a shared host where many agents run nodes, sweeps and reaps; the boundary is "a run deletes and signals only what it owns". `tmp` sits inside a dir every deleter already gates; the check reads only `/proc/<pid>/fd` of this run's marked processes and signals nothing. A same-UID process that strips or forges markers is outside the harness's cooperative contract.
- **Fails closed**: no store seen inside, or a marked process the check cannot read, fails the run.
- **Side gain**: the node's temp files leave world-writable `/tmp`, and `cdb-ts-<pid>` sockets stop colliding across runs when pids are reused.
- **Not applicable**: cryptography, credentials, Actions permissions, new dependencies, user-facing surfaces.

## Assumptions

- **Facts**: F1. Node 24 `os.tmpdir()` returns `$TMPDIR`. F2. `aztec.sh` ends in `exec node …` (no `.aztecrc` re-exec here), so the node is the spawned pid. F3. With no data directory configured, every kv-store, the world state, the IPC sockets and logs, the foundry copy and the FIFO take their path from `os.tmpdir()`; an inherited `DATA_DIRECTORY` would change that, and the check would catch it. F4. Deletion criteria as in Shape (`global-setup.ts:862-867`, `sandbox-ownership.ts:129-153`, `:259-284`). F5. `bun run test` runs `apps/extension/scripts/**/*.test.ts` on Bun. F6. CI's network lanes run on `ubuntu-latest`. F7. A throw after `markBootReady()` classifies as a real failure, before it as 86 (`apps/extension/tests/e2e/sentinel.ts`). F8. `boot-guard.test.ts` already covers `socketInodes` through `listenerIsOurs` with real listeners.
- **Inferences** (Phase 1's red run and Phase 2's green run verify): I1. Every store open at boot holds an fd in a process carrying the node's marker. I2. No legitimate `.mdb` lies outside the run dir (for example under `~/.aztec`); if one shows up, stop: that is a plan change. I3. Forge, the CLI's own anvil, `aztec-wsdb` and the AVM work with `TMPDIR` under `E2E_DATA_ROOT`.
- **Asks**: none; nothing a person sees changes.

## Phases

### Phase 1: the store check (red) ✓

1. In `boot-guard.ts`, make the fd read a private helper that tells a gone process from an unreadable one; keep `socketInodes`'s results.
2. Add `nodeStores`; call it from `setup()` as Architecture says.
3. Add to `boot-guard.test.ts`'s Linux block, with marked children that hold a file open and stay alive (no stdio beyond fd 2): one test where the inside store is reported inside and a sibling `<dir>-other` store and a deleted store are reported outside; one where an unmarked child's outside store is not reported and a marked child with no store gives none inside.

**Validation gate**: `bun run lint`, `bun run typecheck:all`, `bun run test` exit 0. Red probe (Warning: not during deps-audit-1's soak). Make a fresh scratch dir under `~/.cache/nulo-backlog/e2e-stores-1/` and run `TMPDIR=<scratch> NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/meta-getChainInfo.test.ts`. It exits 1, not 86, and the error names `.mdb` paths under the scratch dir. Warning: delete the scratch dir only when `apps/extension/.e2e-state/owned.json` is absent (teardown cleared it). If it is present, run `bun run e2e:reap` and check the file again. If it is still present, keep the scratch dir and report it. Layers: lint, typecheck, unit, network e2e.

### Phase 2: the node's TMPDIR (green) ✓

1. Add `nodeTmpDir`, make `createRunDir` create `tmp` and return `{ data, tmp }`, and call `nodeTmpDir` in `setup()` before `markBootStarted()`.
2. Make `spawnAztecNode` pass `data` to `--data-directory` and set `TMPDIR` to `tmp`.
3. Add one test in `owned-processes.test.ts`: `nodeTmpDir` accepts a multibyte run dir at the platform limit and throws one byte over it.
4. Update the comments and docs in the change map.

**Validation gate**: the Phase 1 commands exit 0, and the probe, run without the scratch `TMPDIR`, exits 0 and logs `node stores: <n> open, all inside <run dir>`. After it exits, that run dir is gone from `E2E_DATA_ROOT`. Layers: lint, typecheck, unit, network e2e.

### Phase 3: the suites at retry 0, both browsers ✓

Run each command on Chrome, then again with `NULO_E2E_BROWSER=firefox` (Warning: not during deps-audit-1's soak; poll each run's log in a bounded loop, under two hours per call):

- Smoke: `cd apps/extension && NULO_E2E_RETRY=0 bun run test:e2e`.
- Network: `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 bun run e2e:agent`, with `--exclude` for each file of CI's prover-ON canary job (`.github/workflows/_extension-network-e2e-lane.yml:120`), which the PR runs with real proofs.

**Validation gate**: each run exits 0, and each network run logs the `node stores` line. A red gets one rerun only for a known flake, named in `lessons/phase-3.md`. Record each run's wall-clock, labelled local. Layers: smoke and network e2e, Chrome and Firefox.

## Audit verdicts and decision ledger

- Codex r1 (gpt-6.1-sol, high): `conditional approve`. Opus 5.5 (Plan): `conditional approve`. Codex r2 (resumed): `conditional approve` on one condition, accepted: the red probe's scratch dir is deleted only once teardown or `e2e:reap` has cleared the lock, so no store is deleted under a live holder. Codex r3 (resumed): `approve`, no new material findings. Every finding below was checked against the tree or the pinned install.
- D1 `TMPDIR`, not `DATA_DIRECTORY`: both legs agree. Accepted correction (Opus): upstream calls ephemeral stores "acceptable", it does not forbid persistent ones.
- D2 the boot fd check: both legs call it the only attributable proof (about 20 lines). Accepted: scan every marked process, since `aztec-wsdb` holds the world-state stores (both; I1 rewritten); report unreadable fd dirs (Codex); log the pass line so a green gate shows the check ran (Opus); the boundary, deleted-file and unmarked-process cases (both); home it in `boot-guard.ts` with a private reader, not a new `owned-processes.ts` export (Opus, simpler than the draft).
- D3 after `markBootReady()`: both agree.
- D4 the socket budget: both legs rejected the draft's guard inside `createRunDir`, which runs after `markBootStarted()` and would turn a deterministic error into a retried 86. Accepted: `nodeTmpDir` before `markBootStarted()`. Rejected: the known-limit issue (both): the change creates the hazard, and its failure would be a silent AVM hang.
- D5 scope: no `TMPDIR` for anvil or the playground (no demonstrated leak). Neighbour filed at close-out: `helpers/import-drivers.ts:589` leaves `nulo-e2e-backup-*` dirs (11,299 on this host).
- Phase 3 (Opus): the browser never sees `TMPDIR`, so the Firefox network run adds no evidence about this change. Kept: the lane brief requires both browsers. The `bb-batch` FIFO appears only under real proofs; the PR's prover-ON canary job covers it (Codex: deferral proportionate).
- Rejected (Codex, Opus): a lifetime census of stores; hostile same-UID tampering. Both need unsupported conditions or a new design.
- Implementation review (net diff from `5711a1bc3`, Codex gpt-6.1-sol high, Opus 5.5 beside round 1). Codex r1 `findings: 4`, all low: (1) the budget refuses a bare run that would adopt a hand-started node, rejected as a known limit (an explicit refusal naming its remedy; after the adoption probe it would be a retried 86 for agent runs, which never adopt); (2) the pid-1 test assumed its owner, fixed to assert that init's fd list is refused (no CI job runs unit tests as root; a `node:fs` mock rejected as coupling the test to the fd path); (3) the fixture was made at collection, fixed in `beforeAll`; (4) a pid reused between the scan and the fd read, a known limit (needs the pid space to wrap within milliseconds; Opus concurs). Opus `findings: 6`, all applied: the same fixture fix, held-open children that end on their own, an empty-root guard, the budget case run on every platform, comments under 100 columns, docs that say what the node gets; and its suggestion to name the count of escaped files. Codex r2 `findings: 1` (a comment overstated that an outside store outlives every run; upstream closes some), applied. Codex r3 `clean`.
- Deviations: the review ran beside the Chrome network suite, so that suite ran on the pre-review head (the review's fixes are tests, comments, docs and one failure string; the other three suites ran on the reviewed head). The agent tool stops a background command after two hours, which cut the first Firefox network run at 110 of 128 files with none red; `e2e:reap` cleared what it left, and the 18 files left ran in a second run.
- Recorded trade-off (Opus): on a host whose `/tmp` is tmpfs the stores move to disk, and `openTmpStore` syncs every commit; this host and CI keep both on one disk, so their timings cannot show it. Plausible, unverified; no issue unless a slower local run is reported.

## Delivery

Single arc: branch `worktree-e2e-stores-1`, one PR against `dev`, opened only after the Phase 3 gate and the review loop. Title: `fix(e2e): keep the local network's temp files inside the run dir`. Body: `Closes #1041`, the validation runs, each browser's suite wall-clock (local and CI labelled apart, before from `dev`'s latest CI run). Open it without labels; add `e2e:extension-network` or `e2e:extension-smoke` only if a lane's path filter skipped it. The close-out is the PR's final commits. No parallel lanes (three serial phases).

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `5711a1bc3`, with these values. Step 1 is absent (`code_review: off`). Step 2 runs once over the net diff from `5711a1bc3` after Phase 3: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, hard stop at three rounds, each round in `lessons/phase-3.md`. Step 3: `gh pr create --base dev`, then `gh pr checks <n> --watch`. Step 4: the Outcome, the lessons promotion, the neighbour issue (dedupe first: `gh issue list --state all --search "nulo-e2e-backup"`), the `git mv` into `archive/`; never merge. Step 5, after the orchestrator merges: `agent-worktree done e2e-stores-1 --merged`.

## Seeds

```
/goal Phases 1-3 of implementations-plan/e2e-stores-1/plan.md marked ✓, each gate's output in the transcript (the red probe exiting 1 on the store check with paths under its scratch TMPDIR; the green probe and both browsers' suites at retry 0 exiting 0 with the "node stores" line); the Codex loop converged with a resumed pass reporting no new material finding; the PR to dev open with Closes #1041 and the close-out's archive move in it (git show --stat); bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/e2e-stores-1 forward per its plan.md: reality-check plan.md and lessons/, run the next pending step, run its gate, never run e2e during deps-audit-1's soak or two e2e:agent runs at once, decide with Codex (gpt-6.1-sol, high) instead of waiting, stop after 5 failures on one step, never merge.
```
