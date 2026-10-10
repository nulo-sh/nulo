# Phase 3: coverage and the playground (arc 3)

Branch `e2e-harness-gaps-coverage` off `origin/dev` at af4afcc (#278's squash), D-orch-12 and D-orch-13. Every network run below is `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 bun run e2e:agent <file>`, through the host registry, unless it says otherwise.

## 3.1 Multicall nonces (#164)

- **Red on the base playground.** `tx-sendTx-multicall.test.ts` rewritten to read the dApp's `sendTx` result, the record's terminal stage, the mined receipt and the recipient's public balance delta. On the base playground (nonce `i`) both cases fail on Chrome, retry 0: `#32` in 22.8 s, `#33` in 20.8 s, each with `status=error` and the dApp error `"The wallet could not process the request."` (the unclassified constant).
- **The cause, read once from the journal** (a temporary dump in the test, removed before commit): the record is `{ stage: "failed", from: "simulating" }` with `Assertion failed: Invalid authwit nonce. When 'from' and 'msg_sender' are the same, '_nonce' must be zero`. The claim holds, narrower than the issue says: the wallet's own simulation (`simulatePublic: true`) refuses the transaction before proving, so the calls after the first never reach public execution on chain. The old test passed because it accepted a record at `simulating`.
- **The fix.** `buildTransferExec` passes nonce 0 on every call: each call's `from` is the sending account. A single call already had nonce 0, so no other test's input moves.
- **Green, retry 0.** Chrome 2/2 (`#32` 32.5 s, `#33` 27.1 s, file 59.7 s); Firefox 2/2 (`#32` 41.4 s, `#33` 36.7 s, file 78.0 s). Each case sees the dApp's hash, one `succeeded` record, a mined receipt and the recipient's balance up by 3 and 7 units.
- Fast: `bun run lint` 0, `bun run typecheck:all` 0, `bun run test` 0 (734 files, 11,113 tests).
