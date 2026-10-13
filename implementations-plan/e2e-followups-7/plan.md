---
plan: e2e-followups-7
tier: light
status: planned, awaiting the orchestrator's approval
issues: "#349 (arc-1); #322, #329, #354, #279, #186, #195 (no arc)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex (gpt-6.1-sol, high) on the decision and the plan, resumed to an explicit verdict; one Opus 5.5 Plan lens
base: origin/dev at e900f710
trunk: dev
post_implementation_hardening: not scheduled
---

# e2e-followups-7: the drain waits for the write its grant still owes

Recon: [recon.md](recon.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md). Probes, rates and consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In (arc-1):** #349, Phase 1. The PR says `Closes #349`.

**No arc, with reason:** #322 (investigated in #328, open until the recursion recurs); #329 and #354 (lane `wallet-followups-7`); #279 (decision page 5, P5-07); #186 (after #279); #195 (decision page 5).

**Out:** no product file changes. No raised wait (the 60 s in `fillSendForm` stays), no retry, no reordered case, no `skipIf`, no suppression. `lessons.md` is at its 8 KiB budget: nothing is promoted unless a retirement pays for it.

## Outcome & Quality Bar

**For whom:** the maintainer who reads `extension-network-e2e-status` on a PR that touches neither Send, balances nor authwits, and needs a red there to mean a real fault.

**What excellent looks like:**
- Before the mint, the drain proves the grant's last balance write has landed, and its doc comment names every write and its one cause.
- Under the two-core amplifier the drained cases pass every round on both browsers (base failed 4 of 7 on Chrome, F2), and a widened copy is red on base and green on the head for the traced reason, on both browsers. The cost, about +55 s per drained case (three per browser), is measured and stated.

**Good enough:** the barrier is local to snack-placement and fixture-specific; the helper it borrows moves to a fixture so it has one copy.

## Assumptions

**Facts** (verified at e900f710):
- F1. The writer is the transaction worker's finality commit. `TransactionService.checkFinality` (`apps/extension/src/wallet/services/transaction/service.ts:526-541`) re-reads a mined row every 60 s (`inclusion.ts:13`; the next read is scheduled before the I/O, `:437`) through a single-attempt client (`network/service.ts:843-847`) and commits `Finalized`; `commit` (`:546-562`) stamps `updatedAt`, persists, then emits `onTransactionUpdated`, unawaited by its subscribers; `TokenBalanceService.onTransactionUpdated` (`token-balance/service.ts:589-606`) refreshes on any non-Pending update, so the dApp-origin grant re-projects every balance of the account a second time.
- F2. Base, amplified (two cores, retry 0): on Chrome 4 of 7 valid drained-case runs failed and the finality write landed after the spend in 6 of 7; every failure's trail shows `Tx finality settled {"outcome":"final"}` 1-4 s after the spend, then a balance tick storing `publicBalance "0"`. Firefox: 0 of 9 failed, the write landed after the spend in 6 of 9, each after the form filled; #349's comment records three Firefox failures under CI load.
- F3. The finality watch came with #343 (merged 2026-10-13 03:03Z); #349's first failure ran at 11:36Z on a head that contains it.
- F4. Neither a queued retry nor the mint's update explains a captured failure; KL1 keeps two traced, unreproduced paths open (§ Architecture).
- F5. This sandbox does not advance L1 with wall-clock time alone (anvil with `--slots-in-an-epoch 1` and no block time, `tests/e2e/global-setup.ts:401-403`), so the test drives finality itself rather than lean on later traffic. `finalizeThrough` (`network/failed-send-check.test.ts:178-187`) does it with `anvil_mine`.
- F6. `waitForBalanceQueueIdle` (`fixtures/journal.ts:340-363`) says it cannot see work not yet enqueued.
- F7. #349's line refs moved: `sendFromDrainedBalance` is at `:341` (the issue says `:342`), `fillSendForm` at `helpers.ts:1245`.

