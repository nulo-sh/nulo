# onboarding-1 recon

Base: `origin/dev` at `9ce6bb0bd`. Two Sonnet explorers (a reuse sweep and a test-harness map), then the planner's own reads. Paths are relative to `apps/extension/` unless they start at the repo root.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Render the shared confirm in the onboarding tab | `src/popup/components/popups/ConfirmPopup.vue` reads `cacheStore.confirm` and shows on `popupStore.isOpened("confirm")`; it imports only `@/composables/snackInset`, `@/composables/usePopupStack`, `@/stores/cache.store.ts` and composes `./popup-shared.module.css` (shared by 14 popups). `Popup` teleports to `#popup`, which `src/onboarding/app.vue` already declares. Only `src/popup/app.vue:4` imports a popup host (`PopupManager`), explicitly. | adapt: mount `ConfirmPopup` in the onboarding shell with the line `PopupManager.vue:79` uses |
| `PopupManager` as the host | 25 popups plus `IncomingTransferServiceClient`, `ConfigServiceClient` and `useIncomingTrustPrompts` (`PopupManager.vue:1-67`), which can open the incoming-trust prompt | rejected: brings a prompt and two connections the tab never had |
| Confirms reachable from onboarding | one: `useProfileImportFlow.ts:131` ("You already have this wallet", "Add anyway"), shared by the phrase and full-backup paths. No other `popupStore.open` is reachable from `src/onboarding/**` (searched `askConfirm`, `requestConfirm`, `useConfirm`, `popupStore`, `usePopupStore`). | reuse as is |
| A per-tab "this flow made a profile" marker | `src/onboarding/steps.ts:23-35`: `doneRoute(path)` puts `onboardingPath` in the done entry's `history.state`; `donePath` parses it as an enum (onboarding-3 D18). No `sessionStorage` anywhere in `src` (searched `sessionStorage` in `*.ts`/`*.vue`). `chrome.storage.session`'s `nulo:onboarding:tab-id` is one id for the whole browser (`wallet/utils/onboarding-tab.ts:20`). | adapt: the same history-entry state, written one step earlier |
| vue-router keeping a hand-written entry key | vue-router 5.2.0 merges `history.state` on `replace` and on the current entry before `push` (`dist/vue-router.esm-browser.js:868-877`), and its diagnostic prescribes `history.replaceState({ ...history.state, ...yours }, "")` (`:325-326`) | reuse as is |
| "Phrase not saved" state | `useGetStarted({ profileId })` (`src/composables/useGetStarted.ts`) reads the per-profile flags live, an unread flag reads not done; `phraseSaved` is written by `onboarding/pages/create.vue:157` ("I saved it") and `popup/pages/settings/security/export/seed.vue:93` (words shown); `imported` hides every reminder (`utils/get-started.ts:141`). Home's step title is "Save your recovery phrase" under the card label "Get started" (`GetStartedCard.vue:13,26`). | reuse as is |
| Showing the words again | `exportMnemonic` opens only with the password or a passkey answer (`wallet/services/profile/service.ts:2225-2235`); Settings' reveal (`seed.vue`) owns the unlock, the wrong-password state, the passkey ceremony and the lock fences. Onboarding may not import popup pages (`biome.json:510-513`). | not reused: see plan D4 |
| Duplicate refusal | `DuplicateWalletError` thrown at `service.ts:2339`, `details.existingProfileNames` (unvalidated, filtered to strings at `useProfileImportFlow.ts:96-98`); `ConfirmPopup` renders it as text (`ConfirmPopup.vue:63-64`), no `v-html` | reuse as is |

## Test harness

- `src/onboarding/app.test.ts` shallow-mounts the shell with mocked `vue-router`, `@/utils/core`, `useProfileBootstrap`, `ConfigServiceClient` and `@/stores/app.store`; no Pinia. Its "resume" block (`:105-137`) pins today's rule: any active profile goes to Ready.
- `pages/done.test.ts` sets the entry with `window.history.replaceState(doneRoute(path).state, "")`; `pages/create.test.ts` and `pages/import.test.ts` mount with `createTestingPinia` and mocked `managers`.
- The extension's vitest config auto-imports APIs only, not components (`vitest.config.ts:12-14`), so a test sees a component only through an explicit import or a stub.
- Smoke e2e: `tests/e2e/onboarding-tab.test.ts` (7 tests, about 29 s Chrome, 45 s Firefox; `create with password` walks the phrase step at `:83-147`) and `tests/e2e/onboarding-import.test.ts` (1 test). No e2e reloads the onboarding tab; reload an extension page only through `reloadExtensionPage` (`tests/e2e/FIREFOX.md:55`). `tests/e2e/duplicate-phrase-import.test.ts` drives the popup page only. The profile chaos model has no page reload and its `onboardingCreate` needs zero profiles (`helpers/profile-chaos/model.ts:1401`), so it seeds nothing here.
- Composition tests cannot mount pages, route or reload (`tests/COMPOSITION-TESTS.md`).

## Open work and known limits

- Open issues on this surface: #1385, #1386, #1387 only (searched `onboarding`, `PopupManager`, `done page`).
- Closed known limits nearby, none touched: #727 (a Create bootstrap publishes after Back), #729 and #1164 (the phrase step and a lock elsewhere), #847 (`notFirst` on rare paths), #1165 (a worker down past the request bound).
- Prior decision: onboarding-3 chose "a reload lands on Ready" for the phrase step (`implementations-plan/archive/onboarding-3/plan.md`, line 140), with Home's item as the safe side; the owner's 2026-10-30 words reopen that.
