# Post-implementation: review loop

- 2026-10-31 Opus diff review: approve. One stale header line in `reaper.ts` (the periodic tick's `stuck_queued`), fixed.
- 2026-10-31 Codex round 1 (gpt-6.1-sol, high): changes requested.
  - Adopted: the playground suite died on import with the transpiler cache off. Under `NODE_ENV=test`, `@aztec-labs/foundation`'s bn254 module calls `expect.addEqualityTesters`, which Bun's `expect` lacks. A warm cache hid it locally; a fresh CI runner would not. The test now mocks that module. Verify a `bun test` suite with `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0`.
  - Adopted: two comments that restated their code, deleted.
  - Not adopted: a disconnect overriding a recorded estimate refusal. A refused request ended by close, lock or switch already reads as its refusal (`service.test.ts`, "a refused request ended by a %s"). Every one of those kinds is "refused before sending", and the specific refusal says more. `disconnect` joins that pin.
- 2026-10-31 Codex round 2 (resumed): approve. Fixes verified; the playground suite passes with the cache on and off; the disconnect refusal-precedence pin accepted.
