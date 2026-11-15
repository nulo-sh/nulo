---
plan: fee-claim-build-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at a763870d4
status: in progress
---

# fee-claim-build-1: the claim-paid fee row says who pays

Page 151, signed 2026-11-15 21:04 UTC. A request that leads with the Fee Juice contract's `claim_and_end_setup` crediting the sender, with the sender as payer, is classed `fjwc` (`packages/wallet-bridge/src/fee-payer.ts`, `classifyFeePayer`); `isEmbeddedFeePayment` holds, so the approval window draws the app-paid row and reads "About ~X; payment method set by \<app\>." although no contract pays: the account pays from what the claim credits. Lane fee-claim-words-1 rendered three wordings; the owner picked **W1**, no note:

> **P151-01 = W1** (2026-11-15 21:04 UTC): "One sentence says who pays: "You pay about ~X from the Fee Juice this app claims to your account." (two lines, 58 px, while the estimate runs and once it lands; the failed state stays today's grid). It names no app, so the longest name cannot stretch it; with dollars, "Fee" and "Juice" break across the two lines unless a no-break space joins them."

One arc, one PR against `dev`, `Closes #1804`. It changes what users see, so it does not land on its own: the orchestrator lands it on the owner's approve of its captures. Recon: [`recon.md`](recon.md). Owner asks: none ([`OWNER-ASKS.md`](OWNER-ASKS.md)).

Proportion (lane brief): a three-line prototype made a build, with tests. No plan audit round; one Codex pass over the plan and the net diff after the build; no Opus review.

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | `AppFeeLine.vue` takes a `claimed` boolean and renders the W1 sentence in a `v-else-if="claimed"` branch after the Private Fee Juice one; the priority clause and the closing full stop stay shared. | The prototype's shape, and the pattern `privateFeeJuice` already set: the parent classifies, the line words it. The two flags never both hold (a claim names the sender as payer, the PrivateFPC is not the sender), so the branch order decides nothing. Rejected: passing the operation down (the L4 line would classify payloads). |
| D2 | `fee-figure.ts` exports `claimsToAccount`; `OperationCard.vue` reads it as `claimPaid` and passes it down. | One classifier, already read by `personPaysAppPayment` and `waitsForFeeFigure`, covers both kinds: `aztec_sendTx` by payload, `send_transaction` by `embeddedFeePayment === "fjwc"`, which the planner derives from the same classification (`operation-planner.ts`, `embeddedPaymentOf`). No copy. |
| D3 | "Fee Juice" is joined by `&nbsp;` in the template. | The pick names the fix ("unless a no-break space joins them"). One character, no element or class, so no type role moves; the window already joins this way (`SendTxSummary.vue`). Rejected: a `white-space: nowrap` span, an element and a style for one word pair. |
| D4 | The failed state is unchanged: "FEE / Set by \<app\>" over "YOU PAY / Couldn't estimate fee. TRY AGAIN". | The pick: "the failed state stays today's grid". Its label already reads "You pay" (`personPaysAppPayment`). |
| D5 | The running and landed row on this route loses `execute-op-app-name`: the sentence names no app. Every other testid stays. | The pick's words. No spec or test reads it on this route (`recon.md`). |
| D6 | The `appName` comment in `OperationCard.vue` reads "every line of the fee row that names the app". | The claimed sentence names none; the old comment would be false. |
| D7 | The fee-claim-words-1 fixtures ship: `claim` and `claim-long-names` on the execute fixture route, `?estimate=running\|failed`, and the fixture test admitting the Fee Juice contract (a protocol address off the curve the check reads). The scratch capture spec does not. | The lane brief keeps them when captures use them; armed builds only (`execute-fixture-gate.ts`), so the captures come from the PR head itself. No spec iterates every fixture, so no e2e runtime moves. |
| D8 | Tests in the unit and component layers; no new e2e scenario. The four network specs that read the row's testids run unchanged as the regression gate. | The change is a branch inside one component; none of those specs drives the claim route. No span or role changes (D3), so the type-roles smoke spec is not due. |
| D9 | No accessibility call. | Text only; the row's focus, `aria-busy`, Tab order and live region are untouched. |

## UI impact

- **Approval window, app-paid fee row, a request that claims Fee Juice to the account** (`AppFeeLine.vue`, `OperationCard.vue`), running and landed: before "About ~X; payment method set by \<app\>."; after "You pay about ~X from the Fee Juice this app claims to your account.", the skeleton in the figure's place while the estimate runs; a priority fee keeps "Includes a ~X priority fee the app asked for." after it. "Fee Juice" never splits across the two lines (D3, the pick's named fix). The failed state, every other route's row and the seal rule are unchanged; no mark on this row (`feeSealed` is false when the account pays). Sign-off, **P151-01 = W1**, quoted above.
- Nothing else: no tooltip, glossary term, stored key or Tab stop.

## Security & Adversarial Considerations

