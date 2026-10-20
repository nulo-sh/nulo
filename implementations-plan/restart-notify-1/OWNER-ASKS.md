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

**What ships now:** B. The arc's one route list (used after a crash and before the lock's restart) leaves out `execute`, `fee` and `network-unavailable`; A adds them (one line and one test row each), before or after the merge.

**Recommendation:** A. The window can no longer do anything; a "Processing error." after Confirm reads like the send failed for a reason the person can fix, and the New Tab window looks like a browser fault.
