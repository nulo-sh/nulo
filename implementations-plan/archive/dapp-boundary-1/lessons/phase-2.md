# dapp-boundary-1: phase 2 (no dApp profile)

## Built (2026-10-17)

- `ViewExecutor.executeAztecProfileTx` throws `UnsupportedMethodError.forMethod("profileTx")` first; its build code and the `appPriorityOf` import went. `view-executor.test.ts`: one refusal test over `gates`, `execution-steps` and `full` (no fence capture, no build, no `pxe.profileTx`; control: a simulate in the same harness builds). The fence test lost its profile call; the profile gas-settings test went with the code it pinned.
- `classifyOperationCatch` lets `UnsupportedMethodError` ride the code channel; `logOperationOutcome` logs it at debug ("refused: unsupported method").
- One placement differs from the plan: the classify → unwrap → envelope proof is an added assertion in `error-envelope.test.ts`'s existing chain test ("each survives the REAL production chain"), which runs the real `unwrapOperationResult` from `@nulo/wallet-bridge`, rather than a new test beside the argument-refusal one in `rpc-cancel.test.ts`, which stops at `walletErrorFromPayload`. The debug level is a row in `service.composition.test.ts`'s existing table. With the `rpc-cancel.ts` line reverted, both go red; restored, both pass.
- `sim-methods`: the loop of two became `sim-simulateTx (#23)` (unchanged assertion) and `sim-profileTx (#24)`, which asserts the -32601 envelope; `envelopeOf` is shared with #25.
- `delete-after-prove` (D8): the popup opens `keyval-store` as idb-keyval does (one `keyval` object store, so a later bb.js open needs no upgrade) and keeps the handle on `window`; the test asserts the handle is still there just before the reset (a reload would drop it), closes it in `onTestFinished`, and keeps the CRS-in-place assertion after the erase. The dApp profile call, its 180 s budget and its playground inputs went (`sendDefaultTx` sets its own).
- `CI.md:84` describes the canary's `delete-after-prove` without the dApp profile.

## Gate F (2026-10-17)

- `bun run lint`, `typecheck:all`, `test`, `test:all`: all exit 0.
