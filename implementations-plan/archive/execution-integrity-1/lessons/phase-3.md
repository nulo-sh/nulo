# Phase 3: wait, verify, prune (#664)

- The receipt reads live in one small module, `auth-registry/grant-block.ts`: `grantBlockOf` (a block, or `undefined` while pending or dropped, or on a failed read) and `awaitGrantBlock` (polls every second up to a deadline). The service gained `awaitGrantBlocks` before the send, `verifyRevoked` after the proof, `singleAttemptNodeFor`, and `deleteTracked`, the under-lock delete now shared with `syncAuthwit`. `syncAuthwit` now also compares `txHash`, so its delete is no looser than before. `syncAuthwits` lost its row parameter, since the revoke no longer calls it.
- Fixture trap: the suite's grant hash was `"0xtx1"`, which `TxHash.fromString` refuses. Under the new code it reads as a failed read, so every revoke of a pending row would poll its full 120 s. The fixture is now a real 32-byte hash (`TX1`). The harness gained a single-attempt node whose receipts read a block.
- Fake timers fake only `setTimeout` and `Date`, which drive the poll's sleep and deadline. Storage and the lock run on promises and are untouched.
- Mutation check, each red on its own: no grant wait (7 tests), no block comparison, no `txHash` identity in the delete, `complete()` instead of `completeIfTracked()` in the revoke tail, and no authorized check after the proof.
- The type-roles digest of `auth-registry/service.ts` was re-pinned after re-attesting it: both operations still reach the node only through `executeSendTransaction`.
- Gate F, at load 183: green, 13 433 unit tests.
