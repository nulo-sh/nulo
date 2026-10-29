# send-side-1 recon

Base: `origin/dev` at `af025cfb5`. One Explore pass (sonnet), every claim below re-checked by the planner. `E` is `apps/extension`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Mark "this token change continues the form" | `keepAmountFor`, set by `pickAddedToken` and consumed by the `activeTokenIdx` watcher (`E/src/popup/pages/send.vue:567-590`) | reuse: widen it to the sides |
| Reset a side to the default and clamp it to the token | `initSendType` / `initReceiverType` (`send.vue:187-215`), the only clamp on a token change | adapt: skip the default for the kept case, keep the clamp |
| Keep a still-supported side when the same token's flags change | the capability watcher (`send.vue:594-598`) | untouched |
| Read the From side in e2e without a click | `readSendView(page).origin` = `fee-settings-card[data-origin]` = `selectedSendType` (`send.vue:886`); `strip.to` is `"public"` or `"hidden"` (`publish-facts.ts:107`) | reuse |
| Flip a side in e2e | `setActiveSendType` (`E/tests/e2e/fixtures/transfers.ts:26-43`) | reuse |
| A helper for "the side a token supports" | none: searched `supportsSide`, `clampSide`, `sendTypeFor` and the four flag names over `E/src` and `E/tests` | none needed (the clamp stays in the two init functions) |

## Facts

- Token flags are computed at read time from the stored interface (`E/src/wallet/services/token/utils.ts:12-18`), never stored. New token proceeds only when the parsed interface is complete (`NewTokenPopup.vue:210`, `isTokenComplete`, `utils.ts:21-30`), so a token New token creates lists with all four flags true; a contract already stored comes back as stored (`token/service.ts:440-446`), and a dApp's `registerToken` stores partial interfaces (plan F4).
- `cacheStore.preselectedBalanceType` defaults to `"private"` (`E/src/stores/cache.store.ts:43`); its one writer is Send's unmount, back to `"private"` (`send.vue:803`). The reset after a token change is therefore always to Private.
- `initReceiverType` gates its default on the Balances flags but clamps on the Transfers flags (`send.vue:203-213`); `SendTypesCard.vue:16-24` toggles From on Transfers and To on Balances. Pre-existing, out of scope.
- No unit or component test pins the sides after a token change. `send.test.ts:370` and `:385` pin the capability watcher on a same-token update; `send.test.ts:1040` pins that a row pick clears the amount.
- One e2e step pins today's reset: `E/tests/e2e/network/send-picker.test.ts:103-108` waits for "0 PICK" right after the import ("The pick re-selects the private side"), then flips From back to public. It is the only test that imports a token; `send-picker-add.test.ts` (smoke) escapes New token before any add.
- `deployExtraTokensForAccount` mints public only (`E/tests/e2e/fixtures/aztec.ts:739-755`), so PICK's public side reads 7 and its private side 0.
- Writers of `activeTokenIdx` while Send is mounted: `onTokenDeleted`, `pickAddedToken`, the `awaitingNewToken` watch, the identity fetch, `applyQueryToken` (all `send.vue`) and the picker's row pick (`SelectTokenPopup.vue:76`). The watcher runs on `flush: "pre"`, so two writes in one tick give one run.
- #1342 measured the import case at 18.0 s (Chrome) / 19.8 s (Firefox), the file's other case at 51.8 s / 50.5 s (its PR body).

## Collisions

- Lane fee-race-1 also edits `send.vue` (fee card, estimate, review sheet). The watcher calls `closeReview()`; the diff here stays off that line and off everything below the watcher.
- Closed known limits searched (`send side`, `send picker`): #1339 and #1340, from the picker lane; neither touches the sides.
