---
plan: send-followups-1
tier: mid
status: approved by the orchestrator 2026-10-14; implementing (arc 1)
issues: "#412, #408, #406 (one arc)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); dual audit (Codex gpt-6.1-sol high + one Opus Plan agent); one final fresh Codex pass, plus one confirmation resume
base: origin/dev at d3dc4415
trunk: dev
post_implementation_hardening: not scheduled
---

# send-followups-1: a like-shaped cap basis, a row for a long USD line, no dead override path

The Send follow-ups the owner decided on decision page 9 (2026-10-14), in one arc and one PR against `dev`.

- **#412 (P9-12 = B).** A queued send's cap basis becomes the last send of this token with the same privacy, fee method and speed. Speed is recorded nowhere today, so each Send-page row gains one optional field. With no like send, the shipped no-basis state shows (P9-10 = A).
- **#408 (OA-15 = C).** In USD mode the derived token line moves to its own full-width row under the amount when, beside the balance and Max, it would draw below 8 px. Ordinary amounts keep the signed shrink (P9-01 = A).
- **#406 (OA-20 = B).** The fee card loses its unreachable app-payment banner, both buttons and their state. Nothing a person sees changes; the `embedded` kind on the wire stays.

Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In:** #412, #408, #406. **Out:** #411, #400, #401 (lane fees-and-sponsors-2), #407 (combo box demo), #380, #381 (known limits), #410 (CI), the narrow override research on #406 (the orchestrator's).

**Claims that did not hold or hold narrower** (evidence in recon.md):
- #412 names "the journal record the basis is read from". The basis is read from Tx rows, not the operation journal, and `FeeCostReadout.vue` / `QUEUED_FEE_COPY` need no change. #412 has no `## Decision` block; P9-12 = B is in its body and on #217 (OA-13 = B).
- #412 assumes the three facts exist. Privacy and fee method are on the row; speed is not stored anywhere that outlives the send.
- #412's fix breaks the e2e case that proves the re-ask: it relied on a Fast basis for an Urgent send (`same-token-concurrent-sends.test.ts:649-713`).
- #408 and #406 hold as written.

## Owner dependencies

None open. Every visible change is signed: #408 Decision (C), #406 Decision (B), #412 (P9-12 B, P9-10 A). The floor value and the row's placement are recorded under UI impact. **Persistence:** #412 adds one optional persisted field (`Tx.priorityLevel`). P9-12 B cannot be built without it; OWNER-ASKS.md OA-1 records it for the orchestrator to confirm with the plan.

## Outcome & Quality Bar

**For whom:** a person sending a token from the Send page, often a second send while the first confirms, sometimes typing in USD.

**Excellent:**
- A queued send's "for at most Y" comes from a send like this one. A Normal private send's figure never caps an Urgent public one; with no like send the page waits as it did before.
- A long derived amount reads at 8 px or larger, on one line, inside the card, in both browsers, whenever it fits the card's width at 8 px (about 60 characters); a short one looks exactly as today.
- The fee card's code holds no path that no flow can render; its tests test only live behaviour.

**Good enough:** rows written before the change hold no speed and so are never a basis (pre-production: no migration). The derived line's row move is not animated. A line wider than the card at 8 px (a whole part of about 30 digits with a long symbol) keeps the signed shrink in its own row: a known limit, filed at close-out.

## Assumptions

### Facts (verified at d3dc4415)

