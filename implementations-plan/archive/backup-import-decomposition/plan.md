# Full-backup import decomposition

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `restoreBackup()` is a thin orchestrator in `apps/extension/src/composables/useFullBackupImport.ts` over typed stage functions in `apps/extension/src/composables/full-backup-restore.ts`, pinned by `apps/extension/src/composables/useFullBackupImport.stages.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Split the import's orchestration into a sibling module of plain functions, one per restore stage, and keep a short orchestrator in the composable: guards, validation gate, rollback bookkeeping, the stages in order, a liveness-gated rollback in the outer catch, and client disconnects in the finally. The three already-extracted helpers stay exported from the composable; moving them risked import cycles and suite edits for no complexity gain. `pickBackupFile` and `decryptBackup` get only a light touch: a pure name-normalisation helper, with their publication and stale-selection fences left in their exact shape.

Stages return typed terminal descriptors (proceed, fail with its own copy, silent cancel, cleanup pending) that one small `applyOutcome` helper renders. That keeps each stage's copy local while making every status, stage and error combination exhaustive and testable in one place.

## Why

`restoreBackup()` had cognitive complexity 114 across 220 lines and carried five complexity suppressions in the file. It is money-path-adjacent (it restores wallets, opens sessions and deletes orphan profiles), so the change had to be a behaviour-preserving transcription, not a redesign.

Equivalence was proved two ways: the existing 74-test suite stays green with zero edits, and new real-wiring pins were committed against the old code before any extraction. The suite covered the major failure branches but not duplicate-confirm decline and retry, active-pointer rejection, imported-key order, error-log reset, failure-path disconnects, or the exact stage, status and error matrix of the seven failure paths.

## What shipped

- Stage functions for passkey credential, secret building, profile, networks, active-network pointer, accounts, tokens, the six-service loop, reconcile, finalize, account state and completion, plus a hoisted rollback and the liveness-gated outer-catch body.
- Invariants kept verbatim: the stage and status sequence the page's re-enable guard keys on, the rollback matrix (bounded retries, a commit-ambiguous delete is never treated as success, post-finalize failures keep the profile), the order of restore (profile, id remap, networks, active pointer, accounts and keys, tokens, services, reconcile before finalize, account state after finalize), and completion isolation (a failed completion after success only surfaces).
- Two corrections from review: the error log is reached through live callbacks, never a captured object, because the log's value is replaced at restore start; reconcile is its own stage after all service slices, because folding it into accounts would orphan later dependent rows.
- A fence fix in `decryptBackup` at its helper await boundary, with a deterministic race pin.
- Five complexity directives removed from the file and the baseline manifest shrunk to match.
