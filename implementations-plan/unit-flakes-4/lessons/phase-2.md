# Phase 2: #1112

- Change: `scan` (`css-v-bind-ban.test.ts`) returns `[]` unless the source spells `useCssVars`, `v-bind` or `&#`; `kinds` (`amount.callers.test.ts`) returns `[0, 0]` unless the text spells `balanceFormatted` or `&#`. One inline case each for a call a template spells with a character reference. Biome reflowed the new `test.each` row.
- Mutation proof, each disjunct dropped in turn (reverted after each):
  - css `useCssVars` → red: "a hand-written call in a component", "a hand-written call in a composable, …";
  - css `v-bind` → red: "a v-bind in a style";
  - css `&#` → red: "a hand-written call a template spells with a character reference";
  - amount `balanceFormatted` → red: the tree case and every inline case;
  - amount `&#` → red: "a call a template spells with a character reference is read".
- Gate: `bun run lint` exit 0; `bun run typecheck:all` exit 0; both files 30/30 at retry 0 (16 tests per run, load 110 to 175).
- Measurements (not pass criteria), 30 runs: "every known-token capped amount reads compact" mean 300 ms, max 413 ms; "no component runs useCssVars" mean 238 ms, max 328 ms. Before the change: 1068 to 1387 ms at load 56 to 95.
