# holdings-add-1 recon

Base: `origin/dev` at `c1bca82cb`. One Sonnet Explore sweep plus direct reads.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Parse → add → balance wait → toast | `NewTokenPopup.vue:167-275` (`handleAddToken`, `createBalanceWait`, `closeAdded`); nowhere else | adapt: extract into `src/composables/useTokenImport.ts`, popup calls it |
| Parse → add without wait | `modules/general/token-import-retry.ts:44-52` (`retryTokenImport`, a failed journal row's retry) | leave: no wait, no toast, other contract (`isLive` guard) |
| "Already exists" / "Invalid address" check | `NewTokenPopup.vue:40-51` (`useFormState` validator over `getTokens`) | adapt: pure `contractVerdict` both use |
| Busy state on a button | `@nulo/design` `Button` `loading` (`Button.vue:119-130,172`: spinner, `aria-busy`, `pointer-events: none`, stays focusable) | reuse |
| Refusal announced | inline `role="alert"` (`send/AmountCard.vue:566` is the closest analogue) | reuse |
| Focus to a row after an action | `settings/networks/index.vue:82`; `EndpointOrderList.vue:237` moves focus only from `body` | reuse the pattern |
| Holdings rows | `useTokenBalanceSnapshot` over the active account's balance rows (`token-order.ts:95-113`) | reuse; live `onTokenBalanceAdded` lands the new row |
| Screenshot kit | not in the tree; commit `782858322` `apps/extension/capture/ca2/` (Vite page over fake clients, 400 px, 2x, light/dark) | reuse uncommitted for the captures |

Searched for other add paths: `parseTokenInterface`, `addToken(`, `createBalanceWait`, `BALANCE_WAIT_TIMEOUT`, `onTokenBalanceAdded` in `apps/extension/src`.

## Entry points that open `NewTokenPopup` (`popupStore.open("new_token")`)

`TokensView.vue:343,417` (tokens menu), `settings/tokens/index.vue:144`, `send/SelectTokenCard.vue:67`, `SelectTokenPopup.vue:84` (Send picker add row, with `onAdded`), `pages/holdings.vue:124` (this lane's).

## What the popup shows or checks between open and its import press

1. Field: `isFieldAddress` → "Invalid address"; a contract in `getTokens(profile, chainId)`, any case → "Already exists" (`NewTokenPopup.vue:43-48`). Both `role="alert"` beside the field; the button stays off.
2. Button off until profile, network and account exist (`:57-65`); the press re-checks → "Account is still loading. Please wait a moment and try again." (`:177-180`).
3. After the press: incomplete interface → "Couldn't auto-detect this token's interface. Try a contract whose ABI matches a known standard." (`:211-215`); `ContractNotFoundError` → "There is no token at this address on this network."; any other throw → "Something went wrong. Try again." (`:264-270`). Shown under the button, no live role.
4. Chain mismatch: "Token added" toast, close, no `onAdded` (`:223-228`). Synced, success, timeout, error: `closeAdded` with one of three toast labels; `onAdded` only in the same `scopeEpoch` (`:88-93,250-263`).
5. No flag, warning, choice or listed-token metadata: the popup never reads the signed list. "Flagged as a scam" shows on Holdings under the Add row (`TokenList.vue:99,143`).

## Facts that shape the design

- Holdings offers Add only for a curve point no row matches (`TokenList.vue:95-98`, `isValidAztecAddress`), so "Invalid address" is unreachable from it.
- A token can sit in `getTokens` with no Holdings row (its balance-row creation for this account failed or is pending, `token-balance/service.ts:503-518`). There `addToken` returns the existing token without an event (`token/service.ts:444-451`), so a direct add with no "Already exists" check would wait with no timer (known limit #1681's path).
- `ServiceClient.connect()` opens synchronously and never rejects (`extension-messaging/src/background/client.ts:66-70`).
- An added token with a zero balance folds behind "N empty" once its balance lands (`token-fold.ts:14-18`), today too.

## E2E that drive the surfaces

- `tests/e2e/holdings-add-token.test.ts` (smoke): render, shot, click → popup filled. Its render checks duplicate `TokenList.test.ts:206-215` and `type-roles.test.ts:623-636`.
- `tests/e2e/network/holdings.test.ts:107-143`: Holdings → popup → submit → PASTE row; then no-contract → popup refusal.
- Unaffected by this change but touching `TokenList`: `token-list.test.ts`, `send-picker-add.test.ts` (smoke), `network/send-picker.test.ts`.
- Unit pin to change: `pages/holdings.test.ts:331-341` ("the add row opens the New token popup").
