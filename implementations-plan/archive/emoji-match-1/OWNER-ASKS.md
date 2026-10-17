# Owner asks: emoji-match-1

P28-04 = A (signed 2026-10-16) is built as signed. These two asks are what the decision page did not show. Both must come from the owner's own words.

## OA-1: the "Skip this check next time" switch, in the check and in Settings

**Surface:** two rows with the same signed copy (security-ui-1), "Skip this check next time" over "Only for this app on this network.", with a switch:
- in the emoji check, above "They don't match" and "They match" (`popup/windows/verify/index.vue`);
- in Settings → Connected apps → the app, under the last connection's grid (`DappSessionVerification.vue`).

**Why it is asked:** this switch is the only way a reconnect skips the check today, so it is most likely what "remembered" means in #587. Under A the check shows on every connection, so the switch can no longer do what it says. The decision page described remembering as skipping the capability consent; in the wallet that part already holds for every remembered app, switch or not (the connect window and any capability request the stored grants cover are skipped).

**Also confirm:** when you saw no check in #587, had you turned this switch on for that app? If not, something else hid the window, and this arc does not fix it.

**Options:**
- **A. Remove both rows (recommended).** The check reads: the header, the app, the grid and its instruction, then They don't match and They match. Settings → Connected apps → the app keeps "Connection check", the last connection's grid and "Emojis from the most recent connection. They should have matched what the app showed then.", with no switch.
- **B. Keep both rows.** The switch stays and saves its setting, but the check shows anyway: the screen promises a skip that never happens.
- **C. Reopen P28-04.** The switch keeps working as today.

**Recommendation:** A, the only form in which P28-04 A and the screens agree.

**What ships now:** the arc is built with A and its PR stays a draft until you answer. The wallet change and the removal cannot ship apart: without the removal the switch makes a false promise (B); without the wallet change the check still skips. If you answer C, the PR closes and #587 returns to the decision page.

**What the app's page shows under A** (recon § 1): the sdk resolves `confirm()` on the page with no answer from the wallet, and no protocol message carries one. So the page shows its own grid until the person confirms there, as today. Its calls then wait in the wallet until They match (decision page 14, DH-0, for an untrusted reconnect; now for every reconnect). On They don't match the wallet ends the session. A page that has already confirmed gets the standard disconnect and its waiting calls fail. A page still showing its grid does not: the sdk drops a disconnect that arrives before the page confirms, so its grid stays up. If the person then confirms on the page, its first call can wait until the sdk's heartbeat gives up, 300 seconds by default. That limit exists today for every new connection; it is filed for aztec-packages at close-out. The playground draws no grid and confirms at once; its rows read pending until They match (DH-4).

## OA-2: what They don't match does to a remembered app

**Surface:** the check on a reconnect, its left button "They don't match" (P28-04's text calls it "Reject"), and Settings → Connected apps afterwards.

**Today (signed, P2-09: "They don't match ends the session as today"):** the wallet ends the app's connections and forgets the app: it leaves Connected apps, and its next connection asks Allow and any capability again. If forgetting fails, the check says "The connection ended, but this app could not be removed. Remove it in Settings, Connected apps."

**Options:**
- **A. Keep today's behaviour and the label "They don't match" (recommended).** A mismatch means the channel may be relayed; forgetting the app makes its next connection ask Allow again.
- **B. End the connection but keep the app remembered**, as the lane brief proposed. The app stays in Connected apps with its grants; the person forgets it there. The error line above goes.

**What ships now:** A, today's behaviour; the code does not change. The PR still leaves draft only once you answer, so the deletion ships by your choice. If you pick B, say whether it waits for a later change or must ship with this one.
