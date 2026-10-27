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
- Revised in the review loop (round 1): Vue's `parseCssVars` deletes style comments before matching, so `v-/**/bind(x)` is a finding that spells no `v-bind`; a `/*` trigger would admit 223 of 252 `.vue` files. `scan` now pre-checks only the `callsTo` search (`useCssVars` or `&#`) and keeps Vue's `parse(…).descriptor.cssVars` on every `.vue`; new case "a v-bind a CSS comment splits". Mutations on the revised code: drop `useCssVars` → the two hand-written cases red; drop `&#` → the encoded case red; a name-only `v-bind` check before the styles' parse → the comment-split case red. Re-gate: lint exit 0; both files 30/30 at retry 0 (17 tests per run, load about 130); "every known-token capped amount reads compact" mean 248 ms, max 344 ms; "no component runs useCssVars" mean 301 ms, max 395 ms.
