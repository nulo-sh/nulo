# dapp-boundary-4: owner asks

Arc 1 depends on neither ask: it changes no screen. Arc 2 waits for OA-2.

## OA-1: what the class-lookup consent row and the Details table show

- **Surface.** The connect window's row for a `contractClasses` grant with `canGetMetadata`: "Look up contract code on <network>", sub-line "Public information any node can give it.", unflagged, with no chip for `"*"` (`apps/extension/src/popup/windows/capabilities/permission-rows.ts:141-149`). The Details table lists no `contractClasses` grant (`details-table.ts:49-56`).
- **Why it is open.** A class lookup answers two things: whether the class is published on chain, and whether this wallet holds its artifact (`isArtifactRegistered`, upstream's meaning). Arc 1 takes the first from the node. The second stays a local answer, so the sub-line is still not the whole truth. What the row says and lists, and whether `"*"` is flagged, is a consent-surface choice.
- **Options.**
  - **A (ships now, arc 1):** publication from the node; the row unchanged.
  - **B:** A, plus a sub-line that also names the wallet's own records (for example "Whether it is on chain, and whether this wallet holds its code."), the any-class chip and flag for `"*"`, and a `contractClasses` column in the Details table, taken with the other consent-row work in another lane.
  - **C:** A, plus `isArtifactRegistered` answered `false` for every class: no local answer at all, at the cost of upstream's meaning (a dApp may then send an artifact it need not send).
- **Recommendation.** A now; B with the consent-row lane.

## OA-2: arc 2

- **Surface.** No screen.
- **The question and its options** are tracked privately with the orchestrator and are not written here.
- **What ships now.** Nothing: arc 1 does not depend on it.
