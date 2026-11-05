# send-picker-1 recon

One Sonnet reuse sweep plus the planner's own reads, at `0a659726c` (the worktree's base, `origin/dev`). `E` is `apps/extension`, `P` is `E/src/popup`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Holdings-style list: search, value order, pins, fold, add row | `P/components/modules/holdings/TokenList.vue` (presentational; literal `holdings-*` testids; rows are `TokenCard` links; `addToken` emit at :27, add rule at :86-89) | adapt: testid prefix, label, placeholder, sort switch, selection, flag check, a note slot |
| A row with symbol, fiat or name, both balances, first-sync skeleton | `P/components/modules/general/TokenCard.vue` (a `RouterLink` `<a data-testid="tokens-card">`, :75-113; skeleton on `updatedAt === 0`, :61) | adapt: a pick form, a native button |
| Row order and classes | `E/src/utils/token-order.ts` (`orderTokenRows`, `classifyRow`), `token-fold.ts` (`isHiddenHolding`, `foldLabel`), `token-search.ts` (`matchesQuery`: case-insensitive, contract prefix only after `0x`) | reuse as is |
| Address validity for the add row | `E/src/utils/aztec-address.ts` `isValidAztecAddress` (curve point; stricter than New token's `isValidHex`) | reuse as is |
| Scam flag for an address no row holds | `E/src/composables/usePrices.ts` `isFlagged({ chainId, contract })` (:135, :198) | reuse as is |
| Open New token filled in | `P/pages/holdings.vue:111-114` writes `cacheStore.preselectedTokenAddressToAdd` and opens `new_token`; `NewTokenPopup.vue:269-282` reads it on show | adapt: the popup payload instead of the store field |
| A popup handing a result to its opener | `ImportContactsPopup.vue:105-116` opens `edit_contact` with payload `{ contact, onSave }`; `EditContactPopup.vue:40` reads `popupStore.getPayload`; the payload lives only while the form is open. Also `cacheStore.confirm.callback` | reuse the payload-callback pattern |
| The added token's id | `NewTokenPopup.vue:205` `newToken = await tokenService.addToken(...)`; used only inside the popup; every success path toasts and emits `onClose` (:213-250) | adapt: report it |
| Send's token pick | `SelectTokenPopup.vue:90-93` writes `cacheStore.activeTokenIdx`; `send.vue:559-568` watcher closes the review, re-inits both types, clears the amount (not the recipient) | reuse; the add path keeps the amount |
| A new token reaching Send's list | `send.vue:108-118` `onTokenAdded` → `reloadTokens` (sequence-fenced) | reuse as is |
| "Never synced" vocabulary on Send | `send.vue:255` `tokenBalance.updatedAt !== 0` | reuse as is |
| The zero corner | `components/composite/send/AmountCard.vue:247-251` returns null on `!tokenBalanceByType`; pinned at `AmountCard.test.ts:128-134`; story `NoBalance` | adapt |
| A skeleton | `@nulo/design` `Skeleton` (`packages/design/src/ui/Skeleton.vue`), used by `TokenCard` | reuse as is |
| Section label with count | `@nulo/design` `SectionLabel` (`label`, `count`, `countTestid`) | reuse as is |

Absence trails: no popup result channel besides store fields and payload callbacks (grep `getPayload|callback|onResult|onSelect|popupStore.open(.*,` over `E/src`); no selection or click override in `TokenList` (grep `select|slot|emit(`); no address prop on `NewTokenPopup` (props: `show` only); no `onTokenAdded` in the picker.

## Facts the plan rests on

- `Popup.vue:120-139` renders its slot under `v-if="show"`, so the picker's `TokenList` mounts per opening and keeps its query while a popup stacks on top.
- `Popup.vue` (focus-trap) returns focus on close to the element focused when it opened; a removed element receives nothing.
- `SelectTokenCard.vue:54-62` is the only opener of `select_token`; with no token it opens `new_token` itself.
- `E2E_LIST_FLAGGED`'s address `0x00…f1` and the smoke's `UNLISTED` `0x12…02` both pass `isValidAztecAddress` (checked with the repo's function).
- `deployExtraTokensForAccount` (`E/tests/e2e/fixtures/aztec.ts:739-763`) deploys and mints a PUBLIC balance, skipping the mint at amount 0; it does not import.
- `network/send-picker.test.ts:36` asserts no search field with two tokens.
- The add row's text is pinned exactly by `holdings-add-token.test.ts:21` ("Add token 0x12…02"), so a flag line sits outside the button.

## Collisions

- Open issues near the area: #528 (form popups' submit live while their duplicate list loads; New token awaits its list before it fills the address, so the paste path is not that window), #1211 (a failure notice keeps its stacking place when popups below it close by code).
- Closed known limits searched (`picker OR holdings OR "new token" OR amount`): none covers this change.
- Decisions this lane reopens on the owner's call: home-holdings-pin's "the Send picker gains search only past Home's row budget"; ui-picks-1 OA-4 A (signed with P69-04 A), "at zero the corner shows no balance".
