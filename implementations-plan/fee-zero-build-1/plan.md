---
plan: fee-zero-build-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 3017f1928
status: approved (orchestrator proportion: no plan audit round)
---

# fee-zero-build-1: two balance reads that disagree are read again before a refusal (S1)

#1802: on 1.2.0 Mainnet the approval window's fee card read Available 38.1638 FJ while its warning said "This send can cost up to ~4.160516 FJ ($0.053). You have 0 FJ." and Confirm was refused. The two figures are two reads of one balance that nothing compares: Available is `GasBalanceReader`'s five-minute cache from `balance_of_public` (a view simulation); the refusal is the estimate's one fresh `getPublicStorageAt("latest")` at the active endpoint (`probeOwnFeeJuice`), with no block pin. Behind a keyless pool, a lagging upstream answers an unwritten slot as 0. Decision page 152 was signed on 2026-11-16 at 14:02 UTC:

- **P152-02 = S1** (no note). The item: "The fee card when the worker's fresh read says 0 FJ and the card says 38.1638 FJ, four ways: today's refusal (S0), one recheck then a warning that refuses nothing (S1), a second probe on another endpoint (S2), or the words alone (S3)". The option as the page put it: "Reconcile. When the probe reads short but the card's last figure covers the fee, the worker reads both once more, concurrently (one forced reader read and one more probe), inside the estimate. Both cover: no shortfall. Both short: today's refusal. Still disagreeing: the shortfall is marked unconfirmed, the card warns with both figures and refuses nothing, Confirm is on, and the node decides at submission. The sentence to sign: "Your balance couldn't be confirmed: one check found 38.1638 FJ and a fresh one found 0 FJ. If the network refuses this send, nothing is charged." Its last clause is verified against the node's fee-payer validator before it ships, or dropped. Agreed on zero, the card takes the fresh 0 once, so Available reads 0 FJ and today's "You have no Fee Juice yet" nudge replaces the cost rows: today's zero rule withdraws the Fee Juice settings, and keeping a sentence there would change that rule, which no shape asked for. One recheck per estimate, no timer, no stored state, one optional wire field. The residual risk: Confirm on with a true 0 costs one proof and a refusal at submission, and the send rides the same pool, so a lagging upstream can refuse a funded account there too. Prototype diff 20 files, +244/−17, tests included."

One arc, one PR against `dev`, `Closes #1802`, no `Part of` line. #1749 (a pool's lagging upstream, a closed known limit whose reopen condition #1802 meets) and #1607 (the pool's upstreams behind the PXE's anchor, closed) are the likely cause; the PR cites them and reopens neither. The PR changes what users see, so it does not land on its own. Recon: [`recon.md`](recon.md). Owner asks: none ([`OWNER-ASKS.md`](OWNER-ASKS.md)).

Proportion (lane brief): a prototype with its own tests made a build. No plan audit round; one Codex pass over the plan and the net diff after the build; no Opus review.

## The clause, verified

"If the network refuses this send, nothing is charged" **holds** (high confidence), read in the node packages of `@aztec-labs` 6.0.0, the pinned line (the sandbox toolchain's `aztec-node`, `p2p` and `simulator`; the wallet's `node_modules` carries only `stdlib`):
- `aztec-node/dest/aztec-node/server.js`: `sendTx` runs `isValidTx(tx)` with fee enforcement on and throws `Invalid tx: <reason>` before `p2pClient.sendTx`, so a refused transaction never enters the pool.
- `p2p/dest/msg_validators/tx_validator/factory.js`: `createTxValidatorForAcceptingTxsOverRPC` includes `GasTxValidator` unless `skipFeeEnforcement`; `createTxValidatorForBlockBuilding` includes it again. `gas_validator.js`: `FeePayerBalanceValidator` reads the payer's Fee Juice slot and refuses "Insufficient fee payer balance" when it plus any setup-phase claim is below the fee limit.
- `simulator/dest/public/public_processor/public_processor.js`: a transaction failing the block builder's pre-process validator goes to `failed`, never into the block; a private-only transaction's fee is a public-data write (`performFeePaymentPublicDataWrite`) that throws on a short balance, and the processor reverts the transaction's checkpoint. The fee is a state write inside a block, so a transaction in no block pays nothing.

