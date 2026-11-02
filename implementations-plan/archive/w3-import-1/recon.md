# w3-import-1 recon

Base: `origin/dev` at `b21fcdac8`. One Sonnet explorer (reuse sweep, five capabilities) plus the planner's own trace of the three issues. Paths are under `apps/extension/src/` unless they name another root.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Keep an imported key unless its account row is gone | `wallet/services/account/service.ts:243-251` `sweepOrphanImportedKeys`: under `tupleLocks.withLock(rowId)`, `if (await this.storage.occupied(rowId)) return`, then `importedKeys.delete` | reuse: extract the per-row body as one helper, called by the sweep and by `commitImportedAccount`'s catch |
| Fault after both import writes | `wallet/services/account/service.test.ts:662-720` `makeHarness` (`chainLive(call)`, `recordWrites` log, `keysLeft()`); `readFailsOnSecondCall` (L33-38); the `test.each` at L855-870 asserts both rows removed when `unwrite` succeeds | adapt: add one case where `unwrite`'s first `get` of the account key also rejects, using a one-shot wrapper shaped like `parkRowRead` (L52-73) |
| A page lifetime fence | `onboarding/pages/create.vue:50-51` `createRunFence()` + `lifetime.snapshot()`, invalidated in `onBeforeUnmount`; `composables/runFence.ts` | reuse as-is |
| A test that a departed page publishes nothing | `onboarding/pages/create.test.ts:442` and `:483`: deferred promise, unmount, resolve, `flushPromises`, assert bootstrap and `router.push` untouched | reuse the shape in `onboarding/pages/import.test.ts` (its harness mocks `bootstrapActiveProfile`, `router.push`, `importMnemonic`; L1-125) |
| Backup then restore through the real service | `wallet/services/transaction/service.finality.test.ts:246-272` (real `TransactionService`, `backup()` and `restore()` in one harness; restore then backup only); `transaction/sealed-transactions.composition.test.ts:248-266` (two profiles) | adapt: backup then restore in the finality harness; no test does that order today (searched `\.backup(` and `\.restore(` across `*.test.ts`) |
| Export applies the importer's acceptance rule | `transaction/service.ts:739-743` `exportableTx` filters ambiguity, profile and chain, not status; `:713-715` restore throws on `TxStatus.Pending` | adapt: one more clause in `exportableTx` |

No new module is built.

## Claims checked against the tree

- **#1458 holds.** `commitImportedAccount` (`service.ts:824-850`) sets `keyWritten` after the key commit; its catch deletes the key whenever `keyWritten`. `assertStillLive` (`:544-552`) sends an `isChainLive` rejection to `unwrite` (`:557-564`), whose `storage.get` or `storage.delete` can reject and replace the refusal; the row then stays and the catch still drops the key. Both callers reach it: `importAccount` (`:808`) and `recreateImportedForReset` (`:472`). The in-lock path (key committed, account commit rejected) reaches the same catch; whether a rejected commit can have landed is unverified.
- **#1466 holds.** `useProfileImportFlow.ts:176-182` awaits `importNamed` and calls `completeImport` with no liveness check; `dispose` (`:368-371`) fences nothing. `onboarding/pages/import.vue:44-56` marks the entry, bootstraps and pushes `doneRoute("import")`. The header's `OnboardingBackLink` (`onboarding/components/OnboardingBackLink.vue`) is a plain button to `/onboarding/welcome`, never disabled. `onboarding/app.vue:113-115` renders the route with no keep-alive, so Back unmounts the page. The restore path reaches the same `completeImport` (`composables/useFullBackupImport.ts:562`, `:887`). The popup's import guards with `isUnmounted` and `flowLive()` (`popup/pages/import.vue:67-77`).
- **#1459 holds.** `TransactionService.backup` (`transaction/service.ts:673-692`) exports every row `exportableTx` accepts; restore throws `restored pending transaction rejected` (`:713-715`); a recorded row error sets `isRestoreHasErrors` (`composables/useFullBackupImport.ts:859`), which holds the auto-complete (`:726`, `:767`). The quoted guarantee (`utils/full-backup-helpers.ts:21-25`) is about file size only; the issue extends it by analogy, correctly.

## Sibling slices (same root cause, checked, not in scope)

The explorer compared every `backup()`/`restore()` pair under `wallet/services/`. Token and account restore refuse rows on a chain with no live network (`token/service.ts:1086-1099`, `account/service.ts:~1085-1102`), but a network's deletion purges its chain's rows, so the export cannot hold one in a supported state. Config restore skips non-restorable keys with a warning, not a row error. Token-balance, authwit and account-state already filter at export. No other demonstrated mismatch; nothing filed.

## Open work and collisions

- Known limits searched (`gh issue list --state closed --label known-limit --search import` / `backup pending`): none covers these paths. #727 (closed, known limit) is the neighbour: a bootstrap that Create already started keeps publishing after Back. The fix here only stops a departed import from starting one.
- #1478 (open) plans to extract the import button stack from both import pages; it edits the template of `onboarding/pages/import.vue`, this lane edits only its script. Merge order decides who rebases.
- e2e files that drive the touched surfaces (smoke): `tests/e2e/import-paths.test.ts` (onboarding import), `tests/e2e/account-import-export.test.ts` (Import account), `tests/e2e/backup-roundtrip.test.ts` (full backup).
