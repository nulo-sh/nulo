---
plan: exec-window-1
tier: light
status: approved by the final Codex pass; arc 1 next
issues: "#1494, #1495; P93-70 has no issue"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex gpt-6.1-sol high audit round trip + Opus Plan leg
base: origin/dev at c17dfc1bc
trunk: dev
post_implementation_hardening: not scheduled
---

# exec-window-1: the execute window's failed fee row, failed preview, and what leaves the account

Three signed picks in the lower half of `#/windows/execute`, one arc, one PR. Recon, the frames in words and the reuse map: [recon.md](recon.md). Paths are under `apps/extension/src/` unless they name a package or `tests/`.

## Outcome & Quality Bar

For a person approving a dApp's transaction in the 400 × 800 window.
- Every failed fee on an app-paid row reads as the fee card's does: the same words and the same TRY AGAIN, which asks the same estimate again. A failed authorization preview says so where the list would be and asks again. After a keyboard press, focus stays in the card.
- Each "Leaves your account" row is the gross sum, per token contract, of the request's calls that the wallet reads as a direct transfer from this account to another address. It claims no complete outflow, net balance change or execution effect: a call it cannot read adds no row, and an authorization stays in its own list.
- Good enough: no new e2e scenario (each state is a component-level fact); captures prove the look.

## UI impact (the owner's pick on a rendered prototype is the sign-off; the PR body quotes each)

- **Fee section of an app-paid operation after a failed estimate.** Decision page 95, P95-03, then page 97, P97-02, signed 2026-11-02 18:34 UTC, option **D**: "The app-paid row takes the fee card's failed state, so every failed fee reads the same way." Before: the legend "Fee payment method set by <app>", nothing to press. After: frames `p95-03-d`, `p95-03-d-owncap`; every app-paid failure, as the prototype's code shows it. Snacks unchanged.
- **Authorization list of a default-entrypoint send after a failed preview.** Page 95, P95-08, then page 97, P97-03, signed 2026-11-02 18:34 UTC ("though I don't love"), option **C**: "The authorization list collapses to a single line that says so and asks again." After: frame `p95-08-c`. The snack and Confirm unchanged.
- **Top of the fee section of an `aztec_sendTx` that sends tokens.** Page 93, then page 96, P96-10, signed 2026-11-02 18:55 UTC, option **F**: "The fee section opens with “Leaves your account” rows (2 transfers, 6 TST; 1 transfer, 10 USDC), then a rule and Fee: what leaves and the fee read as one bill." After: frames `p93-70-f`, `p93-70-f-foot`. Not drawn where the card's fee section is replaced (a refusal, the raised-fee window): the conservative reading of an execute-window pick, asked as Q3.
- Copy is the prototypes' copy, character for character. Nothing else changes.

## Assumptions

**Facts** (recon has the traces; both audit legs re-verified them):
1. An app-paid op carries `feeSettings: embedded` (`popup/windows/execute/operation-display.ts:91-94`), so `retryFeeEstimate` re-asks the init's estimate (`index.vue:360,454-471`). The sweep's claim that it cancels did not hold.
2. `useFeeEstimationMap` marks `failed` before `onError`, refusals included; `estimate()` clears it (`composables/useFeeEstimationMap.ts:82-84,103-109`).
3. Under a refusal the `#fee` slot replaces the fee block (`OperationCard.vue:391-395`); the authorization summary above it stays.
4. `TransferSender` `explicit` is the dApp's `from`: any well-formed 32-byte address (`call-surface.ts:89-97`, `utils/transfer-intent.ts:53-68`).
5. The raised-fee window renders `OperationCard` with a `#fee` slot (`popup/windows/fee/index.vue:245-268`).
6. No smoke e2e file opens the execute window, but `FeeCostReadout` is Send's too, so Send's smoke files run.
7. `sameFieldAddress` refuses an address above the field modulus (`packages/wallet-bridge/src/field-address.ts:10-27`), so `call-surface.test.ts`'s `0xaa…` constants cannot test D8; `execute.fixture.ts:23-29` holds valid ones.

**Inferences:** none left open; the 2 px padding question was settled (D1).

