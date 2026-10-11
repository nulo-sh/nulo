# Phase 2: settle the `auth-*.js` rejection

## Step 1: the lock helpers' callers (frozen 2026-10-11, before any probe)

Read on 8f2ca65. The lock helpers are `lockWallet`, `lockThroughConfirmDialog`, `waitForLockScreen`, `unlockAfterBackgroundDeath` and `reopenAndRecoverAfterImport` (`fixtures/helpers.ts`); every one ends in `waitForLockScreen`. No fixture file other than `helpers.ts` calls them.

The lock lands through the background's lock event, not through an `isLogined` watcher: the header chip's `useLockWallet` reads the session handle, sets `isLogined = false` (which only seals, through `watchLockStart`) and sends `lockActiveProfile`; the background clears the session and emits `onActiveProfileChanged(undefined)`, and `app.vue`'s handler runs `createLockedState().onLockEvent`, which seals, awaits `getProfiles()` and pushes `/popup/auth` (`src/popup/locked-state.ts:45-53`).

"Same page" means the helper locks and observes the page the test passed; "after the event" means the page was opened after a background death, whose boot finds no session. "Reopen" is the test's own, after the helper returned (the lock had landed); no caller reopens before it.

| Caller | Helper | Page | Test's own reopen |
|---|---|---|---|
| `auth-flows.test.ts` ×4 | `lockWallet` | same page | closes and opens a new popup after the helper returns |
| `backup-imported-account.test.ts` | `reopenAndRecoverAfterImport` | same page (after `closeStuckPopup`) | none |
| `backup-roundtrip.test.ts` | `reopenAndRecoverAfterImport` | same page | none |
| `helpers/handshake-import.ts` ×2 (used by `import-handshake-note`, `import-handshake-note-matrix`, `same-token-concurrent-sends`) | `lockWallet` | same page | none |
| `imported-account-lifecycle.test.ts` ×2 | `lockWallet` | same page | none |
| `legal-acceptance.test.ts` | `lockWallet`, then `waitForLockScreen` ×2 | same page | the test's `reloadExtensionPage` after the lock landed, then `waitForLockScreen` on the reloaded document |
| `own-window.test.ts` ×2 | `lockWallet(home)` | same page; another window observes the lock itself | none |
| `security.test.ts` | `lockWallet` | same page | closes and opens a new popup after |
| `sw-resilience.test.ts` ×2 | `lockWallet` | same page | one closes, stops the background and opens a new popup after |
| `sw-restart-network.test.ts` | `lockWallet` | same page | closes, stops the background, opens a new popup after |
| `tooltips-glossary.test.ts` | `lockWallet` | same page | closes and opens a new popup after |
| `wallet-lock.test.ts` ×2 | `lockWallet`; `waitForLockScreen` after its own `waitForHash("#/popup/auth")` | same page | closes and opens a new popup after, each time after the auth assertion |
| `network/account-balance-orphans.test.ts` | `reopenAndRecoverAfterImport` | same page | none |
| `network/auto-lock-defers-while-proving.test.ts` | `waitForLockScreen` (auto-lock) | same page | none |
| `network/backup-migration-roundtrip.test.ts` | `reopenAndRecoverAfterImport` | same page | none |
| `network/backup-restore-integrity.test.ts` | `reopenAndRecoverAfterImport` | same page | none |
| `network/connect-locked-queue-sw-restart.test.ts` | `lockWallet` | same page | none |
| `network/connect-locked-queue.test.ts` ×2 | `lockWallet` (password; passkey anchor) | same page | none |
| `network/delete-after-prove.test.ts` | `lockWallet` | same page | none |
| `network/failed-send-check.test.ts` | `unlockAfterBackgroundDeath` | after the event | none |
| `network/firefox-background-restart.test.ts` | `unlockAfterBackgroundDeath` | after the event | none |
| `network/imported-account-execution.test.ts` | `lockWallet` | same page | none |
| `network/incoming-arrival.test.ts` | `lockWallet` | same page | none |
| `network/inflight-call-background-death.test.ts` ×3 | `unlockAfterBackgroundDeath` | after the event | none |
| `network/lock-cancels-dapp-send.test.ts` | `lockThroughConfirmDialog` | same page | none |
| `network/profile-switch-sweeps-transfer.test.ts` ×3 | `lockWallet`, `lockThroughConfirmDialog` | same page | none |
| `network/same-token-concurrent-sends.test.ts` ×2 | `unlockAfterBackgroundDeath` (after the event); `lockWallet` (same page) | as listed | none |
| `network/wallet-locked-mid-session.test.ts` | `lockWallet` | same page | closes after |

No caller needs the helper's reload: every caller either locks the page it passes, or passes a page opened after the background death. D3 applies to all of them unchanged.
