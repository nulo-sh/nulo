# Phase 1: the list, the runner and the wiring

- Base moved before the arc: `origin/dev` advanced to 4ae04b194 (#1664, #1721), neither touching `wallet/services/`; the arc branch was cut there and the plan commit cherry-picked (one `index.md` conflict, dev's lines kept).
- The orchestrator updated the brief at 2026-11-06 21:42 UTC: a conversion that threw logs at `warn`, as today's pass; D5 and the tests follow it. The runner picks the level; the service maps it to `logWarn`/`logDebug`.
- `conversions.filter(...) as readonly UnlockConversion<R>[]` fails `tsc` (TS2352: the distributive union does not overlap a generic member). A predicate typed `entry is AnyUnlockConversion & UnlockConversion<R>` narrows with no cast.
- The table harness compares with `isDeepStrictEqual` and asserts booleans, as `seeds.test.ts` does, so a failure prints no recorded endpoint URL.
- Mutation (step 4): removing `retiredNamesConversion` from `UNLOCK_CONVERSIONS` reds the service's unlock test and three table cases (4 failed); restored.
- Gate: `bun run lint` exit 0; `bun run typecheck:all` exit 0; `bun --bun vitest run src/wallet/services/unlock-conversions src/wallet/services/network src/wallet/services/seal-on-unlock` 11 files, 335 tests passed; `seeds.test.ts` and `retired-endpoints.test.ts` unchanged.