- **Threat model.** A dApp writes the payload, including its payer and calls. The row's words follow the wallet's own parse (`isClaimAndEndSetup`: address, selector, flags, four arguments crediting the payer; never the call's name), the same classification that routes the entrypoint to Fee Juice with claim. A dApp cannot make the row say "You pay" while a contract pays, nor the reverse: a payer other than the sender is `fpc`, a claim that credits someone else is `self-pay` (the locked fee card, not this row).
- **What the new words claim.** "You pay" was already the failed state's label on this route and is what the entrypoint does; the sentence names no app, so a hostile name cannot reach it.
- No storage, permission, secret, dependency or log line changes.

## Assumptions

**Facts** (checked at `a763870d4`):
- F1. `AppFeeLine.vue` renders "About \<figure\>; payment method set by \<slot\>" for every app payment but the PrivateFPC; `OperationCard.vue` mounts it only while an estimate runs or has landed.
- F2. #1804's "green square-check" no longer holds: since #1808 the row draws only the seal, and only for a pinned paying contract (`feeSealed`); the claim route draws none.
- F3. A claim route's estimate never carries `appPayerFunding` (`embedded-strategy.ts`, `appPayerOf` returns nothing unless `fpc`), so the "may not cover" notice cannot show beside the new sentence.

**Asks.** None.

## Phase 1: the row and its tests

1. `apps/extension/src/popup/windows/execute/fee-figure.ts`: export `claimsToAccount` (D2).
2. `apps/extension/src/popup/components/modules/send/AppFeeLine.vue`: the `claimed` prop and branch (D1, D3); one line in the header comment.
3. `apps/extension/src/popup/windows/execute/OperationCard.vue`: `claimPaid`, passed as `:claimed`; the `appName` comment (D6).
4. `apps/extension/src/e2e/execute-fixture.ts`, `execute-fixture.test.ts`, `apps/extension/src/popup/windows/execute/index.vue`: the fixtures (D7).
5. Tests, wire-shaped:
   - T1 (`AppFeeLine.test.ts`): claimed and landed, the exact sentence with "Fee Juice" read from `textContent` and no slot text; with a priority fee, the clause after it; estimating, the skeleton in the figure's place. The existing unclaimed cases stay the control.
   - T2 (`OperationCard.fee.test.ts`): an `aztec_sendTx` as the wire carries it (`0x` + 64 hex fields, a leading `claim_and_end_setup` crediting the sender, the sender as payer) and a `send_transaction` with `embeddedFeePayment: "fjwc"`: the sentence at the landed state, no `execute-op-app-name`, no seal; the same request with an app's own contract as payer keeps "About …; payment method set by Swap." (the control); the failed test.each gains the claim row, "FeeSet by SwapYou payCouldn't estimate fee.Try again".

**Validation gate** (retry 0, one command at a time, from the worktree root): `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd apps/extension test:components`; `bun run check:plans` after staging; then `NULO_E2E_BROWSER=chrome NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-sponsor-funding.test.ts tests/e2e/network/tx-sendTx-feePayer.test.ts tests/e2e/network/tx-sendTx-noFrom.test.ts tests/e2e/network/tx-sendTx-selfPay.test.ts` (`agent.sh` claims ports from `~/.agents/ports.md`; the 10-minute stall watchdog stays). No Firefox run (no fixture, focus, window or WebAuthn change). Pass: every command exits 0; T1 and T2 pass and fail on the base; every other existing assertion passes unedited.

## Phase 2: captures and the PR

1. Capture at 400 px, light and dark, from the fixture route over the armed smoke build, with a scratch capture spec copied in and removed after: `fcb1-run`, `fcb1-done`, `fcb1-fail`, `fcb1-done-long` (the 64-character name), and `fcb1-done-usd` only if the route can price (the smoke build has no AZTEC price; if not, the PR says so), each `-light` and `-dark`, into the lane's scratch `shots/` with `captions.json`.
2. Commit the landed pair under `pr-captures/fee-claim-build-1/` in one commit; delete them in the next.
3. Post-implementation, then the PR.

**Validation gate.** `git status` clean after the capture run; no `fcb1-captures` file in the tree; every frame exists in both themes; `bun run check:plans` exits 0 after staging.

## Delivery

One PR from `fee-claim-build-1-a1` (off `origin/dev`, carrying the plan commit) to `dev`, opened ready, no label. Title (50 characters): `fix(execute): the claim-paid fee row says who pays`. The body quotes P151-01 verbatim as the sign-off, names the no-break-space hardening with its capture, says `execute-op-app-name` leaves this row on this route, embeds the landed captures from `pr-captures/fee-claim-build-1/` at the commit that adds them, names History's line for such a send ("Public Fee Juice (with claim), set by \<app\>", `tx-detail-helpers.ts`) as an out-of-scope follow-up, lists the gates with outcomes, says no e2e scenario was added, and carries `Closes #1804`. Merging is the orchestrator's, on the owner's approve.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `a763870d4`. Plan-specific values:
- Step 1: `code_review: off`, so absent.
- Step 2, bounded work: after Phase 1 is green, ONE `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` over the plan and `origin/dev...HEAD`, the prompt in the lane's scratch dir. Take its findings and rerun only the gates a fix touches. A second round only if the first says anything but approve (resume with `resume-codex.sh`; hard stop at three). No Opus review.
- Step 3: `gh pr create` as Delivery says; `gh pr checks <n> --watch` once.
- Step 4, close-out in the same PR's final commits: Outcome, lessons (none expected), `STATUS.md` deleted, `git mv` into `archive/` in its own commit, the index line to `archive/index.md`, after merging `origin/dev` in.
- Step 5: teardown is the orchestrator's.

## Seeds (not run; the orchestrator owns the ELI5)

- `/goal`: Build fee-claim-build-1 per `implementations-plan/fee-claim-build-1/plan.md`: Phase 1 green, captures, one Codex pass, PR open with captures; stop before merge.
- `/loop`: Each firing, read `STATUS.md`, run the next unfinished step of `plan.md`, record its gate, stop at the open PR.

## Audit verdicts

No plan audit round (lane brief, Proportion).
