# Phase 0: planning

## Recon (2026-10-09)

- Two Sonnet explorers: a reuse sweep over eight capabilities, and a mapper of the profile-switch path. Findings consolidated in [recon.md](../recon.md).
- #44's claim did not hold at 61060c0: PR #41 merged 27 minutes after the issue was filed and added the `targetId` exclusion with a test. Verified by reading 3b80761^ (the bug) and running the import-mode tests at base (3 passed).
- A falsy cancel from `pickFile` would clear a chosen backup on the full-backup page (`runPickBackupFile`); this decided the typed rejection.

## Codex plan audit, round 1 (2026-10-09, gpt-6.1-sol, high)

- Verdict: reject, with blocking findings: a write can still start after the switch (the service awaits its lock and reads after the fence check); a begun deletion fails the fence with a plain error, not `SessionEndedError`.
- Eight findings; triage and dispositions are in plan.md's Audit verdicts. The two High ones were accepted (an in-lock `isFenceLive` check before the write; fence failures mapped to `SessionEndedError` on the fenced path).

## Opus 5.5 Plan-agent review, round 1 (2026-10-09)

- Verdict: conditional approve. Two High: the stop toast depended on which request a lock's page unmount rejects (the contacts page disconnects the client it lends the composable); the Firefox smoke would load a stale or missing build, and headless Firefox might fire `cancel` by itself.
- Folded with Codex round 1 into one revision; dispositions in plan.md's Audit verdicts.

## Codex fix-up review, round 2 (2026-10-09, resumed session)

- Verdict: conditional approve. Conditions: state and test that a failed fence probe stops the run; correct the `null` rationale (the port keeps a trailing `undefined`: `wrapParams` carries the arity); make the Firefox contingency match the pending input and clean up in `finally`; fix Phase 1's step order. All four folded; the plan stops here at the approval gate.
