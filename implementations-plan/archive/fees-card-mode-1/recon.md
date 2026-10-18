# fees-card-mode-1: recon

Read at `origin/dev` `dc4a88ec`. Two Explore agents (Sonnet) plus the driver's own read of the card, its four callers, the test file and the sibling lanes' branches (read through git objects, never their worktrees). Paths are relative to `apps/extension/src` unless they start with `apps/`, `scripts/` or `implementations-plan/`.

## The card today

`popup/components/modules/send/FeeSettingsCard.vue`: 1,021 lines (878 script, 103 template, 31 style). The study's counts (`study-513`, measured at `0fe841be`) hold at `dc4a88ec`: the card is unchanged since.

- 18 lines read `props.originPrivacy`; 15 switch on the mode (13 tests, plus `sendSelection` null at `:278` and `:326`). The template has no mode branch; it binds `:data-origin` at `:888`.
- Callers: `pages/send.vue:821-839` (origin, destination, queue, readout, `txShape`, five out-models); `windows/execute/OperationCard.vue:397-409` (`embedded`, `lockedMethod`, `update:payer`); `popups/RevokeAuthwitsPopup.vue:243-252` and `popups/ChangeAuthwitsRegistryPopup.vue:152-160` (`fallsBack`).
- Send always passes an origin: `selectedSendType` starts `"private"` (`send.vue:181`) and is only ever set to `"private"` or `"public"` (`:186-194`, `:558-559`). No app caller passes one; the prop defaults to `null`.

## Claims that did not hold