The sentence ships as signed.

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | Cherry-pick the prototype's `36b5c1c02` (S0 fixture seams) and `090f5b3b9` (S1) onto the arc branch; resolve `FeeSettingsCard.vue` by hand (#1813 moved one line there). | It is what the owner saw rendered and signed. |
| D2 | `refusesShortfall(short)` in `packages/wallet-bridge/src/fee.ts` is the only test of a shortfall anywhere a refusal is decided: the window's `isShortEstimate`, Send's `feeAllowsSend`, Send's `submitLabel` (`feeRefused`, "Fix the fee") and `useWalletTxEstimates`' `short`. `git grep feeJuiceShortfall` finds no other reader that refuses. | One rule, so no path still refuses an unconfirmed shortfall and none allows a confirmed one. |
| D3 | The probe and its recheck become one helper in `sponsor-funding.ts` (`ownFeeJuiceShortfall(built, deps, log)`: `probeOwnFeeJuice`, then `recheckShortfall` with the reader's peek, one forced reader read and one more probe), which both executors call. | The prototype pasted the same eight lines into `dapp-send-executor.ts` and `transfer-executor.ts`; one copy cannot drift. |
| D4 | Bounds as prototyped: at most one recheck per estimate, only when the probe reads short and the reader's last figure (a peek, never a fetch) covers the fee; a failed fresh reader read counts as no confirmation, never as funds (the refusal stands while the probe still reads short); a covering second probe clears the shortfall whatever the reader read, since it reads the slot the node's fee-payer check reads. The probe is bounded by `SPONSOR_PROBE_TIMEOUT_MS`; the reader read by its transport and its one retry; the estimate's `throwIfAborted` after both discards a cancelled one. No timer, no loop, no stored state, no block pin. | The page's terms. A pinned recheck would fail on a lagging upstream (unknown block) rather than read 0, and a failed probe already warns of nothing. |
| D5 | The card's one-time re-read (a confirmed shortfall against a card figure that covers the fee; once per estimate object, a `WeakSet`) asks the store for the gas leg **without** forcing, then `useFeeSnapshot.refreshGas()`. | Deviation from the prototype, which forced it: the worker's recheck has just written its fresh read into the reader's cache, so an unforced read returns exactly the figure the worker agreed on, with no third network read that could land on another upstream and reopen the disagreement. A read the recheck could not make was cached already stale (`GasBalanceReader` caches a failed leg with `fetchedAt: 0`), so the unforced read then fetches. No visible change. |
| D6 | The sentence names `lastRead` (the recheck's fresh reader figure, `formatGasBalance`, four decimals, as Available is drawn) and the probe's `balance` (the refusal's six-decimal truncation). | As signed. Both reader figures are the same reader's reads minutes apart and Fee Juice falls only by fees, so they match Available in practice; the next balance refresh aligns any residue. |
| D7 | The fixture seams stay, armed-build-only: `fixtureGas` (balances store), `footerLive` and `gasAfterEstimate` (window). The fixtures become `fee-zero-disputed`, `fee-zero-agreed` and a new `fee-zero-resolved` (an own-Fee-Juice estimate with no shortfall); the S0 `fee-zero` goes, since S1 never shows its state. `execute-fixture.ts` gains no runtime import (type-only imports only, never the `@nulo/wallet-bridge` barrel); `src/e2e/config.test.ts`'s armed-gate test is timed before and after. | The agreed-zero frame needs a balance the sandbox cannot produce (the reader's simulation would have to read 0 while the card still covers), and the captures must match the signed frames' figures. Release bundles drop the module (`_build-extension.yml`'s `nulo:e2e:execute-fixture` grep). |
| D8 | The relay gains a `result` fault: it forwards the request and, in the upstream's answer, replaces the result of each entry the rule names (method, and `carrying` within that entry), each under its own id. | The node client batches calls made in one tick, so a probe can share a request with other calls; answering the whole body locally would break those, and a fixed body breaks the id check. |
| D9 | One network scenario, a new file `tests/e2e/network/fee-shortfall-recheck.test.ts`, on Send rather than a dApp's window: `feeJuiceImportedExtension`, the active network's primary rewritten onto a relay (`rewriteActiveNetwork`), a `result` rule zeroing `getPublicStorageAt` carrying the Fee Juice address; public → public, amount 1, Public Fee Juice; assert `fee-juice-unconfirmed` shows and `send-submit` is enabled; `relay.clear()`, change the amount, assert the next estimate shows neither row. No submission, no proof gate, any prover mode. | The distinct failure mode: the worker's probe and the card's read diverging across the real transport, which no unit or composition layer can show (both reads are faked there). Send drives the same worker helper (D3) as the window; a playground request would add a dApp round trip and a window for nothing the rule doesn't already prove (the window's gate is pinned in its unit test). Kept out of `rpc-failover-send.test.ts`, which is proverless-only and spends a mint per run. |
| D11 | The recheck's second probe returns the balance (`bigint`, or `undefined` when the read fails), and a failed second probe keeps the first probe's figure. | Deviation from the prototype, found in the build: `probeOwnFeeJuice` answers `undefined` both when the slot covers and when the read fails, so the prototype cleared a refusal two agreeing reads had confirmed whenever its second probe timed out (first probe 0, fresh reader read 0, second probe fails → no warning, Confirm on). Path traced in code, consequence a proof and a node refusal on a balance two reads put at zero; the fix is local to `recheckShortfall`, T1 gains the case. |
| D12 | `approve()` returns when no request stands behind the window. | The `footerLive` seam turns a fixture's Confirm on, which would have sent `approveInteraction(undefined)`; the guard keeps a fixture answering nothing, as `reject()` already does. T6 (`index.test.ts`): a `fee-zero-disputed` fixture shows Confirm on and a press sends nothing; red without the guard. |
| D13 | `scripts/type-roles/identifier-sites.expected.json`: `execute_window`'s digest of `execute-fixture.ts` re-pinned. | Re-attested: the fixture module still builds only `aztec_sendTx` operations (`operations: [operation]`, evidence line unchanged), so the branches it pins unreachable stay unreachable. |
| D10 | No accessibility call. | The new row reuses the shortfall row's markup (icon, `body` text, `secondary`), no control, no focus change. |