**Asks.** None blocks the arc. Each ships as stated and goes on the PR as a question, as the lane brief routes them:
- Q1. #1495: the preview snack stays open after a successful TRY AGAIN, as today. Close it as the fee snack closes?
- Q2. P93-70: a single counted transfer gets the block, as the prototype's code does. Keep, or only from two?
- Q3. P93-70: the block is not drawn under a refusal or in the raised-fee window. Add it there?
- Q4. P93-70: an authorization that lets a contract move this account's tokens is listed under Authorizations, not counted. Count it?
- Q5. #1494: the signed "<App> pays" names a payer the wallet cannot vouch for. Keep?
- Q6. #1495: a cleaner shape inside C's sentence, if one turns up, gets a capture beside C's; C ships.

## Architecture & Implementation

**#1494.** `FeeCostReadout` gains `label` (default "You pay") for every branch's label. In `OperationCard`'s app-paid branch, one persistent wrapper (`execute-op-fee-set-badge`, `tabindex="-1"`, inset focus ring, no padding of its own) holds either today's content (padding 12, check icon, lines) or, while `estimateFailed && !feeEstimate && !isEstimating`, the failed block on the low surface (`execute-op-app-fee-failed`): `Fee` (label-section, secondary) over the method ("Private Fee Juice · set by <app>" or "Set by <app>"), padding 12; then `<FeeCostReadout failed :label>` ("You pay" when `personPaysAppPayment(op)`, else "<app> pays"), its hairline full width, plus the 2 px the frame has below the readout's 10 px; no check icon. The private-fee notice follows under a hairline. TRY AGAIN emits `retryEstimate`; a keyboard press then focuses the wrapper (FeeSettingsCard's rule). The app's name is untrusted and up to 64 unbroken characters: the block sets `overflow-wrap: anywhere`.

**#1495.** `index.vue` destructures the preview map's `failed`, passes `previewFailed`, handles `retryPreview(i)` with `scheduleAuthwitPreview(i, { index: i })`. `OperationCard.authwitSurface` gains `{ kind: "failed" }` for a NO_FROM op with no preview, none running, `previewFailed` and not `refused`. `SendTxSummary` draws the prototype's box (`execute-op-authwits-preview-failed`, retry `execute-op-authwits-preview-retry`) and emits `retryPreview` with the native event. A keyboard press focuses the card's "Show all details" toggle, which takes `refuseRepeatEnter`.

**P93-70.** `call-surface.ts` gains `accountOutflows(rows, account, tokens, chainId)`: per contract (lower-cased), the count and sum of `transfer` surfaces whose sender is the account (`account`, or `explicit` and `sameFieldAddress(from, account)`) and whose recipient is not (`!sameFieldAddress(to, account)`). `amountOf` moves there from `SendTxSummary` with explicit token and chain arguments; both templates append " base units" as the summary does. `OperationCard` draws `execute-op-leaves-account` (rows `execute-op-leaves-row`, each on the existing `.row` rule so a long total wraps instead of clipping) after the divider, then an inset rule, for an `aztec_sendTx` with at least one row and no `#fee` slot.

