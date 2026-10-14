---
plan: fees-and-sponsors-2
tier: mid
status: approved 2026-10-14 (orchestrator); arc 1 in progress
issues: "#400, #401, #411 (one arc)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 Explore agents (sonnet); dual audit (Codex gpt-6.1-sol high + one Opus Plan agent); one final fresh Codex pass
post_implementation_hardening: not scheduled
base: origin/dev at d3dc4415
trunk: dev
---

# Fees and sponsors 2: one cap rule, an app's priority fee, no Teardown line

The fees follow-up the owner decided on decision page 6 (P6-13 B, P6-13b "B with C's tooltip", P6-19 B, P6-20 C). Each issue's `## Decision` block is the sign-off. One arc, one PR against `dev`.

- **#400 (P6-19 B).** Every payer commits the app's `maxFeesPerGas` when the app gives one. The app-paid row shows gas limits × the committed cap.
- **#411 (P6-13 B, P6-13b).** Every send commits the app's `maxPriorityFeesPerGas`, and the cap makes room for it. The app-paid row reads B's sentence: "Fee up to 0.016 FJ, includes a 0.004 FJ priority fee the app asked for".
- **#401 (P6-20 C).** The activity detail's gas breakdown loses its Teardown line.
- **Confirm waits for the figure** when the app set its own cap or priority fee (P6-07: "if an app asks for more, the approval window shows the higher figure before Confirm"; P6-19 B: "which the person sees before Confirm").
- **[OWNER-ASKS.md](OWNER-ASKS.md)**: open, the dotted term (OA-1) and the app-paid row before its figure lands (OA-4); defaults from the signed words, answered only to change them, the wallet-chosen readout's words (OA-2) and Confirm after a failed estimate (OA-3). Each names what ships now.

Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Issue map

| Issue | Ships here | Waits on | PR line |
|---|---|---|---|
| #400 | every payer commits the app's cap; the app-paid figure; the Confirm wait | nothing (a default-entrypoint row has no figure, D9) | `Closes #400` |
| #401 | the Teardown line removed | nothing | `Closes #401` |
| #411 | the priority on every payer; B's sentence on the app-paid row | OA-1 (the dotted term) | `Closes #411` if OA-1 is answered and built before the PR; else `Refs #411` and a comment naming what waits |
| no arc | #405, #406, #408, #410, #412 (lane `send-followups-1`, CI, the owner's call), #117 (`blocked:external`), #197 | — | — |

## Outcome & Quality Bar

**For whom.** A person approving an app's transaction in the approval window, and later reading its cost in the activity detail.

**Excellent:**
- The fee figure is the fee limit the estimate committed (gas limits × cap), whoever pays. An app can lower it on every payer; a raise is on screen before Confirm can be pressed. A confirm that rebuilds may commit a fresh basis (D12).
- When an app adds a priority fee, the app-paid row says how much of the figure it is, in the signed sentence, and that part never exceeds the figure.
- No row shows a figure the wallet did not compute from the request it will commit.
- The activity breakdown's lines add up to "Estimated".

**Good enough.** No USD on the app-paid row. No new reuse path. `formatFeeJuice` at six decimals, as every fee figure.

## Assumptions

### Facts

