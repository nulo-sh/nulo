# Phase 2: one pick and decrypt classifier, one error log

- The pick and decrypt classification moved to `composables/full-backup-selection.ts` (stateless: `readPickedBackup`, `openPickedBackup`), the error-log writers to `composables/restore-error-log.ts`, and `retryNetworkIds` into `full-backup-restore.ts`. Both pages keep admission, the pick counter, resets, the prefill and their own log lines.
- The import's existing race pin (`useFullBackupImport.stages.test.ts`, a re-pick queued from the decrypted body's parse) now proves the helper's own check after the earlier-passkey read, not the caller's: that check moved inside the helper. Its title and comment say so.
- New caller-gap pins, one per page, wrap the real `openPickedBackup` through a pass-through `vi.mock` and re-pick after it returns. With `|| stale()` removed from both callers they fail (`expected { kind: 'opened', … } to strictly equal { name: 'new.json', … }`, 2 failed); restored, they pass.
- The build regenerated `src/types/`: the diff also catches up phase 1's moves, which typecheck never flagged because `skipLibCheck` skips the generated declarations. Read and committed whole.
- Gate: lint, `typecheck:all`, the phase 1 and 2 test paths at retry 0 (244 files, 4888 passed, 1 skipped), the chaos citation test (266), the `useFullBackupImport` grep in `useRestoreAgain.ts` empty.

## Arc 1 end gate: the decrypt tail moved into the helper

- `audit:dup` at the head of phase 3 read production 179 / 8794 against the base's 178 / 8787. A diff of jscpd reports at `cf9ed1e40` and head (both from `git archive`, same flags as `scripts/dup-trend/report.ts`) found one new pair: the two pages' decrypt tails after `openPickedBackup` (fence, refusal, publish), 7 lines.
- `openPickedBackup` became `decryptSelection(selected, password, banner, onOpened?)`, which publishes through the page's selection ref with no await between its last stale check and its writes. The caller-gap pins went with the gap: the helper's internal call cannot be intercepted, and nothing awaits between the check and the writes. The import's existing race pin (a re-pick queued from the decrypted body's parse) now covers that last check: with the check removed it fails (`expected { kind: 'opened', … } to strictly equal { name: 'new.json', … }`); restored, it passes.
- After: `audit:dup` production 178 / 8787; typecheck, the phase test paths at retry 0 (244 files, 4889 passed), the regenerated `src/types/` read (`openPickedBackup`/`OpenedBackup` out, `decryptSelection`/`SelectionBanner` in).
