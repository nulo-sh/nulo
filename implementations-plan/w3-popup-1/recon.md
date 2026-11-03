# w3-popup-1 recon

Base: `origin/dev` at `baec79333`. One Explore sweep (sonnet) plus the planner's own reads. Paths are under `apps/extension/` unless they name a package.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Page-scoped unmount fence | `pages/settings/connected-apps/[id].vue:51` already has `let unmounted`, set at `:209`, read only in `fetchAccounts` (`:133`, `:139`). `pages/tokens/[id].vue:147` and `pages/received/[id].vue:217-257` keep their own local fences. No shared composable (searched `unmounted`, `isClientDisconnectRejection`, `useScopeAlive`, `\balive\b` over `src`). | reuse as is: `fetchSession` reads the page's own flag |
| Disconnect detection | `isClientDisconnectRejection` (`@nulo/extension-messaging/errors`), used by `received/[id].vue:202`. The client rejects posted requests with the same error on `disconnect()` and on a port drop (`packages/extension-messaging/src/background/client.ts:101-105`, `:139-145`). | not used: it cannot tell an unmount from a port drop (D1) |
| Submit gate shared by button and Enter | `usePopupEntity` (`composables/usePopupEntity.ts:49`) calls the popup's `submit`; each `New*Popup` handler starts with its gate. Siblings put field verdicts in the gate and a processing error on the button only (`NewFpcPopup.vue:67-76`, `:154`; `NewAccountPopup.vue:44-51`). | adapt: `NewSenderPopup`'s gate reads `isAlreadyExist` |
| Edge-trim of invisible characters around an address | None (searched `Default_Ignorable`, `White_Space`, `trimStart`, `trimEnd`, `paste`, `isValidAztecAddress`). The class exists privately in `utils/contact-name.ts:11-12` (`\p{Default_Ignorable_Code_Point}`, `\p{White_Space}`), used with `g` to delete everywhere. | build new: `bareAztecAddress` in `utils/aztec-address.ts` (D3) |
| Typed-text rule | `stripBidiAndZeroWidth` (`utils/string.ts:46-54`), wired by `:normalize` on `RecipientField.vue:252` and `SettingsSearch.vue:75`, and by hand in `popup/windows/capabilities/AccountSelectRow.vue:52-62` (a native input, caret kept, a composing keystroke skipped). | reuse as is |
| `normalize` on a design `Input` | `packages/design/src/ui/Input.vue:138`, `:197`, `:336-338`. The developer searches use this `Input` (`settings/developer/account-state/{contracts,notes,authwits}/index.vue`). | reuse as is |
| Holdings' search field | `components/composite/SearchField.vue`: a native `<input maxlength="80">` with no `normalize` prop; one consumer, `TokenList.vue:117`, which serves Holdings and Send's token picker. No `SearchField.test.ts`. | adapt: the field applies the typed-text rule itself (D4) |

## Issue claims checked

- **#1486** holds by code trace. The Header renders over every page (`popup/app.vue:663`); the network chip pushes `/popup/settings/networks` while unlocked (`components/Header.vue:138-141`). The detail page renders nothing until the read lands (`[id].vue:217`). `onBeforeUnmount` disconnects the session client (`:208-213`), which rejects the pending `getDappSession`; `fetchSession`'s bare catch pushes the list (`:93-100`). The `!session.value` branch (`:102-105`) pushes too, unfenced. `getDappSession` throws for a missing or expired row (`wallet/services/dapp-session/service.ts:152-161`).
- **#1499** holds by code trace, at new line numbers: `isAlreadyExist` `:39`, the gate `:40-48`, `handleAddSender` `:70-71`, the button's `:disabled` `:166`. The verdict now reads "Already exists" (`ALREADY_EXISTS`, `utils/entity-rules`). Also traced: `validateSenderAddress` watches the address only (`:86-89`), so a list that lands after the address was typed shows no verdict.
- **#1405** holds. `showInvalidHint` `:69`, the hint `:233-238`, `isValidAztecAddress` strict hex (`utils/aztec-address.ts:21-28`). Send judges and sends the field's model (`pages/send.vue:233`, `:531`, `:647`).
- **#1406** holds for the behaviour; its proposed fix does not hold for Holdings: `TokenList.vue` renders `SearchField`, which takes no `normalize` (the issue says "each of those `Input`s"). `addCandidate` trims with `String.prototype.trim` only (`:93-96`). The developer searches filter on the raw term (`contracts/index.vue:27-28`, `notes/index.vue:100`, `authwits/index.vue:61`).

## Collisions

- `components/composite/general/AddressInput.vue:42-48` resets `scrollLeft` on an `insertFromPaste` input at the next animation frame (fu2-send-1, merged in #1544). The recipient's `normalize` already rewrites a paste (the zero-width space case), so a longer strip adds no new event order; the smoke `send-keyboard.test.ts` paste assertion stays in the gate.
- #1449 (enhancement, no owner decision) names `NewSenderPopup`'s verdict among the entity popups' inline rules; #1499 does not wait for it.
- Closed known limits in the area: #1404, #1407 (joiners and tags kept), #1408 (a `normalize` field moves the caret to the end after a mid-text strip). None blocks this lane.

## E2E that drives the touched surfaces

- Smoke: `send-keyboard.test.ts` (recipient, a real paste), `send-picker-add.test.ts` and `token-list.test.ts` (the picker's search and add), `holdings-add-token.test.ts` (Holdings' add).
- Network: `network/senders-advanced.test.ts` (New sender), `network/connect-check-window.test.ts` (the connected app's detail page).
- None drives the developer searches (searched `contracts-search`, `notes-search`, `authwits-search`, `account-state` over `tests/e2e`); their component tests are the only witness.
