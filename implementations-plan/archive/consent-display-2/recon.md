# consent-display-2: recon

Base `origin/dev` at `f55b7b4e6`. Two Sonnet explorers (the execute window's fee block and token-add card; the
Delete Profile, forgot-password and delete-chain pages) and the planner's own reads of the capability window.
No open issue covers any of the four surfaces (`gh issue list --state all` searched for capability window,
private events, Private Fee Juice, flagged token, registerToken, Delete Profile, imported accounts, contract
class, consent). Closed limits read: #931, #794, #809, #807 (none is reopened by this lane).

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Row titles, flags, chips, switch defaults | `apps/extension/src/popup/windows/capabilities/permission-rows.ts` (pure; only `authorizationsRow` and `holdsCallScope` are also read by Settings' `connected-apps/[id].vue`) | adapt |
| New rows and held rows from the grants | `build-items.ts` `newRows`, `plainRows`, `heldEntries`, `newDataRows` | adapt (thread the wallet's names, the resulting grants into the events default) |
| Names the wallet vouches for | `payload.params.knownContracts` (`dapp-interaction/known-contracts.ts`: Fee Juice, the two protocol FPCs, Auth registry, verified defaults; lower-cased) | reuse-as-is |
| Contract keying as the scope check compares | `fieldAddressKey`, `sameFieldAddress` (`packages/wallet-bridge/src/field-address.ts`); `isAnyContractScope`, `coversAnyContract` (`method-scope-checkers.ts`) | reuse-as-is |
| "Call scope" | `holdsCallScope` doc and `coversAnyContract`: `transaction` scope plus `simulation.transactions` scope, never utilities | reuse the definition |
| Details table model | `details-table.ts` `buildDetailsTable`, `collect`, `rowFor`, `tableLabel` | adapt (three boolean columns, a class section) |
| Details table view | `components/composite/capabilities/DetailsTable.vue` (worded heads, `COLUMNS`, `spokenName`) | adapt |
| PrivateFPC test | `wallet/services/fpc/private-fpc-address.ts` `isPrivateFpc`; `execute/fee-figure.ts` `personPaysAppPayment` (`aztec_sendTx` with `exec.feePayer` the PrivateFPC, or a claim to the account) | reuse; split out the PrivateFPC half |
| The app-fee sentence | `popup/components/modules/send/AppFeeLine.vue` (only consumer: `OperationCard.vue:394`) | adapt (one prop) |
| The flagged banner | `popup/components/modules/general/FlaggedTokenBanner.vue` (no props; token page, Send) | reuse-as-is |
| The signed list's flags in the popup | `usePrices` → internal `listState()` (`getQuotes`, which never fetches; adopts broadcasts) and `isFlaggedToken` (`utils/token-flag.ts`). No token-list client exists in the popup | reuse `usePrices` as-is (the plan's D10) |
| A consent tick that starts unticked | `Checkbox` (`@nulo/design`, role checkbox, Enter/Space); `LegalConsent.vue` "never seeded" with its remount test | reuse `Checkbox`, copy the remount test shape |
| Window-level Confirm gates | `execute/index.vue` `confirm-disabled` list and the same early returns in `approve()` (`:415-447`) | adapt (two gates) |
| Imported-account marker and lister (arc 2) | `Account.type === AccountType.Imported`; `AccountService.getAccounts(profileId, chainId, all)`, no session check in its body; a paused reset's `reset.heldImported` (journal-held imports after a purge) | reuse, unlocked only (OA-1) |
| "It also deletes the imported account …" (arc 2) | `components/stale-network/copy.ts` `deleteChainImported(names, exportable)` | reuse-as-is |

## Facts the plan rests on

- The capability rows: `transactionRow` reads "Every transaction" (`permission-rows.ts:214`); the metadata-only branch
  reads "See details of contracts in your wallet", never flagged (`:129-137`); `privateEventsRow` reads "See private
  events from its contracts" (`:186`); `contractClassesRow` takes only the network name (`:141-150`);
  `privateEventsDefault` is On for any list (`:258-260`).
- `collect` feeds no column from `contracts` without `canRegister`, from `data` or from `contractClasses`
  (`details-table.ts:49-57`); `details-table.test.ts:103` pins that.
- The execute window's embedded-fee branch draws a green `square-check` for every app payer and the probe line
  "This app's fee contract may not cover this fee right now." on `appPayerFunding.funded === false`
  (`OperationCard.vue:383-415`). The probe reads the payer's public Fee Juice, for the PrivateFPC its pool
  (`sponsor-funding.ts:76-87`); `provenShort` holds Confirm through `payerShort` (`index.vue:198-202`).
- The `register_token` card has no flag read (`OperationCard.vue:467-501`); the window's clients are execution,
  interaction and token (`index.vue:100-102`).
- `usePrices` calls `refreshIfStale()` on creation (`usePrices.ts:82-90`), which can fetch quotes; `getQuotes()`
  never fetches (`price/service.ts:167-170`) and carries `flaggedTokens` whatever the fiat setting.
- E2E: no e2e reads a row title or the Details heads. `cap-request-partial.test.ts:27` expects the events switch
  On for `data-scopedEvents` (events on the token, no call scope): it changes. `data-privateEvents.test.ts`
  already expects Off for `"*"`. `fee-sponsor-funding.test.ts:246-312` pins the SponsoredFPC card's text (must
  stay). `selfpay-phase.test.ts` drives the PrivateFPC routes with `approveExecute` only. `register-token.test.ts`
  is the one add-token e2e; no e2e drives a flagged add. `cap-window.test.ts:122` pins S2's overflow at 12 px.
- Arc 2: `reset.vue` is `isAuthRequired: false` and reachable from the lock screen's "Lost your password?"
  popup (`ForgotPasswordPopup.vue:18`); the account export page is `isAuthRequired: true`, takes `?address=`, lists
  only the active chain's accounts and bounces passkey profiles; delete chain names imported accounts only from a
  paused reset's journal (`networks/[id].vue:46-51,147-187`); `networks/[id].test.ts:141-170` pins the copy.

## Collisions

- PR #964 (firefox-files-1) edits the export pages "Export first" leads into: arc 2 waits for it (lane brief).
- firefox-sidebar-1 edits the popup shell, not these windows. dapp-boundary-4 edits `packages/wallet-bridge`
  metadata and class reads, not the popup. execution-integrity-2 edits the Send executor and `send.vue`, not
  `OperationCard.vue`'s embedded branch. No file overlap found for arc 1.
