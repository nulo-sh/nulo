# note-owner-1 phase 1: the tripwire test

- Merged `origin/dev` at `4cc06669d` (e2e-stores-1, #1063): no change to `index.md`, `lessons.md` or the lockfile.
- `note-owner-scope.sources.test.ts`: five tests, each asserting its rule on the shipped text and a miss on every mutation (the commented-out throw, the block-commented original beside an unchecked method, the caller's scopes, the renamed `syncScope`, the sibling `async function`, the constant secret, the push in the none branch, the gate copied into a sibling `fn`). `mutate` throws when its target is absent, so no control can run on the shipped text by accident.
- Gate, 2026-10-22: focused run 5/5 green; `bun run lint` 0; `bun run typecheck:all` 0; `bun run test:all` RC=0, every package `Exited with code 0`, no `FAIL`.
- Close-out order: a refused `git rm` (STATUS.md had local edits) let the rename-only archive commit land before the Outcome commit; the move still sits alone in its commit, and the Outcome, this log and the index lines follow it.
