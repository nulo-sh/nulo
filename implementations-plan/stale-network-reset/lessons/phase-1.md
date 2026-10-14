# Phase 1: seeds, classifier, records

## Base

- Branch `stale-network-reset-1-quarantine` from origin/dev at 1ba770cf (25 commits past the plan's d01569a2). `bun install --frozen-lockfile`: no changes. The network service's seed block was unchanged by the drift.

## Built

- `S/network/seeds.ts`: `SEED_L1_BY_KIND`, `DefaultSeed`, `LOCAL_NETWORK_RPC_URL`, `DEFAULT_SEEDS` and `PRIMARY_SEED` moved verbatim, plus `seedForKind(kind)`, the one lookup the classifier and the reset share. `service.ts` re-exports `LOCAL_NETWORK_RPC_URL`, so `service.test.ts` imports it unedited.
- Deviation, mechanical: `getPrimaryNetwork` copies `PRIMARY_SEED` into a local before the `find` callback. TypeScript does not keep an imported binding narrowed inside a closure (TS18048); a module-local `const` it did.
- `S/stale-network/types.ts`: the three keys and their zod schemas, as § Records shapes them.
- `S/stale-network/classify.ts`: `hasNetworkCause(row)` (seeded kind, chainId off its seed) and `classifyChains(networks, accounts)`. A chain's mismatches are confined only when exactly one network row owns the chain, every derived row on it moved, and every account on it carries that row's L1; otherwise the first moved row of that chain becomes the profile block's mismatch. A network reset whose seed L1 differs from the row's sets `addressesMoved` too (the cause table's second row). Mainnet is an ordinary entry here; the view derives `blocked` from `l1ChainId === 1`.
- `S/stale-network/repository.ts`: one module-level `KeyedLock` per profile shared by every instance; `compareAndSetRecord` reads the current digest under the lock and writes nothing on a change; an empty verdict removes the key; `mergeEntry` replaces one chain's entry; `takeNotice` returns nothing while that network's journal exists; `clearProfile` removes all three keys. Undecodable reads as absent.
- `NetworkService.isChainQuarantined(profileId, chainId)`: one `readQuarantineState` (a single `storage.get` of both keys) plus the row read, lock-free.

## Gate

- `bun run --cwd apps/extension test src/wallet/services/stale-network src/wallet/services/network`: 5 files, 178 tests, exit 0. The existing network tests are unedited (the diff to `service.test.ts` only appends one `describe`).
- `bun run lint`: exit 0 (27 pre-existing warnings, none in touched files; complexity baseline OK).
- `bun run typecheck:all`: exit 0.
