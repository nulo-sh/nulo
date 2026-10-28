# lock-ux-1 recon

Read at `dev` 78f5f9171. One Sonnet reuse sweep plus the planner's own reading. Paths are relative to `apps/extension/` unless they start with `packages/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Confirm before a settings save | `composables/useConfirm.ts`; the strict-mode toggle in `popup/pages/settings/lock.vue` (`onStrictToggle`) | reuse-as-is |
| Knowing that a confirm was cancelled | `ConfirmRequest.callback` runs on Confirm only ("Cancel and dismiss run nothing", `stores/cache.store.ts:21`). One caller watches `popupStore.isOpened("confirm")` for the close: `useDuplicateConfirm` in `composables/useProfileImportFlow.ts:125` | adapt (see plan D1) |
| 5-minute countdown that closes a secret | `composables/useSecretCountdown.ts` (`start`, `disable`, `countdownLabel`, scope-disposed) and `components/composite/SecretCountdownClose.vue` (a Close button with a progress bar, and a "Disable auto-close" ghost link) used by `settings/security/export/seed.vue` | composable reuse-as-is; the ghost link adapt (plan D3) |
| Onboarding phrase step | `onboarding/components/OnboardingPhraseStep.vue` (emits `saved` / `later`; no test file); `onboarding/pages/create.vue` drops the words on lock, session end and worker reconnect, and on unmount | adapt |
| "File saved" state after a download | `settings/security/export/full.vue`: `backupStatus === "downloaded"` titles the banner "Saved to your downloads" and swaps the download button for Close (`backup-close-btn`), focused by a watcher | reuse the pattern in `export/account.vue` |
| Duplicate-phrase report | `assertNotDuplicateWallet` (`wallet/services/profile/service.ts:2330`) throws `DuplicateWalletError` (`packages/extension-messaging/src/errors.ts:542`) with `details.existingProfileName` of the FIRST match; details cross the worker hop as data (`walletErrorFromPayload`) | adapt |
| Lock screen selection | `popup/lock-screen-profile.ts` `lockScreenProfile(profiles, lastActiveId)`: the single policy, called by `pages/auth.vue`, `boot-session.ts`, `locked-state.ts` and `route-guard.ts`. Callers open the chooser when it returns `undefined` with profiles left (`auth.vue` `settleProfile`, `locked-state.ts` `land`) | adapt |
| Profile recency or age | none. Searched `createdAt`, `lastUnlock`, `unlockedAt`, `created` in `wallet/services/profile/*.ts`, `spec.ts` `ProfileInfo` and `wallet/storage/stored-shapes.ts`: `ProfileInfo` is `id, name, type, retired?, recoveryMode?`. The only recency datum is `nulo:ui:lastActiveProfile` (`utils/lastActiveProfile.ts`), one id | build new only under #1228 option B |
| Pictures in the real popup | `tests/e2e/fixtures/shots.ts` `shotSend`; fixtures `registeredExtensionPerTest`, `freshExtensionPerTest`, `createAndActivateProfile`, `resetProfile`, `revealSeedPhrase`, `setupPasskeyVirtualAuth`, `openOnboarding` | reused for the uncommitted mocks |

## Issue claims checked against the tree

- **#1158** holds, with a correction. The value saves 300 ms after the last keystroke (`debounce` in `lock.vue`), not at once. Clearing the field also saves "never": `Input`'s `int` subtype turns an empty field into `0` (`packages/design/src/ui/Input.vue:219-225`) and the watcher writes it. Demonstrated by the mock run: the field reads `0` and the toast "Auto-lock timeout updated" shows.
- **#1192** holds: `create.vue` drops the words on lock, session end and worker reconnect; `OnboardingPhraseStep.vue` has no timer.
- **#1207** holds: `handleSaveFile` downloads, then the `protected` stage offers `account-download-btn` "Download File" again. The same stage also follows the password path's Protect, where that press is the first download.
- **#1208** holds: `find` returns the first live match; the dialog words one name and "Both profiles".
- **#1228** holds for today's behaviour. Its possible fix ("the most recently unlocked, else the first by creation time") rests on data the wallet does not keep (row above). The lane brief names `apps/extension/src/popup/pages/lock.vue`; the lock screen is `pages/auth.vue`, and the policy is `popup/lock-screen-profile.ts`.

## Collisions

- `profile-chaos` harness citations (`tests/e2e/helpers/profile-chaos/model.ts`, checked by `scripts/e2e/profile-chaos-model.test.ts` inside `bun run test`) pin line numbers in `settings/lock.vue` (197), `pages/auth.vue` (377), `onboarding/pages/create.vue` and `wallet/services/profile/service.ts` (2337, 2423, 2480 and earlier lines). An arc that shifts one updates its citation.
- Open #1225 (export pages reset on lock) touches `export/account.vue`; open #1183 (typed password across a profile switch) touches `pages/auth.vue`. Whichever lands second merges `dev` first.
- Pinned tests that change with a pick: `settings/lock.test.ts` (writes of `"0"` at :130 and :162), `pages/auth.test.ts` (:443, :588 expect the chooser), `popup/locked-state.test.ts`, `useProfileImportFlow.test.ts`, `packages/extension-messaging/src/errors.test.ts:117`, `export/account.test.ts`.
- Closed known limits read: #1154 (`Input` `int` subtype paste and clear; reopens when a caller adds `maxLength` or `clearable`, which no option does).
