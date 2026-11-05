# quality-popup-2 recon

Read at `6c7ba2867` (origin/dev). Three Sonnet explorers plus the planner's own reads. Paths are under `apps/extension/src/` unless they start with `tests/` or `implementations-plan/`. The issues were filed at `51ea220b1`; 39 commits landed since, so several line numbers and two claims moved.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Row amount width | `balanceFormatted(x, d, 8, { compact: true })` at `TransactionCard.vue:129`, `RecentActivityView.vue:214`, `TransactionIncomingCard.vue:42`, `utils/journal-state.ts:63` and `:445`, `utils/snack-amount.ts:10`; no named constant (searched `ROW_AMOUNT`, `AMOUNT_LENGTH`) | adapt: name it once |
| Detail hero width | the same literal at `popup/pages/tx/[id].vue:93`, `received/[id].vue:135`, `journal/[id].vue:87`; `popup/pages/detail-page.ts` holds only `DETAIL_TIME_FORMAT` | adapt |
| Journal transfer amount gate | `journalCardAmount` (`journal-state.ts:58-64`, parses with `parseSide`), `transferCardFields` (`:439-446`, raw string), `journal/[id].vue:84-88` and fiat `:98-101` (raw string, `BigInt`) | adapt: one gate, `parseSide` |
| Developer-fields flag | `tx/[id].vue:154-160` and `journal/[id].vue:218-226`, identical `Boolean(debugMode \|\| developerMode)` over `getProps()` in `onMounted` | adapt |
| Call registry | `utils/amount.callers.test.ts` counts calls per file and refuses any option but `{ compact: true }`; it never reads the length argument | reuse-as-is (a named length keeps every count) |
| Account scope `{ profileId, networkId, account }` | four literal copies: `RecentActivityView.vue:265-267`, `popup/pages/activity.vue:84-87`, `popup/app.vue:99-101` (arrivals, behind `isLogined`), `popup/app.vue:~122` (sends, behind `isLogined` and the route); closest helper `selectedBalanceScope` (`stores/balances.store.ts:55-62`) returns another shape (`accountAddress`, `chainId`); searched `incomingScopeOf`, `activeScope`, `active-scope` | build new: one pure helper |
| Row-type dispatch | Home's template (`RecentActivityView.vue:866-879`) and `TransactionsList.vue:64-77`: the same three cards and props, except Home's `!token` arriving gate and its `{ id: op.id, ...props }` terminal spread; both evaluate the terminal builder twice; no component exists (searched `ActivityRow.vue`, `*ActivityRow*`; `ActivityRow` is a type in `utils/activity-rows.ts`) | build new: one row card |
| Tx hash row | `popup/components/modules/tx/TxHashRow.vue` (props `hash`, `explorerUrl`, `linkTestid`, `copyTestid`; emits `copy(hash)`); `received/[id].vue:396-414` re-implements it with `gap="12"`, fixed testids and a labelled copy | reuse-as-is |
| Address card | four hand-written cards: `tx/[id].vue:220-268` (From, To), `received/[id].vue:337-390` (From with four body branches and `card_static`, To); shared pieces `AddressDisplay`, `AddressCardLink`, `detail-page.module.css` (`address_card`, `caption`) | build new: one card with a body slot |
| Amount rule across row kinds | tx rows and the tx page both read `utils/tx-amount.ts`; the incoming card gets `knownDecimals(token)` from `buildIncomingCardProps`, so its `isValidDecimals` check is the same test; the receipt page lacks an empty-string guard | see "Claims that did not hold" |
| Task mirror | hand-rolled in `RecentActivityView.vue`: `executingTask`, `executingSubtasks`, `taskFence` (155-166), handlers and snapshot (592-674), the three clears (487-529), `pendingCancelJobIds` (300-301) | build new: C1 `useExecutingTask` |
| Re-ask sheet | `RecentActivityView.vue:380-429` and the fee watcher (715-720); pure parts already in `reask-review.ts`; timer in `useSendReview` | build new: C1 `useReaskReview` |
| C1 shape to mirror | `useJournalMirror` (options of functions; the parent subscribes its handlers; `begin`, `dispose`), `useScopedTokens` (client `Pick`), `useSendsInProgress` (mirror plus scope reset); none returns `reset()` | reuse the conventions |
| Panel move | `leavePanelFor` (`utils/own-window.ts:232-234`), used by four pages; four more inline it in `onBeforeMount`: `export/seed.vue:150-153`, `export/full.vue:166-169`, `export/account.vue:364-368`, `unlock-method.vue:256-259` | reuse-as-is |
| Stored-passkey ask | five copies of lookup, fence, `runCeremony({ mode: "get", … })`: `export/account.vue:213-238`, `export/seed.vue:116-135`, `unlock-method.vue:137-143` (`currentPasskey`), `popup/pages/auth.vue:118-131`, `composables/useFullBackupExport.ts:158-190`; the injected-runner precedent is `useNewProfilePasskey.ts:27` | build new: one stateless helper |
| Config read | `composables/useConfigRead.ts` (reconnect re-read, newest-read fence, `updatedSince`), nine consumers; hand-rolled at `BalanceView.vue:86-97`, `popup/pages/holdings.vue:79-104`, `PopupManager.vue:44-73` | reuse-as-is at two sites |

