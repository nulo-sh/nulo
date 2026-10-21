# restart-notify-1: recon

Base: `origin/dev` at `817cce9d6`. Three read-only Sonnet explorers (reuse sweep, window lifecycle, wallet-sdk wire), consolidated here; paths are under `apps/extension/` unless a package path is given. #907 (`origin/harden-security-fixes-3-a4`) and #886 (`origin/connect-split-1-a1`) are open, unmerged branches read with `git diff origin/dev...<branch>`.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Know which request windows a restart orphaned | Nothing records them: `WindowManager.handles` (`src/wallet/services/window-manager/window-manager.ts:72`), `DappInteractionService.storage` (`src/wallet/services/dapp-interaction/service.ts:151`), the verify reservations (`src/wallet/services/wallet-sdk/verify-admission.ts:227`) and `handedOver` (`background.ts:297`) are memory only. Searched `storage.session` writers, `onStartup`, `getAll`, `getContexts`. | build new: every request lives in memory, so every request window older than the running background is orphaned by construction |
| List the extension's own windows | `RuntimePort.getContexts?` (`packages/wallet-core/src/ports/runtime-port.ts`), wrapped in `ChromeRuntimeAdapter.getContexts` (`src/core/adapters/chrome-browser-api.ts:151`), used by `src/wallet/utils/offscreen.ts:310` with a `documentUrls` filter. `WindowPort` has no list method. No `tabs` permission (`manifest/manifest.config.ts:46`). | adapt: read `documentUrl` and `windowId` from `getContexts({ contextTypes: ["TAB"] })` |
| Close a window from the background | `WindowPort.remove` (`packages/wallet-core/src/ports/window-port.ts`), `FakeWindowsAdapter` (`packages/wallet-core/src/testing/fake-browser-api.ts:204`) | reuse-as-is |
| A request window's route and id | `windowUrl(type, id)` → `#/windows/<type>?requestId=<id>` (`service.ts:104`); verify: `#/windows/verify?sessionId=…&verificationHash=…&isReconnect=…` (`session-established.ts:71-75`) | reuse-as-is |
| Answer a dApp whose session a restart forgot | `stale-session.ts` answers a `ping` or `secure-message` naming a session the sender's tab does not hold with `session-disconnected` (`background.ts:482-493`); pinned by `tests/e2e/network/inflight-call-background-death.test.ts` | reuse-as-is |
| End every live transport session and keep the grants | `endSession` (`background.ts:157-160`: drops the hold, then `handler.terminateSession`), looped per item with try/catch in `revokeLiveSessions` (`session-revocation.ts:25-48`) and the profile-switch teardown | adapt: loop `endSession` over `handler.getActiveSessions()`; `endSession` is a closure inside `initWalletSdkHandler` today |
| Know that a `session-disconnected` reached the content script | `buildContentTransport.sendToTab` fires `chrome.tabs.sendMessage(...).catch(...)` and returns `void` (`background.ts:360-367`) | adapt: keep the send's promise so a caller can wait for it |
| The lock's restart | #907: `ProfileService.lockActiveProfile` calls `this.runtime.reload()` when `recordKept` and no successor session (`src/wallet/services/profile/service.ts`, on the #907 branch) | adapt (after #907 merges): wait for the disconnects first |
| A window noticing its own restart | `ServiceClient.onConnected` / `onDisconnected` (`packages/extension-messaging/src/background/client.ts:93-107`); no dApp window subscribes. `useDappApprovalWindow` (`src/composables/useDappApprovalWindow.ts`) is shared by discover, capabilities, execute and fee; verify has its own lifecycle. | considered, not chosen (plan § Trade-offs) |
| E2E: kill and restart | `stopBackground`, `backgroundAlive`, `evaluateInBackground` (`tests/e2e/fixtures/browser/index.ts`); #907 adds `allowSelfRestart`, `backgroundOrigin`, `withInterceptionsReleased`, `waitForExtensionRestart`, `refuseSessionDeletes`, `pressHeaderLock` | reuse-as-is |

