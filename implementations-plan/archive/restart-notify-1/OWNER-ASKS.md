# restart-notify-1: owner asks

## OA-1: the send and sign windows (and the fee question and network notice) after a restart

**Surface.** The windows an app opens other than the connection windows: Send (`sendTx`), Sign (`createAuthWit`, the same window titled Authorization), the fee question for a held send, and the network-not-available notice. The arc closes the connect, emoji check and capabilities windows on your P70-08 words; these four are not in those words.

**Today, measured on Chrome** (Firefox draws the same windows; it was measured for the connect window only):

- *A crash or the browser ending the wallet's background:* the window stays as if the request were live. A "Couldn't estimate fee. Try again." notice appears; Confirm then shows "Processing error." and greys out. Nothing is sent. The app already received "Wallet disconnected" within 2 to 12 s.
  - Send, after the restart: `screenshots/chrome-unplanned-execute-after.png` (dark: `-dark`)
  - Send, after Confirm: `screenshots/chrome-unplanned-execute-after-primary.png` (dark: `-dark`)
  - Sign, after Confirm: `screenshots/chrome-unplanned-sign-after-primary.png` (dark: `-dark`)
- *The lock's own restart (#907):* on Chrome the window turns into a small Chrome New Tab window that stays open (`screenshots/chrome-planned-execute-after.png`; Chrome draws it, so light and dark are the browser's). On Firefox the window closes. A lock already closes these four windows on its own (each window refuses its request and closes when the wallet locks); on Chrome the restart simply comes first.

**Options.**

- **A (recommended):** close them too, as the connection windows. After a restart nothing of the request is left on screen; the app has its own error.
- **B:** keep today's behaviour.

**What the plan shipped first:** B. The arc's one route list (used after a crash and before the lock's restart) left out `execute`, `fee` and `network-unavailable`; A adds them (one line and one test row each).

**Recommendation:** A. The window can no longer do anything; a "Processing error." after Confirm reads like the send failed for a reason the person can fix, and the New Tab window looks like a browser fault.

**Pick: A** (P72-03, 2026-10-20): "Close them too, as the connection windows close. Nothing of the request stays on screen; the app has its own error."

**Disposition:** shipped in arc 1's PR, before its merge. `execute` (Send and Sign share it), `fee` and `network-unavailable` joined `RESTART_ENDED_ROUTES`, the one list the boot sweep and the lock's tracker read, each with a test row; the PR closes #939, which tracked this ask. The after pictures (Chrome, light and dark, after a crash and after the lock's restart) are `screenshots/chrome-fixed-*.png`.

## #940: the wallet's own windows after the lock's restart

Filed at close-out: on Chrome the lock's restart leaves the wallet's own popup windows (the logs viewer, a request's JSON, the passkey window, an export or import in its own window) open, as New Tab windows. Measured for the logs viewer while building the fix: with the page-opened windows left out, it stayed open past the restart.

**Pick: A** (P73-02, 2026-10-20): "Close the wallet's own windows before the restart too (logs viewer, request JSON window, passkey window, export or import in its own window), as the request windows close. A person reopens one from the popup."

**Disposition:** shipped in arc 1's PR, before its merge. Before the lock's restart the background removes every window it opened and every popup-type window a wallet page reported from by opening a port; the PR closes #940. Pictures: `screenshots/chrome-fixed-own-*.png`.
