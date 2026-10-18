---
plan: fee-call-match-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 58e2b01b
trunk: dev
issues: "#796 (A1 Closes, in part: D2)"
post_implementation_hardening: not scheduled
---

# fee-call-match-1: the Fee method row reads an app's fee contract by address

One arc, one PR against `dev` (D-orch-1). The transaction page's Fee method row names "Private Fee Juice" only for a `pay_fee` call on the PrivateFPC, so an app's own fee contract with a Nulo-like function name reads "Set by {app}". Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1; A1 depends on none). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are relative to `apps/extension/src` unless they start with `apps/` or `implementations-plan/`.

## The issue and what did not hold

- **#796** (bug, ux; filed as plausible, traced, not run). The trace holds at `58e2b01b`: `describeExternalFee` (`popup/components/modules/tx/tx-detail-helpers.ts:55-64`) takes the first call whose method is in `FEE_METHODS` and never reads its `contract`. **Demonstrated by code trace** for an app fee call named `fee_entrypoint_private` or `pay_fee` on its own contract: the row reads "Private Fee Juice". That label names the person's own Private Fee Juice, which only the PrivateFPC draws on; here the app's contract is the network payer, and a token FPC's `fee_entrypoint_private` charges the person in a token. Consequence: a wrong screen on the person's own record. Attacker capability: a dApp names its functions; the label feeds no send, fee or key.
- **The lane brief's premise holds only on the no-`from` path.** On a dApp send with `from`, a fee the person picks in the window and a fee the app embeds both record `EXTERNAL` with origin DAPP ([recon.md § What records which calls](recon.md#what-records-which-calls-the-fee-rows-input)). So "the name match only where the wallet chose" cannot be read from origin: applied by origin, it would relabel the person's own pick on every dApp send as "Set by {app}" (D1).
- **The sponsor half is demonstrated too, and not decidable from the record** (D2): an app's own `sponsor_unconditionally` reads "Sponsored", even for a fee contract that charges the person. It stays as today: its fix needs new persisted state, the owner's call (OA-1). A1 says `Closes #796` and resolves it in part, explicitly: the PR body says the sponsor half is not fixed and links its `owner-decision` issue.

## Outcome & Quality Bar

- **For whom:** a person who opens the transaction page of a dApp call, to check how its fee was paid.
- **Excellent:** (1) "Private Fee Juice" appears only for a call to the PrivateFPC's `pay_fee`, the one call that draws on the person's own Private Fee Juice. (2) Every fee the person picked keeps its label: Private Fee Juice and Sponsored on a popup Send, an auth-registry send and a dApp send, whatever app calls follow the wallet's fee call.
- **Good enough:** an app's own `sponsor_unconditionally` still reads "Sponsored" (D2, OA-1).

## UI impact

Fee method row of the transaction page only (no-ask record, lane brief): "The Fee method row's label for an app-paid fee: today it can read as a Nulo method (the bug); after the fix it reads as the app-set form the page already has for an external method." Before: "Private Fee Juice" for an app's `fee_entrypoint_private`, or for its `pay_fee` on a contract other than the PrivateFPC. After: "Set by {app}" (origin DAPP) or "External FPC" (no origin). Both labels exist (`tx-detail-helpers.ts:62-63`). No new label. Every other row and screen stays as it is.

## Architecture & Implementation

**Change.** In `tx-detail-helpers.ts`, `FeePaymentLabelInput.calls` becomes `{ contract?: string; method?: string }[]`. `describeExternalFee` keeps its first match on `FEE_METHODS` and its order of branches, and changes two lines: `fee_entrypoint_private` loses its "Private Fee Juice" line, and `pay_fee` reads "Private Fee Juice" only when `isPrivateFpc(feeCall.contract)`. One comment states the label's invariant: only the PrivateFPC's `pay_fee` charges the sender's own Private Fee Juice. Any other fee call falls through to the existing branches: no fee call on a UI row reads the `feeSpender`; origin DAPP reads "Set by {app}"; otherwise "External FPC".

