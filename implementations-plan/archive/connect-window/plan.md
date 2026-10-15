# One connect window

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A connect window that turns into the emoji check, in `apps/extension/src/wallet/services/wallet-sdk/session-established.ts`, `verify-admission.ts` and `pending-verification.ts`, with the pages `apps/extension/src/popup/windows/discover/index.vue`, `verify/index.vue` and `ConnectStepBar.vue`.
- **Open items**: the connect header naming the active rather than the dApp's network, the waiting window's "wants to connect" copy, the step bar's low-contrast empty half, a failed wait closing the window with no message, screen-reader announcement of the swap to the check, and the `network/price-fixture` time budget, tracked in #123, #124 and #185.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

After Allow, the connect window stays open and becomes the emoji check once the secure channel is up, instead of closing so the service worker opens a second window. The permission window stays separate, because the dApp asks for permissions on its own schedule and possibly never. A reconnect of a remembered but untrusted dApp keeps its own check window.

The check's header names the account and the network by name. Before an account is shared it reads "No account shared" beside the session's network, and the network's name replaces "chain N" on every reconnect. The check keeps its content, toggle and OK button. The connect page's revoke line points at Settings, Connected Apps.

## Why

A connect used to pop up to three wallet windows. Merging the first two removes a window swap at the moment the person is comparing two grids of emojis.

The service worker owns the switch end to end, because a page that navigates itself cannot be trusted to finish. Establishment pushes the route change, with no polling. The window's hand-over to the connection flow is a handle, never a page-supplied id.

Every exit between Allow and the check must close the window and leave no way for a later establishment of that attempt to succeed without a check. The SDK restores an approved discovery after any termination, so the same session id can establish again later. An abandoned attempt's pending-verification marker therefore becomes a tombstone, not a gap, and a retry of that id terminates whatever the row's "always trust" flag says. Only a successful establishment spends a marker.

## What shipped

- A window port that can navigate, and a reservation with a standby state that holds the waiting window until its removal. A window slot is released only when the window is gone.
- A hand-over at Allow, a closed-window recheck immediately before the marker is set, and tab-teardown cleanup of handed-over windows.
- A connect page that keeps its loading look after Allow, with a two-step bar over the connect screen and the check.
- OK refusing a repeated Enter through `refuseRepeatEnter`.
- Network specs that record every window created in a connect and check each grid against the dApp's own hash, on both browsers.

## Lessons

### Controls

A test that something never happens passes code that always fails, unless a success-path control shares its fixture. The test that a send arriving during a failed navigation is never dispatched could not fail, because the fake service graph could not dispatch at all. It gained the missing pieces and a control that sends the same message while the navigation succeeds.
