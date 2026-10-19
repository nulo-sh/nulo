# connect-split-1 recon

Base: `dev` at `f214e5cb`. Paths are repo-relative; `SDK/` is the installed `@aztec-labs/wallet-sdk` 6.0.0-rc.3 `src/` (one copy, resolved from both `apps/playground` and `apps/extension`); `WSDK/` is `apps/extension/src/wallet/services/wallet-sdk/`.

## 1. What the sdk allows (the lane's phase 1)

| Fact | Where |
|---|---|
| The dApp's discovery is `{type: 'aztec-wallet-discovery', requestId, appId, chainInfo}`; `requestId` is the page's own `crypto.randomUUID()` and becomes the session id. | `SDK/extension/provider/extension_provider.ts:177`, `:222-228` |
| The wallet answers a discovery only after it calls `approveDiscovery` ("User must approve before wallet reveals itself"). Nulo calls it after Allow, or at once for a remembered row. | `extension_provider.ts:147-151`; `WSDK/discovery-flow.ts:233`, `WSDK/discovery-approval.ts:127` |
| Discovery collects every wallet that answers for 60 s (`DEFAULT_DISCOVERY_TIMEOUT_MS`), into an async iterator; a page can list wallets and connect to none. | `extension_provider.ts:17`, `:209-230`; `SDK/manager/wallet_manager.ts:94-131` |
| The key exchange is a separate call the page makes when it chooses: `WalletProvider.establishSecureChannel()`. Its own timeout, 2 s (`KEY_EXCHANGE_TIMEOUT_MS`), starts at that call, not at the discovery answer. | `extension_provider.ts:20`, `:56-103` |
| The sdk sets no deadline between a discovery answer and the key exchange: the wallet-side approved entry has no TTL and answers the first key exchange that names it, then is deleted. | `SDK/extension/handlers/background_connection_handler.ts:306-331` |
| A termination re-adds the session's discovery as `approved` "so user can retry key exchange": one discovery can lead to more than one key exchange over its life. | `background_connection_handler.ts:398-413` |
| `establishSecureChannel` resolves once keys are exchanged; `confirm()` is local and waits for nothing from the wallet. The page learns nothing of the wallet's check; a wallet disconnect before `confirm()` is dropped by the sdk (#605, `blocked:external`). | `wallet_manager.ts:155-172`; #605 |
| The playground discovers and exchanges in one call (`connect()`): it takes the first provider and calls `establishSecureChannel` at once. It has no discover-only path. | `apps/playground/src/lib/wallet.ts:67-116`; grep `discover\|getAvailableWallets` in `apps/playground/src` |

So the two-step window assumed every discovery is followed by an exchange; the sdk does not promise one, and a wallet-picker page (list now, connect later or never) is a normal use.

## 2. How the two windows work today

New connection (`WSDK/discovery-flow.ts:370-423`, `runDiscoveryPopup`):

1. `dappInteractionService.discover` opens the discover window (400 x 800, top right of the last focused normal window: `dapp-interaction/service.ts:611-618`, `window-manager/placement.ts`).
2. Allow: `resolveInteraction` → `settleDiscovery` hands the window to the worker with `{approved, windowId, expiredUrl}` (`service.ts:301-308`, `window-manager.ts:195-204`); the window is put in `handedOver`.
3. `admitVerifyWindow` reserves a verify-window slot (`consumesToken: false`), then `reservation.attach(windowId, expiredUrl)` puts it in `standby` (`verify-admission.ts:109-119`).
4. `persistAndApprove` writes the `DappSession` row, sets the pending-verification marker and calls `approveDiscovery` (`discovery-flow.ts:492-569`, `discovery-approval.ts:90-138`).
5. The page's key exchange → `onSessionEstablished` (`WSDK/background.ts:505-544`) → `handleSessionEstablished` → `showVerifyWindow` claims the standby window and navigates it to the check (`session-established.ts:243-269`).
6. No exchange: the reservation expires at the discovery time + 55 s (`DISCOVERY_STALE_MS`) + 10 s (`RESERVATION_GRACE_MS`); `expire()` navigates the standby window to `?expired=1`, which shows "Connection request expired" and closes itself after 30 s (`verify-admission.ts:184-198`, `discover/index.vue:30`, `:143-161`, `:216`). That wait is #859.

Remembered reconnection (`autoApproveExistingSession`, `discovery-flow.ts:278-297`): admission spends a token, the reservation stays `unstarted`, and establishment opens a fresh window through `openVerifyWindow` (`session-established.ts:274-317`): anchor `getLastFocused({windowTypes: ["normal"]})` (`core/adapters/chrome-browser-api.ts:209-215`), `createPlaced` 400 x 800 top right, no `focused` option, the browser's default focus.

