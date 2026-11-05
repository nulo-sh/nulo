# Phase 2: the entity forms' rules (#1449)

- mutation check: New FPC with `appendUnlistedUpdate` left at its default turns the New FPC pin red (1 failed), restored.
- `test:all` red once: `scripts/e2e/profile-chaos-model.test.ts` cites lines by number (`tests/e2e/helpers/profile-chaos/model.ts`); the Select profile and backup-import edits moved four of them. Re-cited by a line diff from base (the lessons.md entry); 266 passed.

## Review loop, round 1 (2026-11-05)

- Codex R1 (gpt-6.1-sol, high, read-only): changes requested, comments only, no runtime regression. Accepted: the FPC comments overstated network isolation (an add still lists a foreign row, #529); `INVALID_ADDRESS`'s comment implied one shared check; `send-sides.ts`'s comment named its test.
- Opus diff review (general-purpose, opus): clean, four small fixes. Accepted: Edit FPC's update pin had no listed-rename control, so dropping `fpcList.onUpdated` passed every test (mutation-checked: the control now fails, 1 of 24); the `entity-list` test title; the `INVALID_ADDRESS` comment (as Codex); `send-sides.ts`'s comment wording; `ProfileNameField.vue`'s header comment back above the import.
- Codex R2 (resumed): clean; the fixes and the four re-cited lines verified, no regression. The loop converged in two rounds.
- Smoke on Chrome (the arc gate's eight files): 8 files, 43 tests passed, 3 min 27 s.
- Network on Chrome (`transfers.test.ts` via `agent.sh`): 1 file, 1 test passed, 153 s.
