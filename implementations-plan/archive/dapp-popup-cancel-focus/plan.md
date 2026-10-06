# dApp popup: cancel closes it, refocus from the Queued card

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Cancelling a queued transaction from Activity closes the approval popup and rejects the dApp with a structured cancel error. The popup opens centred on the active display and the Queued card refocuses it (`apps/extension/src/wallet/services/dapp-interaction/service.ts`, `apps/extension/src/wallet/services/window-manager/window-manager.ts`).
- **Open items**: whether the Queued card switches macOS Spaces, which no headless run can observe, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Two gaps in the window the wallet opens when a dApp sends a transaction, fixed as two stacked changes.

- The service worker reacts to the operation journal's `cancelled` transition. It marks the interaction cancelled, closes the popup and rejects the dApp's pending call with the same `4001` cancel error a mid-prove cancel already produces. The popup closes at once, with no overlay.
- The popup's own Reject reaches the dApp as a typed `UserRejectedError` mapped to `4001` with a distinct `USER_REJECTED` code, instead of an unclassified string.
- `WindowManager` centres the popup on the last-focused normal browser window when it opens, keeping signed coordinates so displays left of or above the primary work. The Queued card in Activity is clickable and asks the service worker to focus the popup's window.

## Why

- Before, a cancel from the feed moved the journal record to `cancelled` and stopped. The popup stayed open, and Approve failed silently once the window closed because the claim helper refuses a cancelled record.
- The journal event is the existing decoupled seam, and it is emitted under the lock that serialises cancel against claim. Calling `DappInteractionService` from the execution lane would invert a dependency that already points the other way.
- Only the service worker holds the handle map, so only it can close the window and reject the promise in one step. A broadcast asking the popup to close itself is lost if the popup has not subscribed yet, and it leaves the dApp call hanging.
- The error envelope maps only `Error` subclasses and forbids matching on text, so the cancel reason had to become an `Error` instance.
- The card is clickable at the `queued` stage only. A queued record does not prove a window exists, so a click that finds none returns false and does nothing visible. A journal flag recording "popup open" would add a write on every open and close for a cosmetic gain, so it was not taken.

## What shipped

- `WindowManager.cancel` accepts an `Error` and passes it to the rejection unchanged. `WindowManager.focus` and the pure `centerOn` helper are new, and opening looks up the last-focused window before creating the popup.
- `DappInteractionService` subscribes to the journal, finds the interaction by its journal id and cancels it. A journal re-read right after the interaction registers closes the gap where a cancel lands before the subscription can see the interaction. `focusInteractionWindow` is an RPC that refuses a profile other than the active one, as `cancelJob` does.
- `WindowPort` in `packages/wallet-core/src/ports/window-port.ts` gained `update` and `getLastFocused`, and `create` accepts `left` and `top`. The Chrome adapter and the fake implement them.
- `error-envelope.ts` maps `UserRejectedError` to `4001` with `USER_REJECTED`.
- `TransactionAwaitingCard.vue`, `recent-activity-handlers.ts` and `RecentActivityView.vue` carry the clickable Queued card.
- Validation was unit, component and composition tests; no e2e ran.
