# onboarding-1, arc 1: browsers and the review loop

## Captures, 2026-10-30

A scratch spec outside the repo drove the base and head Chrome builds through the same path: a registered wallet reveals its phrase, the onboarding tab imports it again, then reloads. The base spins with no dialog and reloads onto YOU'RE IN; the head shows the confirm and reloads onto Import. With the form scrolled to its submit button, the head's sheet sits against the first screen and leaves an undimmed strip: closed known limit #686, whose reopening condition this arc meets.

## Codex round 1 on the arc diff (gpt-6.1-sol, high), 2026-10-30

Verdict: reject (a pending load check's `finally` erases a mark its own document's flow wrote).

- 1 Check pending → Create succeeds and marks → the check rejects → `finally` clears the new mark → a reload offers Create over the new profile. Demonstrated in memory. The resolving twin, found while fixing it, replaced the phrase step with Ready. Accepted: `markFlowPath` records that this document's flow marked; `resumePath()` ignores such a mark and `settleResume(resumed)` drops only the loaded one. D6 amended in place: one more flag beside the settle flag, no new lifecycle.
- 2 No test began unmarked and marked during the check: accepted; one `resume.test.ts` case per settle direction, both red before the fix.
- 3 Two comments restated their code: accepted; cut.
- Ask 5: ship #1385 and reopen #686 with the capture; its fix is a layout change to every `Popup` user, outside this lane.

## Opus review of the arc diff, 2026-10-30

Verdict: approve. It had found round 1's race independently at `00220b67f`.

- 1 Keep a loaded mark when the check fails: rejected; it reopens Codex r3-1 with no new evidence.
- 2 Mark a restore at `"finalizing"`: rejected; finalize can still fail ("Couldn't open the imported profile"), and a mark there would send a reload to Ready over another window's session. A reload mid-finalize lands on Import, where a second attempt meets the duplicate confirm.
- 3 I2 missed a Create left before its profile lands: accepted; I2 corrected, no code change (the mark would land on the entry the person went to).
- 4 The shell test registered `ConfirmPopup` itself, so it could not fail the way #1385 did (an unresolved tag): accepted; the shell imports it, and the test reds without the import.
- 5 The two settle tests share their file's module: noted; each runs last in its file.

## Codex round 2 (resumed session), 2026-10-30

Verdict: approve. Its probes ran the shell callback over unmarked, loaded and live marks with both settle directions, and a mark written while `router.isReady()` waits. Both Opus rejections stand. The loop converged.

## CI on #1400, 2026-10-30

Firefox smoke shard 2 red, real breakage: `firefox-sidebar.test.ts` opened a bare onboarding tab over an unlocked profile and waited for Ready, the shortcut this arc removes. The phase-3 gate ran only the three onboarding files; nothing else in the smoke suite named that dependency. The test now opens Ready by its route, which a profile active keeps (the plan's known limit). Local Firefox 4/4 at retry 0.
