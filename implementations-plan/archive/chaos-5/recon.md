# chaos-5 recon

Read at `origin/dev` `a4da1f36f` by three read-only explorers and the planner. Paths are relative to `apps/extension/` unless they start with `implementations-plan/`. `PC/` is `tests/e2e/helpers/profile-chaos/`, `PS/` is `src/wallet/services/profile/`.

## The item list, confirmed

#1157's comments of 2026-10-28 leave nine browser items; the lane brief lists eight of them and drops "`prfSalt` rewritten in the passkey prompt's own window", which the second comment names. The two composition files (`PS/profile-chaos.composition.test.ts`, `PS/profile-chaos-scenarios.composition.test.ts`) hold none of the nine: every sequence there runs PATH A (the page's answer, `materializeCredential`), and none restores, exports an account file or picks a file.

| # | Item | What holds it today | Search trail for absences |
|---|---|---|---|
| S1 | A delete racing a method change, as pages | Service side: `PS/profile-chaos-scenarios.composition.test.ts` "a method change held at its new passkey's answer" › a delete lands. Page side: `src/popup/pages/settings/security/unlock-method.test.ts:582,593` (session end with a fake store). E2E: only the lock form, `raceLockDuringMethodChange` (`PC/model.ts:1579`, `PC/unlock-method.ts:110`) | `rg "delete" PC/unlock-method.ts`; `secondWindow` takes `lock` or `unlock` only (`PC/model.ts:1228`) |
| S2 | A second window's method change racing one, as pages | Service: the same composition block › a second window's change lands. Page: `unlock-method.test.ts:471,539` (a faked `onProfileUpdated`). E2E: none | `rg "changeUnlockMethod" PC/drivers.ts PC/run.ts`: only the anchor runs a change |
| S3 | A discovery answered with another profile's credential, in the passkey window | Page form (PATH A) in the catalog: `drawCredential` reuses any minted credential (`PC/model.ts:544-547`), narrowed by `pickDiscovered` (`PC/prf-capture.ts:80`). PATH B, service side: `PS/service.integration.test.ts:780-797` over its `FakePasskeyService` (`:137-194`), and `passkey/service.test.ts:123` (the request names no credential). Browser: none | `rg "extends Service" -g '*.test.ts' src/wallet/services/profile`; `toolbar-panel.test.ts` creates and unlocks, never discovers |
| S4 | `prfSalt` rewritten while the passkey window's prompt waits | PATH A: `editRowDuringUnlock` (`PC/model.ts:1447`, `PC/tamper.ts:75-92`) and the composition block "a prfSalt rewritten between the answer and the row's re-read". PATH B, service side: `PS/service.integration.test.ts:1177` (no session; the window's outcome unchecked). Browser: none | as S3 |
| S5 | A discovery in the passkey window cancelled after the authenticator answered | `passkey/service.test.ts:162` (Cancel rejects the step), `:170` (a late answer for a gone request builds nothing), `:187` (a close while the answer is built rejects the step; nothing is handed over), `:200` (a newer request then), `:98` and `window-manager/window-manager.test.ts:382` (after the hand-over the window's close settles nothing). The window hides Cancel while it finishes (`src/popup/windows/passkey/index.vue:150-152`) | n/a: held |
| S6 | A network switch or an unlock change during the account file export in its own window | `export/account.test.ts:412` (a switch in the page's own window), `:450` (unlock changed to a password), `:396` (a failed Save drops the answer) | `rg "onActiveNetworkChanged" src --glob '!*.test.ts'`: only `token/service.ts` subscribes |
| S7 | A restore under a passkey racing a second restore | Duplicate guard alone: `PS/service.integration.test.ts:3335-3353`. No concurrent restore anywhere | `rg -i "two windows\|second window\|concurrent restore" tests src` |
| S8 | Two 64 MiB backup picks with Import between them | The pick and run fences: `useFullBackupImport.stages.test.ts:406,414,560`, `useFullBackupImport.test.ts:1655,2813`, `useRestoreAgain.test.ts` (PK3-PK9 of `implementations-plan/archive/passkey-unlock-1/lessons/phase-A2.md`) | `rg "MAX_BACKUP_FILE_BYTES\|Too Large\|64 \* 1024" tests/e2e`: no e2e picks a large file |
| S9 | Restore again offered an earlier passkey backup, refused | `useRestoreAgain.test.ts` (BR8, BR9: refused at the pick and at decrypt); `restore-again.test.ts:147` (a refused file shows the page with its error). E2E: the import page's form only (`importEarlierBackup`, `PC/drivers.ts:453`) | `rg -i "restore-again\|restoreAgain" PC/` |
| S10 | Firefox's contacts chooser cancelled under load | `toolbar-panel.test.ts:450-562` (the chooser's cancel, deterministic, headless) | origin: `implementations-plan/archive/passkey-unlock-1/lessons/phase-A2.md:119-120` |

## Facts the plan rests on

- **PATH B exists only in Firefox's toolbar panel.** `closesOnFocusLoss()` is `isFirefox() && isToolbarPopup()` (`src/utils/browser-surface.ts:11-13`), with no test seam. The panel's create and unlock call the service with no credential data (`src/composables/useProfileCreateFlow.ts:63`, `src/popup/pages/auth.vue:123`), and the service asks the passkey window through `PasskeyRecoveryCoordinator` (`PS/passkey-recovery-coordinator.ts:36-48`). Reveal, export, the account file and Unlock method move to an own window and run PATH A there.
- **After the answer, PATH A and PATH B run one body.** `unlockPasskeyProfile` takes the answer from `fromCredentialData` or `getInWindow`, then the same `reportToPasskeyWindow` body: credential check, `openSlots`, `revalidatePasskeyRowHoldingLock` (`PS/service.ts:946-1013`). `createPasskeyProfile` likewise (`:879-897`), with the input minted by the background on PATH B.
- **The in-process chaos harness stubs the passkey service** with `materializeCredential` only (`tests/helpers/profile-chaos-in-process.ts:322-326`); `StepHooks.onAnswer` holds there (`:180-182`). PATH B's service branch is driven elsewhere, by `PS/service.integration.test.ts`'s `FakePasskeyService`.
- **The chaos anchor is a tab** (`openPopup`, `tests/e2e/fixtures/wallet-pages.ts:75`), so every seeded step runs PATH A. The passkey window is driven only by `toolbar-panel.test.ts` (Firefox), and Firefox 157+ refuses a page preload on extension pages (closed known limit #1329), so nothing can wrap the window's first `get` before it runs.
- **A held `get` never reaches the authenticator** (`holdNextGet`, `tests/e2e/fixtures/passkey.ts:227-262`): it calls the real `get` only on release and rejects on its abort signal. So a page with no authenticator (a Chrome second page) can hold a prompt honestly.
- **The Unlock method page resets on another window's update or a session end** while no commit is in flight (`unlock-method.vue:85-120`): `onProfileUpdated` → `onChangedElsewhere` → `reset()`, which rejects the open card.
- **The active network does not cross windows.** `appStore.network` is written only by the window's own activation paths; `guarded-network-activation.ts:11-17` states it ("each view converges to the durable pointer on its own bootstrap"). `account.vue:177-186`'s watcher fires on a switch in its own window only. `exportAccount` reads only its arguments (`account/service.ts:677-722`), so the file names the account of the network the page shows.
- **Restore commits serialize.** `ProfileService.restore` → `restoreProfile` → `runExclusive(commitRestoredProfileHoldingLock)` with `assertNotDuplicateWallet` inside the lock (`PS/service.ts:2413-2467`, `:2332-2343`). The page's `restoreStatus` guard is page-local (`useFullBackupImport.ts:568-576`). The name suffix is read before the lock (`PS/service.ts:2420-2431`).
- **S10's origin is host load, not the wallet.** The A2 lesson records headless Firefox's own chooser cancel arriving after 10 s at load near 120; #1222 (open, `flake`) owns that test wait.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Hold a prompt, abort-aware | `holdNextGet` (`fixtures/passkey.ts:227`), `watchPromptAbort` (`PC/ui.ts`) | reuse as-is |
| A second page | `openPopup` (`fixtures/wallet-pages.ts:75`), the `secondWindow` driver (`PC/drivers.ts:581`) | reuse as-is |
| The competing change and delete | `changeUnlockMethod` driver (`PC/unlock-method.ts:90`), `deleteProfile` driver (`PC/drivers.ts:529`) | adapt: run on a named page |
| Ceremony binding | `checkAnswers`, `minted` (`PC/prf-capture.ts:99-123`) | reuse as-is |
| Planned in-process scenarios | `planFrom`, `StepHooks.drive/onAnswer`, `plant`, `redAt`, `green` (chaos-4 arc 2) | reuse as-is |
| PATH B answers in process | `FakePasskeyService` (`PS/service.integration.test.ts:137-194`: `answerAt`, `held`, `discovered`, `outcomes`) | reuse as-is |
| The passkey window in a browser | `toolbar-panel.test.ts` (`stepFromDyingPanel`, `refuseInWindow`, `openedWindow`) | reuse as-is |
| Concurrent restores | `restoreSecretFor` (`PS/service.integration.test.ts:98-104`), the duplicate block (`:3335`) | reuse as-is |
| Large picks, contacts chooser, Restore again | see S8-S10 | no new code |

## Open work and limits read

`gh issue list --state closed --label known-limit --search "chaos"`: #1329 (Firefox preload and screenshots on extension pages), #1306 (agent launcher), #1304, #1294, #322. `--search "passkey window"`: #593 (the window's flash; decided "leave as today"). Open: #1222 (the chooser's cancel wait, `flake`). Related closed: #1151 (a declined import's passkey stays), #1206 (a restored profile's name).