| Claim | Source | Reading at `dc4a88ec` |
|---|---|---|
| The execute window passes `fallsBack` | #513 body | It passes `embedded` and `lockedMethod`; only the two authorization popups pass `fallsBack` (also found by the study). |
| "18 mode branches" | #513 title and body | 18 references, 15 of them mode switches (study § 2). |
| Verdict refs at `:138-152`, Send derivation at `:217-262` | #513 comment (F-12) | `:133-146` and `:214-266` (study § 4); the line numbers did not move since `110446a4`. |
| onboarding-3 adds a Presto line to the card | lane brief, Collisions | onboarding-3's plan (decision D6, branch `worktree-onboarding-3`) ships no fee-card line: "Nothing on Send changes". No file overlap. |
| consent-display-1 edits the app-set fee row | lane brief, Collisions | That row lives in `OperationCard.vue` (and in fees-display-1's new `send/AppFeeLine.vue`), not in this card. No file this lane edits. |

## Leftovers the plan must dispose of (brief: "cleaned up or filed, never silently kept")

1. `destinationPrivacy` (`:74`): declared, never read. Passed by `send.vue:830`, declared by the stub in `pages/send.test.ts:179,187`, passed in `FeeSettingsCard.test.ts:1856,2824,2883,3089,3118`.
2. Send-mode recovery: `recommit` (`:763-780`) reads the app key through `readSavedFeeMethods` on every card; `commitFromEntry` then skips the reconcile for Send (`:588`), so the read is discarded.
3. Not in the study: `cacheStore.feePaymentMethods`. The card writes it (`:400-405`, app picks of a sponsor) and filters it on unmount (`:879`). Nothing reads it: `grep -rn feePaymentMethods apps packages` finds only the store's declaration (`stores/cache.store.ts:45,69`), the card, and three test assertions (`FeeSettingsCard.test.ts:532-548, 593, 679`). Present since the starting commit.
4. Not in the study: `isMethodsDropdownOpen` (`:184`): set by the template's `@open`/`@close` (`:902-903`), never read.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| C1 composable shape (receives connected clients, exposes `dispose`) | `composables/usePrices.ts`, `useAuthRegistryStatus.ts`, `useConfigRead.ts`, `useFeeEstimationMap.ts`; all `.ts` with a colocated `*.test.ts` | reuse the pattern |
| A long composable under the 80-line function budget | `composables/useFullBackupExport.ts`: a state object (`createExportState`, `:469`) plus module-level functions over a `ctx`, a thin exported composable (`:492`) | adapt: the snapshot lifecycle is ~200 lines, Biome counts nested functions in the outer one (`biome.json:58-65`) |
| Composable tests outside a component | `effectScope()` + `scope.run(...)` (`useFeeEstimation.test.ts:19-28`, `useIncomingTransfers.test.ts:47`); no shared `withSetup` helper (searched `withSetup|effectScope`) | reuse |
| A mode / strategy object chosen at setup | none (searched `Policy\b|strategy|mode ===` in `composables/`, `utils/`); `utils/confirmation-policies.ts` is a data table, not a pick-one composable | build new; the TypeScript interface is what enforces "one return shape" |
| Pure fee decisions | `send/fee-helpers.ts` (`buildFeeMethods`, `settingsForMethod`, `resolveSavedSelection`, `savedSelectionOf`, `defaultSponsor`, `liveFeeScope`, `feeScopeKey`, `isLiveFeeScope`), `send/fee-privacy.ts` (`resolveSendSelection`, `previewForPick`, `recordOf`, `applyFpcEdits`), `utils/fee-picks.ts` (`readAppPicks`, `readSendSlots`), `utils/profile-ui-keys.ts` | reuse as-is; the rule books wrap them, never restate them |
| Balances-store lifecycle | only the card and `modules/general/GasBalanceCard.vue:121-128` (inline, no run supersession) call `subscribe`/`ensure`; no composable wraps them | build new (`useFeeSnapshot`), moving the card's code verbatim |
| Run supersession | `composables/runFence.ts` (`begin`/`invalidate`/`snapshot`) | rejected for this arc (ledger D7): the card's counters also own the loading and reading flags |
| Prices | `composables/usePrices.ts` | reuse as-is; stays in the card |
| Layer rules for `composables/**` | no `noRestrictedImports` override (searched `biome.json`); 11 composables import stores, `@/utils/core` or `@/utils/storage` | may import the store and the storage facade; the profile manager's `saveFeePick` is passed in |
| Static guards a moved line meets | `utils/storage-facade-ban.test.ts`, `utils/log-payload-ban.test.ts`, `utils/copy-dash-ban.test.ts` scan `.ts`/`.js`/`.vue`; `utils/type-role-ban.test.ts` reads templates and CSS only | no new allowlist entry: log lines move verbatim, copy stays in the card |
| Before/after pictures | `tests/e2e/fixtures/send-page.ts:224` `shotSend` (both themes in one run under `NULO_E2E_SHOT_DIR`); `tests/e2e/network/type-roles-windows.test.ts:196,353` (`shot` per window request); no pixel-diff library or image snapshot (searched `pixelmatch|toMatchImageSnapshot|toHaveScreenshot`); `Bun.Image` is present in Bun 1.4.2 | reuse; the pixel compare is a scratch script, never committed |
| Stories | none for the card or `FeeMethodSelector` | not used |

## Tests

- `FeeSettingsCard.test.ts`: 3,167 lines, 137 declarations (61 mount Send, 76 the app mode). Real balances store; mocked clients; a `chrome.storage.local` fake (`:156`), with a gate around `get` in the Send block (`:1842-1850`).
- One test reads script internals: `:3067-3081` reads `vm.sendSelection` and pins that a pending result keeps its identity while unread identity fields change.
- `:2054-2074` ("during a recovery recommit's storage read: ends resolved for the live origin") holds a Send recovery on the storage read that leftover 2 performs.
- No test flips `originPrivacy` between a value and `null` on one card; private ↔ public flips: `:2035-2116`, `:1983`, `:2634`.
- Real-card mounts: `modules/fee-cards.comount.test.ts:141`, `OperationCard.fee.test.ts`. Stubbed: `pages/send.test.ts:177`, the other `OperationCard.*.test.ts`, `RevokeAuthwitsPopup.test.ts:91`, `ChangeAuthwitsRegistryPopup.test.ts:87`.
- Complexity baseline: only `FeeSettingsCard.test.ts` (one cognitive acceptance, the storage fake at `:156`); nothing for the `.vue` or `composables/`.
- E2E reaching the card: smoke `send-fee-privacy.test.ts` (Send, `data-origin`, degraded notice); network `fee-sponsor-funding.test.ts` (Send, sponsor verdicts, `shotSend`), `fee-methods.test.ts` (Send), `same-token-concurrent-sends.test.ts` (Send, `shotSend` on the card), `tx-sendTx-selfPay.test.ts` (execute window, `send-fee-locked`), `tx-sendTx-default.test.ts` and `tx-sendTx-sponsoredFpc.test.ts` (execute window). `network/authwit-lifecycle.test.ts:118-197` submits both authorization popups through the real card with `fallsBack` (the explorer missed it; the Opus audit found it). Nothing reaches the nudge or the shortfall in e2e; the card's unit tests do.

## Collisions (files)

| Lane | State 2026-10-17 22:2xZ | Files this lane also edits |
|---|---|---|
| fees-display-1 (#515) | arc 1 at its final head, PR not yet merged | `FeeSettingsCard.vue` (display computeds, the shortfall row, imports), `FeeSettingsCard.test.ts`, `pages/send.vue`, `pages/send.test.ts`, `src/types/auto-imports.d.ts` |
| consent-display-1 | planning | none |
| onboarding-3 | arc running | none |
| send-fees-ux arc 2 | branch exists | none (`FeeCostReadout`, `SendReviewSheet`) |
| call-vocabulary-1 PR #721 | open | none |

Known limits in the area: #569 (a send pressed while the sponsor row is edited), #394 (a pick saved into a restored profile). Neither is touched.
