# chaos-5 phase 2: the passkey window and restores

## 2.1 The passkey window on Firefox

- I5 holds: with Main's the only credential on Firefox's virtual authenticator, the window's discovery answers with it and shows no chooser. The new profile's row names Main's credential at a salt of its own, and Main's row is unchanged byte for byte.
- S4's order: user verification off, so the first prompt is refused and the window shows `failed`; the control page rewrites the row's `prfSalt`; verification back on, Try again. The window reaches `step-failed`, no session write lands, and nothing opened in the dying panel. The row put back opens from the panel, and Main opens from the control page on the passkey they share (the page brought to the front first, as arc 1 learnt).
- Green at retry 0: alone 14.9 s, in the full file 16.2 s; estimated 90 s.
- The file on Firefox: 125.1 s before (5 tests), 123.0 s after (6 tests); the host's load moves the other tests by more than the new one costs. Chrome skips the file's one describe (0 s before and after).
- Scratch break, never committed: without the row rewrite the retry unlocks and the window closes; the test went red at 11.5 s waiting for `step-failed` ("Browsing context already closed").
- The row is read by field, not through `checkProfiles`, which judges a model world and its bindings that a test outside the seeded run does not build (D16).
- `service.integration.test.ts` › "unlock refuses a row whose input changed while its passkey was asked, and opens nothing" now also checks the window is told `failed`: green, 7 ms.

## 2.2 Concurrent restores

- Green at retry 0: one backup restored twice under the hold, one row and one duplicate refusal, 8 ms; two backups under the same hold, both commit, 308 ms; the facade lock bypassed with the duplicate check real, the hold opened after the second's check, one backup committed twice, 350 ms. The last is the break, committed as a test, so the lock's contention is proved on every run.
- I3, a scratch probe never committed: two restores of one backup, both confirmed as a duplicate, commit two profiles named `P`, since the name suffix is read before the lock (`apps/extension/src/wallet/services/profile/service.ts:2429-2436`). That is #1206's case 1 by another path, and its reopening condition (a path needing no deliberate second window) is not met, so it is a comment on #1206, not a new issue (D16).
- The file: 259 tests, 124.9 s.

## 2.3 Record

- Filed after a dedup search each: #1373 (S5) and #1374 (S6b), both `known-limit` and closed as not planned with their reopening conditions; #1375, open, `documentation`, the export page's network watcher comment.
- README § Chaos runs: the passkey window's two driven forms, S5's limit and S6b's issue linked.
