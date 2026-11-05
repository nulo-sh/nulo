---
plan: e2e-flakes-3
tier: light
status: panel-approved
issues: "#1667 (arc 1, phase 1); #1590 (arc 1, phase 2)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) and its resume; one Opus Plan leg; one fresh final Codex pass
base: origin/dev at 4b250dfe4
trunk: dev
post_implementation_hardening: not scheduled
---

# e2e-flakes-3: count the setup tab through `chrome.tabs`; price simulations on the predicted fee

One arc, one PR against `dev`, two phases. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). CI evidence (runs, jobs, refusal times), consults and local runs: [lessons/phase-0.md](lessons/phase-0.md).

## Root causes

**#1667.** Initial conditions: Firefox smoke, `onboarding-tab.test.ts`'s last test. Actions, in order: the panel's Go to the tab opens the setup tab (`openOrFocusOnboardingTab`); `trackedTab` reads the stored tab active through `chrome.tabs`; `oneSetupTab` (`:373-379`) counts Puppeteer `page` targets whose URL holds `src/onboarding/index.html`. Invariant broken: the count reads a channel that can lose the tab for good. Firefox 158's BiDi announces a tab only through a context it sees ready (`#onContextAttached` drops a `replace`, an `extension` remote type at attach, and a context discarded before its window global), and the shim gives Puppeteer an add-on page's URL only from a commit on a context it saw announced (`bidi-attach.ts:81-105`). Consequence: `PollTimeoutError … last: 0` on a required gate, while the stored tab existed and was active. **Label:** the spec's dependency on that channel is **demonstrated**: with the shim withholding the setup tab's BiDi events, the spec fails with CI's exact message, and the `chrome.tabs` count passes (control, lessons/phase-0.md). What lost the tab on CI is **unverified**: it failed all three fresh-browser attempts in 3 jobs and never in 16 local runs, so a condition of the job, not a per-attempt race. Flake ledger row 36 named this dependency, "no failure seen".

**#1590.** Initial conditions: network shard 2/5; a test mints with the test wallet, then imports the token in the popup. Actions: Import → `addToken` → `fetchTokenMetadata` → `batchedViewSimulation` simulates name, symbol and decimals on the node under `completeFeeOptions(…forEstimation)`, whose default cap is `getCurrentMinFees() × 1.5` (`fee-options.ts:65`). The node prices the next block (`prepareNextBlock`): mid-checkpoint at the fee its first block froze, at a boundary at a cached L1 price, while `getCurrentMinFees` is the fee provider's L1-forward entry (F7), which a frozen fee can sit more than 1.5× above. `computeEffectiveGasFees` refuses a cap below the simulated fee even with `skipFeeEnforcement` (F1), logging `Failed to process tx …: maxFeesPerGas.feePerL2Gas must be greater…`. The fast arm's refusal reruns through `pxe.simulateTx`, built by `nulo-account.buildTxExecutionRequest` under the same default; the second refusal fails `addToken`, and no toast fires. Invariant broken: a simulation's cap must cover the block the node simulates. The committed caps already price off `predictedWorstMinFees` (`fee/fee-cap.ts:37`), and upstream `BaseWallet.completeFeeOptions` does for simulations too (`getMinFees(Limit)` × 1.5, wallet-sdk 6.0.0 `base_wallet.js:180,232-247`). Consequence: whenever the simulated fee sits more than 1.5× above the current minimum, the node refuses a token add, a balance projection, a gas-balance read, an app's `simulateTx` with no fee, and a send's first estimate (`fee-juice-strategy.ts:37-39`, the FPC two-pass's first pass); on CI, a red required gate. **Label:** **demonstrated**. A probe that serves the wallet a quarter of the node's current fee reproduces it on both browsers (node refusals, no toast in 60 s) and passes with the fix on Chrome; Firefox's green is owed in phase 2; CI shows the same two refusals 1.0 s and 2.1 s after the click in 5 of 5 failures, one in 2 of 12 sampled green jobs (the rerun recovered), none in 10. That CI's gap was a frozen fee is **inferred** (I2).

