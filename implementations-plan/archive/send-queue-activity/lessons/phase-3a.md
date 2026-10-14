# Arc 3a — lessons

## Probe record (2026-10-12): what a node and the default endpoint can prove

Read from the Aztec 6.0.0-rc.1 node install's `@aztec-labs/*` packages, the wallet's own `@aztec-labs/*` 6.0.0-rc.1 dependencies, and dRPC's public gateway code (`drpcorg/nodecore`, `drpcorg/public`, read only).

**One node.**
- `AztecNodeService.sendTx` (`aztec-node/dest/aztec-node/server.js:755-792`) refuses before the pool on "no connected peers" and `Invalid tx: <reasons>`; `P2PClient.sendTx` (`p2p/dest/client/p2p_client.js:784-802`) throws `TxPoolError` only for a tx the pool did not add, and a duplicate is `ignored` with no error, so a resubmission of an accepted tx answers success. `propagate` is fire-and-forget.
- The wallet's JSON-RPC client (`@aztec-labs/foundation` `json-rpc/client/safe_json_rpc_client.js`) always posts an array; the node's server answers an array with HTTP 200 and per-call `{id, error}` entries (`json-rpc/server/safe_json_rpc_server.js:196-225`). Transport failures, an unparseable body, a wrong shape or an id mismatch become client-synthesized `-32000`/`-32001` errors on the same surface. So on one node a first-POST refusal is visible at the HTTP layer.
- The archiver writes a block and its tx effects in one store transaction and deletes a tx effect only when its block is unwound (`archiver/dest/store/block_store.js:301-376`); no retention pass exists. One node therefore never forgets or late-indexes a receipt it has a block for.
- `NodeTxReceiptBuilder.getTxReceipt` (`aztec-node/dest/modules/node_tx_receipt.js`) answers DROPPED for any hash its pool and archiver both lack.
- Expiry: `tx.data.expirationTimestamp` (seconds); the validator refuses a tx when `expirationTimestamp < block.timestamp`, except while building block 1 (`p2p/dest/msg_validators/tx_validator/timestamp_validator.js`); `MAX_TX_LIFETIME` is 86400 s, so a tx expires at most a day after its anchor block.

**The default Testnet endpoint is a load balancer.** `TESTNET_RPC_URL` is `https://lb.drpc.live/aztec-testnet/…`. dRPC's gateway splits a JSON-RPC batch into per-request upstream calls (`nodecore` `internal/server/http_server/handlers.go`) and runs each through a failsafe executor that retries retryable errors, timeouts and connection resets among them, on another upstream (`pkg/errors_config/errors.yaml`, `internal/upstreams/flow/request_processor.go`), with optional hedges. Its Aztec method spec gives `node_sendTx` only `cacheable: false`: no broadcast, not sticky. The tree already records the topology (`transaction/service.ts`, the DROPPED-debounce doc).

Consequences:
- **#112.** Upstream A accepts, the gateway's request to A times out, the gateway retries on B, B refuses (a lagging anchor, no peers, a pool rule): the wallet sees one POST answered 200 with a server error while A holds the tx. A first-attempt refusal cannot be told from a gateway-retried one.
- **#108 as planned (D15).** The tip read and the receipt read reach different upstreams; a lagging one answers DROPPED for an included tx, which would print "expired … No fee was paid" for a tx that went through.
- **#109 as planned.** A receipt that reads Pending or DROPPED from a lagging upstream is not a prune; reading it as one flaps a mined row.

## Design consult (2026-10-12)

Codex (gpt-6.1-sol, high, default login, session `01a1326f-c394-7b30-a81f-6615789a9de5`) and one Opus Plan lens, on the brief above.