**Why it holds.** The wallet's injected fee payload calls `pay_fee` only on the PrivateFPC (`getFpcImpl` refuses any other PrivateFPC row, `wallet/services/fpc/service.ts:410-412`). No injected payload calls `fee_entrypoint_private`; a row carries one only from a dApp's own calls (recon). When the wallet picks the fee, its call is the first recorded call (`fee/fpc-strategy.ts:152,201,276,301`; `txCalls` keep the actions' order, `tx-request-builder.ts:195-205`), so the first match finds it before any app decoy. Scanning all calls would let a later app call compete with the person's pick. On a dApp's calls the recorded `method` is the name the call's selector resolves to, and `contract` is the payload's address serialised (`tx-request-builder.ts:209,359,617-624`; `operation-planner.ts:214-217`); the wallet's own calls take their selector from the resolved ABI (`:195-197,585-592`). So the rule classifies by address and selector, as `lessons.md` asks. `mint_and_pay_fee` keeps reading "Set by {app}".

**Not changed.** `FEE_METHODS` and its title and Calls-box readers (they decide intent, not payer); the journal's shape; `popup/pages/tx/[id].vue`; any migration (no stored value changes; old rows read through the same function).

## Decision ledger

| # | Question | Decision | Codex r1 | Opus |
|---|---|---|---|---|
| D1 | What says "the wallet chose the method" | The fee call's address where it is decisive: the PrivateFPC for `pay_fee`. Not origin. | sound | sound |
| D2 | `sponsor_unconditionally` on a dApp send | Stays matched by name; OA-1; an `owner-decision` issue filed before the PR, linked from its body | not a known limit: keep open | known limit; say what it can hide |
| D3 | Test layer | Helper unit tests plus one page case, rows shaped as their writers store them; no e2e scenario | add the page case | add the page case |

**D2.** The wallet pays through any sponsor row, the protocol sponsor or one a person adds (`NewFpcPopup.vue`), so no address the popup holds marks the wallet's own sponsor, and the record does not say who chose. (a) Pin the protocol sponsor's address: a dApp send through a sponsor the person added would read "Set by {app}", the same wrong attribution reversed; an app that embeds the protocol sponsor would still read "Sponsored"; the pin moves with every Aztec bump. (b) Read the person's FPC rows in the page: a history label would change with a setting, and the page would gain a service client. (c) Record on the row who chose the fee: new persisted state, with obligations at every writer, the backup restore and old rows; refused for #760 (`implementations-plan/archive/owner-feedback-1/plan.md` § Decision ledger, D1) and outside this lane ("the journal's shape"). `EXTERNAL` names a network payer other than the account, not who bore the cost: a sponsor's function is checked by signature only, and a custom sponsor may spend the sender's notes (`wallet/services/execution/transfer-executor.ts:171-176`). So an app can make a fee that charged the person read "Sponsored". The path is demonstrated and its consequence matters, so it is no known limit (Codex over Opus); its fix is a product and persistence decision, so its home is an `owner-decision` issue (`implementations-plan/README.md` § Where open work lives). Codex preferred `Refs #796`; `Closes #796` stands because the PR body states the split and links that issue, as both legs require, and #796's Private Fee Juice half is fixed.

**D3.** The page renders the helper's string (`popup/pages/tx/[id].vue:103,280`). Both legs hold the brief to its "tx page test", and `[id].test.ts` already builds wire-shaped rows (`settled`, `field`). So the #796 case and its control run on the mounted page; the helper tests carry the classes the page case does not. No browser behaviour changes, so no e2e scenario is added.

## Security & Adversarial Considerations

- **Threat model:** a hostile dApp names its functions and picks its fee contract; a hostile backup row sets `origin`, `calls` and `feeSpender`. The worst result is a wrong label on the person's own record, which never feeds a send, a fee or a key. The row classifies recorded calls; it proves no payment. After the change a live dApp send reads "Private Fee Juice" only through a call to the PrivateFPC's `pay_fee`. A dApp can still get "Sponsored" by naming its function `sponsor_unconditionally`, for a fee that charges the person too (D2); a backup row can still claim any label, as today.
- **Input validation:** `isPrivateFpc` compares a lower-cased string with the pinned `PRIVATE_FPC_ADDRESS` (`wallet/services/fpc/private-fpc-address.ts:3-9`). A stored row's `contract` is a string: the row schema refuses any other (`wallet/services/transaction/spec.ts:172-178`).
- **Least privilege, crypto, supply chain:** no dependency, permission, workflow or secret; `bun.lock` unchanged.
- **Left open:** D2's sponsor attribution (OA-1, its `owner-decision` issue).

## Assumptions

**Facts** (verified at `58e2b01b`; both legs re-checked F1-F7): F1 the label reads only `method` (`tx-detail-helpers.ts:56-59`); F2 the wallet's injected fee payload calls `pay_fee` only on the PrivateFPC (`fpc/handlers/private-fpc-handler.ts:24-33`, `fpc/service.ts:410-412`); F3 no injected payload calls `fee_entrypoint_private` (recon; no emitter in `git log -S`); F4 the wallet's injected fee call is recorded first (`fee/fpc-strategy.ts:152,201,276,301`, `tx-request-builder.ts:195-205`); F5 a dApp send with `from` that pays through a fee contract records `EXTERNAL` and origin DAPP whether the person or the app chose it, and an app's Fee Juice claim records `FEE_JUICE_WITH_CLAIM` (`dapp-send-executor.ts:755-761`, `fee/embedded-strategy.ts:36-55`); F6 a popup Send records no fee call and keeps its `feeSpender` (`transfer-executor.ts:445-480`); F7 the auth-registry sends are UI-origin and record the wallet's fee call first: a revoke `[fee call, set_authorized(hash, false), …]` (`auth-registry/service.ts:333,387-393`), a toggle `[fee call, set_reject_all(!enabled)]` (`:76-84,437`); F8 a no-`from` row has exactly one call and no `classId` (`tx-request-builder.ts:353-356,460-464`).

**Inferences:** I1 no row the current writers record for a fee the person picked has `pay_fee` on another contract, so none of those labels changes (F2, F4, F6, F7). A row from a build with another PrivateFPC address would read "External FPC" or "Set by {app}"; such rows are pre-production only, not a supported condition. I2 an app's own call to the PrivateFPC's `pay_fee` draws on the sender's Private Fee Juice, so "Private Fee Juice" stays true for it (plausible, not run; with no sender it most likely reverts).

**Asks:** OA-1 (D2). A1 does not depend on it: its change is right under either answer.

## Phases

Each gate also runs `bun run lint && bun run typecheck:all` from the repository root; vitest filters run from `apps/extension`.

**Phase 0 — base.** Branch `fee-call-match-1-a1` off `origin/dev` with the plan commit. Merge `origin/dev` again before the PR; p42-followups-1 A2 may touch the transaction page. Gate: `bun install --frozen-lockfile` exits 0.

**Phase 1 — #796.** Files: `tx-detail-helpers.ts`, `tx-detail-helpers.test.ts`, `popup/pages/tx/[id].test.ts`. Each fixture is shaped as its writer stores it: `0x` + 64-hex addresses, a fee call's `args: []`, app calls with their argument fields and `classId`, a no-`from` row with one call and no `classId`.
- Page case, in `[id].test.ts`'s fee describe, with `feePaymentMethod: 0` (`EXTERNAL`): a `from` dApp send that embedded its fee, `[app FPC fee_entrypoint_private, app transfer]`, reads "Set by example.dapp.io" and never "Private Fee Juice"; the same send where the person picked Private Fee Juice, `[PrivateFPC pay_fee, app transfer]`, reads "Private Fee Juice" (control). Match the row by its text; it has no testid.
- Helper cases in `describeFeePaymentMethod`: a no-`from` row whose one call is an app contract's `pay_fee` reads "Set by Foo", and with no origin "External FPC". The person's pick wins over app decoys: `[PrivateFPC pay_fee, app call, app sponsor_unconditionally]` reads "Private Fee Juice"; `[sponsor's sponsor_unconditionally, app call, app pay_fee]` reads "Sponsored".
- Existing helper tests: the sponsor test takes a sponsor contract; the auth-registry test becomes `[PrivateFPC pay_fee, AuthRegistry set_authorized]` with UI origin; `popupSend("0x0f")` takes a 64-hex address; the `fee_entrypoint_private` → "Private Fee Juice" test, which pinned the bug, is deleted (the page case replaces it).
Gate: `bun --bun vitest run src/popup/components/modules/tx/tx-detail-helpers src/popup/pages/tx` exits 0. With `tx-detail-helpers.ts` taken from `58e2b01b`, the page case and the two app-`pay_fee` helper cases fail; they pass after.

**Phase 2 — arc gate and picture.** `bun run audit:vue`, `bun run test:all`, `bun run check:plans` exit 0. The smoke suite on Chrome on an armed build (`.claude/skills/e2e-testing/SKILL.md` § Build-armed tests): `cd apps/extension && bun run test:e2e -- --retry=0`, every file passes. One picture, light and dark, after the change: the transaction page of a seeded dApp row `[app FPC fee_entrypoint_private, app transfer]`, through a scratch smoke spec kept under `~/.cache/nulo-backlog/fee-call-match-1/`. Copy it into `tests/e2e/` only while it runs, never while lint runs, and never commit it. Gate: every command exits 0; the picture's Fee method row reads "Set by" and the app's name.

## Delivery

- **A1**: one PR from `fee-call-match-1-a1` against `dev`, opened after the Phase 2 gate and the Codex loop converge. Before it opens, file D2's `owner-decision` issue (dedupe first; five sections, OA-1's options) so the body can link it. Title (58 characters): `fix(tx): name the fee method by the fee contract's address`. Body: what changed and why; the no-ask record quoted; the picture (PNGs under `apps/extension/pr-screens/` in one commit linked by its SHA, removed in the next); the validation runs; "no e2e scenario added"; D1's departure from the brief's "by origin" wording; `Closes #796` beside the sentence that its sponsor half is not fixed and lives in the new issue. Open without labels; the path filters already run smoke and network for `apps/extension/src`.
- Carries the close-out as its final commits. Parallelism: one phase of code; nothing to split.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `58e2b01b`; step 1 absent (`code_review: off`). Step 2 once over the arc's diff after Phase 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, hard stop at three rounds; one Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1; log each round in `lessons/phase-1.md` and § Audit verdicts. Close-out as the PR's final commits: the Outcome (`Open items:` the D2 issue), the `lessons.md` pass, `STATUS.md` deleted, a comment on #796 naming the D2 issue, the `git mv` to `archive/` in its own commit. Teardown once `implementations-plan/archive/fee-call-match-1/plan.md` is on `origin/dev`: `agent-worktree done fee-call-match-1 --merged`.

