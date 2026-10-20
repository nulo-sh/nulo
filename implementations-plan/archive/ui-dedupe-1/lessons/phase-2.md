# Phase 2 (arc A2): lessons

## A2.1, the premise (2026-10-17)

- Aztec line: `@aztec-labs/pxe@6.0.0-rc.3`. With a store injected, its client entrypoint opens no store of its own (`dest/entrypoints/client/lazy/utils.js:35`).
- The canary gained stage 6 after its last prove: from a popup, the `pxe` OPFS root exists (the control) and `indexedDB.databases()` lists no `pxe/` name.
- Both runs used the prover-on build (no `NULO_E2E_PROVERLESS`), retry 0, on the pre-deletion tree (base dev `dc4a88ec` plus the canary check, `9b599dae`):
  - Chrome: `opfs-storage` and `frozen-account-canary` 3/3, stage 6 green, 238 s wall (vitest 200 s; canary 89.6 s, opfs 24.6 s).
  - Firefox: the same 3/3, stage 6 green, 346 s wall (vitest 319 s; canary 185.7 s, opfs 38.4 s).
- No `pxe/` database on either browser, so the premise holds and A2.2 goes ahead.
- The first Chrome attempt never reached a test: the dev merge brought a new dependency (`@aztec-labs/standard-contracts` in `wallet-bridge`), and the build failed to resolve it until `bun install --frozen-lockfile` linked it. Not a test failure; recorded so the next arc installs after every dev merge.

## A2.2, the deletion (2026-10-17)

- The tick pins re-derived from the last surviving step came out at the same values as before (erase: generation dead and queued read at tick 2; chain purge settles at tick 6). The removed IndexedDB step was the last await on both paths, so the shape after it did not change. A mutation adding one `await` after either OPFS removal turns both pins red.
- The `indexedDB` stubs are gone from the unit suites. Node and Bun define no `indexedDB`, so a reintroduced call throws there and the erase and purge cases go red: the absence of the stub is the guard.
- The tree had five stale "PXE IndexedDB" lines beyond the plan's list: `ARCHITECTURE.md:127`, `CLAUDE.md` § Persisted-storage, `backup-migration-registry.ts:113`, `contact/service.ts:190`, `network/service.test.ts:1453`. All five name the OPFS store now (D203).

## Review round 1 (2026-10-17)

- Codex (gpt-6.1-sol, high, session `01a14bef-2cce-7e81-9ef3-26401c00ac3e`): `findings`, one. F1: stage 6's control (the `pxe` OPFS root exists) passes even if an Aztec bump ignored the injected store, since the wallet's own store open creates `pxe/` first and upstream's fallback pool lands at the OPFS root as `.aztec-kv-<name>`. Accepted: the OPFS root must list exactly `pxe`. Its placement nit ("after every prove" overstated) accepted.
- Opus (general-purpose): `findings`, no behaviour difference against base. F1: one more stale "IDB" comment (`network/service.ts`). F2: "the PXE opens no IndexedDB" is false on the WASM path, where bb.js opens `keyval-store` for its CRS cache (`legal/privacy.md` says so); the lines now say none of the PXE's state is in IndexedDB. F3: a `pxe/` prefix check misses an upstream store under any other name; the check now refuses every database but `keyval-store`, the only `indexedDB.open` in the built bundle (idb-keyval's). Nits accepted: the sweep log's doubled slash, two history-narrating comments rewritten as invariants.
- The deletion itself: both legs verified the erase, purge and sweep order and the tick pins unchanged.
- Observation, not filed: upstream's `quarantineDuplicatePool` copies a corrupt pool into `.aztec-sqlite-quarantine` at the OPFS root, outside the profile erase. The copy is ciphertext under the profile's store key, which the erase drops first, so nothing readable survives; stage 6 would go red if a canary run ever quarantined, which is the signal wanted.