## 3. Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Open the check in its own window for a new connection | `openVerifyWindow` with the admitted reservation (`session-established.ts:274`) | reuse as is |
| Bound how many checks an origin holds | `VerifyAdmissionGate`: one slot per reservation, `liveWindowIds`, 2 per origin, 8 global, FIFO 4 (`verify-admission.ts:22-26`) | reuse; drop the `standby` state |
| End an Allow that gets no exchange | the unstarted reservation's expiry (`expiredUnclaimed`, `expire()` → `released` hook tombstones the marker, `background.ts:321-328`) | reuse as is |
| Keep the discover window after Allow, owned by the worker | `WindowManager.handOver` (`window-manager.ts:195`), `handedOver` map, tab teardown closes it (`background.ts:339-343`) | adapt: a short bridge, not a slot |
| A late or foreign exchange opens nothing | dead marker → terminate (`session-established.ts:118-122`); no row → terminate (`:124-130`); no reservation → throw → terminate (`:182`); `markInFlight` once (`verify-admission.ts:131`) | reuse; pin |
| Exchange only from the allowed tab and document origin | `keyExchangeFromItsDiscovery` (`background.ts:453-462`), pinned by `background.transport.test.ts:277-330` | reuse; pin |
| A gesture-less window answers no stray key | verify buttons `@keydown.enter="refuseRepeatEnter"`, no document listener, nothing focused on mount, pinned by `verify/index.test.ts:143` | reuse |
| Fake clock and window port for worker tests | `background.connect-window.test.ts` harness; `ClockPort`, `WindowPort` fakes | reuse |
| Record windows an e2e creates | `recordCreatedWindows` (`tests/e2e/fixtures/popups.ts:136`) | adapt: add removal times |
| A page that discovers and connects later | none (searched `discover`, `getAvailableWallets` in `apps/playground/src`) | build new: a playground Discover button keeping its provider for the next Connect |

`WindowPort.navigate` (`packages/wallet-core/src/ports/window-port.ts:54`, `chrome-browser-api.ts:203`) has two callers, both in the standby path (`background.ts:323`, `session-established.ts:260`): dead once standby goes. Searched `\.navigate(` and `navigate:` in `apps/extension/src` and `packages`.

## 4. Tests that pin the two-step design (all change)

- `WSDK/verify-admission.test.ts`: the attach, standby, claim and expired-page cases (`:262-425`).
- `WSDK/session-established.test.ts`: the `standby()` helper and its cases (`:492-610`).
- `WSDK/background.connect-window.test.ts`: "the connect window after Allow" (`:356`), the queued attach (`:516-580`), "an approved connection whose key exchange never completes" (`:582-606`), "establishment shows the check in the connect window" (`:627-760`).
- `dapp-interaction/service.test.ts:920-982` (`handOverHarness`, `expiredUrl`).
- `core/adapters/chrome-browser-api.test.ts:60-90` (`navigate`).
- `popup/windows/discover/index.test.ts`: the expired block (`:462-549`), the step bar (`:587`, `:590`); `index.lifecycle.test.ts:235-260` (stays: the page does not close itself after Allow).
- `popup/windows/verify/index.test.ts:175-187`, `index.window.test.ts:176` (step bar); `ConnectStepBar.test.ts`.
- e2e: `network/connect-one-window.test.ts` (whole file), `window-placement.test.ts:220-272`, `session-tabClose.test.ts:138-170`, `session-reconnect.test.ts:47` (step-bar read); `fixtures/popups.ts` `approveConnect` (`:181-202`) and its ~25 callers through `connectPlayground` (`fixtures/extension.ts:396`).

## 5. Lane claims checked against the tree

- "A remembered app's reconnection already opens its own window since #631": holds (`git log -S isReconnect` → `fc510ef8`, #631).
- "A key exchange opens the check only for the tab and origin whose discovery was allowed": holds at the transport (`keyExchangeFromItsDiscovery`). "A navigation of that tab to another origin voids that Allow": holds by realm teardown and the content script's approval filter, not by `tabs.onUpdated`, which on Chrome sees no URL for an ordinary origin (`WSDK/tab-lifecycle.ts:27-49`; Firefox delivers it, `session-tabNavigate.test.ts:158`): the port for the request dies with the document, a later document drops an approval for a request it did not forward (`apps/extension/src/content-script/approval-filter.ts`), and an exchange naming the id from another document origin is dropped.
- "A page cannot open more than one check window at a time": **does not hold as worded**. One Allow (or one remembered approval) backs at most one window, but an origin may hold two at once (`VERIFY_WINDOWS_PER_ORIGIN = 2`), so one page can show two: two chains, or a new connection plus a re-discovery that the row written at Allow turns into a remembered reconnection. `network/session-reconnect-flood.test.ts` pins "never more than two" as the remembered path's contract. "A stream of exchanges cannot stack windows" holds (one slot per reservation; same-id re-exchanges are ignored by the sdk or refused by `markInFlight`).
- Pre-existing, unchanged by this lane: the row written at Allow stays when no exchange comes, so the app appears in Connected apps and its next discovery skips Allow (the remembered path, whose check then reads "Reconnected"). Same before and after the split; the "remember this app" flow is out of scope.

## 6. Collisions and closed limits

- #606 (closed `known-limit`): a remembered reconnect's slot can outlive its check; its path 5 ("a slow wallet pick finds no slot") now also describes a new connection whose page exchanges after the Allow's validity. No new limit; the plan states the outcome.
- #771 (closed `known-limit`): an Allow during a profile switch away and back binds to its window's profile. Unchanged.
- #605 (`blocked:external`): the dApp-side effect of a refused late exchange.
- Running lanes (execute-window-3, logs-keyboard-1, tx-record-1, firefox-sidebar-1, send-estimate-1, test-infra-1) own none of these files; test-infra-1 touches shared e2e helpers, so changes to `fixtures/popups.ts` stay inside `approveConnect` and `recordCreatedWindows`.
