# import-retry-1 recon

At `612d2809d`. One Explore agent (sonnet) on the e2e restart helpers and the #1792 capture; the rest read directly.

| Need | Found | Use |
|---|---|---|
| A restart's failure on a record | `JournalReaper.start()` boot sweep and `reapUnlocked` (sealed rows), `classifyReapKind` (`apps/extension/src/wallet/services/operation-journal/reaper.ts`) | one branch for `token_import` |
| The row's reason line | `TokenImportRow.vue` `subtitle` (`error.message || "Couldn't add token"`) | map the new kind |
| A Retry control on a token row | `TokenSeedRow.vue` `.retry` (`token-seed-retry`, RETRY) | share the style |
| The import path | `NewTokenPopup.vue` `handleAddToken`: `parseTokenInterface`, `isComplete`, `addToken(..., { origin: "popup" })` | the same two RPCs |
| One row per contract | `home-slots.ts` `splitImports` / `outranks` / `landed` (defaults only) | extend `landed` to user imports; add `supersededImports` |
| Retry dispatch test seat | `TokensView.test.ts` (hoisted client mocks, journal events) | add a token client mock |
| A worker restart in e2e | `stopBackground` (`tests/e2e/fixtures/browser/index.ts`), `unlockAfterBackgroundDeath` (`fixtures/auth.ts`); pages closed first | the scenario |
| A pending import row in e2e | `seedTokenImport` (`tests/e2e/helpers/activity-seeds.ts`), `readActivityScope` | seed before the restart |
| Both-theme shots | `shotSend` (`tests/e2e/fixtures/send-page.ts` re-export of `fixtures/shots.ts`), opt-in via `NULO_E2E_SHOT_DIR` | the captures |
| A sandbox token | `aztecConfig.tokenAddress` (TST), imported fresh by `network/tokens.test.ts` on a file-scoped `localNetworkExtension` | a file of its own, so its import is fresh |

Specs that read the import row: `network/tokens.test.ts`, `type-roles.test.ts`, `shipped-token-list.test.ts`, `rows.test.ts`, `home-links.test.ts`. None asserts `token-import-failed` or failure text.

Closed known limits near the area: #794, #1340, #1681, #1801 (none covers a restart).
