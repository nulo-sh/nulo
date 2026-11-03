# Phase 2: one pick and decrypt classifier, one error log

- The pick and decrypt classification moved to `composables/full-backup-selection.ts` (stateless: `readPickedBackup`, `openPickedBackup`), the error-log writers to `composables/restore-error-log.ts`, and `retryNetworkIds` into `full-backup-restore.ts`. Both pages keep admission, the pick counter, resets, the prefill and their own log lines.
- The import's existing race pin (`useFullBackupImport.stages.test.ts`, a re-pick queued from the decrypted body's parse) now proves the helper's own check after the earlier-passkey read, not the caller's: that check moved inside the helper. Its title and comment say so.
- New caller-gap pins, one per page, wrap the real `openPickedBackup` through a pass-through `vi.mock` and re-pick after it returns. With `|| stale()` removed from both callers they fail (`expected { kind: 'opened', … } to strictly equal { name: 'new.json', … }`, 2 failed); restored, they pass.
- The build regenerated `src/types/`: the diff also catches up phase 1's moves, which typecheck never flagged because `skipLibCheck` skips the generated declarations. Read and committed whole.
- Gate: lint, `typecheck:all`, the phase 1 and 2 test paths at retry 0 (244 files, 4888 passed, 1 skipped), the chaos citation test (266), the `useFullBackupImport` grep in `useRestoreAgain.ts` empty.
