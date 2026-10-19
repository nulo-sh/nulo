# Phase 1: the flag, its write and the rule

- 2026-10-19 Built as planned: `profileNotFirstKey`; `persistCreatedProfileHoldingLock` (predicate, persist, mark) in both creates; `markImportedHoldingLock` became `markProfileFlagHoldingLock(key)`; `firstProfileItems` in `getStartedView`. The fee-picks suite's `purgingDelegate` is hoisted to module scope for the lifecycle case.
- Red proofs (each restored after): the service mark disabled → 3 service cases fail (both creates' order case, the lifecycle); the `notFirst` return in `firstProfileItems` disabled → 2 view and 2 Home cases fail; the mark moved after `openSessionVerified` → the order case fails (the flag lands after "active").
- Gate: phase suites 298/298; `bun run lint` 0 (25 warnings, none in touched files); `typecheck:all` 0; `bun run test` 0 (14144 passed).
- `src/types/auto-imports.d.ts` regenerates on the next build (the new builder is an auto-imported util); it lands with phase 2.
