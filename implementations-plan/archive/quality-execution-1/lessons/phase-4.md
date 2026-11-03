# quality-execution-1 phase 4: one copy of each send step

Base: `origin/dev` at `cf9ed1e40` (arc 1 squash-merged as #1585). Arc 2 branches from it as `quality-execution-1-a2`, not stacked on arc 1's branch, since arc 1 has landed.

## Pins before the extractions

- Added, each through the executors' public entries: the reuse arm's full order (`tryConsume`, `getNetwork`, `getNode`, `getPXE`, `assertFence`, `getAccountContract`, the `isFenceLive` re-check, then the record and the send) on both executors; NO_FROM's failing history row (the send rejects with the row's own error, the journal goes `simulating` then `failed`, no authwit index write, the slot released); distinct `gasLimits` and `teardownGasLimits` sentinels by identity and absent gas settings, with key order, in the planner and NO_FROM projection tests. The order helper is `tests/helpers/call-sequence.ts`.
- Red proof, one run at retry 0 with five deliberate edits, then `git checkout` of the three sources: `getNode` moved after `assertFence` in the transfer arm, `assertFence` moved after `getAccountContract` in the dApp arm, `gasLimits` and `teardownGasLimits` swapped in NO_FROM, the planner's two gas keys reordered, NO_FROM's row write made fire-and-forget. 9 tests failed, the new pins among them: both reuse-order pins, both NO_FROM gas pins' first case, both planner gas pins (key order), the failing-row pin. The transfer arm's `getNode` move was caught by the new pin alone: no earlier test pinned `getNode` or `getPXE`. Green again after the revert (3 files, 339 tests).
