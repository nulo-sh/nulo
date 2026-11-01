# exec-send-1 recon

Base: `origin/dev` at `51ea220b1`, the commit both issues cite, so their line numbers hold. One Sonnet explorer swept eight capabilities; the driver read the call sites itself.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A read that tells "absent" from "failed" | `OperationJournalService.getOperation` already does: `undefined` for a missing or unopenable row, a rejection when `chrome.storage.local.get` or `ensureInitialized` rejects (`operation-journal/service.ts:531-535`, `storage/sealed-entity-storage.ts:168-174,518-521`). No shared fail-closed helper exists (searched `readOrThrow`, `failClosed`, `ReadResult`, `tryRead`, `safeRead` over `apps/extension/src` and `packages/*/src`). | reuse-as-is: the defect is the call site's `.catch(() => null)` (`execution/claim-helper.ts:80`), not the API |
| Cancel versus claim ordering | `cancelJob` transitions the row to `cancelled` under the journal's transition lock, then aborts the controller (`execution/execution-lane.ts:205-245`); the scope re-file already refuses an aborted pre-acquire controller (`claim-helper.ts:210-213`); `disambiguateClaimFailure` rethrows a storage error (`:259-266`) | reuse-as-is |
| The caller's cleanup on a claim that throws | `runInSlot` catch: `markFailedUnlessCancelled`, then `failUnclaimed(queuedJournalId, error)` (fails only a `queued` or `pending` row, never on the cancel sentinel), then both controller keys deleted before the slot is released (`dapp-send-executor.ts:402-419`, `execution-lane.ts:415-423`) | reuse-as-is |
| Journal fakes for the claim | `makeJournal()` / `makeDeps()` in `claim-helper.test.ts:23-60` (`getOperation` a `vi.fn`); the real lane with a fake journal and the real `cancelJob` in `execution-lane.test.ts:28-55`; `deferred` from `@nulo/wallet-core/utils` | adapt: one held-then-rejected `getOperation` |
| A latest-wins balance read that survives events | `useTokenBalanceSnapshot.fetchTokenBalances`: lands as soon as its read resolves, refetches when an in-scope event marked it dirty, only the latest run lands, a refusal settles `state` to `unavailable` and arms one 2 s retry, never rejects (`composables/useTokenBalanceSnapshot.ts:76-157`). Home, Holdings and Select token read only through it. | reuse-as-is for Send |
| Send's balance read | its own `tokenBalanceService.getTokenBalances` inside the identity fetch's `Promise.all`, installed after all three reads (`popup/pages/send.vue:718-731`), beside the hook it subscribes (`:162-174`) | the bypass this lane removes |
| Revision counter | `app.store.ts:193-196` (`InFlightState.revision`), for the in-flight journal cache; the same rule as the hook's dirty flag | not copied: Send gets the hook's rule from the hook |
| Send component harness | `send.test.ts`: `mountSend` (:248), `holdReads` / `holdTokenReads` (:146, :1313), `balanceUpdated` / `balanceAdded` (:293-294), `balanceDeleted` / `balanceConnected` (:1315-1317), `amount`, `card`, `failed` (:1318-1324), `corner` (:718) | reuse-as-is |
| E2E | smoke files that open Send: `send-fee-privacy`, `send-keyboard`, `send-outcome-rows`, `send-picker-add`; the network file that sends and cancels: `network/cancel-mid-prove.test.ts` (a dApp send, 4001 on cancel) | reuse-as-is; no scenario added |

## Other `.catch(() => null)` reads that then act (report only)

- `dapp-interaction/service.ts:596`: the pre-popup cancel check. A failed read opens the approval for a cancelled request; the claim this lane fixes stays the arbiter, so nothing is broadcast. dApp send path, lane `exec-dapp-1`'s area; not changed here.
- `popup/pages/received/[id].vue:190-199`: #1431, lane `incoming-2`.
- `profile/service.ts:1503`: deliberate and documented (a failed read reports "changed").

## Prior decisions that bound the plan

- P44-02 = B (PR #781): every balance list converges on the hook's rules; "Send keeps its failure card". #781's Codex round 2 kept the identity fetch's good balance when a newer read was refused.
- Closed known limits searched (`claim cancel`, `send balance`): #1339, #1340, #1418, #693; none covers either path.
