# onboarding-1, arc 1: browsers and the review loop

## Captures, 2026-10-30

A scratch spec outside the repo drove the base and head Chrome builds through the same path: a registered wallet reveals its phrase, the onboarding tab imports it again, then reloads. The base spins with no dialog and reloads onto YOU'RE IN; the head shows the confirm and reloads onto Import. With the form scrolled to its submit button, the head's sheet sits against the first screen and leaves an undimmed strip: closed known limit #686, whose reopening condition this arc meets.

## Codex round 1 on the arc diff (gpt-6.1-sol, high), 2026-10-30

Verdict: reject (a pending load check's `finally` erases a mark its own document's flow wrote).

- 1 Check pending → Create succeeds and marks → the check rejects → `finally` clears the new mark → a reload offers Create over the new profile. Demonstrated in memory. The resolving twin, found while fixing it, replaced the phrase step with Ready. Accepted: `markFlowPath` records that this document's flow marked; `resumePath()` ignores such a mark and `settleResume(resumed)` drops only the loaded one. D6 amended in place: one more flag beside the settle flag, no new lifecycle.
- 2 No test began unmarked and marked during the check: accepted; one `resume.test.ts` case per settle direction, both red before the fix.
- 3 Two comments restated their code: accepted; cut.
- Ask 5: ship #1385 and reopen #686 with the capture; its fix is a layout change to every `Popup` user, outside this lane.
