# Phase 2: backup slice limits (C2)

- `numericIdBatch` shares `nextNumericId`'s rule (`maxAllocatableId` + `nextIdAbove`); `allocateIdAvoiding` now delegates to a one-shot batch, so the fence-as-pseudo-key copy went away.
- Typecheck caught `Restored<T>["restoreError"]` typed `unknown` in two new assertions (vitest does not typecheck); asserted per row with `toMatch` instead (bfe86eda).
