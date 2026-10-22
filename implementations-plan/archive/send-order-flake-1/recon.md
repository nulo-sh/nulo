# send-order-flake-1: recon

Base: `origin/dev` at `421bf33b4`. One Explore agent (sonnet), its claims re-read in the lead session; one bounded measurement (lessons/phase-0.md).

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Wait for a condition in the composition test | `waitFor(pred, 2000)`, 5 ms polls (`send-order.composition.test.ts:203-209`), already used for `depth()` | reuse as is |
| The record's stage history, in write order | `byId` / `stagesOf` from `onOperationUpdated`, stage changes only (`:62-69`, `:299`) | reuse as is |
| The stored record | `OperationJournalService.getOperation`, lock-free (`operation-journal/service.ts:531-535`) | reuse as is |
| A worst-case interleaving for the negative control | `deferred` (`@nulo/wallet-core/utils`) and `vi.spyOn` on the real journal instance | reuse; no shared helper exists (searched `transitionIfStage` in `*.test.ts`, `deferred(`, `FakeBrowserApi`'s storage adapter `packages/wallet-core/src/testing/fake-browser-api.ts:41-75`: no delay option) |
| An ordering contract between hand-on and journal write | none: only the TSDoc of `parkSlot` (`execution-lane.ts:355-360`) and `requeue` (`:422-423`); `execution/README.md:43-45`, `ARCHITECTURE.md`, `tests/COMPOSITION-TESTS.md` say nothing (searched `requeue`, `hand`, `waitFor`, `sleep`, `poll`) | state it in the TSDoc (plan D2) |

## The mechanism

- `parkSlot` (`execution-lane.ts:361-384`): `keep(release)` hands the slot on (`execution-mutex.ts` `keep` → `handOn` → the next waiter's `await prior` resolves); then `beginExecutionWait`; then `await this.requeue(id)`; only then `await wait()`.
- `requeue` (`:424-430`): `transitionIfStage(id, ["pending"], { stage: "queued" })`, errors logged, never thrown.
- `transitionIfStage` (`operation-journal/service.ts:597-616`): `ensureInitialized`, then the journal's single global `transitionLock` (`:62-87`, `:111`), a sealed read, the stage check, `_transitionLocked` (a second sealed read, the write, then a synchronous `onOperationUpdated` emit, `:403-404`). Sealed rows go through AES-GCM (`packages/wallet-crypto/src/aes-gcm-frame.ts`).
- `getOperation` takes no lock, so it can read the row before that write lands.
- The test (`send-order.composition.test.ts:304-311`, `:343-350`): `parkedSend` waits for `depth().origin === 1`, takes the slot (granted by the hand-on) and releases it, then reads the record once at `:346`.

## Who calls `parkSlot`

- `DappSendExecutor.waitForEarlierSends` (`dapp-send-executor.ts:444-470`), before the claim, with the `queuedJournalId` row: `queued` on the popup path (requeue is a no-op), `pending` on the silent path.
- The post-claim `park` (`dapp-send-executor.ts:383-399`), then `reclaimParked` (`execution-lane.ts:434-439`), which accepts `queued → pending` or a row still `pending`.
- The silent path: `dapp-interaction/service.ts:696-702` moves a self-paid, popup-less send's `queued` row to `pending` before `executeOperations`.

## Product readers of a `dapp_execute` stage in the window

No harmful decision on `pending` read for one journal write after the hand-on was traced:

| Reader | Where | In the window |
|---|---|---|
| Ingress admission cap, counts `queued` rows | `wallet-sdk/queued-journal.ts:160-176` | under-counts the parked row by one; the row read `pending` (not counted) the moment before the park too, and the cap only skips a queued-visibility record |
| Ingress safety net `failQueuedIfUnclaimed` (`["queued"]`) | `queued-journal.ts:253-268` | the executor's own `failUnclaimed` takes `["queued","pending"]` (`execution-lane.ts:412-420`) |
| Reaper graces (`pending` 2 min, CAS on `updatedAt`) | `operation-journal/reaper.ts:73-84` | the record is in `executionWaiters` (heartbeat) before `requeue` starts; the window is one write |
| `cancelJob`, `abandonDeadSessions` (`PRE_SUBMIT_STAGES`) | `execution-lane.ts:68`, `:203-265` | treat both stages alike; `requeue` is `["pending"]`-guarded, so it never overwrites a cancel |
| `reclaimParked` (post-claim park only) | `execution-lane.ts:434-439` | a locked check-and-set accepting both stages; runs after `wait` |
| `cancelQuestion`, `acceptQueuedFee` (need `reask`) | `execution-lane.ts:443-447`, `service.ts:756-758` (transfers only) | a parked dApp row has no `reask` |
| `reconcileCancelledJournal`, `execute` entry | `dapp-interaction/service.ts:213-219`, `:546-553` | popup path, before execution; never a parked silent row |
| Popup lock dialog, card subtitle | `utils/in-flight-send.ts:32-44`, `utils/card-subtitle.ts:26-34` | react to `onOperationUpdated`; `pending` keeps "Preparing..." one write longer and counts as approved one write longer (the conservative side) |
| Session expiry deferral | `execution/service.ts:356-359` → `in-flight-send.ts:41-44`; `profile/session-manager.ts:83-86` | reads the journal directly, lock-free; in the window the row counts as approved, so a lock can be deferred by one 60 s step; the row already reads `pending` through its first wait for the slot |
| The claim after the pre-claim wait | `claim-helper.ts:80`, `:110-133` | reads lock-free and skips its transition on `pending`; it runs after `wait`, so after the requeue settled; this is the reader that needs write-before-`wait` |

## Sibling pattern

`TransferExecutor.takeTurn` starts its `pending → queued` write without awaiting it before the wait (`transfer-executor.ts:507-515`) and awaits it only at the claim (`:535`): the stage is eventually consistent with the wait by design there too.

## Collisions

- No open issue touches the execution lane (`gh issue list --search "parkSlot"`, `"send-order composition"`): only #1083.
- Closed known limits near the area: #380 (a queued send fails on worker restart), unrelated to the order.
- Sibling lanes in flight (ui-keys-sealed-1, e2e-tmp-2, e2e-tmp-4) do not touch `services/execution/`.
