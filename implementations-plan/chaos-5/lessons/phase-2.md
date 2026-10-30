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

- Green at retry 0: one backup restored twice under the hold, one row and one duplicate refusal, 8 ms; two backups under the same hold, both commit, 308 ms; the facade lock bypassed with the duplicate check real, the hold opened after the second's check, one backup committed twice, 350 ms. The last is the break, committed as a test: without the lock, the duplicate check alone admits one backup twice.
- I3, a scratch probe never committed: two restores of one backup, both confirmed as a duplicate, commit two profiles named `P`, since the name suffix is read before the lock (`apps/extension/src/wallet/services/profile/service.ts:2429-2436`). That is #1206's case 1 by another path, and its reopening condition (a path needing no deliberate second window) is not met, so it is a comment on #1206, not a new issue (D16).
- The file: 259 tests, 124.9 s.

## 2.3 Record

- Filed after a dedup search each: #1373 (S5) and #1374 (S6b), both `known-limit` and closed as not planned with their reopening conditions; #1375, open, `documentation`, the export page's network watcher comment.
- README § Chaos runs: the passkey window's two driven forms, S5's limit and S6b's issue linked.

## Consults

### Codex round 1 (gpt-6.1-sol, high, read-only)

Verdict: conditional approve (with conditions: reject fulfilled `restoreError` results). Two findings, each checked against the tree; both accepted.

1. `raceRestores` counted every fulfilled restore as `restored`, and `ProfileService.restore` fulfils with `{ restoreError }` when key setup fails after the row is written (`apps/extension/src/wallet/services/profile/service.ts:2524-2535`), so a control could pass on a broken restore. Fixed: a fulfilled `restoreError` is its own outcome.
2. The comment above the panel test's last unlocks narrated them. Deleted.

### Opus review (general-purpose), beside round 1

Verdict: conditional approve. Five findings, each checked against the tree; all accepted.

1. `step-failed` also follows a request already gone at Try again (`readRequest`, `apps/extension/src/popup/windows/passkey/index.vue:64-70`), with no prompt. Fixed: the window's `credentials.get` is recorded after `failed`, and the retry must have one answer with PRF output. The forged salt was base64url while stored salts are standard base64 (`apps/extension/src/wallet/services/passkey/spec.ts:80`); now base64.
2. The PATH B assertion read `outcomes.at(-1)`, which a `done` reported before the refusal would pass; the outcomes are now cleared after the create and asserted `["failed"]`.
3. The break test's title said "the same schedule" and its comment claimed it proved contention; both now say what it shows, and that a write-time guard would retire it. The lessons line said the same; corrected.
4. The README said "with nothing written"; the test reads the session and the row. Reworded.
5. The plan's Architecture still named `checkProfiles` for the panel test; it now points at D16.

Re-run after the fixes: the changed integration tests 10 green; the panel test green on Firefox, 13.8 s.

