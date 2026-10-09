# Phase 5: close the two deferred writers (Arc 2)

## Implementation (2026-10-09)

- `updateToken` deleted with `onTokenUpdated`: `TokenService` (method, `rpcMethods` entry, event), `TokenServiceClient` (passthrough, event), `spec.ts` (method, event), `TokenBalanceService`'s subscription and handler, two `token/service.test.ts` tests that drove `updateToken`, and the `onTokenUpdated` stubs in seven test files (18 lines). `balance-identity.ts`' comment now says why the triple is immutable without naming the deleted method: a token row is written once, at a fresh id (`persistToken` and `restore` both allocate through `nextNumericId`).
- `bun run build` left `auto-imports.d.ts` unchanged (neither name was ever an auto-import), so this arc does not touch PR #56's file.
- Both writers re-check `isBalanceInvalidated` in the tick their write resumes, through the sync `BalanceJobQueue.deleteIfInvalidated(id)`, which returns the compensating delete or `undefined`. `applyProjectedOk` then fails the task with "Balance record deleted mid-sync" and emits nothing; `writeSyncFailure` returns without emitting (its callers already failed the task). First built as an awaited `setUnlessInvalidated` helper: its return hop let a purge fence and delete the row between the check and the emit (Codex round 1, C1; D-18e).
- `purgeMalformedRows(storage, matchesRaw, onPurged?, onMatch?)`: the hook runs synchronously for every matched row, before the bytes re-check (first built after it, as `beforeDelete`; moved on Opus O1, D-18d). `TokenBalanceService.invalidateRawKey` fences `canonicalNumericStorageId(storageId)` and nothing for a non-canonical key; both raw passes pass it. The init legacy sweep does not: legacy rows fail the codec, so no queue job can hold one.

## Tests

- New `token-balance/purge-commit-race.test.ts` drives the real service, queue and repository over `FakeBrowserApi`, with the projector replaced on the queue and peers stubbed through the composition harness: a control (no purge: writes, emits once); the typed purge with the commit parked after its re-read; a `test.each` over the two writers with the purge run inside the writer's `repo.set`, before the real write lands (storage applying the purge's delete first); a `test.each` over the two purges with the row turned malformed before the raw pass; a malformed row at key `"01"` purged while row 1 syncs.
- Mutation checks, each restored afterwards (7 of 7 pass on the final code):
  - `invalidateAndDelete` without its fence line: the typed-purge row and both reordered-storage rows fail.
  - `balance-job-queue.ts` from the arc base (no post-write re-check): both reordered-storage rows fail.
  - Both raw passes without the hook: both malformed-pass rows fail.
  - `Number(storageId)` in place of `canonicalNumericStorageId`: the `"01"` row fails.
- Review round 1 added two tests: a hop sweep in `purge-commit-race.test.ts` (a `test.each` over the two writers; the purges' own `invalidateAndDelete` at 0-7 microtasks after the write resolves; no row may survive and no update may be announced once fenced), red at 1 hop on the awaited helper; and a call-order row in `purge-rows.test.ts`, red with the hook after the bytes re-check.
- An earlier sweep that started the real `purgeForAccounts` at 0-39 microtasks after the write never reached the gap: the purge's own awaits (initialization, lock, `getAll`) outlast it. The deterministic sweep drives the fence-and-delete directly.
- The typed-purge row passes on the base too: the pre-write fence already catches a delete that lands before the write is dispatched. It is the plan's mutation check for `invalidateAndDelete`, not a base-red row.
