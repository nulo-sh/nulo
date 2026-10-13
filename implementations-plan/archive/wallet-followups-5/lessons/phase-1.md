# Phase 1: the scanner reads every logger call (#302)

## Step 1, the red run on the base scanner

The five D8 self-tests added, scanner unchanged, `cd apps/extension && bun --bun vitest run src/utils/log-payload-ban.test.ts`:

```
× catches every level method of a logger, on any receiver and through an optional call
  AssertionError: expected [] to deeply equal [ …(15) ]
× code after a log call on its line is not the call's argument
  AssertionError: expected [ Array(1) ] to deeply equal []
× every log call on a line is read, each to its own closing paren
  AssertionError: expected [] to deeply equal [ Array(1) ]
× a `)` kept inside an interpolation's string never ends a window
  AssertionError: expected [ Array(1) ] to deeply equal [ …(3) ]
Tests  4 failed | 54 passed (58)
```

D8(d), the control, passed on base as planned (the base window runs to the line's end).

## Steps 2 to 6

- `stripNoise`: the two kept-character sites blank `(`/`)` through `.replace`; its inline comment now says why. Declaration line unchanged.
- `LOG_CALL`: level methods on any receiver with an optional call, the `console` alternative folded in, `g` flag.
- `callWindow` returns `{ line, column }` and counts from the opener's `(` to its balancing `)`; `callWindows` cuts each window after that column and reads every opener on a line (`matchAll`).
- `findLoggedSecrets` split into `lexedLines`, `callWindows` and the reporter (a single `Set` keeps one report per `file:line → name`); none is over 15, so its directive is deleted.
- `bun run baseline:complexity`: "manifest written (biome 2.5.13) — noExcessiveCognitiveComplexity: 21, noExcessiveLinesPerFunction: 2; 23 acceptance(s)". `bun run baseline:rescore`: "complexity rescore OK — 23 acceptance(s) match their functions exactly" (`stripNoise` still 41).
- CLAUDE.md § Complexity budgets: 24 → 23 acceptances, 14 → 13 test/CI-harness directives.

## Step 7, the match table

A scratch copy of the scanner (outside the repo) listed every window opened by a level method on a non-`console` receiver: 11, exactly § Match table's rows (claim-helper.ts 84, 114, 131, 170, 206, 210, 214, 235, 244, 262; opfs-store.ts 220). Offenders on the tree: 0.

## Gate

`bun --bun vitest run src/utils/log-payload-ban.test.ts` 58 passed; `bun run lint` exit 0 (no diagnostic in the touched file); `bun run typecheck:all` exit 0; `bun run baseline:rescore` exit 0; `bun run test:ci-gating` exit 0 (526 pass). Pass.
