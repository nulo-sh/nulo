# fpc-discovery-1 recon (at `19399c82`)

Two Explore agents (sonnet) plus the planner's own reads. Paths are repo-relative.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| PXE work outside the FPC lock, then a fenced write under it | `addFpc` (`apps/extension/src/wallet/services/fpc/service.ts:251-308`): fence captured at entry, PXE fetch and `ensureRegistered` before `this.lock.withLock`, then `assertCurrent` → `isNetworkLive` → `set` → `isCurrent` → compensating delete | reuse the shape |
| The fence sequence itself | Hand-written twice in this service: discovery (`service.ts:231-242`) and `addFpc` (`service.ts:294-303`); the token service has a ticket-aware variant (`token/service.ts:477-489`). No shared helper (searched `assertCurrent(`, `isCurrent(`, `profileDeletedError(`, `captureExecutionFence`, `isNetworkLive(` over `apps/extension/src`) | adapt: one private method for the two FPC copies (D4) |
| Idempotent registration | Upstream `registerContract` is a keyed overwrite (`@aztec-labs/pxe` 6.0.0-rc.3 `pxe.js:544-556`, `contract_store.js:102-106`) behind the offscreen's `withPxeWrite` (`packages/aztec-runtime/src/pxe/service.ts:397-426`). `ensureRegistered` (`execution/contract-resolver.ts:135-145`) adds a `getContracts()` round trip, which on a cold runtime also boots it | reuse `registerContract` direct, as today |
| Concurrent discovery dedupe | Today the FPC lock serialises discovery and the in-lock re-read skips a finished one (`service.ts:148-162`). Single-flight precedents exist (`execution/gas-balance-reader.ts:57-104`, `profile-deletion/coordinator.ts:62`) | keep the in-lock re-read; no single-flight (D3) |
| Unit harness for FPC fences | `fpc/service-create.test.ts`: real `FpcService`, `Lock`, `EntityStorage` on `FakeBrowserApi`, real `ProfileDeletionState`, `svc()` stubs, a mocked `getContractInstanceFromInstantiationParams`, a seeded `protocolAddresses` cache, `deferred` gates, `recordWrites` (`services/storage-write-log.ts`) | reuse; extend |
| Composition layer | `apps/extension/tests/COMPOSITION-TESTS.md` names `FpcService` (all of it) the counter-example: bb-bound (D6), "Fpc has NONE". Neither `FpcService` nor the coordinator has a `pxeClientFactory` seam (both `new PxeServiceClient(logger)`); no composition test drives a profile deletion (grep `deleteProfile|beginDeletion|ProfileDeletionCoordinator` over `*.composition.test.ts`: none) | none (D5) |
| Reset-time measurement | `apps/extension/tests/e2e/security-reset.test.ts` (a smoke spec, `vitest.e2e.config.ts`); #630's uncommitted overlay with Debug Mode and `readSwLogTrail` (`tests/e2e/fixtures/journal.ts:321`), its procedure in `implementations-plan/archive/ci-e2e-hygiene-1/lessons/phase-2.md` | reuse the overlay procedure, uncommitted |

## The path today (`19399c82`)

1. `getFpcs(chainId)` captures the fence (`service.ts:121-122`), finds a protocol row missing, takes `this.lock` (`service.ts:148`; `new Lock("fpc", logger)`, 5-minute watchdog, `packages/wallet-core/src/utils/lock.ts:5`).
2. Under it, `registerAndStoreProtocolFpc` awaits `pxe.registerContract` (`service.ts:215`). The offscreen runs it under `chainGuard.write` and, on a cold runtime, `createChainRuntime` awaits `node.getL1ContractAddresses()` (`packages/aztec-runtime/src/pxe/chain-runtime.ts:190`) with 4 attempts, 1/2/3 s sleeps, 60 s per attempt (`packages/aztec-runtime/src/utils/fetch.ts:19,152`). A failed boot is not cached, so the next registration boots again.
3. The SW-side RPC gives up at 90 s (`packages/extension-messaging/src/offscreen/client.ts:22`); the offscreen op keeps running.
4. `deleteProfile` bumps the epoch and reserves the id (`profile/service.ts:1506`), then runs the coordinator outside its lock. The purge reaches `fpcs.purgeForProfile` (`coordinator.ts:130`), which waits for the FPC lock (`service.ts:442`).
5. The first retry stop is `networks.purgeForProfile` → `purgeChain` → `pxeServiceClient.clearChainState` (`network/service.ts:1110`; `stopRetries(profile, chain)` at `aztec-runtime/src/pxe/service.ts:695`), then `clearProfileState` (`coordinator.ts:136`; `service.ts:750`). Both come after step 4.

## Claims checked

- **Holds**: the lock spans the registration; the purge takes it before any stop; the registration waits on the node with retries.
- **Corrected (#630)**: Home alone starts discovery (`stores/balances.store.ts:554`); Send or fee settings need not be open. Measured: 9,057 ms (Firefox) and 9,232 ms (Chrome) of lock wait in a 10.2-10.6 s purge (`archive/ci-e2e-hygiene-1/lessons/phase-0.md`).
- **Under-stated**: against a silent node the lock frees at the earliest of the 90 s RPC timeout, the ~246 s retry chain or the 5-minute watchdog. A watchdog release displaces discovery while it still writes (`lessons.md`, the `Lock` watchdog line).
- **Lane brief, does not hold**: `security-reset.test.ts` is a smoke spec (`tests/e2e/`, run by `bun run test:e2e`), not a network spec run through `agent.sh`.
- **Lane brief, conflicts with a normative doc**: a composition test of FPC discovery (D5).

## What a late registration can and cannot do

- A registration sent after `beginDeletion` fails at the SW stamp: `getPxeGeneration` returns `undefined` for a reserved id and the client throws "no current incarnation" (`packages/aztec-runtime/src/pxe/client.ts:263`).
- One in flight when `clearProfileState` runs is drained, with retries stopped; one arriving during or after it is refused by the dead generation (`aztec-runtime/src/pxe/service.ts:878`) or the missing store key. It cannot re-create a deleted profile's store.
- A chain purge (`deleteNetwork`, `resetChainInPlace`) reserves the network (`network/service.ts:579,1012`) before its subscribers run, keeps it reserved through `clearChainState`, and `isNetworkLive` refuses any read the reservation overlaps (`network/service.ts:619-625`).
- At send, the fee payload's FPC call goes through `resolveInstances` → the offscreen cascade PXE → node → known bundle (`aztec-runtime/src/pxe/service.ts:279-323`). The known bundle holds the SponsoredFPC instance (`aztec-runtime/src/pxe/known-artifacts.ts:33-37`), not the PrivateFPC one, which no deployment publishes.

## Open work and collisions

- `gh issue list --state open --search fpc`: #553 and #821 (an app's sponsor named row on the transaction page; unrelated). No open PR edits `fpc/service.ts` or the coordinator (lane brief).
- Closed limits in the area: #551 (KL-3, a silent node: one request timeout per node call), #552 (KL-4, token add under `withTokenLock`). Neither changes here: KL-4 is another service's lock.
