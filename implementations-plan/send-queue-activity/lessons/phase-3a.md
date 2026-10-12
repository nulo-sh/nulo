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
