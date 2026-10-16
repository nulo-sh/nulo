# Phase 2: exhaustive operation-kind switches

- A1 refused, so `popup/windows/execute/index.vue` keeps its own switch and fee seed; the fee-seed helper would have had one caller (the merged send arm in `materialize.ts`) and is not added. #549 stays open (`Refs`).
- `validateSession`'s new default throws the fixed message `Unsupported operation kind` (no kind in the message: a refusal never echoes request fields). `dispatchOperation` keeps its `Invalid operation` message; `materializeRequest` keeps its message, now reading the `never`-typed value.
- The window harness in `dapp-interaction/service.test.ts` moved to module scope with a `session` parameter, so the refusal tests reuse it instead of a second collection builder.
- Proof, not committed: dropping `aztec_getChainInfo` from `materializeRequest`, `aztec_profileTx` from `validateSession` and `aztec_getAddressBook` from `dispatchOperation` gives TS2322 at each of the three `never` lines.
- The unknown-kind test fails against the base `service.ts` (the request passes the gate, reaches the profile read and fails later in the materializer). Removing the scope check or the per-action check fails its own test.
