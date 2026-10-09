# Phase 1: run isolation (arc 1a)

## 1.1 Host registry client

- Wrote `tests/e2e/port-registry.ts` to the plan's interface, with two additions the tests need: `acquireRegistryLock` (exported so the token-checked release is testable) and `withRegistry` (the generic locked rewrite the three-process case drives). `releaseDeadRows` returns the count dropped (or `undefined` when locked) instead of a boolean, so `e2e:reap` can report it.
- The rewrite goes through a temp file and a rename (the live writers use `writeFileSync` in place); a writer killed mid-write then leaves the other tools' rows whole. The registry's directory is created under `withRegistry`, so a fresh CI runner needs no setup.
- Mutation check: with the lock opened `"w"` instead of `"wx"`, the two held-lock cases and the three-process case go red; restored, all 15 pass.
- Gate: `bun run lint` 0, `bun run typecheck:all` 0, `bun run test` 0 (716 files, 10,730 tests), `bun --bun vitest run scripts/e2e/port-registry.test.ts` 15/15.
