# Phase 2 — #26: key the verified cache by the artifact object (arc 1)

- `verifiedClassIds: Set<string>` became `verified: WeakMap<ContractArtifact, string>`; `verifyAndCache` skips the recompute only when `verified.get(artifact) === classId.toString()`. The `known` branch is unchanged.
- Tests (`apps/extension/src/wallet/services/pxe/artifact-registry.test.ts`): the cross-store row (class id X verified on object `a`, then a different object `b` the verifier refuses comes back for X), the cached row (the same object twice, one verify) and the other-id row (the same object under two ids, two verifies).
- Red on base (`f5ca160`, the same scratch worktree as phase 1, the test file copied over the base's and restored after): the cross-store row fails, `expected { name: 'store-b' } to be undefined`, the forged object returned unchecked; the other 11 tests in the file pass on base.
