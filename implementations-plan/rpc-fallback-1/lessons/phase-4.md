# Phase 4 (arc 2): the sandbox suite

## S6, recorded first (I2 holds)

The 6.0.0 local node answers `aztec_getPublicStorageAt` at an unknown block hash with HTTP 200 and a per-entry error, code `-32702` ("Block hash … not found when resolving query. If the node API has been queried with anchor block hash possibly a reorg has occurred."). The code is in the reserved range, so the router classifies it as the node's own answer: the routed call ended on A in 3008 ms and B received nothing. The node holds the answer before replying: 3 s for an anchor at the tip or a bare hash, 6 s for an anchor one past the tip (the `AnchoredBlockParameter` wait). D5 stands.

## What the suite found

- **The pick sent to a dead primary (D30).** S4 killed A on the proof's first anchored read. The proof's later reads failed in one batch, which counts once, so A stayed `ready` and active, and the pick took it on trust; the send went to the dead A (`fetch failed`). Fixed in the router: the pick trusts the active endpoint only while its last call answered (`RouteHealth.answeredLast`), with a unit test red on the old code.
- **The local network mines only when a transaction arrives.** `SEQ_MIN_TX_PER_BLOCK=0` notwithstanding, the tip stayed put for two minutes with nothing sent. A scenario that needs the chain to move sends public mints straight to the node (`advance(n)`).
- **Two private sends to one recipient.** The default tagging strategy (`non-interactive-handshake`) performs the handshake on the first send, and every send to that recipient repeats its nullifier until one is mined: two pending at once fail in the mempool (`Nullifier conflict with existing tx …`). With the handshake mined, a constrained delivery still reads the nullifier of the recipient's previous message, so a second send while the first is unmined fails in the kernel (`Nullifier read request at index 2 is reading an unknown nullifier`). `address-derived` is refused for constrained delivery (`an unconstrained tagging secret cannot back constrained delivery`). S7 therefore simulates the next mint, whose sender sync reads the pending hash before the kernel refuses it; S7b resends once the first is mined. **Arc 3 must know:** E1's "second transfer of the same token to the same recipient sent while the first is pending" hits the same kernel refusal in the wallet.
- `pxe.sync()` logs a failed node read and resolves; a scenario asserts a failed read on the routed node directly.

## Runs (each `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/rpc-routing.sandbox.test.ts --retry=0`)

- Dev runs 1 to 5 (S6 alone, then the suite as written, then per fix): the findings above, in that order.
- 2026-11-04, gate run 1 at retry 0: 8/8 green; file 325.9 s (S1 102.4 s, S3 95.1 s, S3b 21.0 s, S4 5.7 s, S5 5.2 s, S6 6.0 s, S7 69.9 s, S7b 14.9 s), 437.8 s with the sandbox's boot.
- 2026-11-04, gate run 2 at retry 0: 8/8 green; file 330.3 s (S1 103.3 s, S3 96.1 s, S3b 21.1 s, S4 5.3 s, S5 5.3 s, S6 6.0 s, S7 69.3 s, S7b 17.7 s). `shard-timings.json` records 326 s on Chrome and 0 on Firefox, where the file skips.
- S3 asserts the PXE's synced block header never falls, the one tier the server PXE exposes; S7's relay A counted no request carrying the first hash, before and after it was mined.