## UI impact

- **Execute window and Send, the fee card's warning row** (`FeeSettingsCard.vue`), when the account pays from its own public Fee Juice and the two reads disagree after the recheck: before, "This send can cost up to ~4.160516 FJ ($0.053). You have 0 FJ." and Confirm (Review send) off; after, a row `fee-juice-unconfirmed` reading "Your balance couldn't be confirmed: one check found 38.1638 FJ and a fresh one found 0 FJ. If the network refuses this send, nothing is charged." and Confirm on. Agreed on zero: Available reads 0 FJ and today's "You have no Fee Juice yet" nudge replaces the cost rows, Confirm off. Both reads cover after the recheck: no warning, Confirm on. Sign-off, **P152-02 = S1** (2026-11-16 14:02 UTC), quoted in full above.
- Nothing else: no other sentence, row, role, testid, tooltip, glossary term or stored key.

## Security & Adversarial Considerations

- **Who decides.** An unconfirmed shortfall moves the refusal from the wallet to the node, which refuses an unfunded transaction before it enters a block (§ The clause). Worst case of a wrong allow: one proof's wait and a refusal that charges nothing.
- **A hostile or lagging endpoint** can still answer 0 to both probes (confirmed refusal, today's behaviour) or a covering figure to both (no shortfall; the node refuses at submission, as today when a probe fails). It gains no new power: it already answers every read.
- **Inputs.** `lastRead` and `balance` are the worker's own reads, never dApp data; the card parses them as today (`formatGasBalance`, `BigInt` on the worker's strings). No new log line carries a balance (the card's debug line logs only `{ error }`); no permission, dependency or stored shape changes (`snapshot.json` untouched).
- **Load.** The recheck adds one probe and one reader read only on the disagreement path, once per user-triggered, debounced, cancelling estimate.

## Assumptions

**Facts** (checked at `3017f1928`): the four refusing readers of D2; `TransferFeeEstimate` crosses the popup boundary as JSON with no schema that would strip `lastRead`; `GasBalanceReader.get(…, true)` writes its read to the cache unless a leg failed; since `612d2809d` only `FeeSettingsCard.vue` moved among the prototype's files; #1749 and #1607 are closed (the lane brief says "stay open").

**Asks.** None.

## Phase 1: the worker, the rule, the card, the window and Send's gates, with their tests

1. Branch `fee-zero-build-1-a1` off `origin/dev` carrying the plan commit; cherry-pick D1; resolve.
2. `packages/wallet-bridge/src/fee.ts`: `FeeJuiceShortfall.lastRead?`, `refusesShortfall`.
3. `apps/extension/src/wallet/services/execution/`: `sponsor-funding.ts` (`ShortfallRecheck`, `recheckShortfall`, `ownFeeJuiceShortfall`, D3); `shared-send-deps.ts` (`peekPublicFeeJuice`, `rereadPublicFeeJuice`); `service.ts` (both from `this.gasBalances`); `dapp-send-executor.ts`, `transfer-executor.ts` (call the helper); the five test-deps factories gain the two deps.
4. `apps/extension/src/composables/useFeeSnapshot.ts` (`refreshGas`), `useWalletTxEstimates.ts`; `popup/pages/send-fee-gate.ts`, `send.vue`; `popup/windows/execute/index.vue` (`isShortEstimate`, fixture seams); `popup/components/modules/send/FeeSettingsCard.vue` (the unconfirmed row, the one-time unforced re-read, D5); `stores/balances.store.ts`, `src/e2e/execute-fixture{,-gate}.ts` (D7).
5. Tests (wire-shaped: balances raw 18-decimal base-unit strings, addresses `0x` + 64 hex):
   - T1 `sponsor-funding.test.ts` › `recheckShortfall`, the prototype's four cases: no recheck when the reader is short or unread; still disagreeing → `lastRead` after exactly one recheck; agreement keeps the refusal, or clears it when both cover; a failed fresh read never counts as funds.
   - T2 `FeeSettingsCard.test.ts`: disagreeing reads warn with the whole sentence and draw no refusal row; a confirmed zero against a covering figure re-reads the card exactly once across a repeated estimate, unforced, and Available becomes 0.
   - T3 `execute/index.test.ts`, beside "an estimate whose payer is the account, read short…": the same estimate carrying `lastRead` leaves Confirm enabled and approve sends one approval; the existing case stays the confirmed control.
   - T4 a new `popup/pages/send-fee-gate.test.ts` (none exists): an unconfirmed shortfall allows the send, a confirmed one refuses.
   - T5 `packages/wallet-bridge/src/fee.test.ts`: `refusesShortfall` on undefined, confirmed, unconfirmed.

**Validation gate** (retry 0, one at a time, from the worktree root): `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd apps/extension test:components`; `bun run --cwd packages/wallet-bridge test`; `bun run check:plans` after staging. Then Chrome, on the armed smoke build: `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_EXECUTE_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/send-fee-privacy.test.ts tests/e2e/send-keyboard.test.ts --retry=0`. The armed-gate test in `src/e2e/config.test.ts` timed at the base and the head (three runs each). Pass: every command exits 0; T1–T5 fail on the base and pass on the head; every other assertion passes unedited, or an edit is recorded here.

## Phase 2: the relay fault and the network scenario

1. `apps/extension/tests/e2e/fixtures/rpc-relay.ts`: the `result` fault (D8); `take` returns the matched rule so the patch knows which entries to answer.
2. `apps/extension/tests/e2e/network/fee-shortfall-recheck.test.ts` (D9), with a `shotSend(page, "send-fee-unconfirmed", "fee-settings-card")` (a no-op without `NULO_E2E_SHOT_DIR`).

**Validation gate** (retry 0, `agent.sh` claims ports from `~/.agents/ports.md`; the 10-minute stall watchdog stays): from the root, `NULO_E2E_BROWSER=chrome NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-shortfall-recheck.test.ts tests/e2e/network/fee-sponsor-funding.test.ts tests/e2e/network/fee-methods.test.ts tests/e2e/network/tx-sendTx-default.test.ts` (prover-ON); then `NULO_E2E_PROVERLESS=1` with `rpc-failover-send.test.ts`; then Firefox (`NULO_E2E_BROWSER=firefox`, proverless) with `fee-shortfall-recheck.test.ts rpc-failover-send.test.ts`. Pass: every run exits 0; the new scenario's duration recorded per browser.

**E2E budget.** One scenario added. Estimate 90 s per browser on a warm sandbox plus its fixture's setup; measured figures and each browser's network suite wall-clock before and after (CI's job envelopes, first-attempt successful jobs) go in the PR body.

## Phase 3: captures and the PR

1. Copy fee-zero-2's scratch capture spec into `tests/e2e/network/` (renamed `zz-fzb1-capture.test.ts`), run it once through `agent.sh` with `VITE_NULO_E2E_EXECUTE_FIXTURE=1` and `NULO_E2E_SHOT_DIR` at 400 × 800: `fzb1-disagree` (`fee-zero-disputed`), `fzb1-agreed-zero` (`fee-zero-agreed`), `fzb1-resolved` (`fee-zero-resolved`); and from Phase 2's Chrome run with `NULO_E2E_SHOT_DIR`, `send-fee-unconfirmed` copied as `fzb1-send-disagree`. Each `-light` and `-dark`, into the lane's scratch `shots/` with `captions.json`. Delete the copy.
2. Commit the disagree pair under `pr-captures/fee-zero-build-1/`; remove it in the next commit.
3. Post-implementation, then the PR.

**Validation gate.** `git status` clean after the copy is deleted; `git grep -n fzb1 -- apps` empty; all eight frames exist; `bun run check:plans` exits 0 after staging.

## Delivery

One PR from `fee-zero-build-1-a1` to `dev`, opened ready, no label at creation (add `e2e:extension-network` afterwards only if its path filter skips the lane). Title (84 characters): `fix(fee): two balance reads that disagree are read again, then warn without refusing`. The body quotes P152-02 verbatim as the sign-off, embeds the disagree pair from `pr-captures/fee-zero-build-1/` at the commit that adds it, states the clause verification, the gates with outcomes, the e2e budget line, cites #1749 and #1607 as the likely cause, and carries `Closes #1802`. Merging is the orchestrator's, on the owner's approve.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `3017f1928`. Plan-specific values:
- Step 1: `code_review: off`, so absent.
- Step 2, bounded work: after Phase 2 is green, ONE `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` over the plan and `origin/dev...HEAD`, asked adversarially about the recheck's bound, D2's four call sites, the card's one-time re-read and the relay's id echo. Rerun only the gates a fix touches; a second round only if the first says anything but approve (hard stop at three). No Opus review.
- Step 3: `gh pr create`; `gh pr checks <n> --watch` once.
- Step 4, close-out in the same PR's final commits after merging `origin/dev` in: Outcome, lessons, `STATUS.md` deleted, `git mv` into `archive/` in its own commit, the index line to `archive/index.md`.
- Step 5: teardown is the orchestrator's.

## Seeds (not run; the orchestrator owns the ELI5)

- `/goal`: Build fee-zero-build-1 per `implementations-plan/fee-zero-build-1/plan.md`: Phases 1–2 green, one Codex pass, captures, PR open; stop before merge.
- `/loop`: Each firing, read `STATUS.md`, run the next unfinished step of `plan.md`, record its gate, stop at the open PR.

## Audit verdicts

No plan audit round (lane brief, Proportion).

**Codex pass over the plan and the net diff** (gpt-6.1-sol, high, read-only, `origin/dev...829ed6239`), 2026-11-16: request changes.
- R1-1, rejected (both cases): "a covering second probe prematurely clears the shortfall" when the fresh reader read is short (case A) or fails (case B). The probe reads the payer's slot, the read the node's `FeePayerBalanceValidator` makes (§ The clause), so a covering second probe is the strongest admission evidence the wallet has: refusing on it (case B) is the wrong refusal of a funded account this plan exists to end, and warning on it (case A) would print the signed sentence with its figures inverted, a state the owner never saw. The invariant now reads in `recheckShortfall`'s comment and D4; T1 pins both cases as deliberate.
- R1-2, accepted: a `result` rule took a request it answered no entry of (its method present in one entry, its text in another), spending its `times` and its count. `matches` now takes such a rule only when `answers` holds for some entry; `scripts/e2e/rpc-relay.test.ts` gains the regression (red before the fix).
- R1-3, accepted: comments. `refusesShortfall`'s overstated "confirmed by agreeing reads" (an unrechecked shortfall refuses too); `ownFeeJuiceShortfall`'s narrating docblock deleted; the fixture constants keep only the rounding sentence (D13's digest re-pinned again).
- Its "looks fine": nothing on the four call sites, the card's one-time re-read or the fixture seams.
