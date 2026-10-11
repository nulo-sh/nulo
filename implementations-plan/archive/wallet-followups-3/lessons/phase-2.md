# Phase 2: #295, error objects in five log lines

## Base: the log assertions on base sources (2026-10-11)

Command: `cd apps/extension && bun run test -- src/wallet/services/account-integrity src/wallet/services/account src/utils/log-payload-ban.test.ts`. Result: exit 1, 5 failed, 230 passed. Each red on its own assertion, `data[1]` being the flattened string:

- `coordinator.test.ts`, a boot derivation that throws: `expected [ 'Error: bb wasm unavailable' ] to deeply equal [ { error: { name: 'Error', … } } ]`.
- `coordinator.test.ts`, a boot block persist that throws: `expected [ 'Error: storage full' ] …`.
- `runtime-mismatch.test.ts`, the fail-closed case extended: `expected [ 'Error: storage full' ] …`.
- `runtime-mismatch.test.ts`, a session close that throws: `expected [ 'Error: session store unavailable' ] …`.
- `service.test.ts`, a sweep whose delete throws during init: `expected [ 'Error: storage unavailable' ] …`.

Harness notes: the coordinator's `build` gained a `persistError` option on the guarded writer (the boot path), `runtime-mismatch.test.ts`'s `build` a `closeError` on `lockProfileIfActive`; the sweep failure is a `remove` that throws on an orphan key row. Every builder returns the `LoggerStore` it already constructed; existing fail-closed assertions are unchanged.

## Fix: green (2026-10-11)

The five lines pass `{ error }`, `{ error: writeError }`, `{ error: err }`, `{ error: writeError }`, `{ error: closeError }`. The same command exits 0, 19 files, 235 tests, including `log-payload-ban.test.ts`. Gate: `bun run lint` exit 0, `bun run typecheck:all` exit 0, `bun run test` exit 0 (740 files), the same runs as Phase 1's gate.
