# Recon: refused-send-1 (#112)

Base `01c279124` (origin/dev). Two Sonnet Explore agents and direct reads. Every line was checked against the tree or the named package source.

## The send path and what a refusal looks like

- `ExecutionCoordinator.sendTxTask` holds the wallet's only `node.sendTx` (`apps/extension/src/wallet/services/execution/execution-coordinator.ts:286-310`). Its catch rewraps an existing-nullifier refusal as `DuplicateInitializationError` only when the tx initializes the account (`:153-163`); otherwise it rethrows the error unchanged.
- The send node is `NetworkService.getNode(chainId)`: a cached client per chain on the primary endpoint, built by `createAztecNodeClient(url, { fetch: makeFetchWithTimeout() })` (`packages/aztec-runtime/src/adapters/aztec-node-factory-adapter.ts:~77`). It is a dedicated client, not the PXE's (`chain-runtime.ts:180`).
- The Aztec JSON-RPC client (`@aztec-labs/foundation` `json-rpc/client/safe_json_rpc_client.ts`, 6.0.0-rc.3) batches every call of one event-loop tick into one POST (window 0, at most 100 calls, `:9-19, 91-207`). A per-call error inside an HTTP 200 is thrown as `new Error(response.error.message, { cause: response.error })` (`:233-235`): the message is the node's text verbatim. A transport failure becomes a synthetic `-32000` / `-32001` error on the same surface (`:141-205`).
- The retry (`packages/aztec-runtime/src/utils/fetch.ts:132-157`, three attempts at 1, 2, 3 s) wraps the whole batch POST and fires only on a thrown fetch (network error, timeout, 5xx). An HTTP 200 carrying a per-call refusal is never retried.
- The rc.3 node (`@aztec-labs/aztec-node` `src/aztec-node/server.ts:579-608`, host install) refuses with `Cannot accept tx: node has no connected peers to propagate it`, with `Invalid tx: ${reason}` from `isValidTx`, or with the pool's `TxPoolError` text. `AggregateTxValidator` stops at the first invalid validator, so a reason is one validator's text (`p2p/src/msg_validators/tx_validator/aggregate_tx_validator.ts`). Validator order: permitted, timestamp, size, metadata, gas limits, phases, block header, double spend, fee, data, contract instance, proof (`factory.ts:340-410`). The double-spend check reads the node's committed nullifier tree (`NullifierCache(db)`), not the pool.
- The reason texts are exported constants of the wallet's own `@aztec-labs/stdlib/tx` (`dest/tx/index.d.ts:25` re-exports `validator/error_texts.js`): `TX_ERROR_EXISTING_NULLIFIER`, `TX_ERROR_INVALID_EXPIRATION_TIMESTAMP`, `TX_ERROR_DUPLICATE_NULLIFIER_IN_TX`, `TX_ERROR_INVALID_PROOF`, `TX_ERROR_INCORRECT_HASH`, the fee and balance texts, `TX_ERROR_BLOCK_HEADER`, and others. The `Invalid tx: ` prefix is a literal in the node's server and is not exported.

## What the record keeps

- A send's catch writes the failed row through `normalizeError(error, kind)`: `message` is `errorMessageFromUnknown(raw)`, the raw message verbatim (`packages/wallet-core/src/jobs/error.ts:39-51`). The popup path is `transfer-executor.ts:292-301` (kind `transfer`), the dApp path `mark-failed-unless-cancelled.ts:31-43` (kind `dapp_execute`). A `DuplicateInitializationError` row stores the wallet's own message, not the node's.
- The journal builds a failed row's progress itself: `failedFrom` carries `txHash`, `submittedEndpointUrl` and `expiry` from `submitting` and discards the caller's fields (`operation-journal/service.ts:650-654`). `check`, `inclusion` and `checkSince` are written only by `setSendCheck`, a compare-and-set under the transition lock that admits only `isSendCheckMove` (`service.ts:402-422`, `spec.ts:263-273`).
- The stored shape is `OperationRecordSchema`; the failed arm's `check` is `z.enum(["sent","reverted","unconfirmed","expired"])` (`spec.ts:242`). `stored-shapes.ts:202` registers it, `snapshot.json:1196-1199` records the enum, and `goldens.json` holds `journal.full` (`check: "reverted"`), `journal.queued` and `journal.minimal`. `pins.ts` is empty: the baseline is not frozen (#938, a draft, would pin it).
- Journal rows are not part of a backup.

