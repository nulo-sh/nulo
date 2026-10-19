# ui-dedupe-2: recon

One Explore agent (Sonnet) plus the driver's own reading, at `ced2c51c`. Paths are under `apps/extension/src/` unless they say otherwise.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| A run that is still current after an await | `RunFence` (`composables/runFence.ts:16-31`), already the export's `isCurrent` | reuse-as-is (#840 is one more check) |
| Home's balance-list rules | `useTokenBalanceSnapshot`'s defaults (Home's `TokensView`, `BalanceView`) | reuse-as-is: options removed, no rule added |
| Home's journal-list rules | `useJournalMirror` defaults plus Home's retry (`RecentActivityView.vue:248-250`, `:616-630`) | adapt: the retry moves into the mirror (D3) |
| A refused-read retry timer | the balance hook's `RETRY_MS` (once per run, `useTokenBalanceSnapshot.ts:36`, `:101-105`); Home's journal retry (repeats every 2 s while the run is current); `useSeedStatus.ts:13`; `balances.store.ts:120` (backoff, gas balances) | Home's journal retry moves as is; not merged with the balance hook's, whose rule differs (once, then a reconnect or a scope change) |
| Pure journal reducers | `utils/journal-mirror.ts` (`journalAdded`, `journalUpdated`, `journalDeleted`), also used by `stores/app.store.ts:345-347` | adapt: `appendAdded` goes, `journalAdded` takes `place` |
| Red-over-old proofs and mutations | ui-dedupe-1's A7 method (`~/.cache/nulo-backlog/ui-dedupe-1/a7/scripts/mutate.py`: one textual mutation, its suites, red or green) | reuse the method; the script stays outside the repo |
| Row 5's pictures | ui-dedupe-1's scratch spec `zz-oa3-shots.test.ts` (outside the repo; CDP `Fetch` hold on the node, an `operation-journal` port wrapper, a 62 s late first read) and `shotSend` (`tests/e2e/fixtures/send-page.ts:224`, light then dark) | reuse-as-is for the after shots |

No new module. Absence trail for a shared "retry a refused read" helper: `grep -rn "setTimeout(" composables popup stores components utils` minus tests, then `retry`: four timers, each with its own rule; none is a helper.

## Pins per option (every test that changes)

- `refetchWhenDirty: false`: `composables/useTokenBalanceSnapshot.test.ts:321`; `popup/pages/holdings.test.ts:281`; `popup/components/popups/SelectTokenPopup.test.ts:412` (each "a read in flight lands over an add that came meanwhile"). Home's default stays pinned by the hook's `:91`, `:147`, `:183`, `TokensView.test.ts:644`, `:859`, `:946` and `BalanceView.test.ts:328`.
- `insertUnseenUpdated`: the hook's `:259` (its first half is Home's rule and stays); `holdings.test.ts:198` (the `DDD` row).
- `added: "append"`: the hook's `:291` and `:300`; `popup/pages/send.test.ts:993` "an add for a listed row id lands again: a worker restart can give a deleted row's id to another token's row".
  - That order cannot occur since #781. Balance ids are fenced for the worker's lifetime (`wallet/services/token-balance/service.ts:266-274`), and a restart closes Send's port, whose reconnect re-reads (`send.test.ts:1006`).
  - Under `keep`, its second assertion fails (amount 0 for the new token).
- `appendAdded`: `composables/useJournalMirror.test.ts:158`; `utils/journal-mirror.test.ts:21` and `:56` (inside "no reducer writes…"); `TokensView.test.ts:1036` `(BUG PIN)`.
- `dropRefusedUpdate`: `useJournalMirror.test.ts:139`; `popup/pages/activity.test.ts:282`.
- `supersede: false`: `useJournalMirror.test.ts:49`, `:191`; `TokensView.test.ts:1050` and `activity.test.ts:299` (a mount read parked under a reconnect read must still land).
- Home's retry: `RecentActivityView.test.ts:1057`, `:1083`; they must pass unchanged once the retry moves.
- `activity.test.ts:397` pins that a refused mount read reaches Vue's error handler; it stays true under D3.
- Not dependent (search trail): `grep -rnE "refetchWhenDirty|insertUnseenUpdated|appendAdded|dropRefusedUpdate|supersede: *false|added: *['\"]"` over `src` and `tests`; `send.integration.test.ts` and the other `send-*` suites never emit balance events.

## Traces

- **`terminalAt`**: written `null` at creation (`wallet/services/operation-journal/service.ts:309`) and `isTerminal ? now : existing` on a transition (`:388`). Terminal stages have no outgoing edge (`packages/wallet-core/src/jobs/fsm.ts:55-57`). A retry or re-ask makes a new record. So History's refused update is only a late copy of an earlier state.
- **History's mount** (`popup/pages/activity.vue:161-174`): a refused `loadTerminalJournalOps()` skips `loadIncomingTransfers()` and `configService.connect()`. `useIncomingTransfers` connects nothing itself (`composables/useIncomingTransfers.ts:155-168`): its rows then wait for a scope change or a reopen. Vue routes the rejection to its default handler; the popup sets no `errorHandler`.
- **`EventHandler.invoke`** drops an async handler's promise (`packages/wallet-core/src/utils/event-handler.ts:47-61`): History's `onConnected` rejection is unhandled today, and stays so.
- **Send's rows** (`popup/pages/send.vue:160-183`): the amount is the first row whose `token.id` is the selected token; the identity fetch fills the rows itself (`:651-700`); the hook reads only on a counted reconnect.
- **Holdings** reads at setup and on a scope change; **Select token** on show and on a scope change while shown, with a whole-scope fence (`SelectTokenPopup.vue:79-82`, `:99-126`). Neither carries a comment on the options; the reasons were ui-dedupe-1's D507, D701 and D704.

## E2E

The smoke specs that render a surface this arc touches: `holdings-add-token.test.ts`, `token-list.test.ts` (Holdings and the Send picker rows), `send-outcome-rows.test.ts` (History's failed and cancelled rows), `type-roles.test.ts` (Home's import spinner, Holdings, History), `navigation.test.ts`, `send-keyboard.test.ts` (Send's amount). Network specs exist for each surface; none reaches an order this arc changes, so none is run (the lane brief's condition).

## Open work and collisions

- Closed known limits searched (`mirror OR journal OR balance OR holdings OR export`): none in this area (#724 is Holdings' price skeleton, #728 the export's Home flag).
- Open PRs touching these files, no shared hunk: #827 (`TokensView.vue` template and style), #806 (`send.vue` template), #743 (`useFullBackupExport.ts` download). #832 touches none.
