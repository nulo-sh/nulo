# Recon: onboarding-3, arc 2

Three Explore agents (sonnet, read-only) at 56361a49, 2026-10-19. Paths are under `apps/extension/` unless they start with `packages/` or `implementations-plan/`.

## Profile origins and the card's inputs

- Writers: `markProfileFlagHoldingLock` (`src/wallet/services/profile/service.ts:1469`), after the row and under the lock, best effort. `markGetStarted` cannot write `imported` or `notFirst` (`src/utils/get-started.ts:23`).
- Creates (onboarding tab, popup New profile; both use `useProfileCreateFlow`) write `notFirst` when a non-tombstoned row exists (`service.ts:1452-1456`), an imported or mid-restore row included (#847 covers the rare cases). Imports write `imported` only: phrase `:2161`, passkey `:2209`, password restore `:2385`, passkey restore `:2541`.
- Settings › Accounts › Import adds an account to the active profile (`src/popup/pages/settings/accounts/import.vue:116`); it writes `nulo:ui:activeAccount` and no Get started key.
- A full backup carries no per-profile UI key; a restored profile starts with `imported` alone (`src/composables/useFullBackupImport.ts:317-323`).
- `prestoReached` is one global config key (`src/wallet/config/config.ts:59`); a restore does not carry it (`src/wallet/services/config/spec.ts:15-23`).
- Deletion removes the ten keys of `profileUiKeys(id)` (`src/wallet/services/profile-deletion/coordinator.ts:135`); `useGetStarted` re-reads per profile and shows nothing until its read lands.
- No deployment state reaches `getStartedView` or Home's card.

## Network states

- Testnet reset (`src/wallet/services/network-reset/service.ts:518-578` → `network/service.ts:1015` `resetChainInPlace`): purges the old chain's accounts, tokens and balances, FPCs, journal, transactions and dApp sessions; recreates accounts from a journal (same addresses unless the derivation moved). Per-profile UI keys are untouched. Home is not mounted under the takeover (`src/popup/app.vue:573`) and mounts again after it (`src/popup/reset-completion.ts:38-42`).
- Quarantine: the shell clears the account (`src/popup/network-switch.ts:100-107`); `selectedBalanceScope` is null; the view is `null`.
- The worker's gas cache is keyed `${networkId}:${accountAddress}` with a 5-minute TTL (`src/wallet/services/execution/gas-balance-reader.ts:28,73`), evicted on a settled tx, a PrivateFPC change or a profile switch (`execution/service.ts:560-583`), not on a reset purge. A read of the old chain cached in the 5 minutes before the reset could show for up to 5 minutes after it (plausible, unverified; outside the card).
- Seeded networks: Testnet and Local (`src/wallet/services/network/seeds.ts:44-62`).

## Tests that already reach the card

- Unit: `src/utils/get-started.test.ts` (view rule per flag; `:154` F leaves on Fee Juice), `src/composables/useGetStarted.test.ts` (12 cases), `src/popup/pages/general.test.ts` (Home with a mocked balances store; no case with a positive Fee Juice and the card showing), `GetStartedCard.test.ts`, `BackupReminderBanner.test.ts`, `src/wallet/services/profile/service.integration.test.ts:1392-1500` (marks per path; no create beside an imported profile).
- E2E: `security-backup` (`:55` first profile; `:83` later password profile), `onboarding-tab:75` (tab create, "I saved it"), `passkey-paths:118` (passkey import, no card), `passkey-toolbar-panel` (Firefox, the mark), network `hero-prices-unavailable` (backup import, no card), network `snack-placement` (`clearGetStarted`).
- Smoke has no node (`tests/e2e/fixtures/node-stub.ts`): the gas read is degraded, "none". Fee Juice is held only in the network suite (`feeJuiceReadyExtension`, `tests/e2e/fixtures/extension.ts:871`; `feeJuiceImportedExtension`, `:943`).
- Helpers: `waitForHomeReminders` (`tests/e2e/fixtures/tokens.ts:117`), `refreshBalances` (`:65`), `clearGetStarted` (`tests/e2e/fixtures/profiles.ts:272`), `createAndActivateProfile` (`:11`), `seedStaleNetwork` / `takeoverScreen` (`tests/e2e/helpers/stale-network.ts:110,277`), `setTheme` (`tests/e2e/fixtures/settings.ts:13`), `shotSend` (`tests/e2e/fixtures/send-page.ts:222`).
- Smoke runs through `test:e2e` against an armed `dist/<browser>`; `agent.sh` runs the network suite only and claims its five ports in `~/.agents/ports.md`; smoke claims its egress ports itself.

## The row padding

- `ItemsContainer` (`src/components/ui/Settings/ItemsContainer.vue:38-63`): `--nulo-surface`, `1px solid --nulo-border`, no radius; a `flat` prop drops both (six callers use it). `SettingItem` (`SettingItem.vue:240-266`): `padding: 16px 20px` at medium; hairline `::after` inset 20 px, `--hairline-strong`. 32 and 27 callers: a change to either is not local to the card.
- Home's `.content` is padded 24 px (`src/popup/pages/general.vue`); token rows (`TokenCard.vue:125-132`) have no horizontal padding and no hairline; their hover tint bleeds to the content edges. Activity rows inset 8 px (`TransactionCardLayout.vue`).
- Leading-mark seams: `SettingItem`'s `#dot` and `#icon` slots; `@nulo/design` `Checkbox` (18 px, 1.5 px border).
- Theme: `<html theme="light|dark">` (`public/theme-boot.js`); a capture sets the attribute and waits for `settleThemeTransitions`. An extension page's CSP refuses an injected `<style>`: style through the CSSOM. Stub `window.open` before a capture.
