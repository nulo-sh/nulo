# Owner asks: backup-import-export

Decision page 1 (Backup and export) was signed on 2026-10-14, with one chat addendum on #189. Arc 3 builds every answer below. Two new asks remain:
- OA-10, the words of the Restore again page you chose in OA-7. What ships now is the recommended wording, built in full and shown in the arc's PR in both themes. The PR waits for you to sign the words or give others; a change is a word swap on one page.
- OA-11, one sentence on the account export page that #230 makes inaccurate. What ships now is the sentence unchanged.

## Answered (page 1, 2026-10-14)

| Ask | Your answer | Where arc 3 builds it |
|---|---|---|
| OA-1 (P1-09) | Names, not a count (chat addendum): "Retry didn't work · Testnet still not restored" | Phase 3.2 |
| OA-2 (P1-10) | A: the notice names the networks | Phase 3.2 |
| OA-3 (P1-11) | B: the viewer shows the name beside the id | Phase 3.2 |
| OA-4a (P1-12) | A: the restored profile only | Phases 3.3, 3.4 |
| OA-4b (P1-13) | A: a deleted network drops out; the last one gone removes the reminder | Phases 3.3, 3.4 |
| OA-5 (P1-14) | C: the deleted-token markers are not carried; #98 closes as not planned | none |
| OA-6 (P1-15) | A: the watchdog keeps the existing sentence | shipped in arc 1 |
| OA-7 (P1-16) | B: Restore again restores only the named networks, into the same profile | Phase 3.5; its words are OA-10 |
| OA-8 (P1-17) | accepted | Phase 3.6 |
| OA-9 (P1-18, P1-19) | B, with the fresh-id rule accepted | Phase 3.1, as below |

**How OA-9 B reads with the accepted id rule** (information, not an ask). A backup whose profile part is not an object, whose type is neither password nor passkey, or whose name is not text shows the integrity message right after Restore. An odd or missing id is still repaired, as you accepted: the restore picks a fresh one. Every file the wallet exports passes.

## OA-10. #192: the words of the Restore again page

**Surface.** The Home banner's "Restore again" opens a new popup page. You pick the backup file you restored, and the wallet restores only the networks the banner names, into the profile you are in. It reuses the full-backup import's words for the file picker, the decryption password, file errors, the warning, Retry, View Errors and Continue. The new words are these.

| Where | Recommended words |
|---|---|
| Page title | "Restore again" |
| Text above the file picker | "Choose the backup file you restored this profile from. Only Testnet and Local Network will be restored, into this profile." (one network: "Only Testnet will be restored, into this profile.") |
| The button | "Restore"; while it runs, "Restoring…" |
| A different backup | error title "This isn't the backup you restored" / "Choose the file you restored this profile from." |
| Success | The page returns to Home with the toast "Testnet restored" (two: "Testnet and Local Network restored"); the banner is gone. |
| A network still not restored | The import's warning, word for word ("Testnet didn't answer in time, so what was saved for it may not be restored. You can retry or continue."), with Retry and Continue. After a Retry that fails again, the line you approved: "Retry didn't work · Testnet still not restored". Continue returns to Home, where the banner still names the network. |
| A network the backup cannot restore (its node is another chain, or a saved contract is refused) | "Testnet couldn't be restored from this backup. You can review the details or continue." with View Errors and Continue. Retry is not offered, since it would fail the same way. The banner keeps naming the network. |
| You switch profile while the page is open | The page goes back to Home and nothing more is restored. A registration already sent finishes in the profile it started in, and the reminder keeps every network not confirmed restored. No new words. |
| You press Dismiss in a second window while a restore runs | The restore finishes and shows its result on its page; the reminder stays dismissed even if a network is still not restored. No new words. |

A tampered file, an incompatible one and one from a newer wallet show the import's existing messages.

**Recommendation:** these words. They name only what the page does, and they reuse every sentence you already approved.

**What ships now:** these words, built in full. The PR shows every state in light and dark and does not merge until you sign them or give others.

## OA-11. #230: one sentence on the account export page

**Surface.** Settings → Security → Export account, the "Before you continue" step, second sentence: "Anyone holding the plain file can spend from this account. Store it as carefully as your recovery phrase." After #230 the page never gives out a plain file, so "the plain file" names something the page no longer makes.

- **A:** keep it as it is.
- **B:** "Anyone holding this file and your profile password can spend from this account. Store it as carefully as your recovery phrase."

**Recommendation:** B. It describes the file the page now produces.

**What ships now:** A, the sentence unchanged, so no copy changes without your sign-off. B is a one-line swap.

## Explanations (no answer needed)

**OA-4b, your note ("what? feels that i need more context on the user flow to get here?"):** the flow is rare.
1. You restore a full backup on a new device.
2. Testnet's node does not answer in time, so Home shows "Testnet didn't finish restoring."
3. Before you press Restore again, you delete Testnet in Settings → Networks, for example a custom network you no longer use.

Your pick A means the reminder then stops naming Testnet; if it was the only one, the reminder goes away. Arc 3 builds exactly that.

**OA-7, your note ("Test the hell out of this e2e cases /chaos"):** every case below runs in real Chrome and Firefox builds unless marked unit.
- The page closes while a restore runs: the reopened popup shows the reminder.
- A second window dismisses the reminder: the first window's banner goes away.
- A Retry that fails again shows its line.
- A renamed network shows its new name; a deleted one drops out.
- Another backup file and a tampered one are both refused.
- A real restore leaves a contact sender missing on a node that did not answer, and Restore again brings it back.
- A profile switch mid-restore and a reused profile id (unit tests): nothing reaches the wrong profile.

Not built: a randomized chaos job like the existing send chaos lane. It would touch five CI files and the seed rules, and the cases above already cover each failure by name. Say "add restore chaos" and it becomes a follow-up issue.

**#148, your note on P1-08 ("If no real installs exist then what are we trying to fix here?"):** nothing for existing installs. Arc 1b's patch (#247) stops a future install from being left with an account the wallet refuses after a crash between two writes. With no installs to recover, no in-app recovery is built. The one item left is the bug report to Aztec, which only you can file; a draft is in #247.
