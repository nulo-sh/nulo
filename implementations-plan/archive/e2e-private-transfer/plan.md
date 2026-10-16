---
plan: e2e-private-transfer
tier: light
status: completed
issues: "#165 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); a two-browser spike; one Codex audit (gpt-6.1-sol, high) with one resume; one Opus Plan leg
base: origin/dev at 8459699c
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date**: 2026-10-16
- **Status**: completed. One arc. Phase 1's gates and the negative control behaved as planned. The Codex loop converged in two rounds.
- **Shipped**: `tx-sendTx-delegated-authwit.test.ts` now runs in the default network partition on both browsers, with no env gate (#165). It reads the discovered authwit as the donor's private transfer to the consumer, in the token's units, and checks that the send is submitted. The delegated-pull rig publishes `PublicChecks` itself. `NULO_E2E_STANDARD_CONTRACTS` is gone.
- **Dispositions**: the playground control and the private-row e2e named by #165 already shipped in #293 (Scope). The step 5 read changed shape (D6).
- **Known limits**: none.
- **Open items**: none.
- **Lessons**: none promoted. `lessons.md` is at its 8 KiB budget and this plan supersedes none of it. The false "post-genesis publish collides" premise was deleted with the header that carried it.
- **Seeds retired**: the `/goal` and `/loop` drafts under Seeds.

# e2e-private-transfer: the discovered-authwit transfer row, end to end

One arc, one PR against `dev`, closing #165. Recon: [recon.md](recon.md). Consults and the spike: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). **UI impact: none** (test code, one fixture, one skill table row; no shipped surface, no playground change).

## Scope

The owner's decision (page 19, 2026-10-15, option A) names three items. Two already exist on `dev`:

- **A playground control for a private transfer** and **one network e2e asserting its row** shipped in #293: `pg-select-transferFn` (`apps/playground/src/sections/transactions.ts:22-36,51`) and the `PRIVATE_KINDS` cases of `tests/e2e/network/tx-transfer-row.test.ts:90-117`. The issue's claim that "the playground sends only `transfer_public_to_public`" did not hold at the base. This arc adds no copy of either.
- **The delegated-authwit file extended to the structured-args case** is the work. The lane brief names it with `NULO_E2E_STANDARD_CONTRACTS=1`; this plan deletes that gate instead (D1).

**Out:** the playground; the network workflows and their partition; the Activity page (Assumptions, scope fact); a mining wait (Audit verdicts, F2).

## Outcome & Quality Bar

- **For whom:** a maintainer who changes discovery, the authwit decode or the transfer vocabulary, and needs CI to fail when a real dApp's pulled authwit stops reading as the transfer it is.
- **Excellent:** the file runs in the default network partition on both browsers with no env gate, and fails at the first broken link (no discovery, no decode, no vocabulary reading, wrong parties, wrong units, no submitted send) with a diff that names it.
- **Good enough:** one scenario, the existing flow plus one wait and one scoped read; the send is checked as submitted, not mined (the playground sends with `NO_WAIT`).

## Architecture & Implementation

**Flow of the scenario** (`apps/extension/tests/e2e/network/tx-sendTx-delegated-authwit.test.ts`):

1. Grant the `transaction-contracts` bundle with `grantCapBundle`.
2. Deploy the rig with `deployDelegatedPullRig(config, account, 10n ** 19n)`; it publishes `PublicChecks` first (D2).
3. Import the pull token from Home with `importToken` (D3).
4. Fill the playground: `setPgInput` for `consumerAddress` and `amount` (`5000000000000000000`); `setPgTextarea` for both instances, each fetched from the node and passed through `serializeInstance` (D5). Click `pg-btn-sendTx-delegated`.
5. In the execute window (D4): wait up to 60 s for `execute-discovered-authwit-toggle` (the estimate's budget, as `type-roles-windows.test.ts:185`), click it, and wait for `execute-discovered-authwit-structured-args`. Wait, inside the discovered row, until `execute-discovered-authwit-transfer-sender-address` has `data-address-shows="name"` (From is this wallet's account) and `execute-discovered-authwit-transfer-to` has text: each `AddressDisplay` fills itself after its own contact lookup. Then read the one `execute-op-discovered-authwit` row in a single `evaluate` and assert `toEqual({ rows: 1, intent: "transfer", fn: "Transfer (private)", to: trimAddress(consumerAddress), amount: "5 PULL" })`.
6. Approve. The journal shows the dApp send worked and the playground result carries a `txHash`: the send was submitted (unchanged).

**File-level change map:**

| File | Change |
|---|---|
| `apps/extension/tests/e2e/network/tx-sendTx-delegated-authwit.test.ts` | Delete the env gate and the stale header; rebuild setup on `grantCapBundle`, `setPgInput`, `setPgTextarea`, `serializeInstance`; add steps 3 and 5; the title and the two inline comments say "submitted" and drop "real proof", "fee content" and "fails at prove time" (CI is proverless; a missing witness fails in private execution). |
| `apps/extension/tests/e2e/fixtures/aztec.ts` | `deployDelegatedPullRig` publishes `PublicChecks` on its own test wallet before deploying; `ensureStandardPublicChecks` becomes a module-private helper taking that wallet and send options; the rig's docblock says it publishes. |
| `apps/extension/tests/e2e/network/type-roles-windows.test.ts` | Drop its `ensureStandardPublicChecks` call; its `instanceJson` serializes through `serializeInstance`. |
| `.claude/skills/e2e-testing/SKILL.md:198` | Delete the `NULO_E2E_STANDARD_CONTRACTS` row (the variable's only other reference). |

**Alternatives not taken:** keep the gate (D1); seed `PublicChecks` at genesis in `global-setup.ts` (every run pays for one file; upstream documents the preload as safe only with matching genesis nullifiers); assert in `type-roles-windows.test.ts`, which reaches the toggle but rejects the window (the owner named the delegated file, and the submitted send would stay unproven).

## Decision ledger

| # | Decision | Why | Rejected |
|---|---|---|---|
| D1 | Run the file in the default suite; delete `NULO_E2E_STANDARD_CONTRACTS` | No CI job sets it, so a gated assertion never runs. Its premise ("publishing post-genesis is a documented collision") is false: the spike passed on both browsers. | Keep the gate (an assertion nobody runs; the owner's no-`skipIf` rule) |
| D2 | The rig publishes `PublicChecks` itself, on its own wallet | The pull cannot execute without it (#165's comment: "Contract … is not deployed"); both callers need it; check-then-publish is enough because files run one at a time per network (`vitest.e2e.network.config.ts:24`). | Each caller calls it (a step every new caller must remember) |
| D3 | `importToken` before the click; no balance wait | The window reads transfer rows only for a stored token row, loaded once at open (`OperationCard.vue:118`, `execute/index.vue:286`); the toast lands after `addToken` resolves. The estimate's simulation syncs the notes itself. | Waiting for the private balance: waits for nothing the flow reads |
| D4 | One wait for both addresses, one scoped read | On this path the card has no caller context, so a transfer reading always has an explicit sender (`call-surface.ts:80-81`): the sender kind cannot fail alone. From showing the account's name, and To reading the consumer, fail on a swapped role or binding; the label on the decode; the intent on the selector check and token row; the amount on the token's decimals. The decode lands after the toggle (spike) and each address after its own lookup, hence the waits. | The sender-kind read (vacuous); four separate reads (an estimate rerun can unmount the list between them) |
| D5 | Reuse `serializeInstance` (`fixtures/selfpay-phase.ts:27`, four callers) | Both touched files carry a copy of it. | A new helper; fixing `contracts-register.test.ts`'s copy (a file this arc does not touch) |
| D6 | Step 5 waits for both addresses to have text, then asserts `from: "name"` in the one `toEqual`; the wait returns that snapshot | Same strength: `AddressDisplay` settles its text and `data-address-shows` in one render after its one await. A wrong sender now fails with a diff, not a timeout. Returning the snapshot from the wait means an estimate rerun cannot split the read. | A wait on `data-address-shows="name"` (fails as a timeout); a separate read after the wait (Opus review) |

## Security & Adversarial Considerations

- **Threat model:** test-only change; no shipped byte, message or storage shape changes. The scenario covers a trust boundary: a dApp-supplied contract whose discovered authwit the wallet reads as a transfer only after the selector check (`call-surface.ts:99-125`). It feeds real network data and pins who pays and who receives, the thing a signer must not misread.
- **Least privilege, crypto, supply chain:** no new dependency, credential or workflow permission; `@aztec-labs/standard-contracts` is already declared. `PublicChecks` is published on the run's own local network only.
- **Not covered here:** the refusal side (a mismatched selector keeps the decoded rows) stays with `OperationCard.discovered.test.ts`; the "Authorizes:" row stays unasserted.

## Assumptions

**Facts** (verified at 8459699c): the private half exists (Scope); `isToken` needs a stored token row (recon); `donate` calls `transfer_in_private(donor, self, amount, 0)` (rc.3 artifact source); the rc.3 local network publishes only AuthRegistry (`aztec/dest/local-network/local-network.js:176`); CI shards run proverless, both browsers run every network file, and neither canary lane runs this one (recon); `transfer_in_private/4` is `0xd73354bc`, pinned against the real Token.

**Spike facts** (`lessons/phase-0.md`, proverless, retry 0, both green, reverted): the send is submitted with `PublicChecks` published; the token imports by address before the dApp registers it; From shows "Account 1"; the file takes 72 s on Chrome and 88 s on Firefox. The spike imported with `importTokenAndWaitForBalance(…, "0")` and sent 100 base units: the Phase 1 gate validates the planned import and amount.

**Scope fact:** the lane brief says "activity row"; #165 names `execute-discovered-authwit-structured-args`, and its Record is the approval card's transfer row. No Activity-page work.

**Inferences:** I1. The final file costs about 70 s on Chrome and 85 s on Firefox (no balance wait; `PublicChecks` is skipped when `type-roles-windows` ran first in the shard), within any shard's 30 min cap (largest shard envelope today: 17 min Chrome, 22 min Firefox).

**Asks:** none.

## Phase 1 ✓: the delegated-authwit file runs and asserts its discovered transfer row (#165)

Steps: apply the change map, writing comments to the repository's comment rules.

**Validation gate:**
- `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`: exit 0.
- From the repo root, at load1 < 150, once each at retry 0:
  - `NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/tx-sendTx-delegated-authwit.test.ts tests/e2e/network/type-roles-windows.test.ts --retry=0`
  - the same with `NULO_E2E_BROWSER=firefox`
  - `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/tx-sendTx-delegated-authwit.test.ts --retry=0` (prover on, Chrome)
- **Negative control:** remove the step 3 import, run the first command on the delegated file alone, and see it fail at the structured-args wait. Restore the import and log both outcomes.
- **Pass:** every listed run passes and none skips; the control fails where stated. Record each file's vitest duration per browser in `lessons/phase-1.md`.
- The full smoke and network suites run as required CI checks on both browsers before merge (Audit verdicts, F4).

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at 8459699c, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2 runs once over the whole diff after Phase 1 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh <session-id> <followup-file> <codex-dir> high`. Both verbatim rules go in every prompt. Hard stop at three rounds; rounds logged in `lessons/phase-1.md`.
- Step 3, the PR body, carries the runtime record. Scenario 1 (#293): it fails when a private-balance transfer's card row loses its label, intent, sender kind or units; give `tx-transfer-row.test.ts`'s duration per browser from the PR run (before: 65.5 s Chrome, 108.3 s Firefox). Scenario 2 (this file): it fails when a real delegated pull is not discovered, decoded on its consumer, read as a transfer with the right parties and units, or submitted. No cheaper layer runs the real simulator against a deployed consumer (composition tests forbid simulate; component tests take fixtures). Give its measured duration per browser, and both suite envelopes before and after (`.claude/skills/e2e-testing/SKILL.md` § Runtime budget; before: Chrome 17 min, Firefox 22 min). State the limit: CI runs this file proverless and no canary lane proves it for real.
- Step 4 lands as the same PR's final commits. Step 5, after the merge: `agent-worktree done e2e-private-transfer --merged`.

## Delivery

One PR from `worktree-e2e-private-transfer` to `dev`, no stack. Title: `test(e2e): run the delegated-authwit send and assert its discovered transfer row` (80 characters). Body: what changed and why, the validation runs, the runtime record, `Closes #165`, the trailer. No label at creation: `apps/extension/**` trips both e2e path filters.

## Audit verdicts

**Codex round 1** (gpt-6.1-sol, high, session 01a14471): approve with changes.
- F1 (Medium, plausible): no test reads which address fills From and To. **Accepted**, at the e2e (D4, with the Opus leg's S1) rather than the component test first proposed.
- F2 (Medium, demonstrated): "landed" overstated the check (`NO_WAIT`; the journal accepts any started state). **Accepted:** "submitted". A mining wait is **rejected**: #165's failure mode ends at the window and the submitted send, and a public-phase revert is the upstream contract's behaviour.
- F3 (Low, demonstrated): the spike evidence was overstated. **Accepted:** Firefox measured, the differences stated, "default partition".
- A1: resolved from #165's text. **Accepted** as a scope fact.
- F4 (Medium): run the full smoke and network suites on both browsers (`CLAUDE.md` § Quality gates on `tests/e2e/fixtures/**`). **Rejected:** the program's gate is the touched files plus their Firefox twin; the fixture edit is node-side and its only callers are the two gated files (`git grep deployDelegatedPullRig`); no smoke test calls it (smoke loads the module through `fixtures/extension.ts`, which typecheck covers); both full suites run as required CI checks before merge.
- D1 to D3 approved; D5 superseded by `serializeInstance`, which the planner found while folding.

**Opus Plan leg** (opus): approve with changes.
- S1 (Medium, demonstrated vacuity): the sender kind is always `explicit` on this path. **Accepted:** D4's From-name wait and To read.
- S2 (Low): same as Codex F2. **Accepted** as wording; `waitForTxMined` rejected as above.
- C1 (Medium, plausible): the toggle click raced the estimate under `clickByTestId`'s 10 s. **Accepted:** the 60 s wait for the toggle, the budget this list already has.
- C2 (Low): separate reads can straddle an estimate rerun. **Accepted:** one scoped read.
- C3 (Low): publish on the rig's wallet; make the helper private. **Accepted.** C4 (Low): two stale inline comments. **Accepted.**
- F1 (Medium): the Firefox citation and the revert were not yet true when it read. **Resolved:** both landed before the fold. F3, F4 (Low): wording. **Accepted.**
- Q1: state the scope reading. **Accepted:** the UI impact line and the final report. G1 (index line, `check:plans`): done at the plan commit. G2: the negative control. **Accepted.** G3: the Firefox estimate. **Accepted** (I1).

**Codex round 2** (resume): approve with changes. R2-1 (Medium, plausible): the From-name wait does not prove To has rendered (`AddressDisplay` sets its text after an awaited lookup, `AddressDisplay.vue` `onMounted`). **Accepted:** the step 5 wait covers both addresses. Every other fix verified; no disposition reopened.

**Implementation review** (the arc's diff, `lessons/phase-1.md`):
- **Codex round 1** (gpt-6.1-sol, high, session 01a144d0): approve with changes. Its one Low finding was narrating comments. Three were deleted. The fourth was reworded and kept, because what `from: "name"` means cannot be seen in the code.
- **Opus review**, alongside round 1: no bug. Accepted: the wait and the read could straddle an estimate rerun (Low, plausible), so the wait now returns the snapshot. Also accepted: two wording fixes. Rejected: moving the docblock, against the repo's idiom.
- **Codex round 2** (resume): approve, no new material finding. The loop converged.

## Seeds

- `/goal Phase 1 of implementations-plan/e2e-private-transfer/plan.md is marked ✓ with its validation gate and negative control reported in the transcript; the Codex loop converged (a resumed pass reports no new material finding); the PR exists with Closes #165 and its close-out archived the plan; lint and test exit 0.`
- `/loop 15m Drive implementations-plan/e2e-private-transfer forward per plan.md: reality-check plan.md and lessons/, take the next pending step, run its gate, commit; never idle.`
