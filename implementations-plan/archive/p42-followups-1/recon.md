# p42-followups-1 recon

Read at `c8a423f2` (origin/dev) by two Sonnet explorers and the driver. Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/` or `implementations-plan/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Fee grammar `~X FJ ($Y)` | `utils/fee-estimation.ts:118-131` (`feeDisplay`, `feeFigure`, `feeText`), `components/composite/FeeAmount.vue` | reuse-as-is |
| A card handing its priced figure to its page | `popup/components/modules/send/FeeSettingsCard.vue:78-98,255-275` (one-way `defineModel`s `feeDisplay`, `queuedCapText`, bound at `popup/pages/send.vue:844-845`) | reuse the pattern in `FeeRaisedCard` |
| Two stacked text rows in a fee card | `Flex direction="column" gap="4"` (`FeeCostReadout.vue` five times, `FeeRaisedCard.vue:69`, `SendReviewSheet.vue:209`) | reuse-as-is: the standard gap |
| A two-line button label | none: no `<br>`, no `white-space: normal` or column inside any `Button` slot (searched every `*.vue` under `apps/extension/src` and `packages/design/src`; `TokenList.vue:112` nests one inline span) | build new, in `DappApprovalFooter` |
| Restore error rows at source positions | `composables/full-backup-restore.ts:637-661` (`settleHeldAccounts`: `records[h.row] = { profileId, chainId, restoreError }`), `atSourcePositions` `:487`; the log appends (`useFullBackupImport.ts:745`) | reuse-as-is |
| Restore log allowlist | `utils/full-backup-helpers.ts:287-298`: account and imported-keys rows keep `profileId`, `chainId` only | reuse-as-is |
| "Waiting for the first answer" check | `utils/token-aggregate.ts:54` `awaitingFirstPriceAnswer` (Home and Holdings) | reuse; Holdings adds the list's own `isLoading` beside it |
| One title rule | `utils/tx-enrichment.ts:69` `callTitle`; `call-surface.ts:142` `rowTitle`; `OperationActionRow.vue:15-16` | reuse-as-is |
| Settled reading | `utils/tx-amount.ts:49-55` `settledReading` (reads `args.length` only) | adapt: accept a length |
| Listed tokens beside journal rows | `composables/useScopedTokens.ts` (Home `RecentActivityView.vue:172-176`, History `activity.vue:49-53`); the journal page loads its own (`journal/[id].vue:54,227-229`) | reuse-as-is |
| Journal metadata write after creation | `wallet/services/operation-journal/service.ts:436-453` `setOperationMeta` (title, subtitle; under `transitionLock`) | adapt: one more field |

## Facts the plan rests on