## What each piece does today

- **Windows after an unplanned restart.** The page keeps its loaded state; its service-client port reopens on the successor silently. Unknown-request RPCs: `getInteractionPayload` and `approveInteraction` throw `"Invalid id"` (`service.ts:222-228`), `rejectInteraction` returns silently (`:322-326`), `isInteractionCancelled` returns `false` (`:524`). The windows turn `"Invalid id"` into the footer `error-text` "Something went wrong" (discover, capabilities) or "Processing error." (execute, fee). Verify reads the persisted `DappSession` row, so it finds it; They match finds no hold and closes (`verification-hold.ts:139-144`); They don't match deletes the row. A window that mounts after the restart routes to the lock screen and, after unlock, back to the route, where `"Invalid id"` follows.
- **Firefox does not end its event page while an extension page is open** (`tests/e2e/FIREFOX.md`, `implementations-plan/archive/firefox-background-kill/plan.md`), so an unplanned restart with a request window open is a Chrome case (a worker crash, or the worker being stopped). The 10 s `storage.session` heartbeat (`src/wallet/runtime.ts:282-291`) keeps Chrome's idle reaper away while the wallet runs.
- **`runtime.reload()`** ends every extension page on both browsers (#907, measured). On Chrome the dApp page's content script is orphaned: the new background's `tabs.sendMessage` reaches only new-instance content scripts (`ARCHITECTURE.md` § 8, "an invalidated extension context … cannot be repaired from the background").
- **Ending a session.** `terminateSession` sends `session-disconnected` to the session's tab synchronously and fire-and-forget; the content script posts `DISCONNECT` on the page's `MessageChannel` and closes it (SDK `content_script_connection_handler.ts:236-244`); a confirmed page rejects every call in flight with `Wallet disconnected` and fires `onDisconnect` (SDK `extension_wallet.ts:315-344`). A lock ends only sessions whose check is unanswered; confirmed sessions survive a lock (`profile-switch-teardown.ts` header, `verification-hold.ts`).

## The wire (wallet-sdk 6.0.0-rc.3)

- No `runtime.Port` exists between content script and background: one-shot `runtime.sendMessage` / `tabs.sendMessage`, and a `MessageChannel` between content script and page. So no port disconnect can carry a restart to the page.
- Before Allow (discovery) and during the 2 s key exchange there is nothing to send: `rejectDiscovery` sends nothing, and the page's key-exchange handler reads only `KEY_EXCHANGE_RESPONSE`.
- Before the page's `confirm()` the page drops `DISCONNECT` (#605, verified against `extension_provider.ts:66-91`, `wallet_manager.ts:258-263`). The playground confirms at once, so it never sits in that gap.
- `DISCONNECT` carries no reason; the page cannot tell a restart from any other disconnect.

## Collisions

- **#886** removes the connect window's standby and `?expired=1` page, opens the check in its own window, and rewrites `session-established.ts`, `verify-admission.ts`, `discovery-flow.ts`, `discover/index.vue`, `verify/index.vue` and `WindowPort.navigate`. Plan around those files; the routes `#/windows/discover` and `#/windows/verify` stay.
- **#907** adds `RuntimePort.reload()` and the reload in `lockActiveProfile`; the notify step lands after it merges.
- **#924** (encryption at rest): its OA-4 case (They don't match after a restart leaves the check window open with "could not be removed") cannot arise once the check window closes at the restart.
- `MigrationBarrier.vue:102` is the only other `runtime.reload()` caller (the popup's Retry while a migration is blocked); no `onUpdateAvailable` handler exists.

## Closed known limits searched

`gh issue list --state closed --label known-limit --search "restart"`, `"background"`, `"window"`, `"disconnect"`: see plan § Assumptions for the ones that bear on this lane.
