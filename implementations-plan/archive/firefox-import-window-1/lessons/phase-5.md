# Phase 5: OA-1 B (a change saved but not reopened hands back)

- The owner answered OA-1 after the plan was archived on the branch (P117-12 B). The archive had not reached `dev`, so the archived copy was amended in place.
- `leaveLocked()` sits beside `leaveChanged()`: the branch inline would take `attempt` past the cognitive-complexity cap, as in Phase 3.
- Codex round 1 found that the lock can land before the error answers: `SessionManager.close()` emits the lock before its storage cleanup, and the shell's lock landing unmounts the page, whose teardown dropped the run. A unit test that rejects at once cannot see it; the fix's test holds the answer, lands the lock, unmounts, then rejects.
- The edits moved nine chaos-model citations of `unlock-method.vue`; re-cited by a line diff from HEAD and checked by `scripts/e2e/profile-chaos-model.test.ts`.
