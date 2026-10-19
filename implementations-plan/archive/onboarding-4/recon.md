# onboarding-4: recon

Base: #743's head `bcee404d` (`origin/worktree-onboarding-3`). One Sonnet Explore agent (reuse sweep) plus the driver's own reads. Paths are under `apps/extension/` unless they start with a package or repo-root name.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| A per-profile UI flag, cleared on deletion and on id adoption | `src/utils/profile-ui-keys.ts`: prefix constants, `PROFILE_UI_KEY_PREFIXES`, `profileImportedKey`; `profileUiKeys(id)` is removed by the deletion coordinator (`src/wallet/services/profile-deletion/coordinator.ts:135`) and by `dropUiKeysBeforeAdoption` inside `persistNewProfileHoldingLock` (`src/wallet/services/profile/service.ts:1443-1454`) | adapt: one prefix, one builder; cleanup comes with the array |
| A flag the service writes after a row commit, best effort, under the lock | `markImportedHoldingLock` (`service.ts:1460-1466`), called by the four import commits (`:2152`, `:2200`, `:2376`, `:2532`) | adapt: take the key as its argument, so one helper writes both flags |
| "Does another profile exist?" | inline only: `(await this.repo.getAll()).filter/some(p => !this.deletionState.isReserved(p.id))` in `getProfiles` (`:610`), `assertNotDuplicateWallet` (`:2080`), `assertNotDuplicateCredential` (`:2097`). `ProfileRepository` has `get`, `getAll`, `contains`, `set`, `delete`, `generateUniqueId`; no `getKeys`, no count (`repository.ts`). Searched `firstProfile`, `isFirstProfile`, `profiles.length`, `getProfiles().length` in `src/`: UI-side hits only (`boot-session.ts:73`, `locked-state.ts:33`, `route-guard.ts:76`, `onboarding/app.vue:83`, `onboarding-tab.ts:99`, `reset.vue:92,110`) | build new: one private predicate in the service, the same filter as `getProfiles` |
| Reading and following the flags | `src/utils/get-started.ts`: `KEYS`, `getStartedKeys`, `changedGetStarted`, `readGetStarted`; `src/composables/useGetStarted.ts` (`NOTHING_DONE`) | reuse: a new `KEYS` entry is read, listened for and typed everywhere at once |
| The card's rule | `getStartedView` (`get-started.ts:113-129`), about 10 decision points, not in the complexity manifest; budget 15 in the root `biome.json` | adapt: the first-profile-only rows move into one helper |
| The card with the phrase row alone | today's form for a password profile after Hide (`GetStartedCard.vue`; `implementations-plan/archive/onboarding-3/screenshots/chrome-home-password-after-hide-*.png`) | reuse: no component change |
| Tests | `service.integration.test.ts:1376` (an import marks, a create does not, a refused write still imports; `FakeBrowserApi`); `get-started.test.ts` (`:36-45` pins `getStartedKeys`; the view cases from `:101`); `useGetStarted.test.ts` (`:61,130,164` compare whole flag objects); `general.test.ts:160` (`Home — an imported profile`, `mountHome(type, storedKeys)`); `profile-ui-keys.scan.test.ts` (a prefix is letters only; every `*Key` export is enumerated) | adapt each |
| E2E: Home's card | `security-backup.test.ts:58-75`, `onboarding-tab.test.ts:133`, `keyboard-guards.test.ts:49`, `passkey-paths.test.ts:166`, `network/hero-prices-unavailable.test.ts`, `network/store-captures.test.ts:325`; `waitForHomeReminders` (`fixtures/tokens.ts:117`) | reuse |
| E2E: a later profile | `createAndActivateProfile` (`fixtures/profiles.ts:11`): lock screen, picker, New profile, Password; used by network specs only. A later passkey profile: a local helper in `passkey-toolbar-panel.test.ts:217-236` with `setupPasskeyVirtualAuth` (`fixtures/passkey.ts:52`). No spec creates a later profile and then reads Home's card (searched `get-started` in `tests/e2e/**`) | reuse the password fixture |
| Pictures | `shotSend(page, name, focus)` (`fixtures/send-page.ts:224`): opt-in by `NULO_E2E_SHOT_DIR`, both themes, at the popup's 360x600 (`fixtures/wallet-pages.ts:140`); the popup's width is `--base-width: 360px` (`packages/design/src/base.css:68`) | reuse |

## Conventions

- Builders in `profile-ui-keys.ts` carry one doc line naming the writer. Prefixes end in `@`, letters only.
- `MarkableGetStartedFlag` excludes the service-only flags, so no page can set them.
- Callers of `markGetStarted`: `useFullBackupExport.ts:436`, `onboarding/pages/create.vue:111`, `settings/security/export/seed.vue:76`, `useGetStarted.ts:56`. Readers of the flags: `useGetStarted.ts`, `general.vue:33,76`.

## Collisions

- #839 (ui-dedupe-2) edits Home's import rows in `TokensView.vue`, not the card.
- structure-2 arc 3 and test-infra-1 arc 4 also stack on #743. Only test-infra-1 names a file near this lane: it moves `profile-ui-keys.scan.test.ts` onto a shared walker, and this lane does not edit that test.
- No other reader or writer of the Get started flags (searched `getStarted`, `get-started` in `src/`).
- Closed known limits for the area: #728 (Full Backup's flag write can die with a toolbar popup), unaffected.
