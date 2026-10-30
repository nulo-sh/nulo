# onboarding-1, phase 0: planning consults

## Codex round 1 (gpt-6.1-sol, high, read-only), 2026-10-30

Verdict: reject (blocking findings: stale markers permit false success, D1 violates the cross-shell rule, product assumptions unresolved).

- 1 D1 breaks CLAUDE.md's cross-shell rule: accepted; ConfirmPopup and its shared sheet move under `src/components/`.
- 2 A refused id marker still leaves Ready on the Done route: accepted in substance; D3 drops the id, so routing keys on the marker's presence and nothing is refused.
- 3 A marker survives Back and blesses a later attempt: accepted; the form pages clear it on mount and the shell reads it in setup. Replacing the form entry was Codex's preference; rejected because it changes Back from Ready.
- 4 The restore tail and a create microtask leave an active profile unmarked: accepted; the tail is marked at `restoring:account-state`, and the create window is one microtask on the safe side.
- 5 Marking a restore with errors equates review with completion: rejected; see the plan's D5.
- 6 Wording is an owner question, and "refused" conflicts with Add anyway: accepted (OA-1); "refused" is settled by the issue's own expected behaviour (the warned confirm).
- 7 Phase 1's test proves presence only: accepted; it drives Confirm and Cancel through the real dialog.

## Opus Plan leg, 2026-10-30

Verdict: conditional approve (path-only marker; mark the restore tail; settle D1; list the wording as an ask). All four conditions are met by the revision. Its finding 7 (a mark after Back mid-import lands on the current entry) is noted only, since the push to Ready that follows already moves the tab.

## Codex round 2 (resumed session), 2026-10-30

Verdict: conditional approve (preserve the marker during the initial resume; test an interrupted resume).

- 1 Clearing on mount erases the marker while the load check still awaits hydration, so a second reload lands on Create (Codex reproduced it with an in-memory router probe): accepted; `clearFlowPath()` is a no-op until the shell's `finally` calls `settleResume()`, with `resume.test.ts` over a real router and a deferred hydration. Codex's own fix, holding `RouterView` until the check settles, rejected: it blanks the tab for as long as the worker takes to answer.
- 2 `useConfirm.test.ts:15` imports the moved file: accepted.
- 3 F5 overstated the restore-outcome reminder (best effort; nothing for an empty network list): accepted, wording only.
- Confirmed: F7's ordering, the restore-tail mark point, the CSS move under Vite's resolver, the reload e2e's justification.

## Codex round 3 (resumed), 2026-10-30

Verdict: conditional approve (clear stale provenance when the check fails; test it). Path: a marked Import entry reloads, the form mounts during the check (its clear is a no-op), hydration rejects, the form stays usable, a cancelled attempt, a later reload reaches Ready. Accepted in a uniform form: the shell's `finally` clears unless it routed to Ready. Trade-off recorded: after a failed check, a second reload on a Create entry whose profile was made shows Create, not Ready; that needs a failed check first, and the form was already showing.

## Codex round 4 (resumed), 2026-10-30

Verdict: approve. No further material findings.
