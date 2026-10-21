---
plan: block-time-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at ca052f08
trunk: dev
issues: "#959 (research; closes on the findings, never on the arc-2 PR, which says Refs #959)"
post_implementation_hardening: not scheduled
status: closed (arc 1 delivered as research; arc 2 not run, D15)
---

## Outcome

- **Date:** 2026-10-21.
- **Status:** closed. Arc 1 (phases 1, 2, 3 and 5) ran on `block-time-1-a1`; arc 2 did not run (D15). The docs-only PR that carries this archive closes #959, and its merge closes the plan.
- **Shipped:** no code. The answer to #959, posted there as `## Findings`: on 6.0.0-rc.3's local network the slot is not the floor of a round trip. The 2 s minimum pool age is, settable only at boot, and it is 5.6 % (Chrome) and 4.2 % (Firefox) of the critical network shard, against a third for browser launch and onboarding. Short slots boot only with companion timing knobs (1 s never), admit 4.9 times the per-tx DA gas of a 72 s slot, and slow overlapping sends. They broke nothing in P-mech, which also stayed green with a forced block every 1 s and every 0.5 s. The combined node-side lever (pool age 0, 0.1 s script polls, forced blocks) cut 68-72 s of script time per P-mech run but did not pass the gain rule on a loaded host with a fixed A-then-B order.
- **Dispositions:** 1/1 did not boot (the proposer timetable), so 2/2 took its place (D13). 3e, phase 4 and the arc-2 PR were not run (D15). No per-lever comparison was run, since no decision hung on one lever. Prover-ON lanes were not attributed. Phase 5's planned public filing for the sandbox's RPC surface became a private advisory (Codex p5 r1).
- **Known limits:** none.
- **Open items:** #988 (the bridge fixture's L1 nonce race), #989 (Firefox's late fee estimate), #990 (the node-side levers measured on CI in balanced order), #991 (per-file launch and onboarding cost), #992 (the wallet clocks, with OA-1), GHSA-4c23-7xf4-f9q3. Shard balance stays with #972.
- **Lessons:** none promoted: `lessons.md` holds 8152 of its 8192 bytes. The boot-only pool age, the node polls `aztec.sh` fixes at 500 ms, and the proposer timetable's boot refusal are in `lessons/phase-2.md` and `phase-3.md`.
- **Seeds retired:** the `/goal` and `/loop` seeds below are retired; this plan is a record, not a task list.

# block-time-1: are shorter Aztec slots the e2e speed lever? (#959)

A research lane. **Arc 1** measures where the e2e time goes, inventories every knob on the block path, sweeps the slot and the knobs that matter, and ends in a findings document plus a `## Findings` comment on #959; it opens no PR. **Arc 2** runs only if a setting holds under the full local gates: the CI confirmation and a draft PR (`Refs #959`) the owner reviews. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The claims and what did not hold

- **#959's hypothesis, "the slot duration sets the floor of every transaction round trip"**: not as stated on 6.0.0-rc.3. `aztec start --local-network` always runs the AutomineSequencer, which builds on a 50 ms mempool poll and warps anvil's clock to the next slot boundary instead of waiting for it (recon § What the local network does). The slot reaches wall-clock by one indirect path only: the 2 s tx-pool age is read on the node's `TestDateProvider`, which jumps forward with every build and settle, so a tx that arrives before a jump can skip part of its age, by more at 72/12 than at 1/1 (Codex r1, traced). A shorter slot may then make overlapping sends slower. H1 tests both paths.
- **"Nothing in the repo sets a sequencer min-tx value"**: `global-setup.ts:555` sets `SEQ_MIN_TX_PER_BLOCK=0`; automine floors it at 1, so it is inert. **"5.0 mints no empty L2 blocks"**: true without a call, but `aztecDebug_mineBlock` on the node's main port builds one; `fixtures/aztec.ts:472` says it is not exposed.
- **"With a matching anvil `--block-time`"**: the AutomineSequencer sets interval mining to 0 at start, so `--block-time` is cancelled (V2 confirms). **"500 ms"**: a slot is whole seconds in the config parser and in EVM timestamps; the 500 ms question becomes a block cadence (phase 3c).
- **"Send to mined from `getBlockData` timestamps against the send time"**: block timestamps are the warped chain clock, hours ahead of the wall clock after a suite. Send to mined is timed by wall-clock receipt polling instead.
- **"Network 25 to 30 min"**: the skill's envelope one-liner gives 17-18 min (Chrome) and 20-21 min (Firefox) for the last green PR runs; smoke 12-13 and 16-19. **Smoke boots no sandbox**: no node setting can change it; it is measured as a control.

## Outcome & Quality Bar