**Inferences:**
- I1. CI's 60 s enabled-wait failure and the probe's 120 s submit-wait failure are one cause: the 0 lands before or after the fill's first poll.
- I2. The load sensitivity is structural: the drain takes about 60 s from the grant's mined commit to the spend (the receipt wait dominates), so the first finality read lands near the spend.

**Asks:** none. P (D1) would be an owner question; it is rejected, not asked.

## Architecture & Implementation

- **Cause.** The case's model misses that a wallet tx mined below Finalized refreshes balances twice: when mined and when the worker reads its block final. The barrier before the spend proves only that the queue is idle, not that no write is owed.
- **Fix (test side).** In `balanceDrainedBehindTheWallet`, after the grant's mined write settles and before the mint:
  1. drive the local chain final through the grant's block;
  2. wait until the account's tx rows are exactly the grant and it reads `Finalized` without `awaitingFinality` (the fixture holds one wallet tx before the mint; any other row fails with the rows as diagnostics);
  3. wait for a balance write newer than that commit's `updatedAt`, then the idle queue.
- **Why that proves no write is owed.** The Finalized row alone does not: the subscriber's `getAll()` and `enqueue` run after the emit, unawaited. Between the grant's settle and the mint the finality refresh is the only possible enqueue, so a write newer than the final commit is its write, and the idle tick after it ends that work (D2). The proof is fixture-specific, not a general quiescence check.
- **The model, in the doc comment:** a wallet tx mined below Finalized refreshes the account twice (mined, final); a first answer already Finalized refreshes once; a move or prune can add more; a receipt to the account refreshes once.
- **Change map:**
  - `apps/extension/tests/e2e/fixtures/aztec.ts`: `finalizeThrough(node, block, timeoutMs = 180_000)` and its `anvil_mine` step, moved from failed-send-check; it uses `aztec.ts`'s own `ANVIL_URL` (`:438`) and drops the `[${SPEC}]` prefix.
  - `apps/extension/tests/e2e/network/failed-send-check.test.ts`: import it; delete `mineL1Blocks`, `finalizeThrough`, the `ANVIL_URL` const (`:55`) and the `Node` type.
  - `apps/extension/tests/e2e/network/snack-placement.test.ts`: the three steps in the drain (the node from `createTestWallet`); a local loop that keeps the last rows for its error, as failed-send-check's `waitForTx` does; the page reads raw storage, the Node side classifies (complexity ≤ 15); the doc comment (`:286-293`).
  - `apps/extension/tests/e2e/fixtures/journal.ts`: one clause in `waitForBalanceQueueIdle`'s doc: nor a refresh the transaction worker still owes.
  - `apps/extension/tests/e2e/README.md`: a helper row for `finalizeThrough`. `.claude/skills/e2e-testing/SKILL.md` § 5: ledger row 56.
- **Boundaries, not built (KL1).** Two later writes with a trace and no reproduction, both after the mint's barrier: a reorg that orphans the mint's receipt (`incoming-transfer/service.ts:2062-2066` marks the balance dirty again), and a second queued projection that fails with a stale anchor and parks a delayed retry after its tick logs completion (`balance-job-queue.ts:334`, `:186`; a later success clears it, `:399`). A general fix needs scanner or queue completion semantics, disproportionate here. Close-out files one closed `known-limit` issue with each path's conditions, trace and reopening evidence (a failure whose trail shows either path).

## Security & Adversarial Considerations

Test-only. No product, permission, secret, network or dependency change. `anvil_mine` reaches only the run's own anvil (`agent.sh` exports the claimed `ANVIL_URL`); a CI shard owns its sandbox and runs files one at a time, and failed-send-check already mines there. A manually shared sandbox does not get that guarantee. The real target is false evidence: a barrier that passes while a write is owed. D2's single-cause argument, the sole-grant check and the causal red/green copy answer it; a lost refresh (worker death) times the wait out, red, never green.

## UI impact

None. No screen, copy or rendered value changes.

## Phase 1: the drain waits for the grant's final write

