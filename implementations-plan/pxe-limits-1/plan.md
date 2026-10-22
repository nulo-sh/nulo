---
plan: pxe-limits-1
tier: light
status: closed (arc 1, measured; no product change)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at cef87d9de
trunk: dev
issues: "#1016 (research; the docs-only PR closes it)"
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-22.
- **Status:** closed. Arc 1 measured on `worktree-pxe-limits-1` with scratch instruments and probes, never committed, and on CI through the Chrome soak on `pxe-limits-1-measure-*` branches, all deleted. This docs-only PR carries the record and archives the plan from `docs/pxe-limits-1`, cut from `dev`, not from `worktree-pxe-limits-1` as Delivery planned, so its history holds the published record only; its merge closes the plan and #1016.
- **Shipped:** no code. The findings are #1016's `## Findings` comment and the nine issues below.
- **Measured** (each against its falsifier):
  - H1 holds through 1,000 blocks: 58 PXE-side node calls and 594 tags over the whole test at 100 and at 1,000 blocks, empty or each carrying another account's transfer. At 10,000 the times stay flat (tip 1.16 s) and the count is not split from a late token's import ([lessons/phase-3.md](lessons/phase-3.md)).
  - H2 holds: per block, private-log tags = 84 × (watched tokens + 1) × scopes × (senders + own accounts) + scopes + 86 × handshakes, plus one public-log tag per watched token, exactly at every point; 128 senders cost 21,674 tags and 15 s a block at load1 206.
  - H3: the OPFS half holds (3.0 and 3.1 KiB a note at 100 and 1,000); the memory half is inconclusive (one step).
  - H4a and H4b hold: proving is 81-97 % of a prover-on send's `proveTx` total; WASM is 2.2-3.2 × native on CI. Firefox proves on one thread, 2.8-3.8 × Chrome's total ([lessons/phase-2.md](lessons/phase-2.md)).
  - H5 holds on CI, 3 of 3 iterations in a fixed order. The page opens grow superlinearly; in an A/B on one export, removing `Icon`'s CSS `v-bind` took 79-90 % off the 5,000-row opens ([lessons/phase-5.md](lessons/phase-5.md)).
  - H6 held.
  - H7: the burst half is inconclusive (no block reached the gas budget; one fee payer's balance stopped a 256 burst at 151); the sustained half holds (80 tx/min all included); the growth half holds (`aztecDebug_mineBlock` +7.3 ms per 1,000 blocks, after load) ([lessons/phase-4.md](lessons/phase-4.md)).
- **Dispositions:** the seal (#924) was not compared at equal host load, so no per-row cost is claimed; A2's pinned 2-core run, a removal run for the unlock, an upstream PXE patch for the balance read and a run without a debugger session were not tried.
- **Known limits:** #1040 (the sandbox keeps one fee payer's pending txs only while their max fees fit its balance), labelled `known-limit` and closed as not planned.
- **Open items:** #1033 (the balance read), #1034 (senders × watched tokens per block), #1035 (the health ping closes a slow PXE document, bug), #1036 (`Icon`'s CSS `v-bind`), #1037 (the recipient suggestions), #1038 (the unlock against watched tokens), #1039 (Firefox's one-thread prover, `blocked:external`), #1041 (the local network's stores outlive the e2e run, bug).
- **Lessons:** none promoted. `lessons.md` holds 8,174 of its 8,192 bytes and nothing there is superseded. The one candidate, that a CSS `v-bind()` costs each instance a page-wide query (Vue 3.5.42), is #1036's subject, and a guard against it belongs in that fix.
- **Seeds retired:** the `/goal` and `/loop` seeds below are retired; this plan is a record, not a task list.

# pxe-limits-1: where the PXE and the wallet hit their limits, measured (#1016)

A research lane after [block-time-1](../archive/block-time-1/plan.md): measurements, a findings document, a plain-language report for the owner's explainer, one issue per lever or ceiling, and this record. **No product change.** One arc: one docs-only PR against `dev`. Facts and their lines: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

Size as planned: about 170 lines against the light target of 150, because each of the four questions needs its own arms, budget and gate; the shared steps are cited from the README standard, not restated.

## The claims and what did not hold

- **"A 2-core CI runner":** `ubuntu-latest` on a public repository, which GitHub documents as 4 vCPU (phase 1 prints it). CI's prover-ON jobs prove through a native `presto-server`; only the nightly's non-required leg proves in WASM.
- **"What a block costs the PXE to sync":** nothing until a PXE call. The sync is header only; an anchor move wipes contract sync state, so each (contract, scope) pays on its next use, whoever calls first.
- **"The activity journal":** terminal journal rows are capped at 50 per (profile, account); History grows through transaction and incoming rows.

## Outcome & Quality Bar

- **For whom:** the owner, deciding before 1.0.0 which ceilings matter; the next person who sizes a list, a scan or a sender policy.
- **Excellent:** (1) every number names its run (local id or CI run, commit, browser, arm, load1 at start and end) and method; every ceiling is a crossing with the tested points either side, or "above the tested range"; (2) every lever or defect names its mechanism with a code line and a one-command reproduction, labelled demonstrated or plausible but unverified; (3) every curve is decided on load-independent counts (node calls, tags, rows) with times beside them.
- **Good enough:** host times (188 cores, load1 150-250, WASM at 32 threads) are indicative; the CI runner gives the representative proving, throughput and list times on Chrome; points are sampled, not dense.

## UI impact

None. Nothing that ships changes. A lever that would change a screen (pagination, a cap, a clock) is filed as an issue for the owner, not built.

## Assumptions

**Facts** (recon.md has every line): F1 the PXE syncs inside calls, tips only, and an anchor move re-runs `sync_state` per (contract, scope) over one secret per sender and own account; F2 `proveTx` and `simulateTx` return timings and `nodeRPCCalls`, and `sync` is the header step only; F3 the incoming scanner runs `getNotes` (a contract sync under the PXE write lock) per watched token per account every 30 s; F4 every list read is one whole-area `storage.get()`, nothing is virtualized, sessions derive a MAC key per row twice per list, and seeding n sessions by RPC is O(n²); F5 held; F6 a tx carries at most 5 app calls, the sponsored fee's `sponsor_unconditionally` among them (`wallet-sdk/dest/base-wallet/base_wallet.js:115-120`), and a sender refuses tag indexes past finalized + 84; F7 the soak workflow cancels a second dispatch on one ref and fails a bundle holding probe strings unless `probe` is `1`, which it does not pass; F8 dApps may register 32 senders per app and 128 per chain, a policy figure never measured, while a contacts import adds senders with no cap (`useContactImportExport.ts:401`); F9 `launchExtension({userDataDir})` relaunches on a kept profile (`tests/e2e/fixtures/extension.ts:92-119`).

**Inferences** (each tested below): I1 catch-up is flat in blocks offline and grows with notes that arrived meanwhile; I2 the per-block cost grows with senders × watched tokens more than with notes; I3 held.

**Asks** (working assumption in force; the orchestrator may overrule):
- A1. *Report location:* `~/.cache/nulo-backlog/_orch/reports/pxe-limits-1-report.md`; `findings.md` in the lane's scratch dir.
- A2. *"2-core":* the lane reports the runner's measured cores and no pinned-CPU run; a 2-core number would need `taskset` on this host.
- A3. *#924:* if still open at phase 5, measured on its head against its merge-base with `dev`, identical seeds, both pinned by SHA; if merged, on `dev` against its parent.
- A4. *Supported envelope:* a ceiling past a cap the wallet enforces is a closed `known-limit`; every other ceiling is an open `enhancement` carrying its number, so the owner decides what the wallet supports. A count above the tested range is "unmeasured", never "unsupported".

## Architecture & Implementation

### Hypotheses (fixed before any run)

| Id | Hypothesis | Falsified when | Verdict |
|---|---|---|---|
| H1 | After N blocks offline (locked, background alive) the node calls to reach the tip and a fresh balance are flat for N = 100, 1,000, 10,000; notes that arrived meanwhile add tag rounds; a cold reopen adds a fixed start cost | node calls or tags grow with N | holds through 1,000; at 10,000 times flat, count not split |
| H2 | One new block costs, summed over every PXE call until quiet, tags ≈ (senders + own accounts) × window × touched contracts; senders move it more than notes (0, 1, 10, 100, 1,000) | the note axis moves tags or time more than the sender axis per unit | holds |
| H3 | OPFS bytes per note are roughly constant across steps; process-tree memory returns to its baseline after the step | bytes per note grow across steps, or memory climbs step after step | OPFS half holds; memory half inconclusive |
| H4a / H4b | Proving is most of a prover-ON send on both backends / WASM proving is several times native | proving is under half of `proveTx.total` / the ratio is under 2 | both hold |
| H5 | A list's service read follows total stored rows (whole-area read); its paint follows its own rows; sessions are the steepest family | a family's read stays flat while other families grow | holds (CI, 3 of 3) |
| H6 | held | held | held |
| H7 | Burst: txs per block are bounded by the checkpoint's gas budget, not a count; sustained: included txs per steady-state minute, attributed to pool age and build and publish spans (they overlap); node latency grows too little per 1,000 blocks to move a 30-min shard (about 60 blocks) | a shard-sized block count adds over 1 min of node path | burst inconclusive; sustained and growth hold |

**Statistics.** Phase 1 calibrates; then each sweep is one screening pass, and only the points bracketing a threshold and the decisive comparisons repeat three times in balanced order (A B B A …). A verdict rests on counts; times carry min, median and max with load1; a cell whose repeats straddle a threshold is *inconclusive*.

### Run discipline

- Local runs go through `apps/extension/scripts/e2e/agent.sh` at `NULO_E2E_RETRY=0`, one at a time in this worktree; each writes `~/.cache/nulo-backlog/pxe-limits-1/runs/<id>/` (log, `results.json`, `node.log`, `rec.jsonl`, `env.txt`: HEAD, patch sha256, arm, browser, load1, other runs in `~/.agents/ports.md`). Long probes log progress at least every 5 min (the stall watchdog fires at 10).
- **CI:** disposable commits on `pxe-limits-1-measure-<x>` branches (the lane brief's `*-measure-*` rule), never on the PR branch, deleted after; the scratch soak edit passes `probe: "1"` so the bundle guard knows the run carries instruments. One dispatch per branch at a time (the soak cancels a second). Before each dispatch, `gh run list` on `pr-extension-network-e2e.yml`, `pr-extension-network-e2e-firefox.yml` and `extension-network-e2e-soak.yml`, `--status in_progress` and `--status queued`; wait while another branch's `workflow_dispatch` is listed; after it, check again and record any overlap.
- A red is re-run once at base on the same commit before it is a mechanism; a saturation red waits for load1 to fall and retries once. Watchdog, timeouts and assertions stay as they are; no `pkill`.

### Instruments (scratch patch set `~/.cache/nulo-backlog/pxe-limits-1/patches/`)

1. **Recorder:** block-time-1's transition recorder and node-log tee (`instruments-v11.diff`, rebased), one `rec()` sink from the background and the offscreen.
2. **PXE calls:** a wrapper at the wallet's PXE service boundary (`packages/aztec-runtime/src/pxe/service.ts`) records per call its caller, lock wait, run time, anchor block and, where the PXE returns them, `timings` and `nodeRPCCalls` (`debug.getNotes` returns neither); a counter wrapped around the node client where the runtime builds it tallies each RPC method and the length of every tag array, no payload kept; `onPhase` records `durationMs` and the backend. No file under `node_modules` is edited. **Quiet** means no PXE call queued or running for 2 s after the first scanner tick that follows the block.
3. **Size and memory:** the OPFS walk summed per `pxe/<profile>/<chain>`, `navigator.storage.estimate()`, the node data dir's `du`, and the browser process tree's PSS sampled every second (both browsers); on Chrome also the offscreen and SQLite-worker JS heaps by CDP.
4. **Probes** (`_probe-pxe-sync`, `_probe-sandbox`, `_probe-ceilings`), not gated: they exist only in the patch and run only when named, and each fails when its instruments record nothing. Seeds: the suite's fixtures and test password; contacts and transactions written as rows; senders through `addSender`; sessions through `addDappSession`.
5. **Parsers** under `~/.cache/nulo-backlog/pxe-limits-1/tools/`; `scripts/ci-cd/e2e-timings.ts` for CI logs.

**Committed:** `implementations-plan/pxe-limits-1/**` and the `index.md` line, then the archive move. The PR's `git diff --name-only origin/dev...` must list nothing else. **Rejected:** a Node PXE for Q1 (it skips OPFS, WASM and the wallet's loops); committing the probes as a tracer (one study, block-time-1 D4).

## Security & Adversarial Considerations

- **Secrets:** `apps/extension/src/wallet/constants/network-endpoints.ts` is never opened or printed; the egress guard stays on. No real key or funded account.
- **Scratch on public branches:** measurement commits are public and their objects outlive a branch deletion. They carry no secret and no shipped path: the session and sender seeding goes through existing RPCs, so no privileged hook is added.
- **Disclosure order:** findings, issue drafts and the #1016 comment pass the review loop before anything is posted. Records hold counts, times and test addresses only: no RPC payloads, plaintext or endpoint-bearing error text.

## Phases

Budgets are serial local hours, projected from block-time-1 (5 min fixed per run; about 25 h in all); phase 1 re-projects them, and a phase past 1.5 times its budget writes a priority call into `STATUS.md`.

### Phase 1 — Instruments and calibration (3 h)

1. Build the patch set; self-test on `transfers.test.ts` proverless, Chrome then Firefox: every instrument records; one cold-versus-warm `executeUtility` differential.
2. One CI soak run of the self-test on a measure branch: the runner's `nproc`, CPU model, memory and `navigator.hardwareConcurrency`.

**Gate.** Pass: every instrument's records present on both browsers and on CI; the budget re-projected in `STATUS.md`; `git status` shows plan files only. Layers: e2e-live-network, CI.

**Result.** Pass: every instrument recorded on Chrome, Firefox and CI (soak 39684358284: 4 cores, 16 GiB, the offscreen document cross-origin isolated); the budget re-projected ([lessons/phase-1.md](lessons/phase-1.md)).

### Phase 2 — Proving per flow (Q2; local 3 h, CI 1.5 h)

1. Locally, prover-ON (WASM) and proverless, both browsers: `transfers` (private→private, public→private, private→public), `tx-sendTx-delegated-authwit` (dApp with an authwit), `tx-sendTx-default`, and a scratch test with `selfpay-phase`'s setup and one PrivateFPC send, its assertions kept (that file's routes are statements inside one test, so `-t` cannot pick one); each run asserts a non-zero proof count. Per proof: `proving`, `perFunction`, `sync`, backend, then send→mined.
2. On CI, Chrome soak (`mode=files`, `repeats=3`, `retry=0`), one arm after another: native, WASM (`disable_presto: true`), proverless.

**Gate.** Pass: per backend and browser, each flow's proving, witness generation and total; H4a and H4b decided. Layers: e2e-live-network, CI.

**Result.** Pass: both hold (CI 39684358284 native, 39688200977 WASM; [lessons/phase-2.md](lessons/phase-2.md)).

### Phase 3 — Sync, discovery, growth (Q1 and Q4's growth; Chrome 7 h, Firefox 2 h)

1. `_probe-pxe-sync`, Chrome. Axes one at a time from a base of one token, one account, no senders: notes 0, 1, 10, 100, 1,000 (one minter, 4 mints per sponsored tx, `finalizeThrough` before each 84 indexes, the batch confirmed in calibration; the wallet's note count asserted); senders 0, 32, 128, 1,000; watched tokens 1, 4, 16; accounts 1, 3. Per point: one empty block, then every PXE call until quiet (H2), discovery latency, the scanner tick and its lock hold, OPFS bytes, memory.
2. Catch-up: lock, mine N blocks one at a time, unlock; done when the PXE anchor is the node tip and a fresh balance read returns. N = 100 and 1,000 empty; N = 1,000 with one foreign private transfer per block; 100 notes arriving while locked (finality advanced); one cold reopen at N = 1,000 through `launchExtension({userDataDir})` (F9).
3. Firefox: notes 0, 100; senders 0, 128; N = 100.
4. Growth, Chrome: 10,000 empty blocks while locked, sampling every 1,000 the node data dir, node RSS, build→published p50 and one mint's round trip; then unlock (H1's 10,000 point) and add a token, timing its public backfill (100-block windows, 5 pages a tick).

**Gate.** Pass: H1, H2, H3 and H7's growth half decided or *inconclusive* with the reason; the 128-sender cost stated. Layers: e2e-live-network on both browsers.

**Result.** Pass: H1, H2, H3 and H7's growth half as in the table; 128 senders cost 21,674 tags and 15 s a block ([lessons/phase-3.md](lessons/phase-3.md)).

### Phase 4 — Sandbox throughput (Q4; local 1.5 h, CI 1 h)

1. Burst: pre-build k public mints, submit together, k = 1, 4, 16, 64; per block the tx count and the processor's gas-skip lines.
2. Sustained: offered rates 10, 20, 40, 80 tx/min for 5 min each; included txs per steady-state minute, measured directly, with accepted, reverted and expired counts, backlog growth, drain time, pool depth and age, and the generator's own limit. Locally and on CI (soak, `repeats=3`).
3. From CI logs: blocks per shard and per-file time against position in the shard, last three green runs per browser.

**Gate.** Pass: the burst cap and the sustained rate with their mechanism; H7 decided. Layers: e2e-live-network, CI.

**Result.** Pass, burst half inconclusive: the burst stops at one fee payer's balance (151 of 256) before any gas budget, so the burst half is inconclusive; 80 tx/min sustained all included (CI 39701296358, 39704296940; [lessons/phase-4.md](lessons/phase-4.md)).

### Phase 5 — The wallet's ceilings (Q3; Chrome 3 h, Firefox 1.5 h, seal 1.5 h, CI 1 h)

1. Pure helpers, Bun: `orderTokenRows`, `isHiddenHolding`, `matchRecipients`, `buildActivityRows`, the contacts sort, at 10 to 10,000 rows.
2. `_probe-ceilings`, per family at 10, 100, 1,000, 5,000 (sessions to 1,000, beyond that A4): service read (median of 5), page open to two frames after the last row paints, the Send pickers and one search keystroke, a session insert's time at N; contacts again with 5,000 transactions stored; surviving service and DOM counts asserted. Firefox: contacts and sessions. CI: the Chrome probe once (soak, `repeats=3`).
3. Held.
4. The seal (A3): step 2's contacts and sessions cells and the unlock's sealing pass at 100, 1,000, 5,000 (sessions to 1,000); #924's own 2,000-contact numbers cited.

**Gate.** Pass: per family and browser the 100 ms and 1 s crossings; H5 decided; the seal's cost per count beside its base. Layers: e2e-live-network on both browsers, unit (Bun), CI.

**Result.** Pass, except the seal's comparison: no service read reaches 1 s at 5,000 rows; pages cross 1 s between 100 and 1,000 rows on Chrome and at 1,000 on Firefox; H5 holds (CI 39709645544). The seal's per-row cost is not claimed: its runs were not at equal host load ([lessons/phase-5.md](lessons/phase-5.md)).

### Phase 6 — Findings, review, publication

1. Write `findings.md` (every table, each patch's sha256, ideas not tried), the report (A1) and the issue drafts.
2. Run the review loop (Post-implementation) over them; only then post `## Findings` on #1016 and file, each after a dedupe: an `enhancement` per lever with its share, a `bug` per demonstrated defect, a closed `known-limit` per ceiling past a code cap (A4).

**Gate.** Pass: every hypothesis has a verdict; every issue names its run; `git grep -nE '/(Users|home|mnt)/' -- implementations-plan/pxe-limits-1` is empty; `bun run check:plans` passes.

**Result.** Pass: the review loop ran three rounds ([lessons/phase-6.md](lessons/phase-6.md)); the comment and the issues were posted after it.

## Delivery

One PR from `worktree-pxe-limits-1` against `dev` after phase 6: `docs(plans): pxe-limits-1, where the PXE and the wallet hit their limits`, the answers in its body, `Closes #1016`, the close-out as its final commits, no label. Local phases run serially; CI dispatches run while local work continues.

## Decision ledger

| Id | Decision | Why | Rejected |
|---|---|---|---|
| D1 | The per-block cost is the sum over every PXE call until quiet, decided on tags and node calls | the cost lands on whichever caller comes first; counts survive host load (both legs r1) | the first probe call's time |
| D2 | Senders are an axis | each sender multiplies every sync's tags, and the 128 policy is unmeasured (Opus r1) | notes and tokens only |
| D3 | Empty blocks are the control; a foreign-traffic arm, a cold reopen and a late token's backfill join | empty blocks alone generalise to no real chain (both legs r1) | 10,000 empty blocks as the whole answer |
| D4 | CI: Chrome soak, armed with `probe: "1"`, one dispatch at a time, phases 1, 2, 4, 5 | the soak exposes the arm and runs bounded files; a gate input beats renaming strings past the guard | full-lane dispatches; evading the guard |
| D5 | Memory as process-tree PSS on both browsers, JS heaps on Chrome | the PXE's SQLite runs in a worker the page heap omits (Codex r1) | a page-heap number as PXE memory |
| D6 | Screen once, repeat brackets three times in balanced order | load drift beat the effect in block-time-1 (both legs r1) | three runs of every cell; one run of every cell |
| D7 | Publication after the review loop | a finding may need private handling first (Codex r1) | posting at phase 6 step 1 |

## Audit verdicts

- **Review loop over the findings, rounds 1-3** (Codex resumed `01a16171`, an Opus leg beside it): r1 *reject* from both, r2 and r3 *conditional approve* from both; every item accepted and applied; the loop stopped at its three-round cap ([lessons/phase-6.md](lessons/phase-6.md)).
- **Codex r3** (resumed `01a15ff0`, verification only): **approve**. All six fixes and the size line present; no regression.
- **Codex r2** (resumed `01a15ff0`, verification): *conditional approve* (batch capacity, tag instrumentation, PrivateFPC selection, the envelope's classes). All accepted: 4 mints per sponsored tx (F6); a node-client counter for tags and methods, since `debug.getNotes` returns no stats, and "quiet" defined (Instruments 2); a scratch PrivateFPC test (phase 2); A4 split into admission, restoration and live-storage limits, sessions to 1,000 in 5.4; H7's sustained rate measured, not derived; the cold reopen through `launchExtension({userDataDir})`. Size: over target by about 20 lines, stated under the introduction.
- **Codex r1** (gpt-6.1-sol, high; session `01a15ff0`): *reject* (CI probes unarmed; the sync and throughput methods do not establish the limits; one held item). Accepted: CI arming and non-zero record checks (D4, Instruments 4); the overlap record after dispatch; the per-block metric (D1); the note recipe; empty blocks as a control with a foreign arm and a cold reopen (D3); memory beyond the page heap (D5); `simulateTx` has no `proving`, backend per proof, H4 split; one held item; surviving counts, a paint endpoint, #924 against its own base; screening then repeats (D6); burst and sustained throughput apart; disposable public commits, the file allowlist, publication after review (D7). Rejected: an exclusive window through the orchestrator (a headless lane cannot reach it; the lane brief's queue check plus an overlap record bounds the cost, which is noise, not lost data).
- **Opus r1** (Plan agent): *conditional approve*. Accepted: the per-block metric with `nodeRPCCalls` (D1); senders as an axis (D2); CI legs reworked rather than dropped (D4); the 5-call and 84-index note recipe; sessions through `addDappSession`, to 1,000; one held item; counts over times (D6); a late token's backfill; H7 on the gas budget; budget about 25 h; stale facts (`agent.sh` path, #924's head, bb.js's 32 threads). Rejected: keeping instrument strings off the guard's regex (D4); dropping CI from phases 3-5 (the runner is the representative host for proving, throughput and lists; phase 3 stays local only).

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `cef87d9de`, with: **review loop** over `findings.md`, the report, the issue and comment drafts, the `lessons/phase-*.md` tables and the patch set (no code diff), Codex by `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` with the standard's two rules verbatim, the adversarial ask and "which claim does the run data not carry; which mechanism is wrong"; resumed until nothing material, three rounds at most, then surface. **Delivery and close-out:** steps 3 and 4 in the one PR; `gh pr checks <n> --watch`. **Teardown:** step 5, slug `pxe-limits-1`, trunk `dev`.

## Seeds (drafts, not run)

- `/goal` implementations-plan/pxe-limits-1 complete: phases 1-6 ✓ in plan.md with each gate's pass in the transcript, the review loop converged, #1016's `## Findings` posted, the issues filed, the docs-only PR open with its archive-move commit.
- `/loop 30m` Drive implementations-plan/pxe-limits-1: read plan.md and lessons/, start a run only when none is in flight, poll it in a bounded loop, record it in its phase's lessons file, dispatch CI only when the queue rule allows.
