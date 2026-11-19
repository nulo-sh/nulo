# Phase 3 (arc 2): the fault relay

- Deviation, recorded as D29: the relay parses its batches itself. `planBatchReplies` lives in `tests/e2e/helpers/rpc-stub.ts`, which imports `fixtures/node-stub.ts` and through it the browser fixture, and the sandbox suite imports no browser fixture. `listenClaimed` (`fixtures/egress-guard.ts`) is browser-free and claims the relay's port, which the relay keeps across `kill` and `restore`.
- The relay matches rules on bare method names (`getBlock`); the wallet's node client sends them as `aztec_<name>`.

## Runs

- 2026-11-04, Phase 3 gate at the relay commit: `bun run lint` 0; `bun run typecheck:all` 0; `(cd apps/extension && bun --bun vitest run scripts/e2e/rpc-relay --retry=0)` 11/11, seen red first (module missing), then one red on the blackhole assertion's message (`The operation timed out.`), fixed in the test.
