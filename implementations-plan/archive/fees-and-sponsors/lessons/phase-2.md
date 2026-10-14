# Arc 2 build log

## Phase 2.1: per-profile fee picks (#91, 2026-10-13)

- Built on `origin/dev` e900f710; R4 clear (account-session-life arc 2, #266).
- `utils/fee-picks.ts` (moved from the Send module) holds the pick shapes, their readers and `applyFeePickUpdate`; `ProfileService.saveFeePick(profileId, update)` is the one writer of both keys. `runExclusive` now hands its callback the lock's `isCurrent()`.
- **Deviation (D17):** no generation stamp. `ProfileInfo` is the backup record; the pre-adoption clear (#271) already covers re-import residue.
- Mutation checks: dropping `isCurrent()` fails the displaced-writer test; dropping `isReserved` fails the reserved-row test.
- Gate: `bun run lint` ✓, `bun run typecheck:all` ✓, the phase's vitest command ✓, network `fee-methods` on Chrome at retry 0 (8 tests, 353 s) ✓, smoke `security-reset` on Chrome at retry 0 (armed build) ✓.

## Phase 2.2: long proofs in the authwit popups (#107, 2026-10-13)

- `IExecutionHooks.onJournalCreated` fires in `runInSlot` right after the claim; `AuthRegistryService` echoes `{ correlation, journalId }` on `onSendStarted`; `useSendStageLine` follows the record with an epoch per `follow`, releasing a late subscription at once.
- Both RPCs that send wait `EXECUTE_SEND_TIMEOUT_MS` (renamed from `EXECUTE_TRANSFER_TIMEOUT_MS`); reads keep 60 s.
- Gate at e28f18dd: lint, typecheck, unit (1498), network `authwit-lifecycle` on Chrome ✓. The Firefox run was stopped by the runner's ten-minute background limit mid-test (no failure); the same file runs on Firefox in Phase 2.3's gate.

## Phase 2.3: who pays, checked before proving (#113, 2026-10-13)

- Send: `isAllowedToSend` requires `feeEstimate`; the estimate watch lists token, network and account too (D21). Tests: Confirm off before the estimate and after an input change, off after a failure (OA-9 A), an estimate for the network just left never enables it. Mutation: dropping the term fails all three.
- Authwit popups (OA-8 A): `estimateRevokeFee` / `estimateRegistryToggleFee` build through the same code as the sends (`revokeOperation`, `registryToggleOperation`) and call `ExecutionService.estimateSendTransactionFee` (admission, cancel); `cancelFeeEstimate` delegates. Both join #196's guard table. `useWalletTxEstimates` binds each key's estimate to its inputs and re-asks every key synchronously on a scope change. The card gets the estimate (readout) and `fallsBack` (D20).
- App-paid rows (OA-7 B): D18 and D19. `EmbeddedStrategy` names `appPayer` from the kernel; `probeAppPayerFunding` shares `coversFeeLimit` with the sponsor probe; the execute window estimates each app-paid standard operation once and holds Confirm on `provenShort`.
- Gate at 86cbc4f2: network `fee-sponsor-funding`, `authwit-lifecycle`, `tx-sendTx-feePayer` at retry 0, Chrome 4/4 (305 s), Firefox 4/4 (562 s).
- **Missed at this gate:** the phase ran only the touched suites, so `pages/send.test.ts` (19 tests that sent before any estimate landed) went red unseen until Phase 2.5's full run; repaired in 024f9b4a. A gate's unit leg is the whole `bun run test`.

## Phase 2.4: the nudge, the notice and the loading row (#114, #115)

- Notice: D22, the four signed forms by takeover kind. Loading row: D23 (`verifying`, selectable, transaction change only). Nudge: D24.
- The first loading-row draft made `verifyingSponsorId` read `effectiveMethod`, which on Send reads `methods` while pending: a computed cycle. The row id is set by the transaction watcher and cleared by an `effectiveMethod` watcher instead.
- Mutation: dropping the nudge rule fails both nudge tests; a constant `verifyingSponsorId` fails the loading test.

## Phase 2.5: one cap rule, the shown maximum, the shortfall, reuse (#188, #118)

- D25 to D29. `feeCapFor` replaces four copies of the cap arithmetic; `finalizeGasLimits` keeps its precedence (an embedded app cap still wins before the pre-set cap).
- `getEstimatedFee` first called `GasSettings.getFeeLimit()`, which test fixtures with plain gas settings lack; `feeLimitOf` computes the same sum from the fields, pinned equal to `getFeeLimit`.
- Dropping the transfer cache's re-wrap of the fee reply broke the composition harness (a plain reply has no `mul`); the class is now given once, in `predictedWorstMinFees`.
- Mutation: each Confirm gate on a shortfall (Send, app window, registry popup) fails its test when removed.
- Network gate at cb3e9c48: the Phase 1.5 list on Chrome at retry 0, 16/16, 1208 s (a temporary 180 s probe wait included; the probe was reverted).

## Phase 2.6: review round 1

- Codex: three findings, all fixed in aac6d2e1 (picks keyed by profile, a shown shortfall held through a re-estimate, Revoke's gate tested). Opus: approve, three lows (one shared with Codex, two known limits).
- The in-mount pick map outlived #91's move to per-profile storage: when storage gains a key dimension, the in-memory caches over it need the same key.
- The app-paid funding check had no live run: the playground's `sendTx feePayer` names a payer in the payload but makes no call that sets it, so the kernel's fee payer is zero and nothing is probed. A new playground button, `sendTx app-sponsored`, sends the shape aztec.js's `SponsoredFeePaymentMethod` builds, and one `fee-sponsor-funding` scenario sends it through the unfunded salt-1 sponsor: the window shows the notice and holds Confirm. Failure mode: `appPayerOf` reading the live `TxSimulationResult`, which every unit layer mocks. Runtime: 5.1 s on Chrome, the playground already connected by the file's earlier test.
- A second `connectPlayground` in one browser times out waiting for the discovery window, because the origin is already approved; the file now connects once per browser (`playgroundFor`).
- Fee Juice's L1 handler mints a fixed 1000 FJ, so a small public balance is a mint to the L1 account followed by `bridgeTokensPublic(to, amount, false)`.

## Phase 2.6: the arc 2 gate

- Unit, at the origin/dev merge (27d10364): `audit:vue` exit 0 (extension 11,853), `test:all` exit 0, `test:ci-gating` 526, `check:plans` 0.
- E2E at d7340778, retry 0. Smoke, armed build: Chrome 51 files / 219 tests (11 skipped by design), 1,431 s; Firefox 53 / 217 (13 skipped), 2,027 s. Network, the Phase 1.5 list: Chrome 8 / 17, 867 s; Firefox 16 / 17, 1,820 s, then `fee-methods` alone 8 / 8, 671 s. Proverless `same-token-concurrent-sends`: Chrome 14 / 14, 602 s; Firefox 14 / 14, 662 s.
- The Firefox red was `fee-methods` "public gas only": its shield send's "Transaction submitted" toast missed the test's 60 s wait. The toast follows the proof and the send, the local run proves in the browser (CI proves through Presto), and the same case passed in 150 s on the rerun: a local timing flake.
- Smoke needs the armed build (`VITE_NULO_E2E_*` at build time, `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1` at run time); a plain `build:chrome` fails the smoke global setup before any test.

- Final head, after merging origin/dev at 4c69cc64 (its #393 reworked Send's fee card markup; merged without conflict): unit at 27ef9dce, `audit:vue` exit 0 (extension 11,863), `test:all` exit 0, `test:ci-gating` 547, `check:plans` 0. E2E, retry 0, every file first try: smoke Chrome 51 / 219 (11 skipped), 1,357 s; Firefox 53 / 217 (13 skipped), 1,764 s. Network, the Phase 1.5 list: Chrome 8 / 17, 868 s; Firefox 8 / 17, 1,752 s. Proverless: Chrome 14 / 14, 578 s; Firefox 14 / 14, 636 s.
- CI on the first head failed network shard 4 on both browsers: `snack-placement`'s three Send cases sent after a failed estimate, which OA-9 A removes, and the local gate ran only the fee files. An answer that changes a gate is checked against the whole network suite, not the lane's files. The cases were reworked: the error case asserts Confirm stays off; the failed-send cases confirm past the reuse window.
- Final head 1b144968, after merging send-queue arc 4 (#402) and the type roles: unit `audit:vue` exit 0 (extension 12,090), `test:all` exit 0, `test:ci-gating` 547, `check:plans` 0; CI green (53 pass, 4 skipped, every required aggregator). Local, retry 0, first try: network fee files Chrome 8 / 17, 848 s; Firefox 8 / 17, 1,676 s. Proverless: Chrome 16 / 16, 650 s; Firefox 16 / 16, 764 s. `snack-placement` alone: Chrome 4 / 4, 691 s; Firefox 4 / 4, 916 s.
