# Popup Enter handler unification

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `NewEndpointPopup.vue`, `EditProfilePopup.vue` and `NewSenderPopup.vue` under `apps/extension/src/popup/components/popups/` now submit through `usePopupEntity` in `apps/extension/src/composables/usePopupEntity.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The last three popups with a hand-rolled any-Enter submit handler move onto the shared `isPopupSubmitKey` guard through `usePopupEntity`, as five popups already had. Enter submits only while an input or textarea is focused. The two authwit popups were left out of this change.

## Why

A body-level Enter submitting a form is a surprising behavior change a user can trigger by accident, and three different hand-written versions of the show, keydown and reset dance drift apart. One composable owns the listener lifecycle and the show and hide effects.

One divergence beyond the sanctioned Enter change: the hand-rolled watches added their keydown listener after their async population, while the composable installs it before running `onShow`. An Enter during that wait is now live. It is safe because the profile update re-validates name collisions against a fresh profile list inside its in-progress latch, and the sender add is gated on hex validity. The submit button was already clickable in that window.

## What shipped

- **New endpoint popup**: the submit and the field reset on show moved into the composable. It has no service client.
- **Edit profile and new sender popups**: show connects the client and loads the collision list or senders, hide disconnects and resets.
- **Component tests** pin the new behavior per popup: an input-focused Enter submits, a global Enter does not, Enter is inert after hide, the guards hold on the Enter path, the show and hide effects run, and the async window behaves.
- **A pre-existing bug was pinned at the time**: the edit-profile Enter path could submit the unchanged name right after opening, because the submit button was gated on having started editing but the handler's guards were not. A later change moved that gate into the shared submit-validity check, and the test is now a regression pin that a pre-edit Enter does not submit.
- The composable removes its document listener on hide and on scope disposal, so unmounting a shown popup in a test does not leak it.
