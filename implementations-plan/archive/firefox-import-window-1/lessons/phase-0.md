# Phase 0: planning consults

## Panel round 1, Codex (gpt-6.1-sol, high, read-only), 2026-11-06

Verdict: conditional approve. Seven findings, each verified against the tree:
1. The helper's `await returnToPanel` adds a suspension between create's last `assertActive()` and its push; a queued shell continuation can run there. Plausible, local. Accepted: the decision becomes synchronous (`handsBackToPanel()`), so the in-place ending runs in the same task as the caller's last check (D13).
2. The unlock-method page re-enables its buttons (`reset()`) before an awaited hand-back, and a post-await fallback could act after a switch. The second half is closed by D13; the first is a known-limit-sized window (see the ledger, D14).
3. `needs-unlock` is not proof of a closed session (a bootstrap failure with the session open); F9 overstated (an inactive session is not reopened; an integrity block closes it). Demonstrated by the branches. Accepted: F9 and I3 rewritten; the panel boots as any panel does. The composition test it suggests is rejected: the chain is pinned piecewise (D15).
4. The new e2e never starts `watchSessionWrites`. Demonstrated. Accepted.
5. The test-6 driver's refusal read can hit a window closing on its hand-back. Plausible. Accepted: the read treats `isTargetGone` as "no refusal" and keeps polling the caller's landing check.
6. The security section overstated: `restrictToTrustedContexts` covers `storage.local` only. Accepted: rewritten.
7. D6 is an exception the signed wording does not settle. Re-read: the investigation in #1701's body, which page 116's option B sizes ("About 13 files" is its "as proposed" estimate), proposes "On `UnlockMethodChangedError`, hand back `/popup/general` with no snack". D6 now follows it (new evidence, recorded in the ledger).

## Panel round 1, Opus Plan leg (opus), 2026-11-06

Verdict: conditional approve. Eight findings, each verified: the test-6 driver race (Firefox sends no `contextDestroyed` for a self-closing window, FIREFOX.md) and no callback for one caller; the async helper's suspension (same as Codex #1); the focus-return limit (3 s, `toolbar-popup.ts:108-109`); D6 and the integrity-block success to the owner; redundant unit cases; the missing session recorder; stale comments and the regenerated auto-import types; a needs-unlock line lost when another profile opens. F5 (`auth.vue:116`, not `route-guard.ts:34`) and F7 (`lock-landing.ts:63`, a session held) corrected. Dispositions in the plan's ledger (D13 to D16) and Audit verdicts.

## Final fresh Codex pass (gpt-6.1-sol, high, new session), 2026-11-06

Round 1: conditional approve. (1) D6 exceeded the recorded approval: an investigation's proposal and a matching file count do not show the owner approved dropping a visible line; D6 ships today's ending and OA-1 asks. (2) A Back during an in-flight hand-back closed the window before `RETURN_TO_PANEL` (`closeOwnWindow`'s non-card branch), reproduced in memory; `closeOwnWindow` joins `returning`. (3) D14's rationale overstated; corrected, disposition kept.
Round 2 (resumed): approve, with one note folded (re-check the join after `getCurrent()`).
