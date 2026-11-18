# connected-app-build-1: phase 1

- T1's red on the base: against the base `[id].vue` alone it failed on the page-root testid, which proves nothing about the section; with only the testid added to the base copy it failed on the never-happens assertion (the section's text drawn), which is the proof recorded.
- `typecheck:all` first failed on the new case's object literal (`verificationHash` is not on the test's `session()` type); fixed with a local `StoredSession` type on `mountPage`, then green.
- Network gate at `0a6e270d1`, Chrome, retry 0, one `agent.sh` invocation: connect-verify-mismatch 2/2, connect-check-window 2/2, type-roles-windows 6/6 (exit 0; longest silence 169 s, under the watchdog).
- Codex (gpt-6.1-sol, high, read-only), round 1 over plan and diff: approve with one comment fix (accepted, `0904820c2`); round 2, resumed: approve.
