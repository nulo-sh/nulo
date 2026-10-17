# Phase 3: no row for a connect that reaches no page

- D3 as planned: `rollBackDiscoverySession` in `discovery-approval.ts` serves the expired, abandoned, not-landed and failed-grant deletes. The not-landed branch deletes unless `rowAwaited()` holds, which `persistAndApprove` reads from `dedupeWaiters` for the pair.
- D4 as revised: `pendingDiscoveryPromises` entries carry `kind: "connect" | "notice"`; the returning-app path skips only a row found while a `connect` entry is open. The map, its caps and its cleanup are unchanged.
- D5: a throw from `setCapabilityGrants` deletes the row best effort, then rethrows, so `rejectFailedDiscovery` still refuses the discovery.
- Harness: a duplicate approved after the window sets no pending-verification marker (it verifies in its own window), so test (b) asserts the approval and the kept row, not a marker.
- Red/green on the base code: (a), (c) and (d) fail; (e) fails with D4 untagged (`!pendingWindow`), passes as shipped.
- Gate: `bun run lint` 0, `bun run typecheck:all` 0, `bun --bun vitest run src/wallet/services/wallet-sdk/` 30 files, 460 tests passed.
