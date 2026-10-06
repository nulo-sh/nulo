# Extract the account and token stages of full-backup restore

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The account-provenance stage and the token-balance relink stage of `restoreBackup` are two separate module-level functions, `restoreAccountsAndFilterOwnedSlices` and `relinkRestoredTokenBalances` (`apps/extension/src/composables/useFullBackupImport.ts`, driven by the stage runner in `apps/extension/src/composables/full-backup-restore.ts`).
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Make the restore pipeline's coupling between two stages an explicit value, with zero behaviour change. `restoreBackup` was a single 500-line closure. Account-provenance filtering and token relinking share a set of (chain, address) pairs that were imported. A previous change had extracted only validation and migration, and this one stages the rest instead of attempting the whole closure.

The first draft extracted accounts and tokens as one unit with the set kept internal. The audit rejected it, and the shipped design extracts each stage separately. The accounts function returns the set of imported chain-and-address pairs, and the token function requires that set as a parameter. Client construction, stage-marker writes, the catch scope and the finally disconnects stay in the caller at their original lines.

## Why

- A combined unit has three boundary impossibilities. A stage marker is written between the two stages, with no caller-side point for it. The token client is only built after the account stage succeeds, so an eager signature would open a connection that never existed on the duplicate-account and rethrow paths. The account stage's disconnect cannot keep its rollback-relative ordering from inside one unit.
- The constraint on this code was that the two stages stay together or thread the set explicitly. A set that crosses one boundary and is consumed immediately satisfies it, and makes the seam directly testable.
- A bare set return was preferred over a discriminated result, since duplicate-account classification never left the caller.
- The plan claimed the chain-equality cross-check was covered end to end, which was false. The existing test imported the address on both chains, so it stayed green with the check deleted.

## What shipped

- `restoreAccountsAndFilterOwnedSlices(data, accountService, recordRestoreErrors)` returns the allow-set. It filters the transaction, auth-registry and token-balance slices in place, and the caller keeps its duplicate-account rollback and rethrow identity.
- `relinkRestoredTokenBalances(data, newTokens, importedChainAddress)` mutates the token-balance slice in place and returns the dropped rows, which the caller appends to the restore error log at the original point.
- A black-box pin imports an address only on one chain and a token on another, so the balance must be dropped with a diagnostic. This is the case the old suite could not tell from a deleted check. Direct-call tests cover both functions, including rejection identity. Every pre-existing black-box test stayed green unmodified.
- Not extracted, and recorded as the next candidates: profile restore, networks plus the later chain-sync stage (they share the created-networks list), the services loop, finalize, and the outer catch, which had just changed shape.