**Decision ledger** (both legs' positions in § Audit verdicts):

| # | Question | Decision | Rejected, and why |
|---|---|---|---|
| D1 | D's failed row | reuse `FeeCostReadout` with `label`; 12 px kept by the wrapper's style | an extracted component (2 callers, more files); a copy (drifts) |
| D2 | Which app-paid rows take D | every failed app-paid estimate (the prototype's condition, "every failed fee") | only Confirm-holding rows: a narrowing nobody signed (Codex C6) |
| D3 | C's box | the prototype's markup | `Banner`: draws an icon and other text roles |
| D4 | C under a refusal | hidden | shown: a refusal is terminal and also sets `failed` |
| D5 | The preview snack | unchanged (Q1) | closing it on retry: a behaviour change nobody signed (Codex C7) |
| D6 | Keyboard focus (a11y carve-out) | D: the persistent wrapper; C: "Show all details", with `refuseRepeatEnter` | focus left on `body` |
| D7 | TRY AGAIN's CSS | `.failed` and `.retry` move to `popup/components/modules/send/fee-shared.module.css`; C keeps nowrap locally | a new module; a second copy |
| D8 | What "leaves your account" | the account sends to another address | the prototype's every sender but `none` (names another address's funds) |
| D9 | F under a `#fee` slot | not drawn (Q3) | drawn: changes the raised-fee window, a surface nobody signed |

## Security & Adversarial Considerations

- **Attacker:** a connected dApp, controlling calls, its name and `feePayer`. Boundary: what the window shows before approval.
- **Naming someone else's funds:** D8 counts only this account's sends to another address; tests pin another `from` and a send to self as absent.
- **Understating** (an unread call, an authorization, a token-shaped contract whose code does something else): the rows claim only recognized direct transfers; the calls and authorizations stay listed with their advice. The block never gates Confirm and never reaches the worker. A balance-effect simulator would be new scope.
- **Clipping** a huge total so it reads smaller: `.row` wraps it.
- **Same symbol, two contracts:** two rows; the calls name each contract. Accepted.
- **Untrusted strings** (app name in a label, symbols) already pass `safeWire`, render as text, and wrap.
- No crypto, storage, permission, message or dependency change.

## Phases (arc 1, all)

Before building: write each pick under `## Decision` on #1494 and #1495 (`gh issue comment`). Tests use wire-shaped values (`0x` + 64 hex) and the valid addresses of `execute.fixture.ts`. Red proofs take the old copy from `c17dfc1bc`. Every phase gate runs: `bun run lint && bun run typecheck:all`, then `cd apps/extension && bun --bun vitest run src/popup/windows/execute src/popup/components/modules/send src/utils/type-role-ban.test.ts src/utils/copy-dash-ban.test.ts src/utils/red-text-ban.test.ts --retry=0`. Pass: exit 0, and the phase's new component test fails on the base copy.

### Phase 1 — #1494 ✓
- Change: `FeeCostReadout.vue` (`label`), `fee-shared.module.css` (D7), `OperationCard.vue` (wrapper, failed block, focus).
- Tests: `OperationCard.fee.test.ts`: Private Fee Juice (person pays), own cap and sponsored ops with `estimateFailed` show the failed block with the exact method and label text and no legend; TRY AGAIN emits `retryEstimate` with the index; a keyboard press focuses the wrapper, a pointer press does not (FeeSettingsCard.test.ts:1036-1077's spy). Rewrite the two tests named "after a failed estimate … the legend" (`:359`, `:448`). `index.test.ts`: an own-cap op's retry asks `[0, { index: 0, feeSettings: { paymentMethod: { kind: "embedded" } } }]`. `FeeCostReadout.test.ts`: `label` reaches the failed row.
- **Status ✓ (2026-11-02).** Gate green (lint, typecheck:all, 936 tests in 40 files at retry 0). The five new or rewritten D tests and the `label` test fail against the base `OperationCard.vue` and `FeeCostReadout.vue`.

### Phase 2 — #1495 ✓
- Change: `index.vue` (`failed`, `retryPreview`), `OperationCard.vue` (prop, emit, surface kind, focus, `refuseRepeatEnter` on the toggle), `SendTxSummary.vue` (line, emit).
- Tests: `OperationCard.summary.test.ts`: a default-entrypoint op with `previewFailed` shows the line's exact text; TRY AGAIN emits `retryPreview` once; failed → previewing shows "Checking authorizations…", → a landed preview shows the list; with `refused` no line, unrefused control shows it; keyboard focus lands on the toggle, and a repeat Enter there is refused. `index.test.ts`: the preview map's `failed` reaches the card; `retryPreview` calls `feeMapInstances[1].api.estimate` once with `(i, { index: i })`; the snack is untouched.
- **Status ✓ (2026-11-02).** Gate green (940 tests in 40 files at retry 0, lint, typecheck:all). The four new tests fail against the base copies. Deviation: the prototype's `align="baseline"` is not a `Flex` value (it rendered as no alignment, which is what the frame shows), so the line passes none; typecheck refused it.

### Phase 3 — P93-70
- Change: `call-surface.ts` (`accountOutflows`, `amountOf`), `SendTxSummary.vue` (imports it), `OperationCard.vue` (block, rule).
- Tests: `call-surface.test.ts`: transfers of 4 TST and 2 TST (the second with `from` = the account in upper case) and 10 USDC, plus a decoded non-transfer, a transfer from another address and one to the account, give rows `[2, 6 TST]`, `[1, 10 USDC]` exactly; an unknown symbol keeps base units. `OperationCard.summary.test.ts`: a request with those calls (real Token decodes) renders exactly "2 transfers" / "6 TST" and "1 transfer" / "10 USDC"; no block with zero counted transfers or with a `#fee` slot (controls).

### Phase 4 — whole-window gates and captures
- `bun run audit:vue && bun run test:all` (retry 0).
- Smoke, Chrome then Firefox (`NULO_E2E_BROWSER=firefox`): `cd apps/extension && NULO_E2E_RETRY=0 bun run test:e2e -- tests/e2e/send-fee-privacy.test.ts tests/e2e/send-keyboard.test.ts tests/e2e/type-roles.test.ts`.
- Network, Chrome, one at a time: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<f>.test.ts` for `tx-sendTx-feePayer`, `fee-sponsor-funding`, `authwit-lifecycle`, `tx-sendTx-noFrom`, `tx-sendTx-default`, `tx-sendTx-multicall`, `snack-placement`, `type-roles-windows`; then Firefox for `tx-sendTx-feePayer` and `type-roles-windows`. Record each wall-clock.
- Captures, light, Chrome, 400 × 800, base and head: both app-paid failures, the failed preview, a three-call approval at the fee section and at Confirm; and, on the head only, the keyboard focus after each TRY AGAIN and a long total. Build them on a throwaway local branch that adds only a failure seam and the prototypes' capture specs (`worktree-shots-p95c`, `worktree-shots-p93f`); never push it. Copy the PNGs to `implementations-plan/exec-window-1/screenshots/`.
- **Validation gate:** every command exits 0 at retry 0; the ten before/after PNGs exist.

## Delivery

Single arc: branch `worktree-exec-window-1` → `dev`, `gh pr create`, ready, no label; title `feat(execute): retry a failed app fee or authorization preview, total what leaves` (81). Body: the three picks quoted (page, item, date, option, sentence); the captures table; the a11y calls (D6) as made under the owner's 2026-10-19 delegation; Q1–Q6; the gates with outcomes and e2e wall-clocks; `Closes #1494`, `Closes #1495`; "P93-70 has no issue; this PR closes none for it". No merge.

## Post-implementation

Cites [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `c17dfc1bc`. Specific here: no step 1 (`code_review: off`). Step 2 runs once over the whole diff after phase 4: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, hard stop at three rounds, one Opus `general-purpose` review beside round 1. Step 4's close-out lands as the PR's final commits after `gh pr checks --watch`, `origin/dev` merged in first; the screenshots stay until the merge, since the PR body links them by SHA. Step 5: `agent-worktree done exec-window-1 --merged` once `implementations-plan/archive/exec-window-1/plan.md` is on `dev`.

## Audit verdicts

**Round 1, Codex gpt-6.1-sol high: conditional approve.** C1 (fixtures fail `sameFieldAddress`): adopted, Fact 7. C2 (gates not at retry 0; smoke and `audit:vue` missing): adopted, phase 4. C3 (D8 proves attribution, not effects): adopted, Outcome and Security. C4 (repeat Enter on the toggle): adopted, D6. C5 (2 px): adopted, D1. C6 (D2 narrows the signed condition): adopted, D2; Q1 of the draft dropped. C7 (D5 changes the snack): adopted, D5 and Q1.

**Round 1, Opus 5.5 Plan: conditional approve.** O1 (authorization moves uncounted): adopted as Q4 and the Outcome's wording; the pick says "calls", so it does not wait. O2 (a long total clips): adopted, `.row`. O3 (D inside the badge's padding misses the frame): adopted, the wrapper. O4 (focus untested): adopted. O5 (two stale test names): adopted. O6 (refusal hides F): adopted, D9 and Q3. O7 (D5 is visible): moot after C7. O8 (gates): adopted. O9 (`fee-shared.module.css` exists): adopted, D7. O10 ("<App> pays"): Q5. Positions differing from Codex: O on D2 (agree with narrowing) and D5 (agree with closing); Codex's reading won on both, being the closer to the signed artifact.

**Round 2, Codex (resumed): approve.** No new material finding. Notes for the build: the extra 2 px applies to the failed branch only; `aria-busy` stays on the outer badge (`OperationCard.fee.test.ts:337-354` reads it there); an upper-case address fixture keeps a lower-case `0x`; the retry's native event is forwarded and read synchronously, as `FeeSettingsCard`'s handler does. It checked that the smoke command forwards its three files and that `NULO_E2E_RETRY=0` overrides both e2e configs.

## Seeds (drafts; the orchestrator runs the arc)

- `/goal Phases 1-4 of implementations-plan/exec-window-1/plan.md marked ✓, each gate's output in the transcript; the Codex loop converged; PR to dev open with Closes #1494 and #1495; bun run test:all and bun run lint exit 0.`
- `/loop 15m Drive implementations-plan/exec-window-1 forward per its plan.md; never merge.`
