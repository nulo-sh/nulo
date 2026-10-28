# Phase 1: the shared list

- A same-name template shorthand (`:label`) binds a script-setup local of that name before a prop: `TokenList` already held a `label` computed (the fold text), so `<SectionLabel :label>` drew "1 empty" until the computed was renamed `foldText`. The picker-host test caught it.
- zsh does not split `$F`, so a list of files in one variable reaches `cp` as one path; the red-first proof now runs from a bash script with arrays.
- Red first on the base sources: 10 new tests fail (TokenList picker host 7, TokenCard option 2, matchesQuery 1); the Holdings-links control passes on both.
- Gate: `bun run test src/popup/components/modules src/popup/pages/holdings.test.ts src/utils/token-search.test.ts` 1037 passed; `bun run lint` exit 0; `bun run typecheck:all` exit 0.
