# Phase 8 — keep bb.js's CRS cache

## Changes

- `packages/aztec-runtime/src/pxe/service.ts`: the legacy IndexedDB boot sweep deletes only rc.2-era
  `pxe/*` databases, last-first, skip-on-blocked, as before. Gone: `LEGACY_SWEEP_KEYVAL`,
  `KEYVAL_STORE`, `findKeyvalStore`, the commit-time re-list, the final `keyval-store` delete, and
  `sweepLegacyIndexedDbs`' `dbs` parameter and splice bookkeeping. The `keyval-store` explanation
  (idb-keyval's default DB, bb.js's public CRS, device-wide) now lives in the profile erase's doc,
  the one comment that names it. The two "plus bb.js's CRS cache" clauses are gone.
- `service-idb-delete.test.ts`: the first boot-sweep case is "deletes every legacy DB last-first and
  never keyval-store" (one scripted listing; the fake throws on an unscripted `databases()`, so a
  re-list would fail the case); the blocked-legacy case keeps its warning and drops "stays counted,
  stops before the re-list"; the four store-only cases are gone; the await-shape case keeps only its
  first-delete tick (1).
- `service-sweep.test.ts`: the new-DB-after-snapshot case is "keyval-store survives the sweep that
  deletes the last legacy DB" (`deleted` equals exactly `["pxe/p1/1"]`: the delete is the success
  control, the absent `keyval-store` the never-happens half); the header loses its keyval clause.
  Its `databases()` stub first returned the same two names on every call, which passed against the
  base sweep too (the base's re-list still saw `pxe/p1/1`, so it kept the store: a vacuous test).
  The stub is now a live listing (a deleted name drops out), and the case fails at base.

Deviation: `deleteDb` returned `true`/`false` only for the sweep's splice bookkeeping; with it gone no
caller reads the value, so it now returns `Promise<void>` (same resolve and reject points, same
ticks), and the policy doc's "(resolves false)" reads "(resolves)".

## Gate runs (2026-10-09)

- `bun run --cwd packages/aztec-runtime test`: 43 files passed (1 skipped), 367 tests passed (2
  skipped). `git grep -n -E 'LEGACY_SWEEP_KEYVAL|findKeyvalStore' -- packages`: nothing.
- Red check against the base's `service.ts` (`git show 833170d:…`, restored after): "deletes every
  legacy DB last-first and never keyval-store", "await shape: the first delete follows the boot
  listing by a fixed tick" (an unscripted re-list throws) and "keyval-store survives the sweep that
  deletes the last legacy DB" (`keyval-store` in `deleted`) fail; the other 17 pass. All 20 pass on
  the change.

## Arc 3 boundary (2026-10-09)

- `bun run lint`, `bun run typecheck:all`: pass. `bun run test:all` at `c83e76a`: every workspace
  green; extension 700 files passed (3 skipped), 10,422 passed, 4 skipped, 7 todo (the four
  store-only sweep cases gone, so 4 fewer than arc 2's 10,426); aztec-runtime 43 files, 367 passed,
  2 skipped.
- Full Chrome smoke, armed build of `c83e76a`, retry 0: 44 files passed, 3 skipped; 186 tests
  passed, 11 skipped.
- Chrome network run of `opfs-storage.test.ts` (retry 0) at `12c4331`: 1/1 green. A boot smoke
  only: a fresh e2e profile holds no legacy `pxe/*` database, so the changed branch never runs
  there; the unit tests and their red check at base are the evidence.
- Codex loop: round 1 one material finding (the blocked-legacy case's late `onsuccess`), fixed in
  `12c4331` with a mutant check; Opus alongside, the same finding plus nits (two accepted, two
  rejected); round 2 `clean`. Verdicts in plan.md § Audit verdicts.