## Claims that did not hold, or moved

- #1469: `RecentActivityView` no longer copies the journal gate; it calls `journalCardAmount` (`:371`). The three live copies are `journalCardAmount`, `transferCardFields` and `journal/[id].vue`, and they differ: only the first parses with `parseSide`; the other two pass the raw string to `BigInt`, which throws on a malformed row.
- #1476, the drift: true in code, not observable. No wallet writer stores an empty `amountRaw`: notes go through `parseNoteAmount` (`wallet/services/incoming-transfer/service.ts:2849-2858`, null on a falsy value), public events through `BigInt(…).toString()` (`packages/aztec-runtime/src/pxe/public-events.ts:379`), journal rows through `req.amount.toString()` (`transfer-executor.ts:633`), and a task's `amount` is a `bigint` (`task/spec.ts:80`). The card's `isValidDecimals` is the same test as `knownDecimals` for its one caller. Closed known limit #1555 already decided not to guard the receipt page's render against a corrupt row.
- #1476, "`RecentActivityView.vue:212-217` omits that guard": the line is the in-flight task's amount, a `bigint` rendered with `String()`, so it is never empty.
- #1445: no C1 composable returns `reset()`; the task listeners are never removed (the client is disconnected); the task fence is never invalidated on unmount.
- #1468: the account-export panel move has no unit test; three page tests mock `moveToOwnWindow` on a spread copy of `own-window`, so `leavePanelFor` inside the real module would call the real window code there.
- #1473: `PopupManager` does not read config as a page does: it seeds `useIncomingTrustPrompts`, which registers its own update listener only after the seed and fails open on a failed read; its test pins the exact call order. `BalanceView`'s read has no `catch` and no reconnect re-read; `holdings.vue` already re-reads on every connect.

## Collisions

- Other lanes: `quality-popup-1` (#1453) edits `unlock-method.vue` (password entry, lines 277-341, 386-395) and `export/full.vue:68`; `quality-services-1` edits `auth.vue:232-236`. Arc 2 touches the same files in other regions. No other lane touches arc 1's files (searched every lane brief for the paths). No open PR touches either arc's files at `6c7ba2867`.
- Tests that pin seams the plan moves: `utils/amount.callers.test.ts`, `composables/useScopedTokens.callers.test.ts`, `popup/incoming-row-parity.test.ts`, `RecentActivityView.test.ts` (shallow mount; finds the three cards by name at 571-573 and 841; reads the exposed refs as unwrapped `vm` properties and mutates `pendingCancelJobIds` once at 1216), `TransactionsList.test.ts` (stubs the cards), `activity.test.ts:200` (`isArriving` prop), `BalanceView.test.ts` and `PopupManager.test.ts` (config mocks without `onConnected`).
- Smoke e2e that open arc 1's screens: `rows.test.ts`, `type-roles.test.ts`, `send-outcome-rows.test.ts`, `received-fee-privacy.test.ts`, `navigation.test.ts`. Network e2e on the task mirror and re-ask: `same-token-concurrent-sends.test.ts`, `cancel-mid-prove.test.ts`. Arc 2: `security.test.ts`, `security-backup.test.ts`, `passkey-paths.test.ts`, `toolbar-panel.test.ts` (Firefox only), `fiat-display.test.ts`, `sw-resilience.test.ts`.

## Baseline

- `bun run audit:dup` at `6c7ba2867`: production 177 clones, 8775 duplicated lines; total 1547 clones, 21273 lines (3.35%).
- Line counts: `RecentActivityView.vue` 989, `activity.vue` 357, `TransactionsList.vue` 98, `tx/[id].vue` 481, `received/[id].vue` 654, `journal/[id].vue` 441, `journal-state.ts` 517, `BalanceView.vue` 534, `holdings.vue` 312.
- Closed known limits in the area: #1555 (receipt amount `BigInt` on a corrupt row), #381 (re-ask fee figures). Neither is reopened.