## Audit verdicts

- **Codex round 1** (gpt-6.1-sol, high, session `01a150e4`; resumed once: conditional approve, F7 split into the revoke and toggle writers, the selector claim scoped to its paths, both applied): conditional approve (conditions: D2's disposition, the page test, narrower guarantees). Accepted: D2's residue is demonstrated, so an `owner-decision` issue, not a known limit; F2, F3, I1 and F5 narrowed to injected payloads and fee-contract payments; "classifies recorded calls, proves no payment"; "Sponsored" can hide a charge; the page case; a precedence control and the auth-registry fixture in writer order; writer-shaped arguments; title 58 characters; the smoke suite in Phase 2. Not taken: `Refs #796` (D2).
- **Codex round 1, resumed twice**: conditional approve, then **approve** ("Both prior conditions are satisfied").
- **Opus 5.5 (Plan)**: conditional approve (conditions: D2 and security wording, the split in the PR body, D3's false collision reason, the page case or a recorded deviation, writer-shaped fixtures). Accepted all; the D2 issue is filed before the PR; the invariant comment phrased on the label; the picture cut to after only, and the scratch spec kept out of `tests/e2e/` while lint runs. Not taken: D2 as a known limit (Codex's reading of Proportion).

## Seeds (orchestrator-owned; not run)

- `/goal` Phase 1 and Phase 2 marked ✓ in implementations-plan/fee-call-match-1/plan.md, each gate's output in the transcript; the Codex loop converged (a resumed pass with no new material finding quoted); PR `fix(tx): name the fee method by the fee contract's address` open against `dev` with `Closes #796` and the D2 issue linked, carrying the close-out; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/fee-call-match-1 forward per its Phases, Post-implementation and Delivery; never merge; stop and report once the PR's checks are green.
