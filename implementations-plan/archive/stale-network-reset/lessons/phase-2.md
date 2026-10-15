# Phase 2: narrow the integrity block

## Built

- `verifyProfile` derives every Nulo_v1 row (memoized per `(l1ChainId, type, index)` across the one retry), reads the rows with `getNetworksRaw`, and classifies. An unclassifiable mismatch persists the block and throws as before; otherwise `writeVerdict` compare-and-sets the record, then clears the block and stamps. Two digest changes in a row throw `ERR_ACCOUNTS_CHANGED` with nothing cleared, stamped or written.
- The classifier walks chains in account order first, so the block still names the first stored row's chain ("first mismatch wins" stays green unedited).
- Writers are a `VerdictWriters` pair: direct under the facade lock (`verifyBeforeSessionOpen`), and through `ProfileService.persistIntegrityVerdictIfLive` on the off-lock boot path. A skipped write (profile gone) counts as done, never as a digest change.
- `persistIntegrityVerdictIfLive<T>(profileId, write)` generalizes the block writer; `persistIntegrityBlockIfLive` now calls it. Profile deletion (live and crash-resume) also runs `StaleNetworkRepository.clearProfile`, which removes the record, the journal and the notice: the plan's "both keys" predates the notice.
- Runtime path: `AccountRuntimeMismatchDelegate.classifyRuntimeMismatch(profileId, chainId)`, set on AccountService by the coordinator at start. It classifies only that chain's rows and network row; a confined move merges one entry and returns true, and `raiseRuntimeMismatch` then throws `ChainNotSupportedError` with no block and no close. False, a throw (for example a locked profile), or no delegate yet keeps today's block-and-close.
- Lock order: facade, then the record lock (`persistIntegrityVerdictIfLive` → `compareAndSetRecord`, and deletion → `clearProfile`). The record lock never wraps the facade.

## Tests

- Harness only (no assertion edited): the coordinator harnesses gain a `NetworkService` stub, `setRuntimeMismatchDelegate` and `persistIntegrityVerdictIfLive`; `runtime-mismatch.test.ts` returns the service so new cases can set the delegate.
- New: a moved chain opens, records and heals a prior block; Mainnet records, never blocks; a mixed chain blocks with no record; a green pass removes a stale record; boot keeps the session on a resettable chain; a profile deleted mid-boot gets no record; one digest change re-classifies; two refuse with nothing written; the runtime merge keeps other entries and closes nothing; a mixed or orphan chain is not confined; AccountService throws `CHAIN_NOT_SUPPORTED` when confined and blocks when the delegate says no or throws; `persistIntegrityVerdictIfLive` skips a deleted profile; deletion clears the three stale-network keys.

## Gate

- `bun run --cwd apps/extension test src/wallet/services/account-integrity src/wallet/services/profile src/wallet/services/account`: 32 files, 587 tests, exit 0.
- `bun run lint`: exit 0; no complexity directive added (baseline check OK). `bun run typecheck:all`: exit 0.