The tree is clean at the plan commit (the planner's probe edit is gone).
1. Move `mineL1Blocks` and `finalizeThrough` into `fixtures/aztec.ts` per the change map; failed-send-check keeps its behaviour.
2. In snack-placement, after the grant's `settledBalanceWrite`: read the account's tx rows; fail unless they are exactly the grant with a finite block number. Call `finalizeThrough(node, block)`; log its duration.
3. Wait, 180 s, until the grant reads `Finalized` without the marker and is still the only row. Derivation: the worker reads every 60 s through a one-attempt client, so allow one failed read (two reads) plus margin; failed-send-check waits 180 s for the same row. A passing run takes no longer. Log chain-final to wallet-final.
4. Keep that row's `updatedAt`; call `settledBalanceWrite(page, account, "0", <it>)`. Do not recapture a baseline. Then mint, as today.
5. Rewrite the doc comment; add the `journal.ts` clause, the README row and ledger row 56.

**Tests:** no new committed test. The drained cases are the never-happens check (Send still offers the stale balance); the execute-window case is an unaffected-path control.

**Validation gate:**
- `bun run lint`, `bun run typecheck:all`, `bun run test`: exit 0.
- Red then green, uncommitted copy `snack-placement.widened.test.ts` beside the file, run with `-t` per case: after the spend it drives finality through the grant's block, waits for `Finalized`, then for a balance write newer than that commit and the idle queue, then opens Send. Base (from e900f710, never `HEAD`): red at the 60 s enabled wait where the final commit followed the spend's return and its write stored 0; a base run whose final commit preceded the spend is recorded as non-qualifying. Head: green, and the copy asserts the final commit's `updatedAt` precedes a timestamp taken before `spendPublicAuthwit` is called. Same instrumentation on both (the planner's base copy is kept under `~/.cache/nulo-backlog/e2e-followups-7/`). Base is done: 3 of 3 drained cases red and qualifying on each browser, the control green (`lessons/phase-0.md`); the implementer runs the head copy. Delete the copy.
- Amplified, from the repo root, five rounds per browser: `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 taskset -c <two free cores> bun run e2e:agent tests/e2e/network/snack-placement.test.ts`, then with `NULO_E2E_BROWSER=firefox`. Pass: 15/15 drained and 5/5 control per browser. Headroom: each drained case under 75% of its timeout (315 s, 360 s); over it, stop and report, never raise it.
- The moved helper's caller, once per browser at retry 0: `tests/e2e/network/failed-send-check.test.ts` (`NULO_E2E_PROVERLESS=1`). Pass: green. The touched fixture is network-only (no smoke file imports `fixtures/aztec.ts`); CI's Chrome and Firefox network lanes run the rest.
- Runtime: snack-placement's wall-clock per browser, unpinned, base and head (the suite's change equals it). Record in `lessons/phase-1.md` and the PR body, with the barrier's logged trail margin.

## Arc gate (final head, after merging `origin/dev`)

`bun run test:all`, `bun run test:ci-gating`, `bun run lint`, `bun run typecheck:all`, `bun run check:plans`, `bun run lint:actions`: all exit 0. If #356 merged, snack-placement once more per browser at retry 0.

## Delivery