## Outcome & Quality Bar

- **For whom:** a person adding a token or sending while fees move, and every PR author whose required gate reds on a wallet that behaved.
- **Excellent:** no simulation is refused for a fee the node already quotes; both specs stay as they are and go green at retry 0 on both browsers; the onboarding spec counts the tab through the browser's own tab list, with no browser branch.

## Architecture & Implementation

**Phase 1 (#1667), test only.** `apps/extension/tests/e2e/onboarding-tab.test.ts`: `oneSetupTab` counts, from `control`, the tabs of `chrome.tabs.query({})` whose `url` starts with `chrome.runtime.getURL("src/onboarding/index.html")`, polled as today (same label, 10 s, 100 ms); its comment states why. Over-count is ruled out: the control page is `src/setup/…`, Chrome's popup `src/popup/…`, and the first-run tab is closed at launch. No driver change: both browsers answer `chrome.tabs` alike (F5). Flake ledger: new row 69; row 36's note points at it.

**Phase 2 (#1590), product.** `packages/aztec-runtime/src/account/fee-options.ts`: the default `maxFeesPerGas` becomes `(await predictedWorstMinFees(node)).mul(1 + MIN_FEE_PADDING)` (import from `../fee-juice`), and the module's two comments that name the current minimum say the predicted worst. `predictedWorstMinFees` falls back to `getCurrentMinFees()` on a node without the method or with no predicted slots, and rethrows any other error. Every committed cap is set later by `feeCapFor` or by the app (F6), so no committed or shown fee moves. Flake ledger: new row 70.

**Alternatives not taken.** Phase 1: `waitForNewTab` or a count by handle (handles carry no URL without a window switch, which moves the focus the spec asserts); a shim that invents a context Firefox never sent. Phase 2: a larger padding (a guess, not a bound); a cap set only in `batched-view-simulation.ts` (a collision with rpc-fallback-1, and the other callers stay exposed); a retry on the refusal (a retry over a cause); bounding the popup's balance wait (D5).

## Phases

### Phase 1 — #1667: the setup-tab count reads `chrome.tabs` ✓

1. Rewrite `oneSetupTab` as above; leave the rest of the test byte for byte.
2. Rerun the control once on Firefox, never committed: `bidi-attach.ts` drops every BiDi event naming `src/onboarding/index.html`; the new count passes.
3. Ledger row 69 in `.claude/skills/e2e-testing/SKILL.md` § 5; amend row 36's note.

**Validation gate.** `bun run lint`, `bun run typecheck:all`; then from `apps/extension`: `NULO_E2E_BROWSER=firefox bun run test:e2e -- tests/e2e/onboarding-tab.test.ts --retry=0` ten times, the same on Chrome five times. Pass: the control green, exit 0 on every run. The runs are regression checks: CI's trigger never reproduced locally, so the control is the proof. Runtimes in `lessons/phase-1.md`.

### Phase 2 — #1590: the default simulation cap is the predicted worst minimum ✓

1. Red at base, never committed: the probe `_probe-fee-rise.test.ts` under `tests/e2e/network/` redirects the local node (`interceptRpc`, `redirect`) to a loopback proxy that forwards every call and answers `aztec_getCurrentMinFees` with a quarter of the node's value; it imports the token as `token-add-auto-trust` does. Expect the node's refusals and no toast within 60 s, on each browser.
2. Change `fee-options.ts` as above; the probe passes on each browser, then is deleted.
3. `fee-options.test.ts`: one case, a node whose `getPredictedMinFees` worst slot is above its current minimum: the default cap is that worst × 1.5, and the call asked for `ManaUsageEstimate.Limit` (red at base: current × 1.5). The existing cases, whose fake node has no `getPredictedMinFees`, pin the fallback and the explicit cap; `fee-juice.test.ts` pins propagation and the per-component worst.
4. Ledger row 70.

**Validation gate.** `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`. Then from the root through `agent.sh`, proverless, retry 0 (`NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent …`, `NULO_E2E_BROWSER=firefox` for Firefox): `tests/e2e/network/token-add-auto-trust.test.ts tests/e2e/network/pin-to-home.test.ts` five times on each browser, then `--shard=2/5` once on each browser (the lane brief's bar; the shard cannot hit the trigger, the probe does). Pass: the probe red then green on both browsers, every run exit 0. Runtimes in `lessons/phase-2.md`.

## Security & Adversarial Considerations

- **Threat model.** The node is untrusted. A simulation's cap is a ceiling it never pays, and `predictedWorstMinFees` refuses a malformed reply (`checkedFees`); a hostile node can refuse a simulation by an absurd prediction, as it already could by refusing it. Committed caps are untouched (F6). The rpc-proxy already allows `getPredictedMinFees` (`infra/rpc-proxy/src/methods.ts:38`).
- **Validation-on simulations.** An app that passes `skipFeeEnforcement: false` (`view-executor.ts:359-360`, `fast-path.ts:244`) has the node also check the cap against the next-block fee (`aztec-node` `server.js:953`), which the old default fails in the same frozen-fee case, and the payer's balance against estimation limits × cap (`p2p` `gas_validator.js:61-79`; `GasSettings.forEstimation`, twice the processable L2 gas). That bar is not the one a send meets (finalized limits × `feeCapFor`'s cap, unchanged). A payer whose balance sits between the old bar and the new one is now refused, as under upstream `BaseWallet`; the app opted into the check.
- **Availability and cost.** A simulation now depends on `getPredictedMinFees`, and its error propagates (the fast arm demotes, the slow arm rethrows). On the node that error is a transport failure, which hits `getCurrentMinFees` alike: the head's failures are swallowed (`server.js:693-696`) and the fee provider's lookup never rejects once started (`fee_provider.js:95-128`). What is new is a provider that serves every method but this one. Every send the wallet prices already calls it (`feeCapFor`); a send whose app sets its own cap did not (`fee-cap.ts:36`), and its first build now does (`fee-strategy.ts:239-251` threads only the priority fee). On such a provider every wallet-priced send fails today, so the wallet does not support it: the app-capped case is a known limit, closed issue #1682 (README § Proportion). A cold boundary may wait up to 5 s (`QUOTE_MAX_WAIT_MS`), mostly overlapping the simulation's own unbounded wait on the same cache (`predict()`). No retry and no downgrade to the current fee (D6).
- **Least privilege, crypto, supply chain, logging:** no permission, workflow, key, dependency or log line changes; the manifest does not change.

## Assumptions

- **Facts.** F1: `computeEffectiveGasFees` asserts `maxFeesPerGas ≥ gasFees` per component (`@aztec-labs/stdlib` 6.0.0 `fees/transaction_fee.js:9-10`), called whatever `skipFeeEnforcement` says (`avm/avm.js:553`); the node rethrows a failed simulated tx (`node_public_calls_simulator.js:169-173`). F2: the only `node.sendTx` under `src/wallet` is `execution-coordinator.ts:320`; the import sends nothing. F3: `settleFastArm` reruns on any non-`SimulationError` (`batched-view-simulation.ts:397-416`). F4: `predictedWorstMinFees` is the committed caps' basis, unit-tested (`fee-juice.ts:33`, `fee-juice.test.ts`). F5: `chrome.tabs.query({})` from an extension page lists the `url` of the extension's own tabs and none for `about:blank`, with no `tabs` permission, on Firefox 158.0 and the suite's Chrome (recon.md). F6: every committed cap comes from `feeCapFor` after the simulation (`fee-strategy.ts:353-367`, `fpc-strategy.ts:187,253`) or is set before it for an embedded payment (`embedded-fpc-cap.ts:15`); `feeLimitOf` and the shown fee read the finalized request. F7: the node's `getPredictedMinFees` leads with the fee its public simulation charges the next block, from the same plan and boundary cache as `predict()` (`aztec-node` 6.0.0 `server.js:678-707`, `next_block/next_block_predictor.js:68-145`); the head is omitted when the node cannot price it within 5 s, and the quote and the simulation read the frontier separately, so it is the best quote available, not a guarantee. `getCurrentMinFees` is the fee provider's entry (`sequencer-client` `fee_provider.js:74-77`).
- **Inferences.** I1: CI's simulated fee exceeded the current minimum × 1.5 (the node's lines are cut at 200 characters before their values, `global-setup.ts:617`). I2: CI's gap was the frozen-fee case F7 names; a fee moving between quote and simulation by more than the pad is still refused, as upstream's is. I3: CI's #1667 trigger is one of the two BiDi gaps.
- **Asks.** None open (OWNER-ASKS.md).

## UI impact

None. Phase 1 is test code. Phase 2 changes no screen, copy or shown figure: a token add, a balance read or a send estimate that a fee gap refused now succeeds. Its costs are a simulation waiting up to 5 s at a cold boundary, the known limit of a provider that blocks `getPredictedMinFees`, and an app's opt-in balance check pricing on the predicted fee, as upstream's does; no wallet screen shows any of them (Security, D6).

## Decision ledger

- D1. #1667's count reads `chrome.tabs`, not the driver (Alternatives).
- D2. #1590 is fixed at `completeFeeOptions`, the one default every simulation caller shares, mirroring upstream (Alternatives).
- D3. The probe stays uncommitted: a committed spec would prove what the unit test proves, at about 35 s per browser.
- D4. No fixture diagnostic on the toast wait: the popup's generic error would not name the fee; the node's line did.
- D5. NewTokenPopup's balance wait has no bound before the first `onTokenBalanceAdded` (`NewTokenPopup.vue:116-130`). No trace ties it to these failures, and bounding it changes when the toast shows: left out: closed `known-limit` issue #1681.
- D6. A failing `getPredictedMinFees` is not downgraded to `getCurrentMinFees`: that reopens the under-priced cap, and the committed path refuses the same way. Not an owner ask: no wallet screen, copy or figure changes, and each cost is either the send path's, a known limit, or upstream's behaviour under an app's opt-in (Audit verdicts).
- D8. Phase 1 also updates `tests/e2e/FIREFOX.md`'s new-tab row, which named this spec's `targets()` wait "no failure seen" (the tree won over the change map).
- D7. Two comments in `services/execution/` go stale (`view-executor.ts:337-338` names the old default; `batched-view-simulation.ts:364-365` says "byte-for-byte", while Nulo takes each fee's maximum and upstream the worst-L2 entry). That directory belongs to rpc-fallback-1 until its arc 3 lands: #1683 corrects both.

## Audit verdicts

**Round 1, Codex (gpt-6.1-sol, high): approve-with-changes.** (1) Major: the view's new failure and latency. Accepted as disclosure (Security, UI impact, D6); its call for an owner decision rejected: no screen changes, the node's error surface is a transport failure that hit the old call alike, and every send already depends on the method. (2) F7 overstated: accepted, qualified. (3) The probe gate contradicted its escape clause: accepted; the probe ran red and green, and the gate requires it. (4) #1667 prose overstated: accepted. (5) PR title 96 characters: accepted.

**Round 1, Opus Plan leg: approve-with-changes.** Verified F1 and F6 independently. (1) F5 against `fixtures/extension.ts:316`: F5 recorded with its API and builds; that comment concerns `chrome.windows`, untouched. (2) A control for #1667: accepted and run. (3) The consequence reaches send estimates and `simulateTx`: accepted. (4) The validation-on balance check: accepted. (5) The quote wait mostly overlaps: accepted. (6) Two stale comments in a collision directory: D7. (7) Title: accepted. (8) D5's home: accepted. (9) Drop the local shard runs: rejected, the lane brief requires them. (10) Tests enough: noted.

**Round 2, Codex (resumed): approve.** No remaining material finding; the owner-approval requirement withdrawn on the revised disclosure; the probe's Firefox green is owed in phase 2.

**Final pass, fresh Codex session: approve-with-changes.** (1) Major: "every send already calls it" is false for an app-capped send, and a validation-on simulation's balance bar moves; it asked for the owner's decision. The fact accepted and corrected (Security); the owner ask rejected: the provider case is a condition the wallet does not support (known limit), and the balance bar is an app's opt-in check that upstream prices the same way, behind which the node already refused the old default in the frozen-fee case. (2) The probe's green overstated: accepted. (3) Run ids not preserved: accepted, now in lessons/phase-0.md.

**Final pass, resumed: approve.** No remaining material finding; the owner-approval requirement withdrawn. It noted that future-slot predictions can exceed an affordable next-block fee (`fee_predictor.js:82-91`), so the balance band is wider than the frozen-fee case; Security already discloses the band.

**Fix loop, round 1: Codex approve-with-changes; Opus diff review approve-with-changes.** Codex: ledger row 70 stated the inferred frozen-fee trigger as fact; qualified. Opus: (1) the same, and "as upstream prices it" loosened to "like upstream": accepted. (2) Row 69's rule too broad, and its unverified gap unnamed: accepted. (3) Fix D7's comments here: rejected, the lane's collision rule forbids that directory outright. (4) A history sentence in `fee-options.ts`'s module doc: removed. (5) Tie the count to the tracked tab id: rejected, a pre-existing gap the fix leaves as it was. (6) Row 70 lands only after phase 2's gate: done so.

**Fix loop, round 2 (Codex, resumed): approve.** No remaining finding; it agreed with both rejections.

**Fix loop, round 3 (Codex, resumed with the README's two review rules and adversarial ask verbatim, which rounds 1 and 2 had left out): approve-with-changes, two comment nits.** `MIN_FEE_PADDING`'s doc restated the formula, and the fallback test's comment restated its arithmetic: both trimmed. No correctness or security finding; the loop converged.

## Delivery

One PR against `dev` from `e2e-flakes-3-a1` (off `origin/dev`, carrying this plan's commit), opened ready after the local gates and the Codex fix loop: `fix(fees): price simulations on the predicted fee; count setup tabs via chrome.tabs` (83 characters). Body: what and why per phase, the validation runs with outcomes and runtimes, each browser's suite wall-clock before and after (no scenario added), `Closes #1667`, `Closes #1590`. No labels at creation; add `e2e:extension-smoke` only if the path filter skips smoke. Merge `origin/dev` before opening. Parallel lanes: none.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at 4b250dfe4 is the contract. Plan-specific: no `/code-review` (`code_review: off`); one Opus review of the final diff alongside the Codex loop's first round, which runs over the whole diff after phase 2 is green (`~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`), hard stop at three rounds. Close-out, as the PR's final commits: two closed `known-limit` issues, #1681 (D5; reopens on a popup stuck loading a balance) and #1682 (the provider that blocks `getPredictedMinFees`; reopens when a supported network's provider is seen doing so), and the open #1683 (D7), each deduped first; the plan archived and its index line removed.

## Seeds

- `/goal` Both phases marked ✓ in implementations-plan/e2e-flakes-3/plan.md, each gate's runs reported green in the transcript with `LESSONS_FILE=implementations-plan/e2e-flakes-3/lessons/phase-N.md` printed; the Codex loop converged (a resumed pass with no new material finding quoted); the PR exists on `dev` with the close-out commits; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/e2e-flakes-3 per its plan.md and the README's Post-implementation standard; never idle; decide with `/codex high` on gpt-6.1-sol; never merge.
