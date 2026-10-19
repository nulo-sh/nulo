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

## Review round 1

- The first move searched `fence.getSourceFile().text` before `fence.getStart()`: the parsed fragment, up to the fence argument. The equal-lists proof could not see either difference (no call in the tree has a `fence`-shaped token in its earlier arguments, and no `.vue` file calls the facade). Codex and Opus each built a counter-example: `function f(fence?: Fence) { svc.executeSendTransaction(op, { fence: live }, task, hooks, fence) }` (old absent, new present), and a `.vue` file whose fence is declared in the other script block (old present, new absent).
- The fix gives `Call` an `offset`, the callee name's file offset (`ScriptBlock.startOffset` for a script block; a template expression's `loc.start.offset` plus the code's place in `loc.source`, because a dynamic argument's `loc` spans its brackets). `mayBeAbsent` reads the whole file up to that offset, which cuts where the old `(` did: only the callee's name lies between them.
- `fixture-check.ts` runs both fixtures through the old reader, the round 1 reader and the fixed one: old and fixed agree (`true`, `false`), round 1 gives the opposite of each.
- `offset-check.ts` checks every call `callsTo` finds in `apps/extension/src` and `packages/design/src`, tests included: 170,710 calls, 570 in `.vue` templates, each `offset` starting with its callee's name on the reported line, no mismatch.
- The equal-lists comparison re-ran on the fixed reader with the walks re-dumped from the guards: 766 files each, the same three fence calls, 11 files and 18 amount calls, all equal (`compare-p7.r1fix.out`).

## Review round 2

- Vue's template parser decodes character references in expression code (`decodeHTML` for interpolations, the tokenizer's `onattribentity` for attribute values) and keeps `loc` on the raw text, so `loc.source.indexOf(content)` is `-1` after a `&quot;` and every later position is shifted. Directive values are otherwise kept verbatim (no trim), and a dynamic argument's `loc` adds only its brackets, so "code equals `loc.source`, or `[code]`" is the exact test for a placeable expression.
- An exact map would need the same decoder, from `entities`, which `apps/extension` does not declare (the isolated linker refuses it, and the lane adds no dependency). `Call.offset` is undefined instead, and the fence guard fails closed on such a call.
- Re-run on the fixed reader: `offset-check.ts` 170,714 calls, none unplaced, no mismatch; `compare-p7.ts` all equal (`compare-p7.r2fix.out`); `fixture-check.ts` unchanged.
