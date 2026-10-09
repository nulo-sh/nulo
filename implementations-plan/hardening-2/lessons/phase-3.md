# Phase 3: resume refuses a journal its registry did not write (Arc 2)

## Setup (2026-10-09)

- The branch `hardening-2-storage-fences` was cut from layer 1's local head `c19f179` (Arc 3, the CSP floor), not from layer 2: Arc 2's files and Arc 1's do not overlap, so the orchestrator stacked Arc 2 on layer 1 while Arc 1 waits on its own PR (decision D-ORD2).
- `origin/dev` `c42033e` merged in (never rebased): only `implementations-plan/index.md` conflicted (code-followups-1 closed on `dev`); kept `dev`'s lines plus this plan's line.
- `agent-worktree register` refuses a worktree whose branch is not `worktree-<slug>`: "cwd worktree is on branch 'hardening-2-storage-fences', expected 'worktree-hardening-2-fences'". The plan names the branch, so the branch stays and the manifest row is not written; `agent-worktree status` cannot be used either. Progress lives in `STATUS.md` instead.

## Implementation

- `Migrator.journalMismatch(backup)` (the plan's `journalMatchesRegistry`, renamed because it returns a reason, not a boolean) runs after the `version >= backup.version` branch and before `restore()`. It compares refs as sets of `root:<root>` / `value:<key>`, since the engine writes `[...reads, ...writes]` with duplicates. The entry check reuses the predicate `footprintKeysFor` uses, now the module-level `footprintCovers`.
- An engine-namespace key in `entries` is now refused, not filtered: the old test "restore does not write engine-namespace keys from a crafted backup" became a row of the out-of-footprint refusal table. `restore()` keeps its own filter as defence in depth (it still skips the legacy key, which a value ref could name).
- Three hand-built journals in `migrator.test.ts` paired refs with a `noop` that declared no footprint; each now declares the refs its journal names.
- Success control: a journal captured from a real engine run (refs `[acct, acct]`) passes, restores and resumes.

## Red on base

- The five refusal rows (no registered migration; extra root; missing root; user key outside; engine key) copied against `git show e9a538a:packages/wallet-core/src/migration/migrator.ts` (the arc's base): all five fail, because the base restores the journal and returns a retryable `interrupted mid-write`. The success control passes on both.

## Gate (2026-10-09, `03fa633`)

- `bun run --cwd packages/wallet-core test`: 24 files, 266 tests pass.
- `bun --bun vitest run src/wallet/runtime.migration-gate.test.ts src/wallet/storage/migrations/ src/wallet/services/backup/`: 6 files, 113 tests pass.
- Smoke build recipe on Chrome (recorder armed too, since layer 1 is underneath), then `migration.test.ts backup-migration.test.ts` at retry 0: 2 files, 7 tests pass, 0 skipped; the 9001 fixture's crash-resume converges through the new check.
- `bun run lint`, `bun run typecheck:all`: pass.

## Delivery mechanics (2026-10-09)

- Layer 1 was pushed and opened as #70 (head `6c811b7`: a `dev` merge and one `STATUS.md` line on top of `c19f179`) while this arc ran; merged into this branch (`311f2fa`), keeping both sides of the one `STATUS.md` conflict. Layer 2 is #71 on `worktree-hardening-2`.
- `gh stack view` here answers "current branch is not part of a stack", and `gh stack add` must run on the stack's top branch, which lives in a sibling worktree this arc may not touch. The PR is opened with `gh pr create --base worktree-hardening-2` instead; once #70 merges, its base moves to `dev`.

