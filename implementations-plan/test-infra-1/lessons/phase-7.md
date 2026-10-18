# test-infra-1: phase 7 (the last two hand call readers)

## The comparison

Scratch, not committed, under `~/.cache/nulo-backlog/test-infra-1/p7/`:

- `extract7.ts` turns a guard test file into an importable module (top-level `describe` and `test` blocks and the vitest import dropped, relative specifiers made absolute). The old readers come from `origin/dev` at 0c340d37 (`productionSources`, `callArguments`, `mayBeAbsent`; `callArgs`, `topLevelArgs`, `kinds`), the new from the worktree (`facadeCalls`; `kinds`).
- The new walks are what the migrated guards actually walk: `sourceFiles` temporarily appended each result with its stack to a dump (`NULO_WALK_DUMP`) while both guard files ran under `bun --bun vitest run` (25 passed), then `source-scan.ts` was restored (`git diff` empty).
- `compare-p7.ts` runs from `apps/extension`: `bun ~/.cache/nulo-backlog/test-infra-1/p7/compare-p7.ts ~/.cache/nulo-backlog/test-infra-1/p7/new-dump.jsonl`. It compares each old walk with its dump, `service.fence-entry`'s calls (site by line, argument count, the absent verdict) from the old test body's loop against `facadeCalls()`, and `amount.callers`' per-file `[compact, plain]` map and per-call top-level argument texts (whitespace collapsed).

## Result (same working tree, 2026-10-18)

| reading | old | new | equal |
|---|---|---|---|
| `service.fence-entry` walk | 766, sha256 4bb636e544af | 766, 4bb636e544af | yes |
| `amount.callers` walk | 766, 4bb636e544af | 766, 4bb636e544af | yes |
| fence calls (site, args, absent) | 3: `auth-registry/service.ts:387` 5, `:436` 5, `execution/service.ts:973` 6, none absent | the same | yes |
| amount per-file kinds | 11 files | 11 files | yes |
| amount per-call arguments | 18 calls | 18 calls | yes |

## Mutation and fixtures

- Dropping `fence,` from the first registry send (`auth-registry/service.ts:387`) turns the guard red: `wallet/services/auth-registry/service.ts:387: expected [ 5, 6 ] to include 4`. Restored from a copy, `git diff` empty.
- `balanceFormatted(a, ")", 8 /* ) */, { compact: true })`: old `kinds` `[0, 1]` (it closed the call at the string's `)`), new `[1, 0]`. The header's "a parenthesis inside a string or comment defeats it" went with the hand reader, and this fixture pins it.
- The comment fixture's bare `\t * balanceFormatted(x)` line has no `/**` opener; the parser reads it as `<missing> * balanceFormatted(x)`, a call. As a real JSDoc block both readers give `[0, 0]`.

## Notes

- Both guards walk the same policy as `legal/call-sites` (`apps/extension/src`, `ts` and `vue`, `TEST_FILE` skipped); `TEST_FILE` also matches `.test.js`, which the `ts`/`vue` extensions never admit, so the list is the old one.
- `callsTo`'s suffix patterns read every call the regexes read, plus optional-chained and bracketed receivers (`x?.executeSendTransaction(…)`, `a[b].executeSendTransaction(…)`), and no longer read a mention inside a string or comment.
