# Firefox passkey steps leave the toolbar panel

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: On Firefox a passkey step started from the toolbar panel runs outside it, decided by one rule in `apps/extension/src/utils/browser-surface.ts`: unlock, a new passkey profile and passkey import in the background's passkey window (`apps/extension/src/popup/windows/passkey/index.vue`), full-backup export and restore in a window of their own (`apps/extension/src/utils/own-window.ts`). Passkey failures show a way out on both browsers, and `apps/extension/tests/e2e/passkey-toolbar-panel.test.ts` fails on any passkey call made in Firefox's real panel.
- **Open items**: a password profile's unlock that fails unexpectedly shows nothing; nothing stops a second own window for one flow; `ConfirmPopup`'s passkey confirmation is dead UI; an in-page passkey creation retried after a failed confirmation saves a second passkey; the owner is to check on a Mac whether the toolbar panel survives the file picker and whether a password profile's full backup downloads from it; CI builds no Storybook; and the pull-request lane's Firefox smoke wants splitting before it times out; all tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Run every passkey step that Firefox's toolbar panel starts somewhere that outlives the operating system's passkey prompt, and keep the in-page card everywhere else: in Chrome, and in Firefox in a tab or a window. One synchronous rule, `passkeyNeedsOwnWindow()`, is true exactly when the document is one of Firefox's two popup kinds (`chrome.extension.getViews({ type: "popup" })` holds it), never by page path, which a tab or a window shares.

- **Unlock, create and import** hand their step to the background's passkey window, the second host that [passkey-in-page-modal](../passkey-in-page-modal/plan.md) kept, and it stays until the background reports how the whole step ended. **Export and restore** need the credential in the page, so the page reopens itself in a popup-sized window. Every full-backup restore moves, since a backup's kind is unknown until the file is read; password-profile exports stay in the panel.
- **Every passkey failure says so, on both browsers**, Chrome's own Cancel included (the owner's call); only a cancel made inside Nulo stays silent. `NotAllowedError` reads as not confirmed, since a dismissal, a timeout and a lost focus look alike. The words, all in `apps/extension/src/utils/passkey-copy.ts`, never say prompt, toolbar, popup, panel, ceremony, PRF or WebAuthn, and one screen (`PasskeyScreen`), the owner's design pick, serves the card and the window.
- **A refused step leaves a way out.** A restore whose passkey was not confirmed keeps the chosen backup and an enabled Import, with a toast, and any new passkey attempt closes that toast. A restore's rarer passkey failures keep their error box until the backup is chosen again. The in-page card traps focus.
- **Onboarding's "Open wallet"** closes its tab from the background, keeping a window's last tab with the popup over it on both browsers. After a passkey-window step succeeds, the popup reopens on the window it came from.
- **Release gating**, the owner's call: a release's assets wait on the Firefox smoke of the shipped zip, and `main` requires the Firefox smoke lane as `dev` does.
- **Not taken**: every Firefox passkey flow in a full wallet window, which turns unlock, the most frequent step, into a heavier one. Left alone, as no person meets it: a lock in the same second a reopened popup boots, which its shell reads as a failed boot.

## Why

Firefox's toolbar popup is an auto-hiding panel. On a Mac the passkey prompt takes focus, Firefox closes the panel and destroys its document, and the request dies with it, so the person saw the prompt close by itself and no error. Failures were silent elsewhere too: the card read every `NotAllowedError` as a cancel, and unlock had no default error branch. Headless Firefox keeps the panel open on focus loss and the suite opened the popup in a window, so no test saw it and a release shipped it. The background already finishes a request whose page died and only drops the answer, so a window that outlives the panel can show the step's end. Export and restore finish their work in the page after the prompt, so only moving the page keeps them alive. Firefox lets a page close its own tab only while the tab's history has one entry, and onboarding's hash router adds one per step.

## What shipped

- **Panel steps.** One passkey request runs at a time: a new one cancels the pending request and its window. A profile whose restore did not finish is refused before any window opens, while the panel can still say so, and a create refuses a credential whose user handle is not the id the background chose. The next document that adopts the session records its profile as the last active one.
- **The passkey window** (`apps/extension/src/wallet/services/passkey/service.ts`). The request stays claimed and cancellable while its credential is built and is handed over at most once; the step's `finish` reports `"done"` or `"failed"` once. The window shows waiting, finishing, a failed screen with Try again while the request is pending, or a step-failed screen with Close. Try again confirms a saved but unconfirmed credential, pinned to it, never creating a second. On `"done"` the popup reopens on the window focused when the step began, if focus returns there within 3 s (`apps/extension/src/wallet/utils/toolbar-popup.ts`).
- **Own windows.** The document records once, at boot, that it opened as one (two allowlisted routes and a `window=own` marker), so the guard and the lock screen cannot lose its flow; unlock returns there, a dApp window's saved page first. Back closes it only in a `popup`-type window, so a marked URL in a tab keeps ordinary back.
- **Trust.** The background answers "Open wallet" only from the onboarding document in a tab, and takes the tab and window from the sender, never from the message. Logs name a fixed category, never a URL (window URLs carry request ids and can carry a typed profile name), a credential id or a profile name.
- **Tests.** The real-panel spec (Firefox only, through `armPanelDeath`) records any WebAuthn call made in the panel, then closes it, and hides the panel once a new window is active, as a Mac does; it failed on the code before the fix. Its export, download and restore case runs locally and in the nightly and release Firefox artifact smokes, which get 45 minutes. `apps/extension/tests/e2e/PRF-NON-PORTABLE.md` keeps a manual checklist for Firefox on a Mac, which headless cannot replace.

## Lessons

### failure-way-out

A failure must end in its way out. Showing the error proves half of it: assert that the retry control is offered and enabled, that the person's choice is still chosen, and that a second try finishes. The full-backup restore said "Try again" over a disabled Import: its stage turned a dismissed passkey into a failed status, under which both import pages disable Import, and only choosing the file again cleared it. Its unit test pinned that failed state as correct, and every e2e stopped at the message. `apps/extension/tests/e2e/passkey-retry.test.ts` now refuses each passkey step a page starts once and finishes it on the second try, on both browsers, and turns red when the stage's old mapping is put back.

### storybook-cycle

An import that reaches a service module drags its graph into every story that renders the importer: the passkey copy module pulled in the WebAuthn runner and, through the wallet utils barrel, the Aztec stack, and the own-window helper pulled in the wallet logger. Each put two Storybook chunks on a static import cycle. Pure helpers now live apart (`apps/extension/src/wallet/services/window-manager/placement.ts`, `apps/extension/src/wallet/utils/passkey-errors.ts`), and CI builds no Storybook, so only a local `build-storybook` catches it.
