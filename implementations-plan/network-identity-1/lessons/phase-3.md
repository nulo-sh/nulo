# Phase 3: the docs, then the arc gate

## Implementation review r1, 2026-10-17

- **Codex** (gpt-6.1-sol, high, session `01a14abd`): **reject**, three items.
  1. A chain-0 row on L1 31337 whose primary is not loopback still reaches use, because loopback is checked at adoption, construction and promotion only. Not adopted as a change: such a row comes only from an install made before this change (a full backup cannot carry a network row, `backup/README.md` § Retired slices), the wallet has no production users, and the metadata it builds stays on L1 31337, the development L1. The plan already scopes loopback away from use. Recorded with D5's known limit; argued in r2.
  2. `SECURITY.md`'s adoption sentence omitted that a Local target records 0. Adopted.
  3. The cache's three failures are cumulative, not consecutive: a success does not reset the count. Adopted in `SECURITY.md` and in `getNodeForUrl`'s doc comment.
- **Opus** (general-purpose): **conditional approve**. Every writer of a chain-0 row and every source of a new account's L1 traced and held. Adopted: the comments that still said a `local` kind alone grants chain 0 (`addEndpoint`, `updateEndpoint`, `_getChainId`, `seeds.ts`), and the same `SECURITY.md` adoption wording.
