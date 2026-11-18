# locked-discovery-1: recon

Base: `origin/dev` at `eb42af540`. Two read-only explorers (sonnet) plus the planner's own reads. Paths are repo-relative; `EXT` is `apps/extension/src`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Queue a locked discovery, badge, drain on unlock | `packages/wallet-bridge/src/discovery-queue.ts` (`enqueue`, `drain`, `DISCOVERY_STALE_MS` 55 s); `EXT/wallet/services/wallet-sdk/background.ts` `wireDiscoveryDrain` (:368), `drainQueuedDiscovery` (:382) | reuse as-is |
| Locked branch of a discovery | `EXT/wallet/services/wallet-sdk/discovery-flow.ts:113` (`if (!profile) enqueue`) | adapt: open the unlock window after the enqueue |
| "Locked" vs "no profile" | `ProfileService.getActiveProfile()` is `undefined` in both; `getProfiles()` (`profile/service.ts:646`) is `[]` only with no profile | reuse as-is |
| Connect-window caps | `discovery-flow.ts:68-69` (4 per origin, 32 in all, over `pendingDiscoveryPromises`), `checkDiscoveryPopupCaps` (:355) | adapt: unlock windows share the count |
| Open, track, time out, close a dApp window | `EXT/wallet/services/window-manager/window-manager.ts` `openAndAwait` (:80), `handOver` (:165), `_settle` removes the window, `WINDOW_CLOSED_BY_USER` | adapt: `reuseWindowId` option, `retime` |
| Load a URL in an existing window | none at HEAD (searched `tabs.update`, `windows.update`, `navigate` over `EXT` and `packages`); `WindowPort.navigate` existed (`tabs.query` + `tabs.update`, no `tabs` permission) and was removed by `e8fe932d4` when its only caller left | restore from `e8fe932d4^` |
| The window owner for dApp interactions | `EXT/wallet/services/dapp-interaction/service.ts` `interaction()` (:638), `discover()` (:624), `notifyNetworkUnavailable()` (:631) | adapt: adopt the origin's unlock window |
| The popup's own unlock screen | `EXT/popup/pages/auth.vue` (password and passkey, one form; no props) | adapt: its body moves to an L4 module both the page and the window render |
| A page sent to the lock screen and back | `EXT/composables/useDappApprovalWindow.ts:138-151` (`pageAwaitingAuth`, push `/popup/auth`), `EXT/utils/own-window.ts:177` `postAuthRoute` | adapt (see F6, F7) |
| Record at boot what a document was opened for | `EXT/utils/window-document.ts` `captureWindowDocument` (a `/windows/*` first URL; called at `EXT/popup/index.ts:48`); `EXT/utils/own-window.ts` `captureOwnWindow` (Firefox-panel flows) | adapt `window-document.ts` (found by the round-1 Opus audit) |
| "The site that asks" | `EXT/components/composite/DappIdentityBlock.vue` + `EXT/composables/useDappOrigin.ts` (serialized origin, IDN/punycode warning) | reuse as-is |
| Windows a restart ends | `EXT/wallet/services/window-manager/restart-ended-windows.ts` `RESTART_ENDED_ROUTES` | adapt: add `unlock` |
| A dApp page's tab closing | `EXT/wallet/services/wallet-sdk/tab-lifecycle.ts` (`terminateForTab` drops the tab's pending discoveries, then `onTabTeardown`) | reuse: hook the refit there |
| Pending discoveries as the SDK holds them | `BackgroundConnectionHandler.getPendingDiscoveries()` (status `pending` only); no removal callback exists (grepped `on[A-Z]\w*(` in the SDK's `.js` and `.d.ts`) | reuse as-is |
| e2e: locked connect | `apps/extension/tests/e2e/network/connect-locked-queue.test.ts` (asserts no window while locked), `connect-locked-queue-sw-restart.test.ts`; fixtures `auth.ts` (`lockWallet`, `ensureUnlocked`), `popups.ts` (`waitForPopup`, `recordCreatedWindows`, `approveConnect`), `shots.ts` (`shotSend`, light and dark under `NULO_E2E_SHOT_DIR`) | adapt |
| Unit harnesses | `packages/wallet-core/src/testing/fake-browser-api.ts` (`FakeWindowsAdapter`), `window-manager.test.ts`, `dapp-interaction/service.test.ts` `windowHarness` (:1005), `wallet-sdk/background.connect-window.test.ts`, `discovery-flow.test.ts` | adapt (fake `navigate` returns) |

## Findings

- F1 Locked today: `handleSecureDiscovery` enqueues and returns (`discovery-flow.ts:113-118`); the queue paints the badge; nothing opens. Holds as the brief says. Its 55 s expiry is lazy: no timer, a later enqueue, sweep or drain rejects the stale request (round-1 Codex).
- F2 The brief's "2 windows per origin, 8 in all" are the **check-window** budget (`wallet-sdk/verify-admission.ts:22-23`). The connect-window caps are 4 per origin and 32 in all (`discovery-flow.ts:68-69`). The unlock window shares the latter.
- F3 `getInteractionPayload` has no lock gate (`dapp-interaction/service.ts:260`); the RPC framework has no lock gate (`packages/extension-messaging/src/background`); individual methods may check the session themselves.
- F4 A `windows/*` route has no `isAuthRequired` meta; `discover/index.vue` renders nothing until `appStore.isLogined` (:185) and `useDappApprovalWindow.start` sends a locked window to `/popup/auth` with `pageAwaitingAuth` set (:143-146).
- F5 `auth.vue` returns to `postAuthRoute(appStore.pageAwaitingAuth)` after an unlock, here or elsewhere (`advancePastAuth` :112, the `isLogined` watcher :354), and only from `#/popup/auth`.
- F6 A cold, locked boot with no profile selected lands by `decideLockLanding` (`EXT/popup/lock-landing.ts`): `select-and-auth` pushes `/popup/auth` without `pageAwaitingAuth` (`EXT/popup/app.vue` `lockLandingActions.selectAndAuth`). Whether the shell or the guard selects the profile first is a race, so a page's own `pageAwaitingAuth` write may never run and the unlock would land on Home. `own-window.ts` solves the same problem by recording the first URL at boot (its header: "the guard, the lock screen and the import page rewrite the route later, so nothing reads the current route").
- F7 `isLogined` lags an accepted unlock until the shell's activation bootstrap ends; the router's auth gate consults the worker's session instead (`EXT/popup/auth-guard.ts` `authRequiredGate`), but `useDappApprovalWindow.start` reads the flag, so a dApp window that mounts in that lag is sent to the lock screen and back.
- F8 A fresh `ProfileServiceClient` receives only events emitted after it connects, so a connect window mounted after the unlock event never sees it (`useDappApprovalWindow` `onActiveProfileChanged` compares against `profile` set in `init`).
- F9 Passkey in a `windows.create` popup takes the in-page ceremony on both browsers (`closesOnFocusLoss()` is `isFirefox() && isToolbarPopup()`, `EXT/utils/browser-surface.ts`).
- F10 The wallet-sdk discovery is sent once per call, 60 s timeout, no retry interval (`extension_provider.js:5,110`); the playground discovers only on its Connect press (`apps/playground/src/lib/wallet.ts:86-97`).
- F11 `manifest.test.ts:65` pins `web_accessible_resources` undefined: no page can load an extension URL, so a window URL is written only by the extension.
- F12 Smoke has no dApp page and no `playgroundUrl` (`tests/e2e/fixtures/playground.ts:27`); every discovery spec is a network spec. The brief's "new smoke scenario" cannot drive a discovery without new smoke infrastructure.
- F13 The SDK's `terminateForTab` deletes the tab's pending rows silently; `getPendingDiscoveries()` then omits them. It is the only "the dApp cancelled" signal: a page navigating away leaves its row until the 55 s cut-off.

## Open work and limits

- `gh issue list --state open --search "locked discovery OR unlock window OR badge"`: only #1849 and #127 (unrelated).
- Closed `known-limit` issues near this area: #883 (two checks per origin), #927 (a refused Allow shows nothing), #681/#682 (waiting duplicates). None collides.