- **For whom:** the owner, who reads the orchestrator's explainer and reviews any PR personally; the next person who touches the e2e harness.
- **Excellent:** (1) every number traces to a run record (id, commit, setting, browser, load1), and every minute claim is a median of three with its spread; (2) every break names its mechanism, a one-command reproduction and a label (demonstrated, plausible but unverified); (3) the recommendation names the lever that moves each lane's longest CI job, with its measured or bounded gain, including "no lever" if that is the result; (4) a shipped setting passes the full gates with no patched package, raised timeout, loosened assertion, retry or `skipIf`.
- **Good enough:** minutes on this host (load1 150-260 on 188 cores) are indicative and CI confirms them; no full-suite matrix of every setting.

## UI impact

- **Arc 1:** none. Nothing that ships changes.
- **Arc 2:** none. The e2e harness and its sandbox env only. A change to a production wallet interval is out of scope: OWNER-ASKS.md holds it, and the arc ships without it.

## Assumptions

**Facts** (recon.md has the lines):
- F1. The local network always runs the AutomineSequencer: 50 ms mempool poll, 200 ms settler, no slot wait, anvil set to automine with interval 0.
- F2. `AZTEC_SLOT_DURATION` (72) and `ETHEREUM_SLOT_DURATION` (12) are integer seconds, honoured from the env at deploy, the L2 slot a multiple of the L1 slot; epoch length (forced 4) and proof-submission epochs (forced 2) ignore the env.
- F3. `P2P_MIN_TX_POOL_AGE_MS` (2000) holds a tx out of a build until 2 s of the node's `TestDateProvider` time has passed since it arrived (`tx_pool_v2_impl.js:783-785, 857`). That clock runs at real rate but is reset at each build to the new L1 time (`automine_sequencer.js:499`; `TestDateProvider.setTime` replaces its offset), forward at 72/12 and backward at short slots when blocks are rarer than the slot, and moved forward at each settle's `reconcileDateProvider`. The real wait is therefore not bounded by 2 s, and a pool age of 0 can still leave a tx briefly ineligible after a backward reset. The value is env-settable and runtime-mutable (`aztecAdmin_setConfig`).
- F4. The `aztec` wrapper pins the archiver, world-state and p2p block polls at 500 ms with no override.
- F5. The wallet runs no block-driven loop: a 1 s receipt worker, a 1 s balance tick, a 30 s incoming scanner; no build flag overrides them.
- F6. CI's network envelope is its longest job, which was pool shard 2/5 in all six last green runs (Chrome 17.8-18.2 min, Firefox 18.4-20.9 min). Shard 2/5 holds 952 s of file time on Chrome (1 119 s on Firefox), of which `incoming-arrival` alone is 345 s (320 s); the rest is boot and build. The longest files suite-wide: `same-token-concurrent-sends` (median 557 s Chrome, 620 s Firefox), `snack-placement` (469, 483), `incoming-arrival` (342, 313), `send-chaos` (300, 339), `failed-send-check` (251, 256); the heavy jobs that hold most of them finish 3 to 6 min before shard 2/5.
- F6b. Smoke's envelope is its shard 2/3 in all six last green runs (Chrome 12.6-13.0 min, Firefox 16.7-19.3 min), 4 to 8 min longer than its other shards; no node setting reaches it. Shard balance is a CI-topology lever outside this lane (a phase-5 finding).
- F7. A calibration run of `wait-for-tx-mined.test.ts` took 5 min 1 s end to end, of which the file took 10.9 s.

**Inferences** (each tested):
- I1. A slot setting changes send → proposed wall-clock only for a tx that arrives before a date-provider jump; a strictly sequential send waits the full pool age at every slot (H1).
- I2. At 72/12 the chain clock ends a full suite hours ahead of the wall clock; at short slots it falls behind it between bursts. The wallet compares chain expiry with the device clock (`src/wallet/services/operation-journal/send-check.ts:188`) and sorts activity by chain time (H4).
- I3. The network lane's time sits in browser and extension work, the 2 s pool age, test-side polls and the wallet's 30 s incoming scan, not in block production (H5).

**Asks** (working assumption in force; the orchestrator may overrule):
- A1. *Delivery with no setting that holds:* arc 1 opens no PR; the lead then opens a docs-only PR that archives this plan with its findings tables and says `Closes #959`. With arc 2, the close-out rides arc 2's draft PR and #959 closes when the orchestrator says.
- A2. *What counts as "a setting":* a sandbox env value (slot pair, pool age) or a harness change on the block path (`forceBlock` through `aztecDebug_mineBlock`, a test-side wait interval), each with its tests. A fixture refactor off the block path is a finding and an issue, not arc-2 scope.

## Architecture & Implementation

### Hypotheses (fixed before any run)