- **Turn 1.** Codex agreed to stop 3a.1. It accepted the anchored first-nullifier proof for #108 only under a finalized anchor: absence at a proposed block proves absence on that branch only. It asked to route #108 through OWNER-ASKS before adopting it. For #109 it rejected "a differing unfinalized hash proves a prune" and required a finalized anchor; it also asked to keep watching pruned rows past the dropped window.
- **Opus.** It agreed to stop 3a.1 and added the double-pay path ("Existing nullifier" on a gateway retry). It agreed the first nullifier is the siloed protocol nullifier and non-revertible, though not unique per tx. It proposed a proven anchor and building now, and a slot rule for #109. It also found the emit-before-unwatch strand in the `SendCheck` sketch and the endpoint URL reaching the exportable log through the single-attempt node's SDK logger.
- **Turn 2 (resumed).** Codex agreed with A-E of the resolution: build #108 at a finalized anchor (it withdrew the OWNER-ASKS routing, since the failure is D15's routing premise, not one node's receipts); use one finalized archive proof for #109 with no slot rule; the compare-and-set `setSendCheck`; the persisted Tx marker; and a silent single-attempt client built with `createSafeJsonRpcClient`. Its one remaining condition, keeping pruned Tx rows watched past the dropped window, is rejected in D26.
- Before relying on mocks, verify the ARCHIVE `findLeavesIndexes` through the real client, including F's own membership: the network e2e case does.

## Code review round 1 (2026-10-13)

Codex (gpt-6.1-sol, high, session `01a132a8-6c5c-7d10-b981-48f25cbe6eb5`) and one Opus general-purpose review, same adversarial brief. Neither found a high.

Accepted and fixed:
- Codex, medium: a lock, purge or stop mid-proof left the proof's later reads running, sending the hash or nullifier after the caller stopped. The proofs take `live()` and check it before each read; SendCheck passes its fence, TransactionService its watch identity. Two tests (a lock between the finalized read and the nullifier read; a purge between the finalized read and the archive read) fail when `live` is replaced by `() => true`.
- Opus, medium: nothing showed an included send's recorded nullifier is in the real nullifier tree, which is what makes absence mean "not included" (`mockTx` lays the nullifier out itself). The network e2e's second case now captures the `submitting` row's `expiry.nullifier` and reads it at the finalized block after the send is Finalized: a public-to-public send, the path the native AVM inserts.
- Opus, low: an `unconfirmed` row must never become `sent` or `reverted` (D28); now pinned in `service.test.ts`.
- Both, low: fixture shapes (`archiveLeaf` with `l2BlockNumber`/`l2BlockHash`), a test title that claimed a Pending receipt it never fed, the e2e card read without a state wait, and comments (a plan tag, a wrong nullifier rule, a redundant doc, a narrating class doc).

Rejected or deferred:
- Opus, low: a lagging upstream can re-answer a pruned block (D23, accepted with reasons).
- Codex: hash-prefix log lines in `transaction/service.ts` predate this arc and are outside its scope. A lying RPC is outside the trust model the proofs claim (they hold against lagging or forked upstreams, not a forger).

## Code review round 2 (2026-10-13)

Codex, resumed on `faf29458` and the e2e change: the fixes hold (high confidence), and the two stop tests fail when `live` is ignored. It judged the e2e's empty L1 mining sound, since L2 finality is the proven checkpoint at L1's finalized block, and harmless, since the agent runner gives each run its own anvil and runs network files serially. One low remained: review provenance ("finding D") in three inherited `transaction/service.ts` comments and a narrating `minedVerdict` doc. Both removed. The loop converged in two rounds.

## Network e2e: the local finalized tip stands still (2026-10-13)

The local anvil mines only on a transaction, and its `finalized` tag trails `latest` by two blocks (`--slots-in-an-epoch 1`). Once the L2 chain is quiet, no L1 transaction lands, so L1's finalized block, and with it the archiver's finalized checkpoint (`l1_synchronizer.js` `updateFinalizedCheckpoint`: the proven checkpoint at L1's finalized block), stops. The first run waited 420 s with the row Proven and never final. The case now mines empty L1 blocks (`anvil_mine`) until `getBlockData("finalized")` reaches the send's block.

## Smoke after a network run needs its own build (2026-10-13)

The network runner and the smoke suite share `dist/<browser>`. Smoke run straight after `e2e:agent` loaded the network's proverless build and failed four tests: `backup-migration`'s fixture-arming contract and three `import-dead-rpc` cases. Rebuild with the smoke flags `_extension-smoke-e2e.yml` sets first: `VITE_NULO_E2E_MIGRATION_FIXTURE`, `VITE_NULO_E2E_TOKEN_SEEDS`, `VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM`, `VITE_NULO_E2E_CSP_REPORT`. Then run with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`. Both browsers then passed clean.
