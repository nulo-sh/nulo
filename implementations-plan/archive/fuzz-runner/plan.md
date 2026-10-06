# Fuzz runner

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `apps/extension/src/stores/balances.store.fuzz.test.ts` split into a world builder, an op interpreter, an invariant oracle, a drain and five probes, with `NULO_FUZZ_SEED` and `NULO_FUZZ_TRACE` harness switches.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Refactor the balances-store fuzz test on its merits instead of accepting its two complexity suppressions. The property drives the real balances store with a random operation tape and checks machine-wide invariants after every step. One function held the per-run world, the op interpreter, the oracle, the drain and five stateful probes. It was split into `createFuzzWorld`, `applyOp`, `assertGasInvariants` and `assertFpcInvariants`, a drain, and one function per probe, with `runTape` reduced to create, loop, drain, probe.

## Why

The op grammar alone could have been accepted as inherently branchy. The world, the oracle, the drain and the probes in one body were the merit case, because they could not be inspected separately. Behavior had to stay identical, since a fuzz test that quietly stops exercising something keeps passing.

## What shipped

- `NULO_FUZZ_SEED` fixes the fast-check seed. It is parsed only when set; blank, non-finite, non-integer or out-of-int32 values throw, and `0` is valid. Unset keeps a random seed.
- `NULO_FUZZ_TRACE=<file>` appends one line per completed run holding the tape and a digest of a canonical event stream: ops, RPC issues and settlements in order, post-flush store snapshots, pending ids, counters and fences, and drain and probe checkpoints. Unset, the recorder is a no-op whose payloads are still built, so timing is preserved.
- The refactor was checked by comparing traces before and after on fixed seeds, byte for byte, because a pass-only run cannot show that an op was dropped. The trace is strong behavioral evidence rather than a formal proof, since failing tapes never reach the digest.
- `applyOp` must not be `async`. Awaiting even an already-resolved promise before the flush adds a microtask checkpoint in which RPC continuations could run, which the synchronous arms never had; only the timer arm returns a promise.
- Setup order is semantic: the RPC mocks are installed before the store is constructed, the mock bodies stay ordinary functions with their executor order intact, and the pending list is spliced, never replaced.
- The ensure arm's model hook stays on the original promise chain and is never awaited, and the release arm's order (compute last-holder, model, real release, fence bump, debt removal) must not change.