| Id | Hypothesis | Test | Falsified when |
|---|---|---|---|
| H1 | The slot reaches wall-clock only through the date provider the pool age reads: a sequential send waits about the pool age at every slot; a send that overlaps a build waits less at 72/12 (the clock jumps forward) and more at short slots (each build pulls the clock back to a chain time behind the wall clock); at pool age 0 the slot has no effect | 3a probe: node-log time from tx arrival to build start, per arm, slot pair and pool age | a sequential arrival-to-build median differs between slot pairs by more than M, or the overlap arms do not move in the predicted direction |
| H2 | Anvil `--block-time` is cancelled by automine | V-boot | anvil mines while idle after the node starts |
| H3 | A sub-second slot cannot be configured | decided by code: `parseSafeInteger("0.5")` throws (`<aztec>/foundation/dest/config/index.js:223-228`) | (no run) |
| H4a | The chain clock leads the wall clock by about (slot + L1 slot) × blocks at 72/12 and lags it at short slots whenever blocks are rarer than the slot | 3a and teardown skew | skew does not follow the slot |
| H4b | No wallet or test code breaks on chain time near the wall clock (short slots) or far ahead of it (72 s) | 3b screen | a test fails with a mechanism that reads chain time |
| H5 | The node path (send → proposed, exclusive time) is under 10 % of each P-mech file and of each pole's critical path | phase 1 tables | it is above 10 % for any of them |
| H6 | P-mech's operations succeed, with submit-to-visible latency that does not grow through the run, at a block every 1 s and 0.5 s | 3c pump | a P-mech test fails with a cadence mechanism, or the latency grows run-long; *inconclusive* when the achieved cadence misses the target by over 20 % |

**Margin and statistics.** H1 is decided from the node log's arrival-to-build time, which is close to deterministic, not from an end-to-end threshold; M there is 250 ms. For e2e cells M is 10 % of the file's default median. Each cell reports the raw values, the paired differences of its interleaved runs (A1−B1, A2−B2, A3−B3) and their median. A gain counts only when all three pairs favour it, the median gain is ≥ M, and the spans show it in the category its mechanism predicts (for the pool age: the age saved per inclusion wait, times the count). A cell whose pairs disagree is *inconclusive*, never "no effect": three runs bound a practical effect, they prove no equivalence.

### Run discipline