Single arc, one PR against `dev`, no stack (orchestrator D-orch-1); `code_review: off`. Branch `worktree-e2e-followups-7`. Open the PR only after the arc gate and the Codex loop converge, with no labels (`apps/extension/**` runs the network lanes). Title: `test(e2e): wait for the grant's final balance write before the drain` (68 chars). Body: the cause with F2's trail, the change, the red/green and amplified rounds, the runtime before and after per browser, `Closes #349`, ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then `gh pr checks <n> --watch`.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at e900f710. Plan-specific parts:
- Review loop: `~/.claude/skills/codex/scripts/run-codex.sh <mktemp prompt under ~/.cache/nulo-backlog/e2e-followups-7/> <worktree> high read-only gpt-6.1-sol`; resume with `resume-codex.sh "" <followup> <codex-dir> high`. Add to the adversarial ask: "Where can this barrier pass while the wallet still owes the account a balance write?" Hard stop at three rounds (`ARC_FAILED: arc-1 <reason>`). Log rounds in `lessons/phase-1.md`.
- Close-out: as the PR's final commits; `Known limits:` names KL1's closed issue; `Open items:` reads `none` unless the loop files one; `STATUS.md` deleted; `git mv` into `archive/` in its own commit.
- Teardown: `agent-worktree done e2e-followups-7 --merged --trunk dev` once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-followups-7/plan.md` succeeds.

## Decision ledger

| # | Decision | Views | Status |
|---|---|---|---|
| D1 | Fix the test's barrier, not the product's finality refresh (P) | Planner: P needs new state or a new signal, since `TokenBalanceService` cannot tell a final-only commit from a first answer already Finalized. Codex: the final refresh reads current balances (the probe shows it correcting one), so removing it changes what a person sees; #343's D30 covers journal rows only. Both: T | accepted |
| D2 | The barrier runs between the grant and the mint | Planner, Codex, Opus: after the mint, a mint write newer than the final commit can end its tick before the finality handler enqueues (plausible, unverified); an acknowledgement would be a contract for one fixture. Cost +55 s per drained case | accepted |
| D3 | The account's rows must be exactly the grant | Planner proposed "no owed row of the account". Codex: two finalized txs can still leave one subscriber's enqueue pending (traced), and an empty set must not pass. Opus: find the grant inside the filtered set. Enforce the sole grant | accepted |
| D4 | Drive finality with the moved `finalizeThrough`, not by waiting | Codex: the mint has not run, and leaning on other traffic is a timing dependency. Keep its node-taking signature (`createTestWallet` returns the node) | accepted |
| D5 | KL1: the reorg and stale-anchor retry paths stay boundaries | Codex and Opus: traced, unreproduced, fix disproportionate; one closed `known-limit` issue, each path with its own trace | accepted |
| D6 | The Finalized wait is 180 s, not 90 s | Codex: 90 s is one cadence plus healthy margin, not a bound; say so and measure. Opus: a one-attempt read can fail, and with 90 s one missed read fails the barrier. Opus's path wins: two reads, the 180 s precedent | accepted |

## Audit verdicts

- **Codex, decision consult** (gpt-6.1-sol, high, read-only; session `01a136be-157b-7f01-a3b5-1956f96758e4`): `verdict: T`, confidence high. Accepted: D3's grant check, the ordering proof, the model, D4, D5, measured headroom. Rejected: none.
- **Codex, plan audit** (same session, resumed): `conditional approve`. Accepted: F4 and F5 narrowed; the sole-grant precondition (D3); the copy observes the causal write before Send and records non-qualifying base runs; the 90 s derivation (D6, resolved at 180 s); 15+5 denominators and the base ledger; `finalizeThrough`'s default; no recaptured baseline; probe removal; `lint:actions`. Rejected: none.
- **Codex, verify** (same session, resumed): `approve`, confidence high; D6's 180 s accepted as an operational budget. One execution detail, accepted: the head copy compares against a timestamp taken before the spend is sent, not after it returns.
- **Opus 5.5 Plan lens**: `conditional approve`. Accepted: D6; the clean tree; the base ledger; base's copy before implementing (run during planning: red 3/3 per browser); the error loop and Node-side classification; the grant inside the filtered set; the move's details; the Firefox and suite-runtime gate notes; the headroom bound; the cost in the Outcome; the non-vacuous head copy. Corrected: "owed" no longer names Dropped rows. Rejected: none.

## Seeds (draft; the orchestrator owns execution)

- `/goal Phase 1 of implementations-plan/e2e-followups-7/plan.md is ✓ with its validation gate reported passing in the transcript, the arc gate passes, the Codex loop converged (a resumed pass reporting no new material finding, quoted), the PR against dev exists with Closes #349 and was opened after the loop, and the close-out archived the plan.`
- `/loop 15m Drive implementations-plan/e2e-followups-7 forward per its plan.md: read plan.md and lessons/ first; run the next pending step; run its gate; never raise a wait, add a retry or skip; consult Codex (gpt-6.1-sol, high) on any decision; stop at the merge.`
