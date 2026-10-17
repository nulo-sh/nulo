# test-infra-1: phase 2 (one tokenizer)

## The comparison

Scratch, not committed, under `~/.cache/nulo-backlog/test-infra-1/p2/`:

- `extract.ts` turns a guard test file into an importable module (top-level `describe` blocks and the vitest import dropped, `__dirname`, relative and `@/` specifiers made absolute, the named functions exported). It ran on each of the three guards twice: at `0fe841be` (`git show`) and in the worktree.
- `compare-p2.ts` runs both versions over the same tree: `log-payload-ban`'s masked text byte for byte over every file it lexes, its call windows with each window's pre-filter `occurrences()`, and its offenders; `useLogFilters.scan`'s registrations for both registration files, `sourceExprs` for every file in its walk, and the refused sites; `toast-call-sites`' calls with their arguments (whitespace-collapsed) and both verdicts per call. Run from `apps/extension`: `bun ~/.cache/nulo-backlog/test-infra-1/p2/compare-p2.ts <worktree> ~/.cache/nulo-backlog/test-infra-1/p2`.

## Result (2026-10-17)

- `log-payload-ban`: 980 files lexed (its walk minus its allowlist). Three files differ, at exactly the misreads F9 names:
  - `apps/extension/src/pages/about.vue:4-10`: the hand lexer read the template as script after the one-line `<script setup lang="ts"></script>`; `codeLines` blanks it.
  - `packages/token-list/src/keygen-cli.ts:1` and `sign-cli.ts:1`: the hand lexer read the shebang's `/usr/` as a regex (`#!     bin/env bun`); `codeLines` blanks the shebang.
  - 658 call windows, equal in start and text, with equal pre-filter occurrences (one window in the tree holds one). Offenders `[]` before and after.
- `useLogFilters.scan`: registrations equal in both files; 994 files, 56 with a source expression, 239 expressions, equal in order, line and text; refused sites `[]` before and after.
- `toast-call-sites`: 142 calls before and after, equal in site, arguments and both verdicts.

## Notes

- `callsTo` names a call's line by its callee's name token, so `this._logger.log(` and `new Lock(` keep the lines the regex readers reported.
- `useLogFilters.scan` parses each file once: one `callsTo` over the alternation of the logger callee and every injected primitive's callee, then each call is sorted by its callee.
- `registrations` now takes the file name `callsTo` needs; its self-test passes `"inline.ts"` and asserts the same result.
- The manifest regeneration (`bun run baseline:complexity`) removed only `log-payload-ban`'s `stripNoise` record (and moved the `generated` date).