- Every run goes through `agent.sh` (network: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent <files>`) or `bun run test:e2e` (smoke), `NULO_E2E_RETRY=0`, one at a time in this worktree, `NULO_E2E_PROVERLESS=1` unless a prover-ON file is the subject.
- Each run writes `~/.cache/nulo-backlog/block-time-1/runs/<id>/`: the gawk-timestamped log, `results.json` (`NULO_E2E_RESULTS_FILE`), `node.log`, `spans.jsonl`, `env.txt` (HEAD, `git diff --stat`, patch-set sha256, setting, browser, load1 at start and end, the other e2e runs live in `~/.agents/ports.md` as a noise covariate).
- Timing cells interleave the arms (A B A B A B) so host drift biases no arm; each cell reports min, median, max and load1.
- A red under a setting is re-run once at the default on the same commit before it is called a mechanism (lessons.md: rerun an environmental-looking red on base first). A red from host saturation (stall watchdog, timeouts with no code cause) waits for load1 to fall and retries once, recorded.
- The stall watchdog, timeouts and assertions stay as they are. `pkill` is never used; `bun run e2e:reap` handles orphans.

### Instruments (scratch patch set, never committed; the findings carry the diff)

1. **Node log:** `global-setup.ts` tees the node's stdout and stderr to `$NULO_E2E_NODE_LOG` with `LOG_LEVEL='info;verbose:automine-sequencer'` plus the p2p tx-arrival module (log filters are regexes on the module name, which is `node:automine-sequencer`); the self-test asserts the build, publish, date provider "Time set to" and tx-arrival lines appear.
2. **Spans:** an env-gated (`NULO_E2E_SPAN_LOG`) append-only JSONL helper after the `import-stage-timing.ts` pattern, wrapped around `launchExtension`, each fixture's setup, `createTestWallet`, script sends, `waitForTxMined`, `finalizeThrough`, `waitForL1ToL2Message`, labelled `pollUntil` calls, `waitForFreshBalanceRow`, journal waits and the literal sleeps. Each span carries its parent; the category table uses exclusive time (a span minus its children), so a fixture and the send inside it are not counted twice.
3. **Wallet transitions, live:** a recorder on the extension's background target subscribes to `chrome.storage.onChanged` and stamps every journal-stage and Tx-status change as it happens, keyed by operation id and tx hash, forwarding each event at once to the test process's span log (exposed binding), and re-attaching when the background target is replaced (`failed-send-check.test.ts:260, 285` stops it on purpose); the self-test covers one `stopBackground`. A teardown snapshot would lose them: the journal replaces `progress` at each stage (`operation-journal/service.ts:384`), dropping `proving.enteredProveAt`, and later Tx updates overwrite `updatedAt`.
4. **Probe spec** `tests/e2e/network/_probe-block-time.test.ts`, gated on `NULO_E2E_PROBE=1` like `_probe-warmup-effect.test.ts`: 10 sequential script mints, then overlapping pairs with the second tx submitted 0.5, 1.0 and 1.5 s after the first (3 pairs each); the pool-age arms (2000, 500, 0) alternate per tx inside one boot through `aztecAdmin_setConfig` on the run's admin port; `getTxReceipt` polled every 50 ms bounds each status; the chain-clock skew per tx; then 10 sends through the default `waitForTx` options.
5. **Chain-clock skew at teardown:** the node's latest block timestamp minus the wall clock, logged before the node stops.
6. **Parsers** (bun, under `~/.cache/nulo-backlog/block-time-1/tools/`): CI log → per-file and per-job durations; `results.json` + spans + transitions → the exclusive category table.

All processes run on one host, so wall-clock stamps from the test process, the browser and the node compare directly; durations inside one process use its monotonic clock. Package experiments run on a private, dereferenced toolchain copy (`cp -rL` into `AZTEC_HOME=~/.cache/nulo-backlog/block-time-1/aztec-home`, keeping the `versions/6.0.0-rc.3` layout `global-setup.ts:96-104` resolves, every edited file checked `stat -c %h` = 1), never on the shared `~/.aztec`, and never on the worktree's `node_modules` (the Bun store may hardlink them into every worktree's tree). Each is recorded with its diff, and decisive runs record the sha256 of the toolchain's `dest` trees and of `node_modules/.bun/@aztec-labs+*` before and after.

### Attribution categories and their sources

| Category | Source |
|---|---|
| Extension build, vitest start, sandbox boot, contract deploy | timestamped `agent.sh` and `[e2e-setup]` lines |
| Browser launch and onboarding | spans around `launchExtension` and fixture setup |
| Script-side setup (test wallets, mints, bridges) | spans |
| Wallet simulate and estimate, prove, send | the recorded journal stage transitions (instrument 3) |
| Send → proposed, checkpointed, proven | node log (tx arrival, checkpoint published) against the recorded submit; the probe's 50 ms receipt polls bound it |
| Wallet observes the outcome | the recorded Tx Pending → mined transition minus the node's proposed time (the 1 s worker) |
| Balance or row visible to the test | span end of the waiting helper minus that transition |
| Fixed waits | literal sleep spans |
| Unattributed | file time minus the exclusive sum; must stay ≤ 10 % on P-mech |

### Sets

- **P-mech** (mechanism coverage, ≈ 9 min of CI file time), every file a real submit: `wait-for-tx-mined` (script sends to PROVEN), `tx-sendTx-sponsoredFpc` (a dApp send approved to mined), `imported-account-execution` (a popup send to the balance), `incoming-transfers` (discovery at unlock) and the `incoming-arrival` case "on Home a new receipt's row plays from its first render" (`-t`, discovery by the 30 s scheduler), `authwit-lifecycle`, `concurrent-sendtx-confirm`, `sim-from-selfpay` (L1 → L2 bridge), `failed-send-check` (finalization; it rewrites the stored expiry, so it says nothing about natural expiry).
- **P-pole** (what sets the CI envelope): `incoming-arrival` and the rest of pool shard 2/5's 23 files (the critical job), then `same-token-concurrent-sends`, `snack-placement`, `failed-send-check` (the heavy jobs, 3 to 6 min of slack today). A lever that does not shorten shard 2/5 does not move the envelope; a lever on a heavy job has to save more than its slack to matter.

### File-level change map

- **Arc 1, committed:** `implementations-plan/block-time-1/**` (plan, recon, OWNER-ASKS, STATUS, `lessons/phase-{0,1,2,3,5}.md` with every table), the `index.md` line. Nothing under `apps/` or `.github/`.
- **Arc 1, scratch:** the instrument patch set (`global-setup.ts`, `fixtures/*.ts`, the probe spec), stored as patch files under `~/.cache/nulo-backlog/block-time-1/patches/`, applied for a run and reverted after it; `git status` shows only plan files before every commit.
- **Arc 2, candidates (only what phase 3 shows holds):** `apps/extension/tests/e2e/global-setup.ts` (the node env), `apps/extension/tests/e2e/fixtures/aztec.ts` and `fixtures/extension.ts` (`forceBlock`, wait options), a unit test for any helper changed (`apps/extension/scripts/e2e/*.test.ts` pattern), `CI.md`, `.claude/skills/e2e-testing/SKILL.md` (runtime numbers). The env lives in the harness, so CI and local runs match with no workflow change.

### Trade-offs and alternatives not taken

- **The full matrix** (every setting × both suites × both browsers × three runs): about 30 serial full runs of 2-3 h each on this host. Rejected; the layers above answer the same questions, and CI confirms the one candidate.
- **Timing every slot pair three times on the e2e set:** done only where the probe shows a node-level effect (rule R1 below); otherwise the minutes would measure host noise.
- **Disabling automine to see slot-timed production:** the CLI forces automine and the e2e will never run a patched CLI. Listed as an idea not tried.
- **Committing the instruments as an opt-in tracer:** a new permanent config surface for one study. Rejected unless the panel shows a second caller; the findings carry the diff.
- **Competing outline B, lever-first** (settle H1 by code and one probe, spend the whole budget on the long poles): cheaper, but drops the owner's "what breaks with shorter slots". Its emphasis on the long poles and its thrift on timing medians are adopted (P-pole, phase 1.5, the 3a and 3d cuts).

## Security & Adversarial Considerations

- **Secrets:** `apps/extension/src/wallet/constants/network-endpoints.ts` is never opened; the egress guard stays on, so no run reaches Testnet. No key is created, read or logged.
- **Shared host:** package experiments run on a private dereferenced `AZTEC_HOME` copy; the shared `~/.aztec` and the worktree's `node_modules` are never edited (a hardlinked Bun store would carry an edit into every worktree), and decisive runs hash both before and after. Processes are owned by `agent.sh`'s markers and pgids; no `pkill`.
- **The sandbox's own RPC surface** is tracked privately: GHSA-4c23-7xf4-f9q3. It predates the lane; this lane neither changes nor relies on it.
- **Scope of a setting:** every value lives in the e2e sandbox's env. Nothing reaches a shipped bundle: no `VITE_*` flag is added, and `aztecDebug_*` is a local-network surface only the harness calls, never the extension.
- **Test fidelity (the attacker is a regression):** a faster setting must not hide a race the slower one exposed. A test that passes only under one setting is a finding with its mechanism, never a reason to keep the faster setting.
- **Supply chain:** no new dependency, no lockfile change.

## Phases

### Phase 1 — Where the time goes (default settings only) ✓

1. Pull the last three green PR runs per lane and browser (done at planning for the network and smoke lanes: `~/.cache/nulo-backlog/block-time-1/ci/`). Record the envelope, each job's time, each file's median and the critical job's file list.
2. Build the instrument patch set. Self-test it on `wait-for-tx-mined`: spans, transitions, the four node-log lines and the teardown skew are all present.
3. Run CI's proverless file set (every network file but the five canary files and `send-chaos`, passed as `--exclude` the way `_extension-network-e2e.yml:274` does) once on Chrome, instrumented. The canary and chaos files keep their CI numbers.
4. Run P-mech once per browser, instrumented. Medians come from CI (step 1); the local runs give the spans.
5. Run P-pole once on Firefox, instrumented, naming shard 2/5's files as CI's log lists them (a local `--shard` may hash other paths).
6. Run smoke's critical shard (2/3's files, as CI's log lists them) once per browser with spans. Smoke has no node path; the rest of smoke keeps its CI numbers.
7. Write the exclusive category table per browser, the top 20 waits and each lane's critical job into `lessons/phase-1.md`.

**Validation gate.** Commands: the runs above; `bun run check:plans` after staging. Pass: every table cell names its run id; `env.txt` shows default settings for every run; unattributed time ≤ 10 % per P-mech file; H5 decided; `git status` shows only plan files. Layers: e2e-live-network (local sandbox), e2e smoke.

### Phase 2 — The knob inventory, verified ✓

1. Turn recon's families into one table: name, default, where read, what it governs, constraints, deploy-time or runtime, honoured by `--local-network`. Add the mechanisms that are not knobs: the RPC unseen-block hold-off (only a read of a block the node has not seen waits: by number 2 × `blockDurationMs`, by hash 3 s, independent of the slot), the fee provider's slot-stepped minimum fee (priced at the later of the next slot after the last checkpoint and the date provider's next L1 slot, `fee_provider.js:184-196`), the PXE anchor on the proposed tip, orphan pruning (disabled on the local network) against the rollback of a failed publish, the incoming scanner's gates (private on the proposed tip, public on the checkpointed tip, `incoming-transfer/service.ts:1228, 1517`; the 5 s tips cache; the forced fourth tick).
2. Run **V-boot** at 12/12 through `agent.sh` with the probe spec and anvil started with `--block-time 1` (scratch): the node reads back slot 12 (F2), anvil's idle block count before and after the node starts (H2), `aztecDebug_mineBlock` and `aztecDebug_prove` over the main port, anvil's `finalized` offset under `--slots-in-an-epoch 1`.

**Validation gate.** Pass: each "honoured" or "ignored" cell cites a code line or the V-boot; H2 and H3 decided. Layers: e2e-live-network (boot and probe).

### Phase 3 — The sweep ✓

1. **3a, probe:** slot pairs 72/12, 12/12, 6/6, 2/2, 1/1 (the brief's settings), plus 4/1 as a diagnostic that separates "short L2 slot" from "L2 slot = L1 slot"; three runs at 72/12 and 1/1, one at the others, interleaved. Each run carries all pool-age arms and both submit arms, and records the arrival and build times it actually got, not the scheduled offsets.
2. **3b, mechanism screen:** P-mech once on Chrome at each non-default pair that boots, and on Firefox at 1/1. Grep every screen's node log for `Automine propose did not succeed`, `mined in slot`, prune lines and fee-refused drops: at L2 = L1 slot one stray L1 block between the timestamp pre-set and the propose pushes the propose into the next slot and rolls back a proposed block the PXE may already anchor on; at 1/1 the proof-submission window is 8 L1 blocks.
3. **3c, cadence:** at 1/1, P-mech once per browser with a block every 1 s, then every 0.5 s; the conclusion is bounded to P-mech's workload (the PXE syncs tips on demand, so green tests show those operations succeed, not a sustained capacity), and it reports submit-to-visible and demand-sync latency through the run beside the achieved block intervals. A scratch pump in the instrumented `global-setup.ts` awaits each `aztecDebug_mineBlock` and then sleeps the remainder of the period (never two calls outstanding; `buildEmptyBlock` queues without bound), stops and drains before teardown, and logs each block's height and time, the achieved cadence and every failure. `mineBlock` builds with `allowEmpty`, so it also carries pending txs, and each block moves the chain clock by at least one slot, which shortens the pool age: the result is compared with 3b's 1/1 runs, and it measures a cadence, not empty blocks.
4. **3d, levers:** the levers phase 1 ranks at ≥ 1 % of a lane's critical job (expected: the pool age, test-side `waitForTx` intervals, `forceBlock` through `aztecDebug_mineBlock`), combined in one arm against the default: three matched pairs per browser (A B A B A B, the same file selection, order and instruments in both arms) over the files the levers target. The result is the combined gain and its category changes; the levers interact (a faster inclusion also shortens polls), so no per-lever share is claimed. If the arc-2 choice hangs on one lever, only that one gets its own matched comparison. Before a pool age below 2000 is timed, list the files that assert an in-flight or queued state without `holdMining` (`fixtures/mining-hold.ts`): they join the timed set, since a shorter age moves the sandbox away from production timing. A lever in our code is a real change with its test, kept on a scratch branch until arc 2.
5. **3e, candidate:** remove the instruments, check the toolchain and `node_modules` hashes against the pristine record, then run each CI lane's own selection with its own env once per browser at retry 0: the pool and heavy files proverless with `VITE_NULO_FEE_MULTIPLIER=10`, the canary files prover-ON (in-browser proving; CI proves through Presto), and the two chaos seeds with `NULO_E2E_CHAOS=1` and their `NULO_E2E_CHAOS_SEED`.

**Rules.** R1: a slot pair whose 3a arrival-to-build medians sit inside M in every arm gets no e2e timing cells, only the screen. R2: a setting whose failure has a mechanism outside the test harness ends there, recorded. R3: a red is re-run at the default on the same commit first.

**A setting holds** when 3e is green on both browsers, the files it targets show a gain by the rule in § Margin and statistics on both browsers, P-mech shows no regression beyond M, and nothing in 3b to 3d failed under it.

**Budget.** Estimated 20 to 30 h of serial runs; the calibration measured only the 5 min of fixed cost per run. After phase 1 the lead projects the remaining runs from measured file times; if the projection exceeds 30 h it writes the priority call into the plan and `STATUS.md` (which cells run first, which wait) and drops no required setting and no part of the "holds" rule.

**Validation gate.** Pass: per setting, a pass or fail table per test and browser; every failure has a mechanism, a reproduction command and a label; every minute claim follows § Margin and statistics with load1; H1, H4a, H4b and H6 decided or marked inconclusive with the reason. Layers: e2e-live-network on both browsers.

### Phase 5 — The findings ✓

1. Write `~/.cache/nulo-backlog/_orch/reports/block-time-1-findings.md`: the attribution tables, the knob inventory, the sweep, every break with its mechanism, every package experiment with its diff and result, the ideas not tried, the recommendation.
2. Post a `## Findings` comment on #959: the answer to each of its four questions, the recommendation, and whether arc 2 runs. No local paths, no links to local files.
3. File an issue for each lever found but out of scope, each after a dedupe.

**Validation gate.** Pass: the document has every section above; `git grep -nE '/(Users|home|mnt)/' -- implementations-plan/block-time-1` and the comment body return nothing; `bun run check:plans` passes.

### Phase 4 — CI (arc 2, only if a setting holds): not run, D15

1. Apply the setting as a real change with its tests on `block-time-1-a2` off `origin/dev`. Run `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run test:ci-gating`, the touched e2e files on both browsers.
2. Push the branch. Dispatch `pr-extension-network-e2e.yml` and `pr-extension-network-e2e-firefox.yml` three times each on the branch and three times each on `origin/dev`, alternating, so both arms meet the same runner pool; dispatch both smoke workflows once on each as a control.
3. Run `extension-network-e2e-soak.yml` on the files the setting touches (`mode=files`, `repeats=5`, `retry=0`) as a regression screen; five clean repeats bound no flake rate, and the findings say so.
4. Compare the touched files' per-file times by the § Margin and statistics rule, then the envelopes as a secondary measure.
5. Add the CI numbers to the findings document and to a reply under the #959 comment.

**Validation gate.** Pass: every dispatch green on its first attempt; the touched files gain on both browsers by the rule; the soak shows no failure. Layers: CI e2e on both browsers.

## Delivery

- **Arc 1** (phases 1, 2, 3, 5): branch `block-time-1-a1` off `origin/dev`, commits of plan files only, pushed; no PR. Its review is the Codex loop over the findings (Post-implementation).
- **Arc 2** (phase 4, conditional): branch `block-time-1-a2` off `origin/dev` carrying arc 1's commits, opened as a **draft** PR against `dev` with `Refs #959`, the before and after numbers per browser in the body, the test-fidelity trade stated plainly (what the faster sandbox no longer exercises), and the close-out as its final commits. Title ≤ 93 characters, for example `test(e2e): <the setting> on the local sandbox`. Not merged; the owner reviews it.
- **No arc 2:** a docs-only PR `docs(plans): close block-time-1, the e2e block-time findings` with `Closes #959`, holding the archived plan (A1).
- **Parallelism:** none. One worktree runs one e2e run at a time; phase 2's boots can interleave with phase 1's analysis only.

## Decision ledger

| Id | Decision | Why | Rejected |
|---|---|---|---|
| D1 | Layered measurement: CI per-file medians, local instrumented runs for spans, the node probe | answers each question at its cheapest layer | the full matrix (cost); CI-only attribution (no spans) |
| D2 | H1 decided from the node log's arrival-to-build time across sequential and overlapping submits, slot × pool age | the slot reaches wall-clock only through the pool age's date provider (Codex r1, Opus r1) | sequential mints only (cannot see the mechanism); an end-to-end threshold (noise) |
| D3 | `--block-time` and 500 ms settled by V-boot and code; the 500 ms question asked as a cadence (3c) | automine cancels interval mining; `parseSafeInteger` refuses 0.5 | sweeping them |
| D4 | Instruments stay scratch; the findings carry the diffs | one study, one caller | an opt-in tracer |
| D5 | Package experiments only on a private dereferenced `AZTEC_HOME`; hashes before and after decisive runs | shared host, hardlinked store | editing `~/.aztec` or `node_modules` |
| D6 | "Holds": 3e green on both browsers, a paired gain on the targeted files in the predicted category, no P-mech regression | the owner's bar: full gates, no patch; a targeted lever need not move unrelated files (Codex r1) | a gain on P-mech alone; min-max spread rules (Opus r1) |
| D7 | Production wallet intervals are owner asks; a sandbox setting's fidelity trade is stated in the draft PR for the owner's review | a person notices the first; the owner reviews the PR personally | changing intervals in arc 2; a separate ask for the sandbox trade |
| D8 | Budget cut to about 20-30 h: one P-mech run per browser in phase 1, smoke's critical shard only, 3a three runs at two pairs, 3b Chrome except 1/1, one combined lever arm with three matched pairs per browser | the plan as drafted needed 45-60 h (Opus r1); the holds rule needs three pairs on both browsers (Codex final r1) | per-lever arms; full smoke locally; reusing phase 1.3 as a default arm |
| D9 | Local candidate validation mirrors each CI lane's selection and env, after the instruments are removed and hashes match | the gate must be the one CI runs (Codex r1) | one proverless full suite |
| D10 | The sandbox's RPC surface is tracked privately (GHSA-4c23-7xf4-f9q3), not fixed here | predates the lane (Codex r1) | changing the harness's node flags in this lane |
| D11 | Instrument 3 records each transition in the extension's background into `chrome.storage.session`, one key per event, and the launch's existing close-time CSP read collects them; spans are wrapped in by a scratch Vite transform over every exported fixture and helper function, plus Puppeteer's page waits | same guarantees as the planned exposed binding (stamped at the change, keyed, kept across `stopBackground`, which the self-test crossed twice) with one path on both browsers; a hand-wrapped list would miss helpers | a CDP binding per browser; a teardown snapshot |
| D12 | The pool age is set per boot (`P2P_MIN_TX_POOL_AGE_MS`) and read back from the node's config dump; 3a adds 500 and 0 boots at 72/12 and 1/1 | the admin `setConfig` schema has no P2P key, so the in-boot arms of instrument 4 never reached the pool (V-boot: every arm waited about 2 s) | in-boot arms (not possible); patching the admin schema for a knob the env already sets |
| D13 | 1/1 cannot boot on 6.0.0-rc.3, so the shortest pair that boots, 2/2 with `SEQ_BLOCK_DURATION_MS=500` and `SEQ_ATTESTATION_PROPAGATION_TIME`, `SEQ_CHECKPOINT_PROPOSAL_PREPARE_TIME` at 0, takes 1/1's three runs and pool-age arms in 3a and its place in 3b and 3c; 6/6 runs with a 1000 ms block duration and 4/1 with 500 ms, the smallest change that boots each; every short pair also boots once at default timing to record its failure, and a 72/12 boot with 2/2's companions separates their effect from the slot's | the tx pool's gas-limit validator builds the proposer timetable, which needs slot ≥ init (hard-coded 1 s) + 2 × block duration + 2 × propagation + prepare (`<aztec>/stdlib/dest/timetable/proposer_timetable.js`), so no 1 s slot boots; the companions are documented node config | patching the timetable; dropping the short pairs |
| D14 | No matched e2e timing cells at 2/2 or 4/1, though their overlap arms leave M | the only node-level arm a short slot moves is slower (the publish pulls the date provider back), so a cell could only measure a predicted loss, and a short slot also loosens the per-tx DA limit 4.9 times (fidelity); the budget goes to 3d | three matched pairs per short pair (R1's letter) |
| D15 | The combined lever does not hold under this protocol: no 3e, no arc 2; the lane closes with the docs-only PR, and measuring the pool age on CI with balanced order is filed as an owner follow-up | 3d's rule gives a gain on two targeted files per browser and inconclusive cells elsewhere, with one Firefox regression by the numbers; selecting the winners afterwards would change the gate (Codex, verdict a) | arc 2 with CI as the decisive layer; re-running 3d until the pairs agree |

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high; session 01a15ad1): *conditional approve* (correct clock attribution, validate achieved cadence, representative unpatched local gates). Accepted: F3 and H1 rebuilt on the date-provider mechanism (D2); live wallet-transition capture, exclusive span time, receipt polls as bounds (instruments 2, 3); the pump records the achieved cadence and drains (3c); P-mech substitutions (two files never submitted: `tx-transfer-row` rejects every window, `send-amount-exact` closes the review) and the `incoming-arrival` scheduler case; paired differences and *inconclusive* (§ Margin); lane-mirrored local gate (D9); D10; fewer boots (V-boot). Rejected: none.
- **Opus r1** (Plan agent): *conditional approve* (rebuild 3a, H1, F3 and R1 on the date provider; cut the budget; fix the log filter). Accepted: the backward clock at short slots (H1, H4a, I2), overlap offsets and in-boot pool-age arms (instrument 4), the log filter (`node:automine-sequencer`), the budget cuts (D8), H1 from the node log and the paired gain rule, simultaneous dev-versus-branch dispatches in phase 4, the await-then-sleep pump and its pool-age confound, the short-slot break mechanisms grepped in 3b, 4/1 in place of 6/6, the in-flight assertion check before a shorter pool age, H3 decided by code, the hold-off marked miss-only, the private-copy checks. Rejected: a separate owner ask for the pool-age fidelity trade (D7: the owner reviews the PR personally, and it is not a surface a person sees).
- **Codex final r1** (fresh session 01a15adb): *conditional approve* (repair the local hold gate, restore 6 s, correct the measurement gaps). Accepted: F3's bound removed, both reset directions stated, achieved overlap recorded (F3, 3a); 6/6 restored, 4/1 kept as a diagnostic; transitions forwarded live and re-attached across `stopBackground`; three matched pairs per browser in 3d, phase 1.3 no longer a default arm; H6 bounded to P-mech's workload with latency growth; the combined arm claims no per-lever share; the budget projected after phase 1 with a written priority call above 30 h. Rejected: none.
- **Codex final r2** (resumed 01a15adb, verification only): **approve**. All seven fixes present, no regression found.
- **Codex p3d consult** (session 01a15d42): verdict (a), the combined lever does not hold; no arc 2 (D15). It also found the attribution double-count, since corrected (`lessons/phase-1.md`).
- **Codex p5 r1** (gpt-6.1-sol, high; session 01a15d86, over the findings, the lessons, the instruments, the run data and the public drafts): *fix-then-ship*, ten findings, all accepted (`lessons/phase-5.md`). **r2** (resumed): three residuals, accepted. **r3** (resumed): **clean**.

## Post-implementation

The repository standard, `implementations-plan/README.md` § Post-implementation standard at `ca052f08`, with these specifics:

- **Arc 1** has no code diff. Its review loop is Codex (`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`) over the findings document, the `lessons/phase-*.md` tables and the scratch patch diffs, asking which claim the run data does not carry and which mechanism is wrong, plus the adversarial ask. Until clean, three rounds at most, then surface.
- **Arc 2** runs the standard loop over its diff (the two rules verbatim), one Opus diff review beside the first round, then delivery as above and `gh pr checks <n> --watch`.
- **Close-out:** as the standard's step 4, in the arc-2 PR or the docs-only PR (A1). **Teardown:** the standard's step 5 for slug `block-time-1`, trunk `dev`.

## Seeds (drafts, not run)

- `/goal` Arc 1 of implementations-plan/block-time-1 complete: phases 1, 2, 3 and 5 marked ✓ in plan.md, each gate's pass shown in the transcript, the findings document written, the #959 `## Findings` comment posted, the Codex loop over the findings converged.
- `/loop 30m` Drive implementations-plan/block-time-1 arc 1: read plan.md and lessons/, start the next run only when none is in flight, poll a run's log in a bounded loop, record every run in its phase lessons file, never change a setting before phase 1's table exists.
