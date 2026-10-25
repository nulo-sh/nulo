# Recon: onboarding-3

Base: `origin/dev` at 1b93cbfa. Three read-only Sonnet explorers (a reuse sweep, the onboarding flow with its tests, Home with backup and the phrase), every load-bearing claim re-read by the planner. Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/` or `tests/` (the last means `apps/extension/tests/`).

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Per-profile UI flag | `utils/profile-ui-keys.ts` (`PROFILE_UI_KEY_PREFIXES`, `profileUiKeys`); deletion clears them (`wallet/services/profile-deletion/coordinator.ts:135`), a row commit clears them first; never backed up | adapt: add prefixes |
| Cross-context re-read of such a flag | `popup/components/modules/general/RestoreOutcomeBanner.vue` (`chrome.storage.onChanged`, a read sequence guard on profile change), `utils/restore-outcome.ts` | reuse the pattern |
| Unlock method of the active profile | `ProfileInfo.type` (`wallet/services/profile/spec.ts:17`), `appStore.profile.type` | reuse |
| The 24 words | `managers.profile.exportMnemonic(id, password): string[]` (`spec.ts:364`, `service.ts:1933-1975`); password profiles only; `createProfile` returns `ProfileInfo` and zeroes the entropy (`service.ts:593-638`) | reuse; no API change |
| Copy a secret | `composables/useSecretClipboardCopy.ts` (copy inside the gesture, honest toast, 60 s clipboard scrub, no dispose by design) | reuse as is |
| Numbered word grid | none. Searched `word.?grid`, `WordGrid`, `RecoveryWords`, `words.map`, `v-for.*word` in `src` and `packages/design/src`. Import takes one text field (`ImportSecretForm.vue:33`) | build new (L3) |
| Phrase screen | `popup/pages/settings/security/export/seed.vue` (agreement gate, `SecretUnlockSection`, `SecretRevealCard`, `useSecretCountdown`, a run fence) | adapt: grid in place of the card |
| `SecretRevealCard` | also used by the account export popup | keep unchanged |
| Full Backup success point | `popup/pages/settings/security/export/full.vue` `downloadBackup` (after `downloadFile`, before the success toast, under `isCurrent()`); no record of an export exists (searched `lastExportedAt\|lastBackup\|exportedAt\|backupAt\|phraseSaved` in `src`) | adapt: one flag write |
| Holds funds | token rows: `BalanceView.vue` (`useTokenBalanceSnapshot`, `balancesState` `loading\|loaded\|unavailable`, `isPriceableHolding`); Fee Juice: `stores/balances.store.ts` `entry(scope).gas.display` (`undefined` = not loaded, `null` = failed), read by `GasBalanceCard.vue:25-60`. No page-level signal; a first render is always unknown | adapt: BalanceView emits a token state; a pure predicate |
| Presto set up | `prestoReached` config flag (`wallet/config/config.ts:60`), set by `usePrestoCheck.ts:49` | reuse |
| Home composition | `popup/pages/general.vue` (`index.vue` only redirects): `.hero` (BalanceView), then `.scroller` > `.content`: RecoveryModeBanner, RestoreOutcomeBanner, TokensView, RecentActivityView | adapt |
| Card of rows | `components/ui/Settings/SettingItem.vue` (`title`, `description`, `value` before the chevron, `to`, `external`, `@click`), `ItemsContainer`, `SectionLabel` | reuse |
| Warning banner | `packages/design/src/ui/Banner.vue` (`info\|warning\|error\|done`, one `action`); no "urgent" variant | reuse `warning` |
| External links | `window.open(FEE_JUICE_BRIDGE_URL, "_blank", "noopener,noreferrer")` (`popup/pages/send.vue:102`); the constant at `popup/components/modules/send/fee-helpers.ts:362` | reuse |
| "How Aztec works" page | none on nulo.sh: `apps/landing` is one `index.html` with a `#see` "How it works" section | out of scope: landing issue |
| Browser detection | `utils/browser-surface.ts` `isFirefox()` | not needed (the tip names no browser) |
| Profile create flow | `composables/useProfileCreateFlow.ts` (default `"password"` at `:49`), shared with `popup/pages/profile/new.vue`; `components/composite/AuthMethodTabs.vue` (Password then Passkey), shared too | adapt: per-caller first method |
| Settings → Proving | `popup/pages/settings/proving.vue` (`PrestoPermissionRow`, `PrestoStatusCard`), route `/popup/settings/proving` | reuse |
| `@alejoamiras/presto-banners` | still imported by `utils/presto-ui-state.ts` and `manifest.test.ts` | stays a dependency |

## Onboarding today

Routes: welcome → (legal guard) terms → create or import → `/onboarding/learn` → fees → presto → done. `app.vue:75` resumes a known profile at `/onboarding/learn`. `legal-guard.ts` allowlists welcome and terms; every other path needs a current acceptance, so a step inside create is gated. `StepIndicator.vue` has six hard-coded cells. `OnboardingExplainer` (learn, fees) and `OnboardingSkipLink` (explainer, presto) have no other users.

## Would break when learn, fees and presto leave and the default flips

- Pushes to `/onboarding/learn`: `create.vue:59`, `import.vue:51`, `app.vue:75`.
- Unit: `onboarding/pages/create.test.ts` (default label, autofocus, route, tab order), `import.test.ts:152-165,233-251`, `StepIndicator.test.ts`; deleted with their subjects: `presto.test.ts`, `OnboardingExplainer.test.ts`, `OnboardingSkipLink.test.ts`. `legal-guard.test.ts:30` lists learn, fees and presto (stale, still green).
- E2E: `onboarding-tab.test.ts` (run-through `:95-181`, method focus `:72-90`, Presto cases `:206-333`), `presto-host-permission.test.ts` + `helpers/presto-step.ts`, `keyboard-guards.test.ts:104-120`, `passkey-retry.test.ts:94-98,128,194`, `legal-acceptance.test.ts` S1-S3, `helpers/legal-drivers.ts:139-148`, `helpers/import-drivers.ts:144` (`ONBOARDING_IMPORT_SHELL.successHash`).
- Type roles: `scripts/type-roles/surfaces.expected.json` (onboarding-learn, -fees, -presto entries), `scripts/type-roles/exceptions.ts:31` (`PRESTO`).
- Phrase readers: `tests/e2e/fixtures/profiles.ts:252-259` `revealSeedPhrase` and five specs read `[data-testid="reveal-content"] input` (`security-backup`, `duplicate-phrase-import`, `legal-acceptance`, `import-paths`, `network/frozen-account-canary`).
- Home: `rows.test.ts:882-1000` (hero screenshots, scroll extent), `network/store-captures.test.ts` (stages Home from an imported seed with USDC, so a funded password wallet). `home-links.test.ts`' Tab walk starts at `tokens-menu-trigger`, below the planned card.

## Collisions

- type-scale-1 (open lane) retunes roles app-wide; merge `dev` before the PR.
- sheet-1 (planning) changes the sheet; this lane opens no sheet.
- testers-fixes-3 and icons-d2-1 arc 2 touch activity cards, the journal page and glyphs: disjoint from this lane's files.
- Closed known limits read: #571 (a Presto probe before a Firefox grant), #352 (toolbar panel re-open), #614 (passkey backup age); none is reopened by this lane.
