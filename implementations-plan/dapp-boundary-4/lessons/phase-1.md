# Phase 1: the class gate

- `public-events.test.ts`'s fake node now returns both class ids through a `classes(original, current)` helper; the two new `test.each` rows fail against the base copy of `public-events.ts` (run by swapping the base file in, then restoring it) and pass with the change.
- The full `bun run lint` hides the one error behind `--max-diagnostics`; `./node_modules/.bin/biome check --diagnostic-level=error` shows it.
