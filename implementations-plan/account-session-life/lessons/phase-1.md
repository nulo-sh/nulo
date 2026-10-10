# Phase 1: arc 1 log

## Merge before work

- `git merge origin/dev` (9574a9d, incoming-transfers arc 1): one conflict, `implementations-plan/index.md`; both lines kept. dev's only shared-code change is `EntityStorage.item` (`packages/wallet-core/src/storage/entity_storage.ts`), which no arc-1 file uses.

## Phase 1.1: one critical section per address (#99)

- R2-1 asked first (D-orch-3): Codex (`gpt-6.1-sol`, high, session `01a12394-69f4-7bf3-8f41-121e759cf705`) and an Opus 5.5 general-purpose agent, both read-only, in parallel while the code was written. Both: UNREACHABLE, high confidence. Evidence and dispositions in plan.md § Audit verdicts, "R2-1 asked first". No fix built.
- Built as planned: create writes under the row lock and deletes the address's imported key in the same hold (`dropReplacedImportedKey`, an unconditional remove: a no-op when absent, and it also reaches a key row the codec would hide); import's duplicate check (`contains`) and both writes share one hold (`commitImportedAccount`); `unwrite` deletes only a row with its writer's type and index; the reconcile picks and deletes candidates by a fresh read under the row lock (`isKeylessImport`).
- Deviation, minor: import's early duplicate check over the decoded rows is gone. The one check is now under the lock. A duplicate is now refused after the seal and the liveness read rather than before them: the same refusal text, one source of truth.
- Existing test adapted: `service.test.ts` "a rename parked on the written row cannot resurrect it after the compensation" parked the import inside its account-row `set`, which now holds the row lock, so the rename could never reach its read (the test hung at 5 s). It now parks the import in its post-write liveness read, outside the lock, which is the only place a rename can still interleave; same assertions.
- Plan guards mapped: "with no create in between, the same rejection removes import's row and its key row" is the existing `service.test.ts` case "a liveness read that fails after the account-row write: both rows removed"; "two creates still get indices 0 and 1" did not exist in `serialize-per-tuple.test.ts` (it pins rejections only), so it lives in `create-import-lock.test.ts`.
- Red/green against `git show 643c0c9:apps/extension/src/wallet/services/account/service.ts`: the four new proofs fail, each at its state assertion (create wrote while import held the address; the rename's imported row survived; the import's undo deleted the derived row; the reconcile deleted and reported the derived row); the four guards pass. The reconcile guard also fails, as the plan says it should, with the key cleanup kept and the reconcile's type check removed.
- Gate: `bun run lint` 0; `bun run typecheck:all` 0; `bun --bun vitest run src/wallet/services/account/` 10 files, 113 tests, 0 failed.
