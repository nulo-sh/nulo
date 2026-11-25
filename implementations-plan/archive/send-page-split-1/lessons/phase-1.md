# Phase 1 (arc 1): `useSendData`

- Budgets on the final file (Biome 2.5.13, scratch copy outside the repo): `useSendData` 39 lines, `fetchIdentity` 41 lines and complexity 12, `onTokensChanged` 4, `reloadTokens` 5.
- Mutants, each red: the commit's fence dropped (supersede and dispose cases, `send.test.ts` "a superseded read…" and "unmounted while the balance read is out…"); the barrier split (the start-at-once case); `onLoaded` before the contacts write (the first case); an `await` before `onLoaded` (the watcher-order case); no `dispose()` at unmount (`send.test.ts` "unmounted while the balance read is out…"); the `tokensFailed` reset moved below the identity guard (three hook cases, added after the Opus review).
- A mutant restored with `git checkout -- <file>` also drops that file's uncommitted edits: commit before running mutants.
- Known limit filed: #2010 (KL-1 and KL-2).
- Codex: r1 (session 01a20f0c) 2 comment findings, r2 clean; Opus diff review 3 low findings, applied; Codex r3 clean.