1. `feeCapFor` reads an app's cap only for `account` and `app` (`apps/extension/src/wallet/services/execution/fee/fee-cap.ts:32`); `capRuleOf` gives a sponsor or private fee juice none (`fee/fpc-strategy.ts:110-112`).
2. No send commits an app's priority: every strategy calls `buildStandard` with four arguments, so `completeFeeOptions` sets `GasFees.empty()` (`packages/aztec-runtime/src/account/fee-options.ts:73-75`); `finalizeGasLimits`, FPC Pass 2 and the embedded cap helper copy the build's priority through. `ctx.op.fee.maxPriorityFeesPerGas` already reaches every strategy (`operation-planner.ts:89-108`). The app's `simulateTx` already passes the priority as the fifth argument (`view-executor.ts:315-321`).
3. `applyEmbeddedFpcGasCap` rewrites the gas settings before the simulation for every embedded payment, `fpc` and `fjwc` alike, and on the default-entrypoint path (`fee/embedded-fpc-cap.ts:14-22`; `dapp-send-executor.ts:1078`). On `fjwc` the person's own claimed Fee Juice pays (`execution/utils/fee-detection.ts:3-5`).
4. Protocol 6.0.0-rc.1: the cap bounds base plus priority, per gas: effective = base + min(priority, cap − base). The node's fee limit and the PrivateFPC charge are gas limits × cap; the priority is not added to either (recon § Protocol facts).
5. The app-paid estimate runs once when the window opens and carries `maxFee` = `feeLimitOf` (`popup/windows/execute/index.vue:268`; `dapp-send-executor.ts:462-474`). A default-entrypoint operation gets none (`index.vue:266`; known limit #395).
6. The app window's Confirm never waits for an estimate (`index.vue:706-714`); #396 closed that as a known limit because no answer covered the wait.
7. `DottedTerm.scan.test.ts:47-57` refuses a dotted term whose definition is not one sentence of at most 100 characters; C's definition has two sentences.
8. The reuse stash refuses an embedded payment and an app cap (`dapp-send-executor.ts:589-600`); embedded confirms rebuild (`:938-949`).
9. No component test of `TxFeeRow` exists and no e2e counts its rows. Smoke `type-roles.test.ts:441` and `rows.test.ts:268-307` open the activity detail; no smoke file opens the approval window.
10. P6-13 B, signed: "the person may pay more than the base price, up to the cap shown, with no separate priority figure on the screen". #411's possible fix: "include the app's priority fee in the committed cap".

### Inferences

- **I-1.** The node admits a send whose priority is non-zero and whose cap includes it. No installed package validates the priority; Phase 4 proves admission live, and Phase 1's pins prove the confirm build carries the priority.
- **I-2.** Without an app cap, the priority goes on top of the payer's basis (C = basis + q). #411's possible fix says the committed cap includes it; inside the basis, the protocol cuts the priority to basis − base, which is near zero on the app's own path (basis = P × 1). With an app cap, C is the app's, as the protocol defines the cap as the total.

### Asks

OA-1 to OA-4 in OWNER-ASKS.md (OA-2 and OA-3 are signed defaults); each working assumption is its "what ships now".

## Architecture & Implementation

### Shape

No new module. The priority enters once, at the build: each strategy passes the app's priority as `buildStandard`'s fifth argument, and every later rewrite of the gas settings already copies it. The cap is decided once, in `feeCapFor`: every rule takes the app's cap and priority. `tx-fee-details.ts` gains the priority figure beside `feeLimitOf`. The window holds Confirm on a computed value over its existing estimate state.

### Cap and priority, every payer path

G = gas limits, P = predicted worst minimum, m = the speed level's multiple, a = the app's cap, q = the app's priority (per gas, per dimension). C = committed cap; the committed priority is q, or zero when the app gives none.

| Payer | App gives a | App gives no cap | Row |
|---|---|---|---|
| Account's Fee Juice (`fj`, requested self-pay, `fjwc`) | C = a | C = m·P + q | readout "~G·C FJ" |
| Sponsor | C = a (new) | C = m·P + q | "Nothing" over the struck G·C |
| Private fee juice (charges G·C) | C = a (new) | C = 1.2·P + q | readout "~G·C FJ" |
| Embedded `fpc` (the app's fee contract) or `fjwc` (the person's claim) | C = a | C = P + q | B's sentence |
| Default entrypoint (app's payer) | C = a | C = P + q | today's sentence, no figure (D9) |

The app-paid row shows "Fee up to G·C" and, when q > 0, ", includes a G·min(q, C) FJ priority fee the app asked for". G·q is the priority allowance: without an app cap the protocol pays it in full (base ≤ basis); an app cap below base + q clips it, and the row still shows the allowance, bounded by the figure.

### #400, today and B (X = G·P, Normal level, no priority)

| Path | App cap | Today | B, this arc |
|---|---|---|---|
| Account's Fee Juice | 0.5× / 3× | 0.5X / 3X shown | unchanged |
| Sponsor | 0.5× | 2X | 0.5X struck; the node refuses it below its minimum |
| Sponsor | 3× | 2X | 3X struck; the sponsor must hold 3X |
| Private fee juice | 0.5× | 1.2X charged | 0.5X charged; refused below the minimum |
| Private fee juice | 3× | 1.2X charged | 3X charged, shown before Confirm can be pressed |
| Embedded payment | 3× / none | 3X / 1X, no figure | "Fee up to 3X" / "Fee up to X" |
| Default entrypoint | any | no figure | unchanged (D9) |

### Interfaces

- `FeeCapRule` (`fee/fee-cap.ts`): every variant takes `appCap?` and `appPriority?` (`AppFeeCap`). `feeCapFor` returns `appCap` verbatim when set; else the payer's basis plus `appPriority`.
- `appPriorityOf(fee?: FeeOptions): PartialGasSettingsRPC | undefined` (`fee/fee-strategy.ts`): `{ maxPriorityFeesPerGas }` when the app gave one. The build's cap default is unchanged; finalize, Pass 2 and the cap helper overwrite it as today.
- `priorityFeeOf(txRequest): bigint` (`tx-fee-details.ts`): Σ G × min(q, C) per dimension.
- `TransferFeeEstimate` (`packages/wallet-bridge/src/fee.ts`): `priorityFee?: string` and `priorityFeeFormatted?: string`, set together, only when non-zero. Internal RPC type; the package is private.

### File-level change map

| File | Change |
|---|---|
| `apps/extension/src/wallet/services/execution/fee/fee-cap.ts` | rule fields and guard; header (the "no priority fee is set" sentence) |
| `.../fee/fee-strategy.ts` | `appPriorityOf`; `finalizeGasLimits` passes `appPriority` on the account rule; an embedded payment always keeps the request's cap; header comment |
| `.../fee/{fee-juice,fee-juice-with-claim,embedded,fpc}-strategy.ts` | pass `appPriorityOf(ctx.op.fee)` to every `buildStandard`; `capRuleOf(fpc, multiplier, ctx.op.fee)` |
| `.../fee/embedded-fpc-cap.ts` | `feeCapFor({ payer: "app", appCap, appPriority })` |
| `.../tx-request-builder.ts`, `.../view-executor.ts` | `buildNoFrom` commits the app's priority; the profile path's build receives it |
| `.../dapp-send-executor.ts` | `prepareNoFrom` carries the priority; the stash refuses an app priority, as it refuses an app cap; the projection pair |
| `.../tx-fee-details.ts`, `packages/wallet-bridge/src/fee.ts` | `priorityFeeOf`; the pair |
| `apps/extension/src/popup/windows/execute/OperationCard.vue` | the app-paid row (UI impact) |
| `apps/extension/src/popup/windows/execute/index.vue` | the Confirm wait, in the footer and in `approve()` |
| `apps/extension/src/popup/components/modules/tx/{TxFeeRow.vue,tx-detail-helpers.ts}` | drop the Teardown line, `hasTeardown`, `teardown*` |
| `apps/playground/src/sections/transactions.ts`, `apps/playground/README.md` | two fee inputs every `sendTx` button reads |
| `apps/extension/tests/e2e/network/fee-sponsor-funding.test.ts` | one scenario (Phase 4) |

`committedCapCovers` and `reuseCapRule` do not change: no reuse entry carries an app cap or priority.

### Alternatives not taken

- **Outline B** (the competing outline both audits saw): every payer at once with B's sentence in `FeeCostReadout` too, C's definition verbatim, a hold on every operation, and an estimate for default-entrypoint operations. Taken from it: the priority on every payer and a hold. Rejected: the readout's words (OA-2), the definition (OA-1; the scan refuses it, and a scan exception weakens a gate), a hold on operations whose app asked for nothing, and a new simulation path (#395).
- **Priority committed in the embedded cap helper only** (the first draft): it left wallet-chosen payers dropping a signed behaviour.
- **Priority inside the basis**: rejected by I-2. **Clamp the committed priority to C**: rejected; the committed bytes stay the app's (`fee-strategy.ts:273-275` states that rule for custom limits).
- **Extend `reuseCapRule` with the priority** (Codex): works, but the stash already refuses app-supplied fee settings; one more condition there is smaller.
- **A `TxGasDetails` field**: rejected; it widens a persisted shape for a figure only the window shows.

## UI impact

- **Approval window, app-paid row (#400, #411).** Before: "✓ Fee payment method set by nulo-playground". Once the estimate lands: "✓ Fee up to **0.012 FJ**", or "✓ Fee up to **0.016 FJ**, includes a 0.004 FJ priority fee the app asked for" (P6-13b B, shot `o-188-prio-B`, cap bold as drawn; P6-19 B "the app-paid row shows gas limit × the committed cap"). "priority fee" is plain text until OA-1. Before it lands, after a failure, and on a default-entrypoint operation: today's sentence (OA-4). `execute-op-fee-set-badge` stays on the row; the sentence gains `execute-op-app-fee`.
- **Approval window, wallet-chosen readout (#400, #411).** Words unchanged. Its figure follows the app's cap and includes the app's priority (P6-13 B: "up to the cap shown, with no separate priority figure"); OA-2 asks whether it should carry B's sentence.
- **Approval window, Confirm (#400, #411).** Disabled while an operation whose app set its own cap or priority has no current estimate (P6-07; P6-19 B). It stays off after that estimate fails (OA-3).
- **Activity detail, gas breakdown (#401).** The Teardown line is gone (P6-20 C).
- **Settings → Glossary.** No change until OA-1.

## Security & Adversarial Considerations

- **Threat model.** An app chooses `maxFeesPerGas`, `maxPriorityFeesPerGas` and its payer in an `aztec_sendTx`, parsed by the wallet-sdk schema before the planner. Malformed or negative values fail the build (`GasFees`, `Fr`), never a silent default.
- **A raised charge on the person's payer.** Path: the app sets k·P with k > 1.2 (or q > 0); the person's pick is private fee juice or Fee Juice; the person presses Confirm before the estimate lands; the PrivateFPC debits G·C with no refund. Plausible but unverified (a window of seconds), demonstrated by code trace (`index.vue:706-714`). The installed library warns that an unbounded fee is a fund-loss vector (`@alejoamiras/private-fee-juice` `dist/src/ts/utils/gas.js`). Fix: the Confirm wait, a computed value over the window's estimate state; no new state or lifecycle.
- **A sponsor pays the app's priority.** Every sponsor row the wallet accepts runs `sponsor_unconditionally`, so any caller can already spend it with any priority: the wallet gives an app no new capability.
- **The app's fee contract.** "Fee up to X" is the network limit. What the person pays that contract is in the app's own payload, as before, and an app may set a small cap so the row reads cheap; P6-19 B signed this design.
- **A confirm-time rebuild above the shown figure.** Embedded confirms always rebuild, and a reuse miss rebuilds, at a fresh basis; the committed cap can exceed the landed figure. Pre-existing on every rebuilt path; binding the figure to approval is a new approval contract. Known limit, filed at close-out (D12).
- **A priority above the cap.** The protocol clamps it; the row shows G·min(q, C).
- **Logs, least privilege, crypto, supply chain.** No new log value, permission, key, dependency or workflow. The playground is the test dApp.

## Phases

### Phase 1: one cap rule and the app's priority (service worker)

1. In `fee-cap.ts`, give every rule `appCap?` and `appPriority?`. Return the app's cap verbatim for every payer. Add the priority to the basis when the app gives no cap.
2. Add `appPriorityOf` to `fee-strategy.ts`. Pass it as the fifth argument of every `buildStandard` in the four strategies.
3. Pass `ctx.op.fee` through `capRuleOf` and `finalizeGasLimits`' account rule. For an embedded payment, always keep the request's cap in `finalizeGasLimits`.
4. Give `applyEmbeddedFpcGasCap` the `app` rule with the priority. Make `buildNoFrom` and `prepareNoFrom` carry the app's priority. Pass `appPriorityOf(fee)` to the profile path's build (`view-executor.ts:387`), so a profile runs under the cap and priority a send commits.
5. Refuse a stash entry when the app set a priority. Add `priorityFeeOf`, the wire pair and the projection.
6. Update the pins to their new values. Do not loosen or delete them:
   - `fee-cap.test.ts`: every payer with the app's cap; every payer with a priority and no cap (basis + q); both (the cap verbatim).
   - `strategies-lifecycle.test.ts`: private fee juice (`:403-419`) and the sponsor (`:446-456`) commit the app's cap, payload figures recomputed; the priority case (`:458-466`) commits the app's priority on every path, and `buildStandard`'s fifth argument is `{ maxPriorityFeesPerGas }`.
   - `tx-request-builder.pins.test.ts:543-550`: a default-entrypoint build commits the app's priority. `:529-541` stays: the builder reads no fee from the operation.
   - `embedded-fpc-cap.test.ts` (`fpc` and `fjwc`), `tx-fee-details.test.ts` (q = 0, q < C, q > C), `dapp-send-executor.test.ts` (the pair only when non-zero; no stash entry for an app priority; the embedded confirm build receives the app's priority), and one `view-executor` test: a profile's request carries the same cap and priority as a send's.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `bun run --cwd apps/extension test src/wallet/services/execution`; `bun run --cwd packages/wallet-bridge test`; `bun run --cwd packages/aztec-runtime test`. Pass: exit 0, every pin above green with its new value. Layers: typecheck, lint, unit.

### Phase 2: the app-paid row and the Confirm wait

1. In `OperationCard.vue`, render the landed figure per UI impact. Keep the container, icon and testid. Show today's sentence while no estimate has landed.
2. In `OperationCard.fee.test.ts`, replace the "reads as before" case with four: no estimate; a funded estimate (`Fee up to 3.577824 FJ`); an estimate with a priority (B's sentence, exact); a short estimate (the figure and the notice). Feed the operation's fee settings as the wire carries them (`0x` hex fields).
3. In `index.vue`, disable Confirm, and refuse in `approve()`, while a standard send operation whose app set a cap or priority has no landed estimate. Skip default-entrypoint operations (no estimate exists).
4. In `index.test.ts`, add: Confirm off while such an operation estimates; on once it lands; off after it fails; never held for an operation whose app set nothing.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `bun run --cwd apps/extension test src/popup/windows/execute`. Pass: exit 0, the eight cases green. Layers: typecheck, lint, component.

### Phase 3: the Teardown line

1. Remove the Teardown block from `TxFeeRow.vue` (`:67-73`).
2. Remove `hasTeardown`, `teardownL2Gas`, `teardownDaGas` and `teardownCost` from `GasBreakdown`. Keep `GasDetailsRaw` (the stored shape).
3. Update `tx-detail-helpers.test.ts`. Add `TxFeeRow.test.ts`: limits with non-zero teardown render exactly "L2 gas" and "DA gas", and the Estimated line.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `bun run --cwd apps/extension test src/popup/components/modules/tx`. Pass: exit 0. Layers: typecheck, lint, component.

### Phase 4: playground inputs, the live scenario, screenshots

1. Add inputs `pg-input-maxFeesPerGas` and `pg-input-maxPriorityFeesPerGas` ("da,l2" in base units). When set, every `sendTx` button passes them as `opts.fee.gasSettings`. Add the README row.
2. In `fee-sponsor-funding.test.ts` (its playground is already connected), add one test. The app pays through Nulo's sponsor (`sendTx-appSponsored`, salt 0) with a priority. Assert B's sentence, press Confirm, and wait for the transaction hash: `NO_WAIT` returns it only after the node admitted the transaction. Do not read the transaction back: `getTxByHash` serves only pending transactions (`stdlib` `aztec-node.d.ts:331`) and the harness has no tap on the worker's node requests, so a read-back races mining. Phase 1's pins prove the confirm build carries the priority; this test proves the node admits that build.
3. Capture the app-paid row (with and without a priority) and the activity breakdown, light and dark, Chrome and Firefox, with `NULO_E2E_SHOT_DIR` (`shotSend`, `tests/e2e/fixtures/send-page.ts:224`), into `implementations-plan/fees-and-sponsors-2/screenshots/`.

**Validation gate.** From the worktree root: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-sponsor-funding.test.ts --retry=0`, then again with `NULO_E2E_BROWSER=firefox`. Pass: every test green on both browsers; the new test's runtime in `lessons/phase-4.md`. Layers: e2e on the local network.

### Phase 5: final gates

1. Run `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run test:ci-gating`, and `bun run check:plans` after staging.
2. From the worktree root, one `e2e:agent` run at a time, retry 0, Chrome then Firefox: `fee-methods`, `selfpay-phase`, `fee-sponsor-funding`, `tx-sendTx-feePayer`, `tx-sendTx-noFrom`, `tx-sendTx-sponsoredFpc`, `sim-from-selfpay`, and every file a caller sweep of `feeCapFor`, `applyEmbeddedFpcGasCap`, `TransferFeeEstimate`, `buildGasBreakdown` and the execute window's Confirm names. Run `@requires-proverless` files with `NULO_E2E_PROVERLESS=1` in their own call.
3. Smoke builds nothing. In `apps/extension`: `bun run build:chrome && env -u EXTENSION_PATH bun run test:e2e -- tests/e2e/type-roles.test.ts tests/e2e/rows.test.ts --retry=0`; then `bun run build:firefox` and the same under `NULO_E2E_BROWSER=firefox`.

Pass: all exit 0. A known flake gets one rerun; real breakage gets a fix. Never raise the stall watchdog.

### Phase 6 (only for asks answered before the PR opens)

- **OA-1.** Add glossary entry `priority-fee` (term "Priority fee", the answered definition, where "Approval window", section Fees) and wrap "priority fee" in `<DottedTerm term="priority-fee">`. Update `glossary.test.ts`, `settings/glossary.test.ts` and `tooltips-glossary.test.ts` if it lists entries.
- **OA-2 A.** Render B's sentence in `FeeCostReadout.vue` for rows the person pays; sequence with `send-followups-1` on `FeeSettingsCard.vue`.
- **OA-3 B or OA-4 B.** Adjust the Phase 2 wait or the row's pending state.

Each runs its phase's gate, then Phase 5.

## E2E runtime budget

| Scenario | Failure mode it proves | Why no cheaper layer | Estimate |
|---|---|---|---|
| The app pays through Nulo's sponsor with a priority (`fee-sponsor-funding.test.ts`) | the node refuses a send with a non-zero priority and a cap that includes it; the row loses the real estimate's figure | the node's admission code is not installed (I-1); the estimate crosses the service worker and the window; `tx-sendTx-feePayer`'s send sets no kernel fee payer, so it cannot prove admission. That the confirm build carries the priority is a unit pin (Phase 1) | ~90 s per browser (one prove and send), measured in Phase 4 |

The PR body states the network suite's per-browser wall-clock before and after.

## Delivery

- One arc, no stack: branch `worktree-fees-and-sponsors-2`, one PR against `dev`.
- Title: `feat(fees): an app's cap on every payer, its priority fee on app-paid rows` (74 characters).
- Body: what changed and why, the #400 table, the screenshots, every gate with its outcome, the e2e wall-clock per browser, `Closes #400`, `Closes #401`, and #411 per the issue map. Open it without labels; add `e2e:extension-network` afterwards only if the path filter would skip that suite.
- Close-out: the PR's final commits, after `gh pr create`. Parallelism: none; the arc is short and serial.

## Decision ledger

| # | Decision | Why | Rejected |
|---|---|---|---|
| D1 | Every payer commits the app's cap when given; `feeCapFor` stays the one rule. | P6-19 B. | A per-strategy override. |
| D2 | Every send commits the app's priority, default entrypoint included; only the app-paid row names it. | P6-13 B signs the behaviour and "no separate priority figure"; P6-13b signs the sentence on the app-paid row. | Dropping it off the app-paid row (the first draft; Codex C2, Opus 2). |
| D3 | Without an app cap C = basis + q; with one, C = a and q verbatim; the row shows G·min(q, C). | I-2; committed bytes stay the app's. | Priority inside the basis (Codex C3); clamping q. |
| D4 | The priority enters at the build (fifth argument); the cap at `feeCapFor`. | Every later rewrite copies the build's priority; the embedded simulation sees both. | Setting it in each rewrite. |
| D5 | The figure is an optional pair on `TransferFeeEstimate`, from the committed request. | The row shows what is committed; nothing persisted. | A `TxGasDetails` field. |
| D6 | The app-paid row keeps today's sentence until its estimate lands, after a failure, and on a default-entrypoint operation. | No figure without a committed request (OA-4). | A skeleton. |
| D7 | No glossary entry or dotted term until OA-1. | The lane brief; the scan refuses two sentences; the entry lands with its term. | C verbatim with a scan exception (Codex C2). |
| D8 | Confirm waits while a standard send operation whose app set a cap or priority has no landed estimate; it stays off after a failure. | P6-07 and P6-19 B sign "before Confirm"; OA-9 A is the owner's rule after a failure on Send; #396's reopening condition (an owner answer) is met. | No wait (the first draft); a wait on every operation (outline B). |
| D9 | A default-entrypoint row stays as today; the comment on #395 says its figure waits on the same simulation. | No estimate exists. | A new estimate path. |
| D10 | One live scenario through new playground fee inputs: the row and the node's admission. Unit pins prove the confirm build carries the priority. | I-1; a read-back of the submitted settings races mining (final pass F2). | Reading the transaction back (Codex C7; not deterministic); a CDP tap on the worker (Chrome-only, new harness). |
| D11 | The stash refuses an app priority, as it refuses an app cap. | One condition beside an existing one. | Extending `reuseCapRule` (Codex C6). |
| D12 | A confirm-time rebuild above the shown figure is a known limit, filed at close-out. | Pre-existing on every rebuilt path; binding needs a new approval contract. | Binding now (Codex C5). |
| D13 (orch) | #396 is reopened for the case D8 covers (an app-set cap or priority); an operation whose app set nothing stays its known limit. The PR comments on #396 and says `Refs #396`; the arc neither reopens nor closes it. | The Confirm wait meets #396's reopening condition (an owner answer: P6-07, P6-19 B). | Closing #396 from the PR. |
| D14 (orch) | D12's known limit is filed at close-out as a closed `known-limit` issue in the five-section form, after a dedupe search, and named on the Outcome's `Known limits:` line. | The proportion rule's home for a known limit. | A line in the plan only. |
| D15 (orch) | #395 gets a comment: the default-entrypoint row's figure waits on the same simulation (D9). | #395 stays its known limit. | A new estimate path. |
| D16 (orch) | Pins move to the values the plan predicts, never loosen; a pin the plan did not predict is recorded in `lessons/phase-1.md` and here. `DottedTerm.scan.test.ts` and the glossary tests stay untouched unless OA-1 is answered. | The owner's standing instruction. | Deleting or loosening a pin. |
| D17 (orch) | Seam with `send-followups-1`: merge `origin/dev` before the final gates; `FeeCostReadout.vue` is untouched unless OA-2 is answered A. | That lane edits the fee card, the Send amount card and the USD basis helpers. | Editing the readout now. |
| D18 | `finalizeGasLimits` keeps an embedded payment's request cap in every case, so `fee-structural-parity.test.ts`'s embedded app-cap pin now feeds the request as `applyEmbeddedFpcGasCap` leaves it (same expected cap). | Phase 1 step 3; the app's cap reaching the request is pinned by `embedded-fpc-cap.test.ts`. The plan's pin list missed this file. | Keeping a second embedded-cap derivation at finalize. |
| D19 | Fixtures carry the app's fee settings as decimal strings, not `0x` hex. | The wallet-sdk's `jsonStringify` writes each bigint as a decimal string; the NO_FROM fingerprint's JSON round-trip refuses a `GasFees` instance. | `0x` hex (the plan's wording). |

## Audit verdicts

### Round 1 (2026-10-14)

**Codex** (`gpt-6.1-sol`, high, session `01a13aaf`): **reject** (blocking C1 to C3).
- C1 high, Confirm before the figure: **accepted** (D8).
- C2 high, signed work withheld: **accepted** for the priority (D2); **rejected** for C's definition: the lane brief orders the ask, and a scan exception weakens a gate (D7).
- C3 medium, I-2 underdetermined: **rejected**; #411's own fix text and the near-zero headroom on the app's path settle it (I-2, D3). The arithmetic is stated in OWNER-ASKS.
- C4 medium, the shown priority is an allowance: **accepted** as wording (the table's note, Fact 4).
- C5 high, a rebuild can exceed the figure: **known limit** (D12): pre-existing, and the fix is a new approval contract.
- C6 medium, reuse under the priority: **accepted**, by refusing the stash (D11).
- C7 medium, the e2e does not prove the submitted priority: **accepted**, then revised after the final pass (D10): unit pins prove the confirm build's priority; the e2e proves admission.

**Opus Plan agent**: **conditional approve**.
- 1 high, the PFJ raise before Confirm: **accepted** (D8); only the failed-estimate case stays an ask (OA-3).
- 2 medium, OA-2 kept the pre-decision behaviour: **accepted** (D2). Its "sponsors keep zero priority" is **rejected**: a `sponsor_unconditionally` row gives an app no new capability.
- 3 medium, the embedded `fjwc` route: **accepted** (the payer table, Phase 1 pins, the wait).
- 4 medium, e2e commands: **accepted** (Phases 4 and 5).
- 5 low, reuse `tx-sendTx-feePayer`: **rejected**; its send sets no kernel fee payer (closed lane, `lessons/phase-2.md:43`), so it cannot prove admission.
- 6 low, outline-B reasons: **accepted** (Alternatives). 7 low, cite #411 for I-2: **accepted**. 8 low, two `app` rules: **accepted** (Phase 1 step 3). 9 low, a cheap-looking app cap: **accepted** (Security).

### Final fresh Codex pass (2026-10-14)

**Codex** (`gpt-6.1-sol`, high, new session `01a13ac1`): **conditional approve** (conditions: profile-path parity; a deterministic e2e read-back). D3, D7, D11 and D12 re-examined and held.
- F1 medium, the profile path builds with zero priority while the cap helper adds q: **accepted** (Phase 1 step 4, a parity test).
- F2 medium, `getTxByHash` serves only pending transactions, so a read-back races mining: **accepted**; the read-back is dropped and the confirm build's priority is a unit pin (D10). A worker network tap would be a new, Chrome-only harness.
- F3 low, OA-2 and OA-3 defaults follow the signed text: **accepted**; OWNER-ASKS marks them as defaults the owner answers only to change.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard at d3dc4415. Plan-specific values:

- **Step 1** is absent (`code_review: off`).
- **Step 2, the loop.** Once, over the whole diff from d3dc4415, after Phase 5 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. Send the diff, this plan, the ledger, the adversarial ask and the README's two verbatim rules. Log each round in `lessons/phase-5.md` and under Audit verdicts. Hard stop after three rounds.
- **Step 3, delivery.** As § Delivery; then `gh pr checks <n> --watch`.
- **Step 4, close-out.** Slug `fees-and-sponsors-2`, trunk `dev`. Merge `origin/dev` first and read `index.md` and `lessons.md`. File D12's known limit (dedupe first). Comment on #395, and on #411 if any part waits. `lessons.md` is at its budget: promote nothing unless a retirement pays for it.
- **Step 5, teardown.** Once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/fees-and-sponsors-2/plan.md` succeeds: `agent-worktree done fees-and-sponsors-2 --merged`. A `/loop` session checks every firing; a `/goal` session arms one background wait after its report.
- **Approval boundaries.** Persistence, a binding of the figure to approval, words on the wallet-chosen readout and a glossary entry are the owner's; a review round that needs one stops.

## Seeds

Draft; the orchestrator drives this lane and runs neither.

```
/goal Every phase of implementations-plan/fees-and-sponsors-2/plan.md is marked ✓, each backed by its validation gate reported passing in the transcript, with LESSONS_FILE=implementations-plan/fees-and-sponsors-2/lessons/phase-N.md printed per phase; /code-review was NOT run; the Codex loop converged (a resumed gpt-6.1-sol pass reporting no new material finding, quoted); one PR against dev exists, opened after the loop, carrying the close-out's archive move (`git show --stat` in the transcript); `bun run test:all` and `bun run lint` exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/fees-and-sponsors-2 forward per its plan.md (read plan.md and lessons/ first; if the plan path is gone, check `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/fees-and-sponsors-2/plan.md` and tear down with `agent-worktree done fees-and-sponsors-2 --merged`, or babysit the PR). Pick the next pending phase, run its gate, mark ✓, log lessons. Decide routine calls with /codex high (gpt-6.1-sol); anything in OWNER-ASKS stays the owner's. After Phase 5: the Codex loop, delivery, close-out, then report and stop.
```