## The send check today

- `SendCheck` (`operation-journal/send-check.ts`) watches a failed row that `isSendCheckable` admits (`spec.ts:276-279`) and that has no answer. It reads the receipt on the recorded endpoint through a single-attempt client, one read in flight per row, inside the profile's live fence. Cadence: every 5 s for 2 minutes after the failure, then every 15 s (`:18-20, 307-309`). A mined receipt records `sent` or `reverted`; once 30 minutes have passed since `checkSince ?? terminalAt` (`DROPPED_RESURRECTION_WINDOW_MS`, `transaction/service.ts:59`), a read that finds nothing mined records `unconfirmed` (`:166-178`). An `unconfirmed` row with an expiry is read again after its expiry and may record `expired` or `sent` (`:180-228`).
- `minedVerdict` folds a receipt into `sent` / `reverted` / nothing, so today the check cannot tell Pending from Dropped (`:254-263, 292-305`). `TxStatus` has `Pending` and `Dropped` (`transaction/spec.ts:19-26`); the node answers Dropped for a hash its pool and archiver both lack (archived send-queue-activity probe, `lessons/phase-3a.md`).
- `TransactionService` already treats Dropped as weak evidence behind a load balancer: a 60 s grace and three consecutive Dropped reads before a pending row is Dropped, then a 30-minute re-check that resurrects a late mine (`transaction/service.ts:41-60`).

## Display

- `journal-state.ts`: `sendOutcome` (`:73-78`), `CHECKED_DISPLAYS` (`:61-67`) and `CHECKED_LABELS` (`:203-218`) are exhaustive records over the outcomes. `JournalTerminalVisualState` already has `failed`; `TransactionTerminalCard.vue` colours by `color` only.
- The journal page (`popup/pages/journal/[id].vue`) shows State as `display.state` capitalised, hides Ended while `checking`, and shows the stored `error.message` only in developer or debug mode.
- The Send snack (`popup/utils/transfer-failure-copy.ts:27-37`) is one toast at the failure, read from the record: a checkable row reads "Send not confirmed" / "Checking whether it reached the network. Don't send it again yet.".

## Tests that pin today's behaviour

- `execution/service.composition.test.ts:1339-1368` pins a refused send (`Invalid tx: Insufficient fee payer balance`) as `checking`. `:1271-1337` drives `SendCheck` on the harness with a `MockClock` and a fake single-attempt node.
- `operation-journal/send-check.test.ts`: a `FakeJournal` that calls the real `isSendCheckMove`; receipt builders `mined`, `dropped`, `pending`; `h.tick(n)`.
- `operation-journal/service.test.ts:846-935`: the `setSendCheck` move matrix.
- `utils/journal-state.test.ts:404-545`: the `CHECKED` table (append, `CHECKED[0]` is used at `:498`).
- `tests/e2e/send-outcome-rows.test.ts`: smoke, seeds five ended sends and checks each status icon's fill against its line colour in light and dark.
- `tests/e2e/network/failed-send-check.test.ts`: a send refused by the Terms guard at the send line (never reaches the node) stays `checking` for 150 s, then `unconfirmed`, then `expired`.

## Sibling lanes

- #924 (encryption-at-rest-1, draft, mergeable) edits `stored-shapes.ts`, `snapshot.json`, `goldens.json`; it does not touch `transaction/service.ts` or the journal. Whichever lands second re-runs `bun run baseline:storage`.
- #938 (migration-rule-1 A4, draft, conflicting) adds the first pin to `pins.ts`. If it lands first, the stamp change needs `-- --additive "<why>"` and the printed pin.
