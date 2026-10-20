# Phase 1: the rule and the card

- **Red on the base.** `string.test.ts`'s two `dashIfBlank` cases failed (no such export); `humanize.test.ts`'s retained cases passed on the base, as they should (the composition keeps every output).
- **Green.** `dashIfBlank` in `utils/string.ts`; `safeWireOrDash = (s, max) => safeWire(dashIfBlank(s), max)`. `string.test.ts`, `humanize.test.ts` and `OperationCard.test.ts`: 36/36.
- **Gate.** `bun run lint` 0 (no diagnostic in the touched files), `bun run typecheck:all` 0, `bun run test` 0 (879 files passed, 3 skipped).