- **Fee window.** `popup/windows/fee/index.vue:113` labels Confirm `Send for ${feeFigure(feeDisplay(fee, undefined))}`, built from the question so it names the fee before the card mounts. Only `FeeRaisedCard` reads a price (`fee/index.test.ts:232-248` pins one refresh, after the session gate). The footer's label is one `<Text color="inverse">` at `lh--100` inside a `nowrap`, `overflow: hidden` button with `min-height: 40px` and no vertical padding (`DappApprovalFooter.vue:55-67`, `packages/design/src/ui/Button.vue:152-202`). The card's "Was … · Now …" is one `Text variant="meta"` at line-height 1 that wraps (`FeeRaisedCard.vue:69-73`): the tight rows the owner saw. Pins: `fee/index.test.ts:207-230`, `FeeRaisedCard.test.ts:41-79`, `tests/e2e/network/tx-sendTx-default.test.ts:196-200`. Nothing asserts the " · ".
- **Restore.** `keyOfRestoredAccount` (`full-backup-restore.ts:478-483`) drops a well-formed key whose scope is no restored account, refused or absent alike, with no row. `reconcileImportedAccounts` (`wallet/services/account/service.ts:1206-1233`) deletes this profile's keyless imported accounts and returns their scopes; `settleHeldAccounts` only warns their count (`full-backup-restore.ts:650`). A key row that fails to rewrap already has its own `imported-account-keys` row; its account is then dropped with none. Pins: `useFullBackupImport.test.ts:424-459,481-505`. Restore again never runs these stages (`useRestoreAgain.ts` imports only the account-state tail).
- **Holdings.** While `balancesState` is `loading`, `rows` is `[]`, so `awaitingFirstPriceAnswer` is false and the summary reads `$0.00` and `0 tokens` (`holdings.vue:101-117`). No test or e2e reads that moment; `holdings.test.ts:339-371` pins the price wait.
- **Settled titles.** `getTxTitle` returns `"Transfer"` for a transfer reading (`tx-enrichment.ts:111-117`); the detail page's Calls row already titles the same call `callTitle(c.method, c.contract, settledReading(c, tokens) !== null)` (`popup/pages/tx/[id].vue:148`). The Activity row shows the token symbol for the wallet's own send (`TransactionCard.vue:100-103`). The header is upper case, `nowrap`, ellipsized (`packages/design/src/ui/SubPageHeaderBase.vue:113-124`). The own send's method is the token ABI's chosen name (`transfer-executor.ts:451-468`), which may have no vocabulary label. Pins: `tx-enrichment.test.ts:182-183`, `tx/[id].test.ts:186-188`.
- **Window cards.** `OperationCard.vue:628` (createAuthWit Function) prints `callName(s.call, s.args)`, the label on any contract, though `s.args` is a `CallSurface` (`:175-188`) and `rowTitle` would read it; `callName` has no other production caller. `:540` (`simulate_utility`), `:580` (`aztec_simulateTx`/`aztec_profileTx`) and `:595` (`aztec_executeUtility`) print `humanizeMethodName`, two of them without the contract; the window decodes none of these calls (`display-calls.ts:33-40`, `operation-display.ts:86`). Pins: `OperationCard.createAuthwit.test.ts:91,144`, `call-surface.test.ts:153-172,348-366`, `OperationCard.long-strings.test.ts:140-155`; e2e `tx-transfer-row.test.ts:107` (a listed token, unchanged).
- **Journal.** A `dapp_execute` record is created at message arrival by `tryCreateQueuedJournal` (`wallet/services/wallet-sdk/queued-journal.ts:189-198`, the wire calls' `name`, `to`, `args` in hand) and, when no queued row exists, by `ExecutionLane.beginJournal` (`execution-lane.ts:155-185`, called through `claimOrCreateJournal` and `runInSlot` with method names only). Either stores `title` alone. The class a call runs is known only at the build (`tx-request-builder.ts:576-584`); no-`from` calls record none (`:460-464`). Records live in `chrome.storage.local` under `nulo:journal`, are in no backup slice (`backup-migration-registry.test.ts:191-196`), and parse through zod `journalMetadataShape` (`operation-journal/spec.ts:270-280`), which strips an unlisted key; `service.ts:309-325` forwards each metadata key under a `satisfies` that fails to compile on a missing one. Readers: `journalCardTitle`/`dappTitle` (`utils/journal-state.ts:432-459`; Home `RecentActivityView.vue:871`, terminal cards on Home and History), the journal page title and Method row (`journal/[id].vue:76-81,102-107`), and Home's executing-task fallback (`RecentActivityView.vue:180-191`). Pins: `journal-state.test.ts:402-411,466-471`; e2e `scope-refusal.test.ts:131,136,139` ("Transfer (public)" on a refused call).

## Collisions

- owner-feedback-1 arc 3 (#763, #766): `OperationCard.vue`'s app-set fee sentence and `TransactionIncomingCard.vue`. This arc edits other lines of `OperationCard.vue`; merge `dev` before the PR and retake the window shots.
- owner-feedback-1 arc 1 (#788): `utils/fee-estimation.ts`, `tests/e2e/rows.test.ts`. This arc changes neither.
- consent-display-1 arc 2: the execute window's register-token card (`OperationCard.vue`).

## Closed known limits read

#718 (a settled call can read as a movement the window showed plain), #724 (Holdings' price skeleton up to 60 s), #744 and #745 (held imported accounts), #461 and #475 (keyless imported rows), #522 (history plaintext at rest).
