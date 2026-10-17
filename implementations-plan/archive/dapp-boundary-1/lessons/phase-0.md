# dapp-boundary-1: phase 0 (planning consults)

## Probe: the reduced shapes round-trip through the dApp's own schemas (2026-10-17)

- A scratch script (outside the repo) imported the installed 6.0.0-rc.3 `stdlib` and `aztec.js`, built the D3 simulate shape from `TxSimulationResult.random()` (wrapped with `appCallOffset: 1`) and the profile shape from `TxProfileResult.random()`, copied `toJsonSafe`, ran `JSON.parse(JSON.stringify(toJsonSafe(x)))`, and parsed with `TxSimulationResultWithAppOffset.schema` and `TxProfileResult.schema`.
- Result: both parse. `acir`, `vk`, `partialWitness`, `newNotes` came back empty at the root and in the nested call; `appCallOffset` stayed 1; `offchainEffects` (2), `gasUsed` and `getPrivateReturnValuesOfAppCall(0)` worked; each profile step parsed with zero-length `bytecode` and `vk` and an empty `witness`.
- So `PrivateCircuitPublicInputs.from({ ...empty(), ... })` and the constructors carry D3 with no schema change.

## Consult: Codex round 1 (gpt-6.1-sol, high), session 01a14a84-030e-7863-a79d-fa38bd2f5a12 (2026-10-17)

- Verdict: `reject` (blocking: D4 must keep the no-signature requirement; D6 must also empty the transaction's would-be effects).
- Accepted: refuse every dApp profile (the brief's own rule; a signed `gates` profile needs the owner); gate counts follow the private execution; empty the tail's and the public output's effects and `firstNullifier`; assert the serialised JSON, not only the parsed object (zod strips unknown keys).
- Rejected: blank `argsHash` (plausible, not shown end to end; selfpay-phase identifies the dApp's own call by it); a composition test (COMPOSITION-TESTS.md D2 and D3).

## Consult: Opus Plan leg (2026-10-17)

- Verdict: `conditional approve` (narrow D6; record D4 as an owner ask; sentinels two calls deep on the wire).
- Accepted all seven points: D6 narrowing, traced through `generateSimulatedProvingResult`; OA-1; D7 sentinels; D1's reasoning (DappInteractionService never receives these kinds); `UPDATE.md` entry and named constructors; always wrap the offset; D5's refusal (retired with D4).

## Probe 2: the narrowed tail and public output round-trip (2026-10-17)

- Rebuilt the tail for both variants (`forPublic` with only call requests, `forRollup` empty), `publicOutput` with `TxEffect.empty()`, and `firstNullifier` = `Fr.ZERO`; `TxSimulationResultWithAppOffset.schema` parsed both, `gasUsed` held, and an `undefined` offset left no `appCallOffset` key on the wire.

## Consult: final fresh Codex pass (gpt-6.1-sol, high), session 01a14a95-0a78-75f2-a354-d884cdac0e57 (2026-10-17)

- Verdict: `conditional approve (with conditions: preserve UnsupportedMethodError through the execution catch; use a type-correct constructor for an undefined appCallOffset)`.
- Verified in the tree: `classifyOperationCatch` (`rpc-cancel.ts:95-104`) lists the classes that keep their code, and `UnsupportedMethodError` is not one; `fromResultAndOffset` declares its offset `number`; the network e2e config retries twice unless `NULO_E2E_RETRY` is set. All three applied.
- `argsHash` disposition kept; its reasoning corrected (the kept return values do not remove the risk).
- D8 confirmed as a faithful precondition, with a cleanup close.

- Resumed the same session with the three fixes: `approve` (no new issue).
