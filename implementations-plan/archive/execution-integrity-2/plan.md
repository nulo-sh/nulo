---
plan: execution-integrity-2
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex plan audit (gpt-6.1-sol, high) and one Opus Plan leg in parallel; one fresh final Codex pass
base: origin/dev at f55b7b4e
trunk: dev
issues: none public (tracked privately)
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-21
- **Status:** completed. Its delivery is A1, one PR against `dev` (#979); this close-out is its final commits. The orchestrator merges it.
- **Shipped:** P77-02 A: a Send the person pays carries the figure its page showed into the worker, the queued cap or the estimate, and every build, reused or fresh, is held to it before proving: the cap strictly (D2), the estimate by the dApp rule, so a build more than 10% and at least one readout unit above it asks the existing fee question (D6); an accepted fee becomes the next build's figure under the same rule (D3). A build the account pays that reaches the worker with no figure is refused before any proof (D4). No new e2e scenario (D5).
- **Known limits:** none new. #380 (closed, `known-limit`) is unchanged; a Send held to its estimate can now wait at `queued` too, noted on the issue.
- **Open items:** none.
- **Lessons:** none promoted: `lessons.md` is at its budget (8152 B), and both gate deviations are refusals that name their own fix (the smoke setup names the armed build; `agent.sh` names `NULO_E2E_PROVERLESS=1`); they stay in [lessons/phase-2.md](lessons/phase-2.md).
- **Seeds retired:** the `/goal` and `/loop` seeds below; they are not instructions.

# execution-integrity-2: every Send is held to the fee it showed

One arc, one PR against `dev` (branch `execution-integrity-2-a1`). A Send the person pays for carries the figure the page showed into the worker. A build at send time that comes out more than 10% above that figure is not proved: the send asks the existing fee question and waits for the answer. A queued Send keeps its cap and its rule. Tracked privately; this plan describes the change and the invariant it keeps. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/` or `implementations-plan/`; `X` = `wallet/services/execution`.

## The owner's answer (decision page 77, 2026-10-20)

- **P77-02 A**: "Carry the shown fee as the cap; above +10%, the existing fee question."

## What the lane brief claims, checked at f55b7b4e

All hold (lead check against the tree):

- `popup/pages/send.vue:505-506` passes `feeCap` (the queued cap) or `precomputedEstimateId`, never both, and passes no figure for a Send that was not queued.
- `X/transfer-executor.ts:258-261` decides "queued" again at execute, from the ticket, the slot and the chain tip, whatever the page saw.
- `X/transfer-executor.ts:363`: with no cap, `buildPass` returns any build, reused or rebuilt, to `proveAndSend`.
- The dApp path holds the same case: a person-paid approval with no figure is refused, and a rise above +10% asks (`X/dapp-send-executor.ts:296,1448-1459`).
- `X/fee/fee-cap.ts:1-7`: Fee Juice is charged base plus priority up to the cap, so the person pays at most the network price; Private Fee Juice charges the whole committed fee limit. The figure binds both; it matters most for Private Fee Juice.

Not in the brief, found by recon: the worker already supports a send that was not queued and asks: `askFeeAgain` moves any transfer row to `queued` with its `reask`, and Home and `acceptQueuedFee` read only the record (recon, reuse map). So the change is the figure, its rule, and the refusal; the question loop is reused unchanged.

## Outcome & Quality Bar

- **For whom:** a person who confirms a Send that shows "You pay about X", paying from their own Fee Juice or Private Fee Juice, and whose send is built again at send time (the estimate expired, the fee moved, or an earlier send went out first).
- **Excellent:** (1) no build the person pays for is proved more than 10% (and at least one readout unit) above the figure they confirmed without their answer; (2) a send whose build stays within that line goes out exactly as today: no extra question, no extra build, the reused estimate still used; (3) the question, its answer and its cancel are the queued Send's, unchanged; (4) a person-paid send that reaches the worker with no figure is refused before any proof.
- **Good enough:** a rise of up to 10% goes out without asking, as on the dApp path; a send waiting for an answer is lost on a worker restart, as a queued one already is (#380).

## UI impact

- **Home's activity row "Fee went up. Review" and its review sheet** (`RecentActivityView.vue:404`, `SendReviewSheet.vue:166`, testids `tx-awaiting-card`, `send-review-fee-reask`). Before: they appear only for a Send that was queued at confirm. After: they can also appear for a Send that was not queued, when its build at send time rose more than 10% above the figure it showed; the sheet then reads "Fee is now ~Y, above the ~X you accepted.", where X is the figure the Send page showed. Same row, same sheet, same copy, same buttons. Signed off by **P77-02 A** (quoted above).
- No other screen changes. The Send page, its review sheet, the queued cap line and every copy stay as they are.

## Architecture & Implementation

### The figure and its two rules

`X/fee-reask.ts` (beside `feeRiseAsks`, which already states the dApp rule) gains:

```ts
/** The figure a Send-page send was confirmed under: a queued send's cap, which no build passes, or
 *  the estimate it showed, which a build passes by at most the dApp rule's rise. */
export type SendFeeFigure = { readonly fee: string; readonly rule: "cap" | "estimate" }

/** Whether a build's `fee` must ask the person again before it is proved. */
export function figureAsks(fee: string, figure: SendFeeFigure): boolean {
	return figure.rule === "cap" ? BigInt(fee) > BigInt(figure.fee) : feeRiseAsks(fee, figure.fee)
}
```

- **`cap`** is today's queued rule, unchanged: the page says "Fee up to X … If it comes out higher, we ask again." (`SendReviewSheet.vue:167`), so a build above X asks (D2).
- **`estimate`** is the dApp rule: a rise of more than 10% and of at least one readout unit asks (`FEE_RISE_ASKS`), so "Was" and "Now" never print alike (#381).
- The rule stays with the send through its answers: an accepted fee becomes the next pass's `fee`, and the `rule` does not change (D3).

### Data and control flow

1. **Page** (`popup/pages/send.vue` `snapshotTransfer`): `feeCap` and `precomputedEstimateId` as today; new `shownFee = feeEstimate.value.maxFee` when the send is not queued and the person pays (`feePayerOf(payer.value) === "self"`). A queued send passes `feeCap` only; Nulo's sponsor and a hand-added sponsor pass no figure (they show none).
2. **Submit** (`popup/pages/send-submit.ts`): `TransferSnapshot.shownFee?: string`; `executeTransfer` gets it as the 11th positional argument (D1).
3. **RPC** (`X/spec.ts` `Methods.executeTransfer`): `shownFee?: string` after `feeCap`, with its TSDoc. The client is a passthrough; no change.
4. **Service** (`X/service.ts` `executeTransfer`): refuse with `InvalidWalletArgumentsError.forMethod("executeTransfer")` when `shownFee` is present and not `isFeeAmount`, or when `feeCap` and `shownFee` are both present (one figure per send). Then build `figure`: `{ fee: feeCap, rule: "cap" }`, `{ fee: shownFee, rule: "estimate" }`, or `undefined`, and pass it to `execute`.
5. **Executor** (`X/transfer-executor.ts`): `execute(req, precomputedEstimateId, fence, figure?: SendFeeFigure)`; `buildWithinCap` carries `figure` in place of `cap`, and after an accept sets `figure = { ...figure, fee: over.fee }`. In `buildPass`, after the build:
   - `figure === undefined`: if `personalPayerOf` names a payer for this build, throw `Error(MISSING_FEE_FIGURE)` (D4); otherwise return the build (Nulo's sponsor, a hand-added sponsor).
   - `figureAsks(fee, figure)` false: return the build.
   - true: today's over-cap tail, unchanged (give the slot back, stash, return `OverCap` with `cap: figure.fee`).
   - `personalPayerOf` reads `{ feePaymentMethod: built.feePaymentMethod, fpcIdentity }`, with `fpcIdentity` from the build's provenance (`entry.fpcIdentity` on a reused build, the snapshot's on a fresh one).
6. **Question and answer**: `askAgain` → `askFeeAgain` → row `queued` with `reask: { fee, cap: figure.fee, payer }` → Home's row and sheet → `acceptQueuedFee` or `cancelJob`. All unchanged.

### File-level change map

| File | Change |
|---|---|
| `X/fee-reask.ts` | `SendFeeFigure`, `figureAsks`; the header and `FEE_RISE_ASKS` TSDoc name the Send estimate as well |
| `X/fee-reask.test.ts` | one `figureAsks` test: the two rules on one input |
| `X/transfer-executor.ts` | `figure` in place of `cap` through `execute`, `buildWithinCap`, `buildPass`; `MISSING_FEE_FIGURE`; the over-figure branch |
| `X/transfer-executor.test.ts` | cap-harness cases pass `{ fee, rule: "cap" }`; new estimate-rule and missing-figure cases (Phase 1) |
| `X/transfer-executor.cancel-window.pins.test.ts` | only if a call passes a cap (it does not today) |
| `X/spec.ts` | `shownFee?: string` on `executeTransfer`, TSDoc |
| `X/service.ts` | validation, `figure` built from `feeCap` / `shownFee` |
| `X/service.composition.test.ts` | the queued describe unchanged; new describe for the estimate figure (Phase 1) |
| `popup/pages/send.vue` | `snapshotTransfer` passes `shownFee` |
| `popup/pages/send-submit.ts` (+ `.test.ts`) | `shownFee` in the snapshot and the call |
| `popup/pages/send.integration.test.ts`, `send.test.ts` | the 11th argument: the estimate's `maxFee` for a self-paid send that is not queued, `undefined` otherwise |

No stored shape, no message wire type beyond the new optional argument, no new copy.

### Trade-offs and alternatives

- **One rule for both figures** (fold the queued +25% cap into the 10% rule): rejected (D2). A queued send could then go out up to 10% above a figure the page called "Fee up to"; changing the figure or that copy is an owner decision outside P77-02 A.
- **The figure as one object argument on the RPC** (`feeFigure: { fee, rule }` in place of `feeCap`): Outline B, rejected (D1).
- **Refuse instead of asking** (P77-02 B): the owner chose A.
- **No refusal for a missing figure** (trust the page): rejected (D4).

## Decision ledger

- **D1 · the RPC takes `shownFee` as one more optional string; the executor takes one `SendFeeFigure`.** Outline A (this plan) keeps `feeCap` and its tests as they are, adds one argument the service validates with the same `isFeeAmount`, and turns the pair into one typed figure at the trust boundary, so the executor sees one figure with one rule. Outline B replaces `feeCap` with `feeFigure: { fee, rule }`: one shape end to end, but an object to validate at the boundary and every queued call site and test rewritten. Lead: A, the smaller change for the same type safety past the boundary. Codex and Opus both pick A: in both outlines the page picks the rule, so B adds object validation and rewrites every queued call site for no added safety.
- **D2 · the queued cap keeps its figure and its strict rule.** Its page copy promises a ceiling ("Fee up to X … If it comes out higher, we ask again."); the 10% rule applies to the figure the page calls "about".
- **D3 · the rule stays with the send after an answer.** A queued send's accepted fee stays strict, as today and as `same-token-concurrent-sends.test.ts:762-765` asserts; a send held to its estimate keeps the dApp rule after an accept, as the dApp path does (`X/dapp-send-executor.ts:850-855`). Alternative: every accepted fee strict. Lead: rule stays, so each path keeps one rule from confirm to send; Codex and Opus agree. Opus notes the accepted-fee band is this plan's reading of P77-02 A (which signs "above +10%" for the shown fee), matching `overCeiling` and the unchanged sheet copy; the PR body states that reading.
- **D4 · a person-paid send with no figure is refused before proving**, classified by the build's route (`personalPayerOf`, the dApp path's classifier) after the build, as `overCeiling` does. The page never sends one; the refusal keeps a later page change from sending a person-paid build unbound. Cost: one wasted build on a path the page cannot take. Opus offered a simpler alternative: decide before the build with `queuedFeePayer(turn.fpc).type !== "fpc"`, which saves the build and the provenance read (for a transfer, `turn.fpc` is the build's row: `tryConsume` ties a reused entry to it, `X/transfer-estimate-reuse.ts:161`). Codex holds the refusal belongs after the build, where the route is known. Lead: after the build, so both paths answer "does the person pay?" with one classifier over what will be proved; the provenance read is pinned by the Private Fee Juice refusal tests.
- **D5 · no new e2e scenario.** The question, its record and its answer are the queued path's, which `same-token-concurrent-sends.test.ts:692` drives end to end on both browsers. What is new is a figure on the RPC (popup integration test and the composition test) and its rule (unit and composition tests). Every existing self-paid Send in the network suite (`fee-methods.test.ts:88,147`) now carries the figure through real builds and proves the rule asks nothing when the build matches. A scenario that rises more than 10% between estimate and send needs a fixture that rewrites the node's fee answers inside the worker; its one distinct failure mode (the page's figure reaching the worker) is covered by the cheaper layers above. With D4, those `fee-methods` sends also prove the figure reaches the worker: without it the worker refuses them and "Transaction submitted" never shows (Opus). Codex and Opus agree: no new e2e.
- **D6 · the estimate rule keeps the dApp rule's one-readout-unit floor.** `feeRiseAsks` asks only for a rise of more than 10% *and* of at least one unit of the readout's last digit (10^12 base units), so the question's "Was" and "Now" never print alike (#381). Codex (round 1) showed a tiny fee can then rise more than 10% unasked: estimate 4 units, build 4.9 units, about 0.000004 vs 0.000005 FJ. The lane brief names "the rule the dApp path already follows", which is this rule, floor included; the unasked amount is under one unit of the last printed digit (0.000001 FJ), a consequence that does not matter. Kept, no owner ask.

## Security & Adversarial Considerations

- **Threat model.** The fee a send commits comes from the node's fee reads and a fresh simulation at send time; both are input the person did not see. The boundary is the person's consent to a figure. After this change no person-paid build passes the figure by more than the rule allows without the person's answer, whatever those reads return. A rise inside the rule (≤ 10%, or under one readout unit) goes out unasked, as on the dApp path.
- **Input validation.** `shownFee` and `feeCap` are validated at the RPC boundary (`isFeeAmount`: a positive integer of at most 39 digits); both together are refused. The figure is compared as `BigInt` only.
- **Repeated questions.** Each build above the figure asks once; the person can cancel; the ticket's deadline (60 min) ends an unanswered question as cancelled. Unchanged from the queued path.
- **What is not trusted.** The page's payer label: the worker classifies the payer from the build's route, so a figure missing for a person-paid build is refused even if the page thought otherwise.
- **Crypto, least privilege, supply chain.** No change: no new dependency, key, permission or workflow.
- **Logging.** No new log line carries a figure; `askFeeAgain`'s existing debug line names none.

## Assumptions

**Facts** (checked at f55b7b4e):
- F1. A reuse hit returns the estimate's own build, so its fee equals `maxFee` (`X/transfer-executor.ts:360-362,781`), and `feeRiseAsks` with no rise answers false (`X/fee-reask.ts:25-28`).
- F2. The Send page offers only Fee Juice, the protocol PrivateFPC and `DefaultSponsoredFpc` rows, Nulo's and hand-added ones (`popup/components/modules/send/fee-helpers.ts:209-222`). `feePayerOf` calls the first two "self", which `personalPayerOf` classifies as personal; it calls the sponsor rows "sponsor" or "unvouched", which `personalPayerOf` does not classify as personal.
- F3. `isAllowedToSend` refuses a self-paid send with no estimate unless it is queued with a cap (`popup/pages/send.vue:321-335`), so every self-paid confirm has exactly one figure.
- F4. `acceptQueuedFee` and Home's row read only the record (`X/service.ts:754-762`; `reask-review.ts`); the record shape does not change.
- F5. `executeTransfer` (`X/service.ts:617-640`) takes trailing optional arguments; the wire keeps `undefined` positions and caps arity at 256 (`packages/extension-messaging/src/utils.ts:4-41`); the client is a passthrough (`X/client.ts:29`).
- F6. The popup's RPC deadline for a send is 60 minutes (`X/client.ts:11`), and so is the ticket's, counted from `sequencer.enter`, a little later (`X/send-sequencer.ts:166`). Near the end the popup's call can time out before the question does; the record still holds the outcome. This is today's queued behaviour, unchanged.

**Inferences** (Opus checked both against the tree; re-check in Phase 1):
- I1. The cap harness and the composition harness need fees of at least one readout unit (10^12 base units) for an estimate-rule case to ask; their current fees are far below it.
- I2. `buildPass` stays within the complexity budget with one more branch; if not, the figure check moves into one helper, never a suppression.

**Asks**: none open. P77-02 A is the only visible change; OWNER-ASKS.md says none.

## Phase 1 · the worker holds every person-paid Send to its figure ✓

Steps:
1. Add `SendFeeFigure` and `figureAsks` to `X/fee-reask.ts`. Update the header and the `FEE_RISE_ASKS` TSDoc.
2. Replace `cap` with `figure` in `X/transfer-executor.ts`. Add the missing-figure refusal and the over-figure branch in `buildPass`.
3. Add `shownFee` to `X/spec.ts` and to `X/service.ts`. Add the two refusals and build the figure there.
4. Change the cap harness call sites to `{ fee, rule: "cap" }`. Replace the second half of "a fee equal to the cap proves once and never asks; with no cap any fee proves" (`transfer-executor.test.ts:1753`) with the sponsor control below: it states the contract this phase ends. Tests whose subject is something else keep the harness's default build, whose placeholder method `personalPayerOf` does not classify as the person's.

Tests that land here:
- `fee-reask.test.ts`: one `figureAsks` test. At one readout unit above a figure (within 10%), `cap` asks and `estimate` proves; at the figure itself both prove. `feeRiseAsks`' own boundaries are already pinned (`fee-reask.test.ts:11-35`).
- `transfer-executor.test.ts` (cap harness, fees scaled past one readout unit, real `AccountFeePaymentMethodOptions` values on the builds these cases use):
  - The estimate's reuse misses (its entry expired), and the fresh build comes out above +10%. The send asks once and proves nothing; the accept proves the stashed fresh build once.
  - Control: a fresh build at exactly +10% proves with no question.
  - After an accept, a rebuild at least one readout unit and at most 10% above the accepted fee proves with no second question (D3; the band tells the two rules apart).
  - No figure, parameterized over a Fee Juice build, a fresh Private Fee Juice build and a reused Private Fee Juice build (the classifier reads `fpcIdentity` from each provenance): each fails with `MISSING_FEE_FIGURE` and proves nothing. Controls: the same Private Fee Juice build with its figure proves; Nulo's sponsor with no figure proves.
- `service.composition.test.ts`, new describe "a Send held to the estimate it showed asks again above it". It uses a Fee Juice request and a stashed entry whose fee clears one readout unit.
  - The send's build is more than 10% above `shownFee`: the record asks `{ fee, cap: shownFee, payer: { type: "fj", isProtocol: false } }`, and `proveTx` and `sendTx` are never called.
  - Control: a build exactly 10% (and at least one readout unit) above `shownFee`: proved and sent once, never `queued`. A build in that band asks under the cap rule, so this control fails if the service maps `shownFee` to the wrong rule.
  - A Fee Juice send with neither figure ends `failed` before proving.
- `service.estimate-queue.test.ts`, the existing facade describe of `executeTransfer`'s fee arguments (deviation: the boundary's refusals already live there, one layer cheaper than composition). Refused classes, nothing run: a malformed figure in either position; `feeCap` and `shownFee` together. Control: a cap maps to the cap rule, a shown fee to the estimate rule.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/execution`; `bun run test`.
- Pass criteria: every command exits 0. The new tests fail on `f55b7b4e` with the new arguments ignored (take the old files from the base SHA), and pass at the phase head. The existing queued describes pass unchanged except for the figure's form.
- Layers: lint, typecheck, unit, composition.

## Phase 2 · the Send page passes the figure it showed; the suites on both browsers ✓

Steps:
1. Pass `shownFee` from `snapshotTransfer` (`popup/pages/send.vue`), as the data flow says.
2. Carry `shownFee` through `popup/pages/send-submit.ts`.
3. Update the popup tests' argument lists.

Tests that land here:
- `send.integration.test.ts`: a Fee Juice Send that is not queued passes its estimate id, no `feeCap`, and the estimate's `maxFee` as `shownFee`.
  - The existing queued and sponsor cases assert the 11th argument is `undefined`.
- `send.test.ts`: the sponsor submits' `toHaveBeenCalledWith` lists gain the trailing `undefined`.
- `send-submit.test.ts`: `shownFee` reaches `executeTransfer` in its position.

**Validation gate**
- Commands:
  - `bun run audit:vue` (typecheck, test and lint, then build); `bun run test:all`.
  - Smoke, on the armed smoke build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`): `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/send-fee-privacy.test.ts tests/e2e/send-keyboard.test.ts --retry=0`.
  - Network, from the repo root: `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/same-token-concurrent-sends.test.ts tests/e2e/network/fee-methods.test.ts` (the network config retries twice unless `NULO_E2E_RETRY` says otherwise; `same-token-concurrent-sends` is proverless-gated, and `agent.sh` refuses the run without `NULO_E2E_PROVERLESS=1`).
  - Then the same network run with `NULO_E2E_BROWSER=firefox` added. Through `agent.sh` only, one run at a time in this worktree.
- Pass criteria:
  - Every command exits 0.
  - The queued re-ask case asks, is answered from Home, and goes out once.
  - The public and private Fee Juice Sends in `fee-methods` succeed with no `reask` on their records.
  - Record each browser's wall-clock for the two network files.
- Layers: lint, typecheck, unit, component, build, smoke e2e, network e2e (Chrome, Firefox).

## Delivery

- One arc, one PR against `dev` from `execution-integrity-2-a1`, not stacked (D-orch-1). Phases 1 and 2 are sequential (Phase 2's page needs Phase 1's argument); no lanes.
- PR title (≤ 93): `fix(send): hold every send the person pays to the fee it showed`.
- PR body: what changed and why, in terms of the change and its invariant; P77-02 A quoted by id and text; the validation runs with outcomes and each browser's e2e wall-clock; no issue reference (tracked privately); no e2e scenario added. Not a draft.
- Labels: none at creation. Add `e2e:extension-network` afterwards only if the path filter skipped the network lane.
- Close-out: the PR's final commits (below).

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `f55b7b4e`. Specific to this plan:

- **Review loop:** single arc, once over the net diff from `f55b7b4e`, after Phase 2 is green. Codex at `high` on `gpt-6.1-sol` (`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`), resumed with `resume-codex.sh`. Every prompt carries the two verbatim rules of the standard, the adversarial ask, this plan and its ledger. Hard stop at three rounds. Log each round in `lessons/phase-2.md` and under Audit verdicts.
- **Delivery:** as above, after the loop converges; then `gh pr checks <n> --watch`.
- **Close-out** (the PR's final commits): merge `origin/dev` first and read what changed in `index.md` and `lessons.md`. Write the Outcome (Known limits: none new; #380 unchanged). Promote any lesson (8 KiB budget). Comment on #380 that a Send held to its estimate can now wait at `queued` too. Delete `STATUS.md`. `git mv` to `archive/` in its own commit; move the index line; `bun run check:plans` green.
- **Teardown** after the merge: `agent-worktree done execution-integrity-2 --merged`, as the standard says.
- Approval boundary: a fix that adds state, a lifecycle, a protocol, a recovery policy or a public contract stops for the orchestrator.

## Audit verdicts

**Round 1, Codex (gpt-6.1-sol, high): conditional approve.** All five accepted.
- C1 (Medium): the one-readout-unit floor lets a tiny fee rise more than 10% unasked. Accepted as a recorded decision, not a code change: D6.
- C2 (Medium): the missing-figure refusal was tested only on Fee Juice, which never reads `fpcIdentity`. Accepted: parameterized over fresh and reused Private Fee Juice builds, with a figure control (Phase 1 tests).
- C3 (Medium): the composition case reuses the stash; the rebuild path needs its own proof. Accepted: an executor case forces a reuse miss and a larger fresh build (Phase 1 tests). No e2e added.
- C4 (Low): F2 omitted hand-added sponsor rows; F6 claimed a deadline order that does not hold. Accepted: both narrowed.
- C5 (Low): the UI gates `audit:vue` and smoke e2e were missing. Accepted: Phase 2 gate.
- Pick: Outline A.

**Round 1, Opus Plan leg: conditional approve.** Five accepted, one alternative rejected.
- O1 (Medium): no test tells which rule the service builds from `shownFee`. Accepted: the composition control sits inside the +10% band.
- O2 (Medium): `transfer-executor.test.ts:1753` asserts "with no cap any fee proves" and stays green through the harness's placeholder method. Accepted: replaced by the sponsor control (Phase 1 step 4).
- O3 (Low-Medium): the `fpcIdentity` read is untested. Accepted (same fix as C2). Its alternative, deciding before the build with `queuedFeePayer(turn.fpc)`, rejected: D4.
- O4 (Low): the D3 and boundary cases must sit at least one readout unit above their figure. Accepted.
- O5 (Low): `figureAsks` tests repeat `feeRiseAsks`' own. Accepted: one test.
- O6 (Low): F5 cited the wrong lines. Accepted.
- Pick: Outline A. Adversarial hunt: no path left where a person-paid Send-page build is proved more than 10% above its figure without an answer.

**Final fresh Codex pass (gpt-6.1-sol, high): conditional approve**, one condition.
- F1 (Low): the network gate promised retry 0 but passed neither `--retry=0` nor `NULO_E2E_RETRY=0`; `vitest.e2e.network.config.ts:28` defaults to 2. Accepted: `NULO_E2E_RETRY=0` on both network runs.
- Looks fine: no bypass on the supported person-paid paths; D1-D6 hold; the tests cover distinct failures; the execution contract is executable from the README standard.
- Resumed after the fix: **approve** ("the network command sets `NULO_E2E_RETRY=0` … no regressions found").

**Implementation review loop (net diff from `85edeb86`, arc 1 of 1).**
- Codex round 1 (gpt-6.1-sol, high): **clean**. Both build paths meet the figure before proving, the provenance reads are right, an accept keeps the rule, the wire keeps the 11th argument.
- Opus diff review (alongside round 1): **clean**, three optional low items, all applied in `96db5421`: the composition refusal checks its recorded reason; the reused Private Fee Juice refusal checks that no fallback build ran; the question's two debug lines no longer say "queued send".
- Codex round 2 (resumed, verification): **clean**. Converged.

## Seeds

```
/goal implementations-plan/execution-integrity-2/plan.md has both phases marked ✓, each backed by its validation gate reported passing in the transcript; LESSONS_FILE lines printed per phase; the Codex fix loop converged on the net diff (a resumed pass reporting no new material finding, quoted); the PR against dev exists (gh pr view), opened after the loop, carrying the close-out commits (git show --stat of the archive move); bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/execution-integrity-2 forward per its plan.md (Post-implementation and the README standard at f55b7b4e); never merge; Codex decides what the owner would; stop after 5 failures on one step.
```
