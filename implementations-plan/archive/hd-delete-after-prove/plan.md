# A profile erase leaves bb.js's CRS cache alone

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `clearProfileState` in `packages/aztec-runtime/src/pxe/service.ts` no longer deletes `keyval-store`, the IndexedDB database where bb.js caches its public CRS, so deleting a profile right after an in-browser proof succeeds. `apps/extension/tests/e2e/network/delete-after-prove.test.ts` covers it with real proving, in the canary job of all four network lanes.
- **Open items**: the legacy boot sweep's own reclaim of the CRS cache, and a standing CI job that proves in browser WASM, tracked in #195. The boot sweep's CRS-cache reclaim was closed by a later plan before `follow-ups.md` was retired.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Treat `keyval-store` as a dependency's public cache, never as profile state. The profile erase stops touching it, whether or not other profiles remain, and keeps erasing everything a profile owns under the verified policy: wait 5 s on a blocked delete, then reject. The one-way legacy boot sweep still reclaims the cache best effort, skipping it when blocked; only its comments changed. Apart from that sweep, only removing the extension or clearing its site data evicts the cache, which now outlives the last profile. bb.js uses any cached point array long enough for the requested size, with no version, so a format change under the same keys is bb.js's to handle; the erase was only ever an incidental eviction.

Not taken: deleting it with the skip policy, which still throws away about 36 MiB on every delete; closing bb.js's connection first, which idb-keyval gives no handle for, so it would mean patching a dependency; deleting it only when a legacy database was deleted, which still treats the cache as profile state and still fails for a pre-OPFS profile erased after a proof.

## Why

Once a page loads the CRS, bb.js keeps `keyval-store` open for the life of that page: the offscreen document on Chrome, the PXE frame in Firefox's event page. A WASM proof loads it (no Presto, or a Presto fallback), and so does a dApp `profileTx` gate count on every prover backend; a Presto-native proof never does. The erase deleted the store whenever no legacy PXE database remained, which on a current install is always. After such a load the delete was blocked, the erase rejected at 5 s, the deletion coordinator kept the profile's tombstone as a retryable failure, and the reset page showed "Couldn't delete profile. Try again". Any extension page holding the connection blocks the delete, so the failure was session-wide, not tied to the profile that proved. The store holds only three public point arrays (`g1Data`, `g2Data`, `grumpkinG1DataV2`), so keeping it leaves nothing of a profile behind.

## What shipped

- The erase drops the profile's in-memory store key first (a crypto-erase), removes its OPFS directories, deletes its legacy IndexedDB databases by prefix under the verified policy, and only then releases the profile's barrier and marks the generation deleted. `packages/aztec-runtime/src/pxe/service-idb-delete.test.ts` and `packages/aztec-runtime/src/pxe/service.test.ts` pin that order, and that `keyval-store` is never requested, held open or not, even for the last profile.
- `packages/aztec-runtime/src/pxe/crs-cache.sources.test.ts` is a tripwire for dependency bumps: bb.js is the only locked package depending on idb-keyval, only its CRS loader imports it (`get` and `set`), and every call names one of the three keys. When it fails, the new writer and its values are reviewed before the pin moves.
- The e2e makes a dApp `profileTx` call and asserts `keyval-store` exists, sends with a real proof, switches through a second profile, then deletes the one that proved from Settings. It asserts the purge completes within 60 s, the lock screen's picker lists only the other profile, and the cache survives. The profiling call holds the CRS open even in the required-Presto canary job, whose sends prove natively, so the test guards the bug on Chrome and Firefox; `scripts/ci-cd/canary-expectations.json` lists it.

## Lessons

### crs-cache

bb.js never closes its CRS cache (idb-keyval's `keyval-store`) once a page loads the CRS, so deleting it blocks. idb-keyval caches its connection and installs no `versionchange` handler, so a `deleteDatabase` waits on `blocked` until every extension page holding the store closes, and a wait-then-reject policy turns that into a failure for the whole session. Delete it only on a path that may skip when blocked.

### jsdom-file-url

The extension's vitest config also collects the `packages/aztec-runtime` tests, under jsdom, where `import.meta.url` is Vite's http URL. A test that reads a file through `new URL(path, import.meta.url)` passes in the package's own suite and throws in the extension's; a `// @vitest-environment node` first line makes it pass in both.
