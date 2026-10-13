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
