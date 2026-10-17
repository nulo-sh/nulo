# dapp-boundary-1: phase 1 (the simulate shape)

## Built (2026-10-17)

- `execution/app-facing-results.ts`: `toAppFacingSimulationResult`, the allowlist of Architecture § The simulate shape. `PrivateCallExecutionResult.from`, `PrivateExecutionResult.from`, `PrivateCircuitPublicInputs.from({ ...empty(), … })` and `PrivateToPublicAccumulatedData.from({ ...empty(), … })` where a `from` exists; the tail, its two partial classes and `PublicSimulationOutput` have none, so they use their constructors.
- One refinement of the interface: the parameter is `TxSimulationResult & { readonly appCallOffset?: number }`, so the offset is read structurally. The fast path's merge builds its result in `@aztec-labs/wallet-sdk`, and an `instanceof` on our own import would silently drop the offset if the two ever resolved to different copies (today both resolve to one `aztec.js` directory).
- `ViewExecutor.executeAztecSimulateTx` wraps the former body, now the private `simulateDappTx`; `runStandardArm` still calls the unreduced standard path, so the merge reads the full arm (pinned in `view-executor.test.ts`).

## Tests

- `app-facing-results.fixtures.ts`: a root, depth-1 and depth-2 call with a unique field element in every dropped field (bytecode, vk, witness, note, counter map, tagging secret, class log; returns hash, protocol nullifier, a key validation request, a read request, a note hash, a nullifier and a private log in each call's public inputs), a public or a rollup tail with effects, a public output with effects, a revert reason and a debug log, and a non-zero first nullifier. Deterministic: no `random()`.
- The never test first runs the same search on the unreduced result and requires it to find every dropped value, so an empty result on the reduced one is evidence, not a blind search. Buffers (bytecode, vk, and the public inputs, which serialise as buffers) are decoded to hex before the search; counters are matched as whole numbers.
- Mutation check, each applied alone to the module: keeping `acir`, the tagging ranges, the call's key validation requests, the first nullifier, the tail's `forPublic`, or the public `txEffect`. Each one reddened the never test (the last two in the public variant only, the one that carries them); the restored module is green.
- The executor harness returns a real fixture: the standard path's and the fast path's answers equal the reduction of what PXE or the merge returned and differ from it.

## Gate F (2026-10-17)

- `bun run lint`, `typecheck:all`, `test`, `test:all`: all exit 0 (extension: 827 files, 13403 tests passed).
