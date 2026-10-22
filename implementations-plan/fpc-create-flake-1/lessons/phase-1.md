# fpc-create-flake-1 phase 1: the order proof

- **BASE** = `origin/dev` at 6ec79be30, merged as 0a6eaacee; the merge touched no file the arc reads (`fpc/`, `lock.ts`, `sealed-entity-storage.ts`, the vitest configs and setup).
- **Step 2** (base + the decrypt-delay spy, `let spy` form): exit 1, T3 `AssertionError: expected false to be true` at the `settled` assertion; 13 passed. Reverted.
- **Step 3** (the edit): 14 of 14.
- **Step 4** (edit + the same spy): exit 0, 14 of 14. Reverted; the file matched the edited copy byte for byte.
- **Step 5** (edit + the FPC lock held across `registerContract`): exit 1, T1, T3 and T6 `Test timed out in 5000ms` (5008, 5006, 5006 ms); 11 passed. `service.ts` restored.
- **Step 6** (smoke): 100 of 100 runs green at retry 0, `reds=0`, 21:37 to 21:47 UTC, load1 80.7 at the start and 45.2 at the end, with lint, `typecheck:all` and `test:all` running beside it for part of the soak.
- **Gate:** the fpc unit files 2 files, 20 tests, exit 0; `test:all` exit 0 in every workspace (extension 917 passed, 3 skipped); `lint` exit 0 (no finding in the edited file); `typecheck:all` exit 0; `service.ts` unchanged against `origin/dev`; `crypto.subtle` count 0 in the test file.
