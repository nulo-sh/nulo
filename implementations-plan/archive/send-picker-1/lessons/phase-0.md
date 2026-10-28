# send-picker-1 phase 0: planning consults

## Codex, round 1 (gpt-6.1-sol, high, read-only; 2026-10-28)

Verdict: conditional approve, 8 findings. Each claim checked against the tree:
1. Selection identity: `TokenList`'s `Row.id` is the balance row's id; the pick must compare and emit `tb.token.id`, and the pick form must not depend on `selectedId` being set (no current token would turn rows into links). Verified (`SelectTokenPopup.vue:90-93` writes `token.id`). Accepted.
2. Amount kept: `AmountCard.vue:346-352` exits a USD session and clears the amount on a token identity change (fail-closed, stale quote); `:131-142` clamps a kept amount to the new decimals with its hint. Verified. Accepted as D9: token-mode amount kept through the card's existing swap rules; a USD session clears as today; send.test.ts with `realAmountCard: true`.
3. Request identity: `popupStore.close` deletes the payload (`popup.store.ts:31-37`), so `onAdded` is captured on show; a report is dropped when `appStore.scopeEpoch` moved since submit or the page unmounted. Verified. Accepted.
4. Report before the page's re-read: plausible but unverified (needs the page's one RPC to outlast the balance task). Accepted the local fix: re-read when absent, recheck, then pick; tests in both orders.
5. Focus after two closes in one flush: plausible but unverified. Accepted: N1 asserts focus on `send-token-trigger` right after the import; S1 closes New token by Escape and asserts the picker keeps focus.
6. A token whose name holds another valid address hides the add offer for that address (`matchesQuery` substring on name, `NAME_MAX_LENGTH` 80 in `token/seeder.ts`). Demonstrated by trace. Accepted: a full address matches by contract only, which is the signed rule ("an address a row holds").
7. D5 wording read as "row absent → unavailable"; the intent was loading. Accepted: an explicit truth table.
8. Validation: red/green vs controls, real AmountCard, root commands with their cwd, `audit:vue`, the armed smoke build, CI wall-clock. Verified against `package.json` and `_extension-smoke-e2e.yml`. Accepted.

## Opus Plan leg, round 1 (2026-10-28)

Verdict: conditional approve, 10 findings, all accepted after checks: `cacheStore.activeTokenIdx` is undefined after an empty fetch (`send.vue:705-706`), so pick mode needs its own prop; `popupStore.close` deletes the payload before a later read; `reloadTokens` only logs a failure (`send.vue:135`), so a pick must wait for a list that holds the token; `keepAmountFor` must clear on every watcher run; a list mounted before its snapshot loads offers to add a held token; the add button names its flag line; focus order follows component order (`PopupManager.vue:95-97`), not emit order, and the abort case becomes a known limit; the smoke setup refuses an unarmed dist (`global-setup-smoke.ts:20,55`), the network config retries twice unless `NULO_E2E_RETRY` (`vitest.e2e.network.config.ts:27`), `e2e:agent` is a root script; `holdings.test.ts:198` pins the store field; the row-pick control exists at `send.test.ts:990-1002`. Proportion: S2 merged into S1, the never-minted token dropped from N1 (D11).

## Codex final pass, fresh session (2026-10-28)

Verdict: conditional approve, 2 conditions.
1. D4 accepted a superseded read's list: read A holds the token, a later read B starts and rejects, so `tokens` never holds it and `activeToken` is undefined. Verified against `send.vue:121-129` (`reloadTokens` publishes only the latest read). Accepted: pick only when the reactive `tokens` holds the token; the double-race case leaves the token added but not picked.
2. D5 skeleton forever after the identity fetch's balance read rejects. Checked: `refetchIdentityScopedState` reads tokens, balances and contacts in one `Promise.all` (`send.vue:684-689`) and sets `tokens` only when all three land, so a rejected balance read leaves no active token and no corner. Not demonstrated; rebutted on resume.
Resumed: approve. Condition 1 verified fixed; condition 2 withdrawn after the trace.
