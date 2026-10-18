# Phase 4: arc gate and the review loop

- Arc gate: `bun run audit:vue`, `bun run test:all`, `bun run check:plans` exit 0.
- Review round 1: Codex `conditional approve` (1 P2, 2 P3); Opus `approve` (3 low, 4 nits). Every claim checked against the tree before acting.
  - C1 confirmed: the export page read held rows once, so a profile switched from another window kept the previous profile's rows. Fixed: a profile-id watch scrubs the flow and reloads, and a read the switch outlived is dropped; the regression test reds without the watch.
  - O1 confirmed: `probeIdentityOnce` runs `nodeChainId`, which refuses a chain-0 answer with `ERR_ENDPOINT_CHAIN_MISMATCH`; the catch turned it into `NodeUnreachableError`. Fixed: that refusal rethrows; one test row.
  - O2 confirmed: a status read that rejects at the 60 s deadline could overwrite a newer read's answer after A→B→A. Fixed: a read generation in `syncNetworkStatus`; one test case.
  - O3 accepted as K3 (copy change needed).
  - Comment fixes: C2, C3, O4-O7.
- Review round 2 (Codex resume): `approve`, "No new findings … No regressions found." The loop converged after two rounds.