- F1. The basis is the newest same-token Send-page `estimatedFee` of this profile and chain (`queued-fee-cap.ts:26-40`), read in `queuedFeeCapFor` (`service.ts:627-635`) from `estimateTransferFee` (`:597-624`), which already holds `sequence.feeSpender`.
- F2. `recordTransfer` writes `calls[0].transfers[0].type = req.transferType`, `feePaymentMethod` (EXTERNAL 0, PREEXISTING_FEE_JUICE 1, FEE_JUICE_WITH_CLAIM 2) and `feeSpender` (every FPC but the protocol sponsor) (`transfer-executor.ts:172-177, 465-499`; `transaction/service.ts:236`).
- F3. No record stores `priorityLevel`. The Send page omits it for Normal (`fee-helpers.ts:98-107`); absent prices at `DEFAULT_FEE_MULTIPLIER` (`fee/fee-strategy.ts:69`), which CI's network lane sets to 10 (`.github/workflows/_extension-network-e2e.yml:153`).
- F4. `TxSchema` lists every field (`transaction/spec.ts:184-205`); an unlisted key is stripped. `feePaymentMethod` is number-shaped so a new upstream member cannot hide a row.
- F5. The popup offers a cap only to a self-paid send (`send.vue:287`); `expectEstimateQueued` (`fixtures/send-burst.ts:79-97`) holds for the capped and the uncapped queued state.
- F6. `fitDerived` has no floor (`AmountCard.vue:175-180`); `HERO_MIN_SCALE = 0.6` (`utils/hero-fit.ts`); `fitHero` reads a room of 0 as "not laid out" and returns full size.
- F7. The type scale's smallest step is 8 px (`packages/design/src/token-contract.ts:87`). `.derived_type`'s calc is carved out by selector (`apps/extension/scripts/type-roles/exceptions.ts:91-96`).
- F8. `send-amount-exact.test.ts:205-212` checks the USD line in real layout (one line, horizontal overlap with the balance, Max spill) at a 1,235,567.123456789012345678 TST balance (the corner shows `1,235,567.12345678 TST`) and a $1 quote.
- F9. The card's embedded path is unreachable (recon.md, #406); the `embedded` kind is live elsewhere (`dapp-send-executor.ts:973`, `materialize.ts:78,87`).
- F10. `same-token-concurrent-sends.test.ts` is `@requires-proverless`; its re-ask case runs Fast (A, held) then Urgent (B, queued).

### Inferences (audits attack these)

