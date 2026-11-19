# authwits-2, phase 1: the checkpoint wait

- `waitForTxProven` → `waitForTxCheckpointed`, reading `getChainTips().checkpointed.block.number` (stdlib 6.0.0 `L2Tips.checkpointed: L2TipId`). Existing tests that stubbed the wait by name follow the rename; nothing else read the proven tip.
- New describe in `service.test.ts`: a node fake whose receipt names block 5, proven tip 1, checkpointed tip 4, 4, then 5. First run failed on the fake itself: the harness's send returns `"0xtx"`, which `TxHash.fromString` refuses, so the case now sends a 32-byte hash.
- Against the base `service.ts` (`git show 0dc22a9c5:…`, the stubs renamed back): all four new cases fail (the two transitions never settle; the two controls throw "not proven" instead of "not checkpointed"); 79 others pass. At the arc: 86 of 86 in `auth-registry/`.
