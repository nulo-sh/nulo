# Arc 2 build log

## Phase 2.1: per-profile fee picks (#91, 2026-10-13)

- Built on `origin/dev` e900f710; R4 clear (account-session-life arc 2, #266).
- `utils/fee-picks.ts` (moved from the Send module) holds the pick shapes, their readers and `applyFeePickUpdate`; `ProfileService.saveFeePick(profileId, update)` is the one writer of both keys. `runExclusive` now hands its callback the lock's `isCurrent()`.
- **Deviation (D17):** no generation stamp. `ProfileInfo` is the backup record; the pre-adoption clear (#271) already covers re-import residue.
- Mutation checks: dropping `isCurrent()` fails the displaced-writer test; dropping `isReserved` fails the reserved-row test.
- Gate: `bun run lint` ✓, `bun run typecheck:all` ✓, the phase's vitest command ✓, network `fee-methods` on Chrome at retry 0 (8 tests, 353 s) ✓, smoke `security-reset` on Chrome at retry 0 (armed build) ✓.