- I1. B's Urgent build costs about 5/3 of A's Fast fee (multipliers 5 and 3). A seeded like basis at 4/5 of A's fee gives a cap of about A's fee, so B re-asks whenever its at-turn fee exceeds A's. This assumes about equal gas and steady network fees between the builds (`finalizeGasLimits` re-measures both); phase 3 logs the measured ratio per browser.
- I2. In USD mode the empty meta span keeps its flex room (`flex: 1; min-width: 0`), so the room beside the balance is measurable while the line sits in its own row.
- I3. At send-amount-exact's balance, the USD toggle after a token-mode Max draws the whole balance's derived line below 8 px beside the balance (Opus estimate from OA-15's two measurements: about 6.9 px), so the case exercises the own row. Phase 2 measures it first.
- I4. fees-and-sponsors-2 does not edit the card's embedded parts; #400 and #411 move only caps a dApp passes.

### Asks (working assumption in force)

- A1. Persisting speed (OA-1, not visible): implied by P9-12 B, which cannot be built without it; recorded for the orchestrator, not an open question.
- A2. The floor (panel). Working assumption: 8 px, D7.
- A3. A seeded like row in the re-ask e2e is a realistic scenario (panel). Working assumption: yes, D6.

## Architecture & Implementation

### #412: the keyed basis

- **Shape.** In `queued-fee-cap.ts`: `SendShape = { transferType, feePaymentMethod, feeSpender?, priorityLevel }` and `sendShapeOf(feeSettings, transferType, feeSpender)`. `fj` maps to `AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE`, `fjwc` to `FEE_JUICE_WITH_CLAIM`, `fpc` to `EXTERNAL` (enum members, never numbers); `embedded` has no shape, so no basis. Speed is `feeSettings.priorityLevel ?? "normal"` (`speedOf`), applied to the request only: a row stores its level explicitly, and a row with no recognised speed never matches.
- **Record.** `recordTransfer` passes `priorityLevel: speedOf(req.feeSettings)`; `addTransaction` writes it with the conditional spread `feeSpender` uses, so a row without it keeps its bytes. `Tx.priorityLevel?: PriorityLevel`. `TxSchema`: a known level or nothing; an unknown value reads as absent and never hides the row (`z.custom(isPriorityLevel).optional().catch(undefined)` or the codec's equivalent).
- **Lookup.** `queuedFeeBasis` takes the request's shape and keeps its other filters. A row matches when `transfers[0].type`, `feePaymentMethod` and `priorityLevel` equal the shape's and its `feeSpender` equals the shape's, case-insensitively, both absent included. `queuedFeeCapFor` builds the shape from `req` and `sequence.feeSpender`.
- **Unchanged:** `queuedFeeCap`, `QueuedFeeAnswers`, the at-turn check, the popup, every word.

### #408: the derived line's row

- **Rule.** Below `DERIVED_MIN_PX = 8` (the type scale's smallest step) at `DERIVED_PX = 11` the line moves to its own row.
- **One pass, no feedback.** `fitDerived` reads the room beside the balance from `conversionEl`, which stays in the meta row in USD mode, empty when the line has moved (I2). It reads the full width from the `send-amount-row` element:
  1. Full width 0: not laid out; change nothing.
  2. Beside room 0 or less: own row. Else the fit's scale beside it; under 8/11: own row.
  3. In the own row the scale is `fitHero` over the full width; else the beside scale.
  Neither room depends on where the line is, so the move cannot oscillate.
- **Template.** A row directly under `send-amount-row`, left-aligned, full width, class `conversion` (type--meta), rendered only in USD mode while `derivedOwnRow`. It holds the skeleton or the `send-amount-derived` span; the meta span holds them otherwise. The ruler sits in the meta span whenever `fiatMode && derivedTokenLabel`, outside both the own-row and the converting branches, so a line that shortens is always re-decided. `.derived_type` is unchanged, so its carve-out still covers it. Test ids are kept and each renders in one place at a time.
- **Converting.** The decision reads `derivedTokenLabel`, which holds its value until the conversion lands, so the skeleton shows in the line's current place.

### #406: the card's dead path

Delete from `FeeSettingsCard.vue`: `isCustomMethod`, `useOwnMethod`, `useEmbeddedFee`, `showMethodSelector` (its `v-if`s keep their other terms), `embeddedHidden` and its two uses (`:641`, `:703`), `handleUseOwnMethod`, `handleUseEmbedded`, the two watchers (`:891-914`), the embedded branch of `derivedSettings`, the `useEmbeddedFee` terms in `noPayerCanPay`, `selectedMethodHasNoGas` and `handleMethodPicked`, the `isCustomMethod && !useOwnMethod` term in `recommitStillValid` (`:825`), the banner (`:943-967`), the back link (`:986-1008`), `.link`, and the `refuseRepeatEnter` import. Reword or drop the comments that name the removed path (`:183-186`, `:329-332`, `:638-640`, `:704-707`, `:734-749`, `:757-759`, `:793-794`, `:1011`, `:1035`). Keep the `embedded` border prop, `lockedMethod`, both live regions, and every wire use of the kind.

### File-level change map

| File | Change |
|---|---|
| `src/wallet/services/execution/queued-fee-cap.ts` (+ test) | `SendShape`, `sendShapeOf`, `speedOf`; `queuedFeeBasis` keyed |
| `src/wallet/services/execution/service.ts` | `queuedFeeCapFor` takes `sequence.feeSpender` |
| `src/wallet/services/execution/service.estimate-queue.test.ts` | real fee settings; like and unlike rows |
| `src/wallet/services/execution/transfer-executor.ts` (+ test) | `recordTransfer` passes `priorityLevel` |
| `src/wallet/services/transaction/{spec,service}.ts` (+ `service.test.ts`, `storage-codecs.test.ts`) | optional `priorityLevel`, codec, conditional write |
| `tests/e2e/helpers/activity-seeds.ts` | `seedTransaction` takes optional `estimatedFee`, `feePaymentMethod`, `priorityLevel`; defaults unchanged |
| `tests/e2e/network/same-token-concurrent-sends.test.ts` | the re-ask case seeds a like basis (D6) |
| `src/components/composite/send/AmountCard.vue` (+ test) | floor, own row, one-pass decision |
| `tests/e2e/network/send-amount-exact.test.ts` | USD assertions re-pointed; a short-figure control |
| `src/popup/components/modules/send/FeeSettingsCard.vue` (+ test) | dead path deleted |

### Trade-offs and alternatives not taken

- **Speed on the journal record** (no token contract, 50 succeeded records per scope; D46 of the archived send-queue-activity plan rejected it). **Speed from `gasDetails`** (the multiplier varies by build). **One opaque shape string on the row** (duplicates three facts the row already holds; Outline B).
- **Floor `HERO_MIN_SCALE` (6.6 px)**: one constant shared with the review sheet, but 60% of an 11 px line is the illegible size #408 reports (6 px).
- **Moving the line by CSS wrap and `order`** in one element: no duplicated template lines, but the measured span's width would then depend on the decision, so the room beside the balance must be derived from the row, the corner and the gap. **Teleport** saves four template lines at the cost of `defer` and target timing.

### Competing outline (sent to both audits)

**Outline B, safest-first.** Store `sendShape: "<type>|<method>|<fee contract>|<speed>"` on the row, built by one function at record and lookup. Keep the re-ask e2e on a seeded basis, and add a case where a like Urgent send mines first and a queued Urgent send goes out under the cap without asking (about +2 min per browser). Floor at `HERO_MIN_SCALE`; move the line by CSS wrap. Rejected in the draft: a duplicate record of facts the row holds, a scenario that cheaper layers prove (the service test), and a floor that keeps 6.6 px lines.

## UI impact

- **Send, the fee row while an earlier send is in flight (#412).** No new words. The capped queued state ("About X", "Goes out after your earlier send, for at most Y.", "Queue send") shows only when a like send exists; otherwise "Queued behind your previous send" with Send disabled. Signed: P9-12 B, P9-10 A.
- **Send in USD mode, the derived token line (#408).** Signed: #408 Decision C. Below 8 px beside the balance and Max, the line moves to a full-width, left-aligned row directly under the amount, at the largest size that fits, and the balance and Max line moves down one line. Ordinary amounts are unchanged. No new words; test ids kept. The PR attaches before (plan base) and after shots of both measured cases, both browsers, both themes.
- **Fee card (#406).** None: no flow renders the removed elements.

## Security & Adversarial Considerations

- **Threat model.** The basis comes from Tx rows, which a backup import writes with caller-chosen values. A planted like row moves only the X and Y shown before the person queues; the at-turn build is charged at most that Y, and above it the wallet asks again. The new field adds equality on a string; an unknown value reads as absent, so a hostile backup cannot hide a row through it.
- **Privacy.** The speed becomes explicit backup metadata. `gasDetails` do not always encode it: private fee juice commits a fixed margin at every speed (`fee/fee-cap.ts:24,40`). It reveals only the person's own speed pick, to whoever holds their backup, which already holds amounts and recipients (OA-1). No log line reads it.
- **Boundaries.** No RPC, permission or wallet-sdk surface changes; `feeCap` and `acceptQueuedFee` keep their validation. #406 removes popup code only; `approval-delta.ts:44` still refuses an app-paid pick.
- **Supply chain, crypto, least privilege.** No dependency, key or workflow change.

## Phases

Commands run from the worktree root unless they start with `cd`. Every gate also runs `bun run lint` and `bun run typecheck:all`. Shorthands used below:
- `UNIT <paths>` = `(cd apps/extension && bun --bun vitest run <paths>)`.
- `SMOKE <files>` = for `<b>` = `chrome`, then `firefox`: `(cd apps/extension && env -u EXTENSION_PATH VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<b> && env -u EXTENSION_PATH NULO_E2E_BROWSER=<b> NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- <files> --retry=0)`. The armed rebuild matters: smoke loads whatever `dist/<b>` holds, and `e2e:agent` leaves a network build there (e2e-testing skill § Build-armed tests).
- `NET <file>` = `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>`, then the same with `NULO_E2E_BROWSER=firefox`; one run at a time in this worktree, retry 0.
- Never overlap a `SMOKE` and a `NET` run.

### Phase 1: remove the fee card's dead path (#406) ✓

1. Delete the code listed under #406 in Architecture.
2. In `FeeSettingsCard.test.ts`, delete the tests that drive the embedded path: `:350-368`, the whole describe at `:1059-1110` (its first test asserts nothing), `:1112-1139`, `:1515-1540`, `:1629-1690`, `:2945-2975` (`fee-sponsor-live` stays covered at `:2564`), `:3228-3265`. The retry chain's live re-entry is the identity watcher, already tested.
3. Rewrite `:1140-1169`, the only guard of the `fee-init-degraded-live` region, on a plain mount: a held, then refused, read shows the region with `role="status"`, `aria-live="polite"` and `aria-atomic="true"`.

**Validation gate.** `UNIT src/popup/components/modules/send/`; `bun run test`; `SMOKE tests/e2e/send-fee-privacy.test.ts tests/e2e/send-keyboard.test.ts`. Pass: all exit 0; `git grep -n "send-fee-override\|send-fee-back-embedded\|useEmbeddedFee" apps/` prints nothing. Layers: unit, component, smoke.

### Phase 2: a row for a long derived line (#408)

1. Measure first (I3): run `send-amount-exact.test.ts` on base with a temporary log of the derived line's font size after the USD toggle. Record it in `lessons/phase-2.md`. If it is 8 px or more, stop and take a longer figure to the panel before step 4.
2. Implement the rule and the template under #408 in Architecture.
3. In `AmountCard.test.ts`, give the `hero-ruler` mock a width per element (the row, the meta span). Replace the no-floor pin (`:610-626`) with: one case that takes a long line to the own row at its full-width scale, then back to the meta span at scale 1 once the amount is `25` (control in the same mount); a full width of 0 changes nothing; a beside room of 0 takes the own row; while converting, the skeleton shows in the own row.
4. In `send-amount-exact.test.ts`, re-point the USD assertions. Check one line, no 2D overlap with the balance, no spill past the amount row, the line in its own row (top at or below the amount row's bottom, bottom at or above the balance's top), and a font size of 8 px or more. After the case's last token-mode step, switch to USD, type `25`, and assert the line shares the balance's row at 11 px (typing earlier breaks the case's later `waitForAmount`).
5. Shoot the two measured cases from a scratch, uncommitted copy of the spec: mint 12,345,679,901.123456789012345678 TST and seed the quote that turns $1,234.56 into 1,234.736567329128065313 TST (about $0.99986), as OA-15 measured. Log the "before" sizes (expected 4.6 px and 6 px). Shoot with `NULO_E2E_SHOT_DIR` and `shotSend`, once on base for "before" and once on the head for "after", both browsers (`shotSend` takes both themes).

**Validation gate.** `UNIT src/components/composite/send/AmountCard.test.ts src/utils/`; `bun run test`; `SMOKE tests/e2e/send-keyboard.test.ts`; `NET send-amount-exact.test.ts`. Pass: all exit 0; the type-role test is green without a new carve-out; shots exist for both cases. Layers: unit, component, smoke, network. e2e budget: no new scenario; step 4 adds a control step to the existing case (failure mode: the decision misreads real layout and moves a short line; jsdom has no layout), estimated +3 s per browser, measured in phase 2.

### Phase 3: the like-shaped basis (#412)

1. Add `SendShape`, `sendShapeOf` and `speedOf`; key `queuedFeeBasis`; pass `sequence.feeSpender` through `queuedFeeCapFor`.
2. Add `Tx.priorityLevel`, its codec and the conditional write; `recordTransfer` passes it.
3. Tests, one per class:
   - `queued-fee-cap.test.ts`: the `row()` fixture becomes a like row. The newest-valid-row control stays. Add one `test.each` refusing another privacy, another fee method, another fee contract, another speed, and a row with no speed. Add two controls: an omitted request speed matches a stored `"normal"` row, and the fee contract matches in another letter case. A compact mapping test covers `fj`, `fjwc`, `fpc` and `embedded` (no shape).
   - `service.estimate-queue.test.ts`: real fee settings (`fj`, `urgent`). The existing cap expectation holds over like rows. Add one case: the newest same-token row of another speed is skipped for an older like row.
   - `transfer-executor.test.ts`: the recorded row carries `"urgent"` for Urgent and `"normal"` for an omitted level.
   - `transaction/service.test.ts`: the field round-trips; the pinned bytes stay without it. `storage-codecs.test.ts`: the `full` fixture carries it; an unknown value reads as absent and the row stays.
4. Extend `seedTransaction` with optional `estimatedFee`, `feePaymentMethod` and `priorityLevel`; existing calls keep their rows.
5. Reshape the re-ask case (D6). Warning: `readActivityScope` throws on the local chain, which has no default token seeds; build the scope by hand (profile, account and network from storage, TST's contract from the burst, 18 decimals).
   - After A is submitted and held, read A's fee with the spec's `readRecordedFee`.
   - Seed one finalized like row of TST: Urgent, private to private, `feePaymentMethod` 1 (Public Fee Juice), an hour old, `estimatedFee` = 4/5 of A's fee.
   - Assert that the first re-ask's `cap` equals `queuedFeeCap` of the seeded fee. Rewrite the case's comment and title.

**Validation gate.** `UNIT src/wallet/services/execution/ src/wallet/services/transaction/ src/wallet/services/storage-codecs.test.ts`; `bun run test`; `SMOKE` over the `seedTransaction` callers `tests/e2e/{rows,navigation,home-links,send-outcome-rows,type-roles}.test.ts`; `NULO_E2E_PROVERLESS=1 NET same-token-concurrent-sends.test.ts`; then CI's chaos seeds, each as `NULO_E2E_PROVERLESS=1 NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=<seed> NET send-chaos.test.ts` for seeds 1095865833 and 1960252198. Pass: all exit 0, and the chaos log shows its actions ran (a missing `NULO_E2E_CHAOS` skips the file and exits 0). Layers: unit, composition, smoke, network. e2e budget: no new scenario; the re-ask case adds one storage write and one assertion (estimated +0.5 s per browser; about 10 min per browser today).

### Phase 4: final gate

`bun run test:all`; `bun run test:ci-gating`; `bun run check:plans`; `bun run audit:vue`. Pass: all exit 0 on the final head.

## Decision ledger

- **D1** One arc, one PR, phases 406 → 408 → 412: the cheapest change first, the longest e2e last. Nothing must land apart.
- **D2** Speed is a new optional `Tx.priorityLevel`; privacy and fee method are read from fields the row already holds. Rejected: the journal record, `gasDetails`, an opaque shape string (Trade-offs).
- **D3** The request's fee method is `sendShapeOf`'s option and `sequence.feeSpender`, compared as the row records them.
- **D4** An unknown stored speed reads as absent; it never hides a row.
- **D5** Rows without a speed are never a basis; no migration (pre-production, CLAUDE.md).
- **D6** The re-ask e2e seeds one like row priced below today's network. "The fee rose since your last like send" is the realistic re-ask under B. Seeding 4/5 of A's fee keeps the 5/3-against-1.25 headroom and makes the case fail on the unkeyed lookup. No new case.
- **D7** The floor is 8 px, the smallest step of the type scale and B's example. Rejected: `HERO_MIN_SCALE`, which allows 6.6 px.
- **D8** The decision reads two rooms that do not depend on the line's placement; one pass, no oscillation.
- **D9** The own row sits directly under the amount, left-aligned, as a `conversion` span holding `.derived_type`. Rejected: CSS wrap (Trade-offs).
- **D10** #406 deletes the card's path and keeps the wire kind; nothing on the wire narrows.
- **D11** e2e: no new scenario; two existing cases re-pointed.
- **D12** Shots: a scratch spec run on base and head at OA-15's balance and quote; never committed.
- **D13** The kind-to-option map stays in `queued-fee-cap.ts`, written with enum members and pinned by a compact test (Codex 6). Rejected (Opus 5): exporting one map for the strategy pins and `operation-planner.ts:223-228`. The planner keys a dApp route, not a kind, and the pins live in `execution/fee/`, the sibling lane's files. A drift fails safe: no basis, the shipped wait.
- **D14** The 8 px floor is the switch threshold, not a guarantee: in its own row a line wider than the card at 8 px keeps P9-01 A's shrink (Codex 1). It needs a whole part of about 30 digits with a long symbol and costs legibility only, as the review sheet shows the full amount. Filed at close-out as a closed `known-limit` issue.

## Audit verdicts

### Round 1, Codex (gpt-6.1-sol, high, read-only; session `01a13ab3-2e65-7ae3-865d-e6b8464ae3ca`), 2026-10-14

Verdict: `conditional approve (with conditions: reconcile the 8 px guarantee, make validation gates executable, and correct the privacy and normalization claims)`. All six accepted after checking the tree:
1. Medium, demonstrated: the own row's fit can fall below 8 px for a line wider than the card at 8 px (`hero-fit.ts:40`). Accepted: the quality bar is qualified; D14.
2. Medium, demonstrated: speed is new backup metadata; private fee juice's cap ignores speed (`fee/fee-cap.ts:24,40`). Accepted: Security and OA-1 corrected.
3. Medium, plausible: normalising an absent stored speed would let legacy rows match Normal. Accepted: `speedOf` applies to the request only; the control is renamed.
4. Medium, demonstrated: `send-chaos.test.ts` skips without `NULO_E2E_CHAOS=1` (`:30`); gates mixed working directories. Accepted: root-relative shorthands, CI's seeds 1095865833 and 1960252198.
5. Low, demonstrated: F8's amount and F3's multiplier were imprecise (the 10 is CI's, `_extension-network-e2e.yml:153`); I1 assumes equal gas. Accepted.
6. Low, plausible drift: the kind-to-option map copies strategy knowledge. Accepted as enum members and a mapping test (D13).

Also judged right: the seeded basis is legitimate fixture data that changes none of B's keys; I2 holds; two template places over CSS wrap or Teleport; #406's deletions are dead; Outline B's extra case is unneeded.

### Round 1, Opus Plan agent (same family, read-only), 2026-10-14

Verdict: `conditional approve (with conditions: render the #408 ruler whatever the line's placement, and test long→short; build the Phase 3 seed scope by hand, because readActivityScope throws on the local chain; set the chaos env vars in the Phase 3 gate; rebuild the armed dist before every smoke run)`.
1. Medium, plausible: a ruler inside a branch would leave a shortened line in its own row (`AmountCard.vue:178`). Accepted: the ruler renders whenever `fiatMode && derivedTokenLabel`; one long-to-short case.
2. Medium, demonstrated: `readActivityScope` throws on the local chain (`activity-seeds.ts:30-31`; `default-tokens.ts:88-90`). Accepted: the scope is built by hand.
3. Medium, demonstrated: chaos skips without its env (same as Codex 4). Accepted.
4. Low-medium, demonstrated: smoke loads whatever `dist` holds (e2e-testing skill). Accepted: armed rebuild before each smoke browser.
5. Low, plausible: the map is a third copy. Rejected for scope (D13).
6. Low, demonstrated: typing `25` mid-case breaks the later `waitForAmount` (`send-amount-exact.test.ts:221-222`). Accepted: the control runs after the last token-mode step.
7. Low, plausible: the shots need OA-15's exact balance and quote, or before equals after. Accepted (D12).
8. Low: the test and comment cleanup was incomplete; `embeddedHidden` has two uses. Accepted.
9. Low: the wall-clock is the CI job envelope. Accepted.
10. Info: OA-1 is implied by P9-12 B. Accepted: recorded, not open.

Security: a hostile backup restamps rows to the importer's profile (`useFullBackupImport.ts:353`), so a like row can be planted; it suppresses a re-ask only up to a Y the person was shown, and `feeCapFor` bounds the commit. No fix. I1 holds with more headroom (B re-asks above about A's fee); I3 estimated at about 6.9 px.

### Final fresh pass, Codex (new session, gpt-6.1-sol, high, read-only; session `01a13ac3-b296-77e3-9360-97fb4a4a2b5b` on the `alejo-icloud` account after a 429 on the default one), 2026-10-14

Verdict: `conditional approve (with conditions: complete the smoke commands, specify the resume invocation, and reconcile the failure threshold)`. All three accepted after checking the tree:
1. Medium, demonstrated: `SMOKE` kept an inherited `EXTENSION_PATH` (`global-setup-smoke.ts:16-18`) and omitted `NULO_E2E_CSP_REPORT=1` (`fixtures/csp-violations.ts:10`), so a green run might not check the rebuilt build. Fixed: the shorthand carries the armed build and the runtime flags.
2. Low: the resume command lacked its arguments, effort and model. Fixed in Post-implementation.
3. Low: the `/loop` seed stopped at five failures, against the program's three. Fixed.

Kept with no new evidence to reopen them: D13, D14, the seeded basis, the two-place template, Tx rows as the home for speed.

**Confirmation (the same session resumed):** `approve`. All three conditions are met and the edits introduce no regression.

## Delivery

One PR, no stack: `gh pr create --base dev` from `worktree-send-followups-1`, opened only after the Codex loop converges. The close-out lands as its final commits.

| Branch | Phases | PR title (≤ 93 chars) | Closes | code_review |
|---|---|---|---|---|
| `worktree-send-followups-1` | 1-4 + close-out | `fix(send): key the queued fee cap on the send's shape, give a long usd line its own row` | #412 #408 #406 | off |

- Open the PR without labels; add `e2e:extension-network` or `e2e:extension-smoke` only when the path filter skips a suite the change needs.
- Body: what changed and why; the validation runs with outcomes; each browser's network suite wall-clock (the CI job envelope, per the e2e-testing skill § Runtime budget) before and after, plus the two touched files' times; #408's shots, quoting #408's Decision; OA-1.
- **Seam with fees-and-sponsors-2:** no shared file is planned. If its PR edits `FeeSettingsCard.vue`, the second to merge takes `origin/dev` and reruns the card's tests and Phase 1's smoke.
- **Parallelism:** the three phases touch disjoint files, but the critical path is the network e2e, which runs one at a time per worktree; lanes would save nothing.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard at 175d826. Plan-specific parts:

- **Loop placement:** single arc. Run the Codex loop once over the net diff from d3dc4415 after Phase 4 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` (on a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`; if that fails too, log it and continue). Keep the trailer's `SESSION_ID` and `CODEX_DIR`; resume with `~/.claude/skills/codex/scripts/resume-codex.sh "<SESSION_ID>" <followup-file> "<CODEX_DIR>" high gpt-6.1-sol`. Hard stop at three rounds, then surface to the orchestrator.
- **Approval boundaries:** a round that adds persistent state beyond `Tx.priorityLevel`, a lifecycle, a protocol, a recovery policy or a public contract stops for approval. Any change to what a person sees beyond UI impact goes to OWNER-ASKS.md.
- **Close-out:** merge `origin/dev` first and read `index.md` and `lessons.md`. `lessons.md` is at its budget, so promote only against a retirement. Comment on #406 that the `embedded` kind stays on the wire, and why. File D14 as a closed `known-limit` issue (dedupe first) and list it on the Outcome's `Known limits:` line. Delete `STATUS.md`; `git mv` the plan into `archive/` in its own commit; move the index line; `bun run check:plans`.
- **Teardown:** once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/send-followups-1/plan.md` succeeds, run `agent-worktree done send-followups-1 --merged --trunk dev`; nothing to exit, as the session started inside the worktree.
- Commits are signed; on a hang rerun as `env -u SSH_AUTH_SOCK git <cmd>`; `git log --format='%h %G?' -3` shows no `N`.

## Seeds

Recommended: `/goal`. Use exactly one per session; they do not compose. Drafts until the orchestrator approves.

```
/goal Phases 1-4 of implementations-plan/send-followups-1/plan.md are marked ✓, each backed by its validation gate reported passing in the transcript, with LESSONS_FILE=implementations-plan/send-followups-1/lessons/phase-N.md printed per phase; /code-review was NOT run (code_review is off); the Codex loop (run-codex.sh … high read-only gpt-6.1-sol) converged over the net diff from d3dc4415, a resumed pass reporting no new material findings quoted in the transcript; the PR closing #412 #408 #406 exists, created only after that, with the close-out commits that archived the plan (git show --stat of the archive move); bun run test and bun run lint exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/send-followups-1 forward. Never idle. Each firing: (1) read plan.md, STATUS.md, OWNER-ASKS.md and lessons/; if the plan path is gone, check `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/send-followups-1/plan.md`: success means merged, so run `agent-worktree done send-followups-1 --merged --trunk dev`, report, clear this loop and stop; failure means delivered, so babysit CI only. (2) Waiting on CI is fine; confirm it progresses. (3) No task in hand: take the next pending step; run lint and the touched tests after each edit; commit. (4) A decision you would bring to a person: consult Codex (run-codex.sh … high read-only gpt-6.1-sol) and act on the stronger argument; log it. Anything a person would see goes to OWNER-ASKS.md. Never merge, never push to main, never expand scope. (5) Same step failed three times: stop and reassess with Codex; a gate that fails three times on one step ends the arc with ARC_FAILED. (6) Phase green per its gate: mark ✓, log lessons, print LESSONS_FILE=…. (7) Phase 4 green: the Codex loop, then the PR and the close-out per Post-implementation, then report and stop.
```
