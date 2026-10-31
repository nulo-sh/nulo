# import-tab-1 recon

One Sonnet explorer (reuse sweep, seven capabilities) and the planner's own reads, at `a46395071` (`origin/dev`). Paths are relative to `apps/extension/` unless they start with `packages/`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A per-run record read in the click handler | `src/popup/pages/send-submit.ts:16-40` (`TransferSnapshot`, "read off the form"); `src/popup/pages/settings/security/unlock-method.vue:185` (`const typed = password.value` before its first await); `NewProfileUnlock` (`src/composables/useNewProfilePasskey.ts:10-12`) | adapt: a two-field record (method, password) read in the click handler; `NewProfileUnlock` stays the seal's shape |
| The passkey card's cancel and failure mapping | `chooseUnlock` in `useImportUnlock` (`src/composables/useProfileImportFlow.ts:235-243`), shared with restore through `useFullBackupImport` (`:242`, `:444-446`) | adapt: the mapping moves into a function of the admitted record; restore keeps its call |
| A tab choice that refuses input while a run is in flight | none. `AuthMethodTabs.vue` takes only `ariaLabel`, `tabClass`, `activeClass` and two testids; it is the only `role="tablist"` in `apps/` and `packages/` (grep `role="tablist"` over `*.vue`); no tablist test mentions `disabled` | build new: one `disabled` prop on `AuthMethodTabs`, passed by `UnlockMethodChoice`, `ImportSecretForm` and `NewProfileMethodTabs` |
| What a disabled control looks like | `packages/design/src/ui/Input.vue:478-480` (`.base.disabled { opacity: 0.5; pointer-events: none }`); `Button.vue:444-446` (`pointer-events: none; opacity: 0.3`) | reuse the Input's fade on the tablist |
| What the pages hold while a run is in flight | onboarding import `:280-291` (Import and the passkey-reuse link disabled, `loading`); popup import `:349-361` (no `isImporting` read at all); popup create `new.vue:133,143`; onboarding create `create.vue:254-266`. No page disables the tabs or the password fields | adapt: the four pages pass the run's flag to the tabs |
| Service-side password refusal | `newRowSeal` (`src/wallet/services/profile/service.ts:2041-2045`, used by `importMnemonic`, `restore` and `changeUnlockMethod`) and `restore` (`:2425`) throw "Password is required for password profile" for a missing password; `changeUnlockMethod` applies `isNewPasswordValid(p, p)` (`:1389-1391`); `account/service.ts:110` applies it to a file password. No typed error exists for a refused new password (grep `at least 8\|PasswordTooShort\|WeakPassword\|class \w*Password\w*Error`) | reuse the existing message: `createProfile` and `newRowSeal` refuse an empty password with it |
| Test harnesses | `useProfileImportFlow.test.ts` (`makeFlow`, `passkeyFlow`, `typePhrase`, `profileApi` mock, the card's `onCeremonyResolve`); `useProfileCreateFlow.test.ts` (`makeFlow`, a pending `createProfile`); `onboarding/pages/import.test.ts:515` (a never-settling `importMnemonic`); `onboarding/pages/create.test.ts:172` (tablist suite, `tab(w, method)`); `popup/pages/import.test.ts` (mocks the flow: `holder`, `makeFlow`); `popup/pages/profile/new.test.ts` (`mountNew`); `AuthMethodTabs.test.ts` (`mountOwned`); `service.integration.test.ts` (`makeService`) | reuse. None defers `getProfiles` during a run or switches the tab mid-run |

## Constraints the plan must carry

- **Test passwords**: every create, import and restore literal in unit and composition tests is non-empty (`"pass1234"` about 76 times in `service.integration.test.ts`; `PW` and `PASSWORD` constants in five composition files and three service files; one 7-character `"oldpass"` at `:274`). The in-process chaos harness generates `Pw-` plus 16 characters (`tests/helpers/profile-chaos-in-process.ts:370`). The e2e suites type `TestPassword123!` (`tests/e2e/fixtures/constants.ts:5`) or `OnboardingTest_!23`. Passkey calls pass no password.
- **The chaos model pins line numbers**: `tests/e2e/helpers/profile-chaos/model.ts` cites about 30 lines of `service.ts` (from `:153` on), `useProfileImportFlow.ts:193` (the card call's text), `useFullBackupImport.ts:445` and `onboarding/pages/create.vue:147,160,179`. `scripts/e2e/profile-chaos-model.test.ts:792` fails on a cited line that moved; it runs in `bun run test`.
- **No production caller** of `createProfile`, `importMnemonic` or the profile `restore` exists outside the two composables and `useFullBackupImport` (grep `managers.profile.(createProfile|importMnemonic|restore)` over `src`, excluding `wallet/services`).
- **The passkey card dims the page** while it asks (`components/passkey/PasskeyCeremonyDialog.vue:3`).
- **Smoke e2e covering the four forms**: `onboarding-import.test.ts`, `import-paths.test.ts`, `duplicate-phrase-import.test.ts` (popup import, clicks `import-method-password`), `registration.test.ts` (popup create), `onboarding-tab.test.ts` (onboarding create).
- **inputs-1 landed** (#1403): `isNewPasswordValid` counts graphemes; this lane calls it and does not change it.

## Open work

`gh issue list --state all --search "unlock tab import password"` and `gh issue list --state closed --label known-limit --search "password import"`: no issue owns this change; #1151 (a refused passkey import leaves its passkey on the authenticator) is adjacent and untouched.
