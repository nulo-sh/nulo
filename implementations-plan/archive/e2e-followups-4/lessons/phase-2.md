# e2e-followups-4 — phase 2 (fix) log

## Fix A (2026-10-12)

- `send-keyboard.test.ts`: the fee-picker test takes `freshExtensionPerTest`, starts a node stub and redirects the Testnet origin to it with `interceptRpc` before `registerProfile`, then runs the unchanged scenario (moved into `pickSeededSponsorByKeyboard`, the only caller, so its lines keep their indentation). Cleanup is nested: the interception's `stop()` in an inner `finally`, the stub's in an outer one. Before `stop()`: `failures()` empty, `hits()` above zero; after it, `stub.requests()` above zero. `openSendPage` asserts no FPC row exists just before seeding sponsors; the scenario ends asserting exactly the two seeded rows.
- `helpers/fpc-seeds.ts`: `fpcRowIds(page)` (raw `nulo:core:fpcs@` keys, sorted), `SEEDED_FPC_IDS` from the same id rule the seed uses, the doc comment's caveat.
- One pre-check run of the fixed test on C1 (release build, artifact mode) passed before the controls; it is not one of Phase 3's slots.

## Gate

- `bun run lint` 0 (after `biome format` on the helper); `bun run typecheck:all` 0; `bun run test` 0 (11333 passed in the extension); `bun run test:all` 0; `bun run test:ci-gating` 0 (526 pass).
- C2's environment, `taskset -c 0,1 bun run test:e2e -- tests/e2e/send-keyboard.test.ts --retry=0`: 5 passed.

## Negative controls (C2's environment, `-t "the fee method picker: a Tab stop"`, never committed)

- **N1** (an extra type-1 row at the protocol sponsor address, id `n1n1n1n1`, written just before the pre-seed check): red at `send-keyboard.test.ts:36`, `FPC rows before the seed: expected [ 'n1n1n1n1' ] to deeply equal []`. Reverted; `git diff --quiet` exit 0.
- **N2** (the same row under `ffffffff`, written just after the pre-seed check): the focused-row, pick and saved-pick assertions passed, then red at `:173`, `FPC rows after the picks`, received `e2e-protocol-fpc-1`, `e2e-protocol-fpc-2`, `ffffffff`. It did not fail earlier, which is evidence for I2 (Chrome lists the later-sorting id second). Reverted; the tree is clean.
