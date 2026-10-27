# unit-flakes-3 recon

Base: `origin/dev` at `78f5f9171`. One Explore agent (sonnet) ran the reuse sweep; the parent read the four tests, their services and the CI logs of #1122's three failures.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Await an async event subscriber in a test | `awaitedBus()` in `apps/extension/tests/helpers/held-read.ts`: `dispatch` settles once every handler it reached has settled. Used by `token-balance/service.test.ts:99-104`, whose handlers return their promise (`.add(this.onTransactionUpdated)`). | reuse as-is; the auth-registry handler must return its promise |
| Wait for a seeder marker a test did not await | `vi.waitFor(async () => … readMarker())` in `seeder.status.test.ts:133`, `seeder.list.test.ts:99,199,227`, `seeder.test.ts:423-425` | reuse the pattern |
| Hold a cancel's journal write inside the transition lock | `parkJournalWrite` (`service.composition.test.ts:161-179`); the `submitting` case at `:762-781` parks a `cancelled` write, spies `journal.transitionOperation`, waits for the queued move, then releases | reuse as-is |
| Hold the execution slot as an earlier send does | `ExecutionLane.tryTakeSlot(profileId, chainId)` (`execution-lane.ts`), pinned by `execution-lane.test.ts:266` | reuse as-is |
| A refused move of the send's own record read as the cancel | `fee-reask.ts` `moveOwn` (refusal from `cancelled` or an aborted signal ⇒ `JobCancelledSentinel`); `proveAndSend`'s `commitSubmitting` catch runs `checkCancelled()` (`execution-coordinator.ts:342-347`) | the `submitting` arm is the model for the `proving` arm |
| Empty token list during a rebuild in incoming scenarios | `tokens.getTokensRaw.mockResolvedValue([])` before the action: `service.scenarios.test.ts:3357-3368`, `:4833`, `:6652` | reuse the pattern |

No new helper is needed. Searched: `awaitedBus|liveBus` (2 users), `setTimeout\((r|resolve|res)` in `*.test.ts` under `apps/extension/src` (180 hits, 2 in auth-registry), `from === "cancelled"` under `execution/` (1 hit, `fee-reask.ts`).

## Facts the plan rests on

- **#1122.** In runs 40139222310 and 40414519299 the `× then accept` case ran 5003 / 5005 ms while its sibling ran 12-14 ms, and logged `Illegal job stage transition: cancelled → proving`. In run 40543798176 it failed in 11 ms at `expect(h.proveTx).not.toHaveBeenCalled()`: `proveTx` was called once. The annotated line 1532 is the `test.each` registration frame (`forEach unknown:1:11`), not the await that hung.
- `proveAndSend` runs `checkCancelled → markJournal(proving) → proveTxTask` (`execution-coordinator.ts:334-336`). Both `markJournal`s swallow a refused move: `execution-lane.ts:654-666` and the closure in `transfer-executor.ts:237-246`. `cancelJob` writes `cancelled`, then aborts after its `await` (`execution-lane.ts:203-243`).
- The journal's `transitionLock` is FIFO; `withLock` leaves in `finally` before the holder's caller resumes (`packages/wallet-core/src/utils/lock.ts`). A sealed `get` always reads storage (`sealed-entity-storage.ts:168`); there is no row cache. The cancel stores a sealed row, so the next queued move's read decrypts before that move can fail, while the cancel's caller reaches its abort on microtasks once its write commits.
- The proof gate (`makeControllableGate`) loses a `release()` that comes before `wait()`, which is the 5 s hang.
- `execution-coordinator.test.ts:103-117` and `:306-320` pin the exact call order; `:151`, `:168` and `:344` throw on the 2nd, 3rd and 3rd `checkCancelled`.
- **#1244.** `clearScopeLocked` calls `hydrateSchedulers`, whose commit starts each scheduler's first poll without awaiting it (`incoming-transfer/service.ts:1183-1197`). IncomingTransferService lists `TokenService.name` in `dependencies` (`:212-216`) and `ServiceCollection.start` starts services in topological phases (`packages/wallet-core/src/base/index.ts:69-80`), so TokenService registers its chain-purge subscriber first (`token/service.ts:190`, `incoming-transfer/service.ts:466`), and `NetworkService.purgeChain` runs subscribers in order (`network/service.ts:1219-1229`). `clearChain` has no UI caller; its contract says "called from the chain-purge fanout" (`spec.ts:382-384`). The case at `:3371` is the only cursor-absence assertion made while the stub still lists the token.
- **#1198.** `auth-registry/service.ts:154-156` subscribes `(tx) => { void this.reconcileFromTx(tx).catch(() => {}) }`. `emitTx` waits a fixed 10 ms (`service.test.ts:842-846`). Nothing else invokes that handler (`execution/*.composition.test.ts` stub `add` as a no-op).
- **#1215.** `retry` resolves before its pass (`seeder.ts:293-314`). The pass writes `outcome: "seeded"` after `persist` resolves, a sealed read and a sealed write (`seeder.ts:619-633`).

## Collisions

- Closed known-limit #999 covers a cancelled popup *estimate* still running one simulation. This lane's #1122 fix concerns a send's *proof*; #999's disposition is untouched.
- No open issue besides the four names these files.
