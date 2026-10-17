---
plan: dapp-boundary-1
tier: mid
status: planned; final Codex pass approve; arc 1 next
issues: "none (the PR closes nothing)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); dual review (Codex gpt-6.1-sol high + one Opus Plan leg); one fresh final Codex pass
base: origin/dev at 13d5f8d0
trunk: dev
post_implementation_hardening: not scheduled
---

# dapp-boundary-1: one app-facing shape for simulateTx; no dApp profileTx

One arc, one PR against `dev`. A dApp's `simulateTx` result is rebuilt into an app-facing shape before it is serialised: what the dApp SDK, aztec.js and the playground read stays, and everything else becomes empty. A dApp's `profileTx` is refused with the wallet's typed "unsupported method" answer, because every profile mode signs with the account key. Wallet-internal simulations are untouched. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1, not blocking). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Brief claims that did not hold

- **"A stubbed signer, as simulate does."** No profile mode runs without the account's real signature. The simulate path's stub replaces the account *contract* through a class override (`pxe/service.ts:556-569`), which the PXE accepts only with `skipKernels: true` (upstream `pxe.js:718`); `PXE.profileTx` takes no override (`pxe.js:632`) and runs the kernels, and the frozen account's `entrypoint` verifies a Schnorr signature (Fact 8). So the brief's own rule ("any mode that would need the real signer is refused") refuses every mode (D4). Restoring `gates` is OA-1.
- **"Drop the private-call internals" must keep the keys.** The dApp SDK parses each response with the upstream schema (Fact 1), which requires every per-call key. The reduction empties them; it cannot delete them.
- **The allowlist is wider than the brief's list.** It also empties each call's `taggingIndexRanges` and `contractClassLogs`, and the side effects the tail and the public output carry.

## Outcome & Quality Bar

For a dApp built on `@aztec-labs/wallet-sdk` that simulates before it sends, and for the person whose wallet answers it. Excellent: (1) every stock consumer still works unchanged: aztec.js `.simulate()` return values, offchain effects and gas, `BatchCall`, and the playground's frame summary; (2) at any depth of a dApp's `simulateTx` answer, on the wire, there is no circuit bytecode, verification key, witness, key-validation request, note record, tagging secret, nullifier, note hash or log; (3) a dApp's `profileTx` gets a typed `-32601` answer before any work. Good enough: per-call return values and argument hashes stay at every depth (D3).

## Architecture & Implementation

- **Where (D1).** One new module, `apps/extension/src/wallet/services/execution/app-facing-results.ts`, used by `ViewExecutor.executeAztecSimulateTx`. Only the dispatcher builds `aztec_simulateTx` operations, and every route that runs one, a `batch` leg included, ends in that method (Fact 4). The wallet's own simulations call `pxe.simulateTx` directly and keep the full object.
- **Interface.** `toAppFacingSimulationResult(result: TxSimulationResult): TxSimulationResultWithAppOffset`, pure, no options. It always returns `new TxSimulationResultWithAppOffset(…reduced fields, offset)`, the input's `appCallOffset` or `undefined` (the constructor takes an optional offset; `fromResultAndOffset` types it `number`); an `undefined` offset never reaches the wire. `executeAztecSimulateTx` keeps its signature.
- **The simulate shape (D3, D6).** Rebuilt with upstream named constructors (`X.from({ ...X.empty(), kept })` where a `from` exists), so a field upstream adds arrives empty, or fails the typecheck:
  - each call, recursively (`PrivateCallExecutionResult.from`): `returnValues`, `offchainEffects`, the rebuilt `nestedExecutionResults`, and `publicInputs` = `PrivateCircuitPublicInputs.from({ ...empty(), callContext, argsHash, minRevertibleSideEffectCounter, publicCallRequests })`; empty: `acir`, `vk`, `partialWitness`, `newNotes`, `noteHashNullifierCounterMap`, `taggingIndexRanges`, `contractClassLogs`;
  - `PrivateExecutionResult`: the rebuilt `entrypoint`, `firstNullifier` = `Fr.ZERO`, `publicFunctionCalldata`;
  - tail: `constants`, `gasUsed`, `feePayer`, `expirationTimestamp`; for `forPublic`, each phase's `PrivateToPublicAccumulatedData.from({ ...empty(), publicCallRequests })` and the `publicTeardownCallRequest`; for `forRollup`, `PrivateToRollupAccumulatedData.empty()`;
  - `publicOutput`: `globalVariables`, `publicReturnValues`, `gasUsed`; `txEffect` = `TxEffect.empty()`, no `revertReason`, no `debugLogs`;
  - `stats` as is (timings and node call counts).
- **Profile (D4).** `executeAztecProfileTx` throws `UnsupportedMethodError.forMethod("profileTx")` before the fence or any build; its build code goes. The class joins `classifyOperationCatch`'s code channel (`rpc-cancel.ts:95-104`; it rebuilds losslessly from code and message) and `logOperationOutcome`'s debug refusals (`service.ts:925-937`), or the dApp gets the unclassified constant and the log an error line. `PxeService.profileTx` stays in the runtime API, unused, for OA-1.
- **Flow.** dispatch → `executeOperations` → `executeAztecSimulateTx` (fast path or standard, merged as today) → `toAppFacingSimulationResult` → `unwrapOperationResult` → `toJsonSafe` → the page. The current body becomes a private method; the public one wraps it, so the fast-path merge still reads the full standard arm.
- **File-level change map.**
  - add `execution/app-facing-results.ts`, `app-facing-results.test.ts`, and `app-facing-results.fixtures.ts` (real-class builders shared with the executor test);
  - edit `execution/view-executor.ts`, `view-executor.test.ts` (real results in the harness; the refusal test; the fence test loses its profile call), `execution/rpc-cancel.ts` and `rpc-cancel.test.ts` (the code channel), `execution/service.ts` (`logOperationOutcome`);
  - edit `tests/e2e/network/sim-methods.test.ts` (the profile case asserts the refusal envelope, as #25 does) and `tests/e2e/network/delete-after-prove.test.ts` (D8);
  - docs: `execution/README.md` (file map), `UPDATE.md` § Types coupled to Aztec shapes (the reduction types against upstream classes), `CI.md:84` (the canary's description of `delete-after-prove`);
  - not edited: `dispatcher.ts`, `method-descriptors.ts`, `background.ts`, `to-json-safe.ts`, `pxe/*`, the playground, the grant copy.
- **Alternatives not taken.** Outline B: reduce in the dispatcher after `unwrapOperationResult` (D1). Reducing at `background.ts:1478` misses `batch` legs. A `gates` profile signed inside the wallet (the first draft's D4) is OA-1.

## Security & Adversarial Considerations

- **Threat model.** A connected dApp is trusted only as far as its grants. `simulateTx` runs without a window under a `simulation` grant (`method-descriptors.ts:220-224`), so what it returns crosses to a page the person does not watch, and the page keeps it.
- **Invariants this change establishes.** (1) A dApp's `simulateTx` answer carries return values, offchain effects, call contexts, argument hashes, side-effect counters, public call requests and their calldata, the block constants, gas, the fee payer and statistics; nothing else. (2) No dApp `profileTx` runs: no signature, kernel witness or gate count is computed for a dApp profile.
- **Kept on purpose.** Return values at every depth (the brief keeps them; the grant line "Results can include your private balances." says so) and argument hashes (D3). Gas stays: the SDK and the playground read it.
- **Input validation.** No new input is accepted; one method is refused. An unclassified error still reaches a dApp as one constant string (`error-envelope.ts:212`).
- **Crypto, least privilege, supply chain.** No new dependency, key, permission or workflow.

## Assumptions

**Facts**

1. The dApp SDK parses the simulate answer with `TxSimulationResultWithAppOffset.schema` and the profile answer with `TxProfileResult.schema` (`aztec.js/dest/wallet/wallet.js:341-363`; `wallet-sdk/dest/extension/provider/extension_wallet.js:121-127`).
2. `PrivateCallExecutionResult.schema` requires `acir`, `vk`, `partialWitness`, `publicInputs`, `newNotes`, `noteHashNullifierCounterMap`, `returnValues`, `offchainEffects`, `taggingIndexRanges`, `nestedExecutionResults`, `contractClassLogs` (`stdlib/dest/tx/private_execution_result.js:131-145`). `from(fields)` exists on it, `PrivateCircuitPublicInputs`, `PrivateToPublicAccumulatedData` and `TxEffect`; `empty()` on every class D3 rebuilds.
3. Upstream `gates` mode empties each step's `bytecode` and `witness` but keeps `vk` (`pxe/dest/private_kernel/private_kernel_execution_prover.js:183-189`).
4. Only the dispatcher builds `aztec_simulateTx` (`dispatcher.ts:1063-1090`); `execution/service.ts:998-1005` routes it to `executeAztecSimulateTx`; `batch` legs re-enter `dispatch` (`dispatcher.ts:465`). The dispatcher hands `DappInteractionService` only sendTx, registerToken, grantPublicAuthwit and createAuthWit (`dispatcher.ts:510,579,624,670`).
5. aztec.js reads the tail's `constants.anchorBlockHeader.globalVariables.timestamp` and `gasUsed`, `publicOutput.publicReturnValues`, per-call `returnValues`, `offchainEffects` with `callContext.contractAddress`, `stats` and `appCallOffset` (`contract_function_interaction.js:113-140`, `batch_call.js:127-138`, `deploy_method.js:273-276`). The playground reads per frame `callContext.{contractAddress, functionSelector}`, `argsHash`, `minRevertibleSideEffectCounter` and `publicCallRequests`; `publicFunctionCalldata`; the tail's `feePayer`, `forPublic` call requests and teardown request; `gasUsed` (`apps/playground/src/lib/simulation-summary.ts:38-80`). Nothing reads `firstNullifier`, `txEffect`, `debugLogs` or `revertReason`.
6. `UnsupportedMethodError.forMethod` composes "Unsupported wallet method: <name>" (`extension-messaging/src/errors.ts:271-276`) and is rebuilt from its code (`REBUILT_AS`, `errors.ts:567`). Thrown in the dispatcher it reaches a dApp as `-32601` with `walletErrorCode: "UNSUPPORTED_METHOD"` and logs at debug (`error-envelope.ts`; `background.ts:1532-1541`). Thrown inside an executor it does not today: `classifyOperationCatch` passes the code only for the classes it lists, so it becomes a plain `Error` and the unclassified constant (the final Codex pass reproduced this).
7. In the canary lane (`VITE_NULO_PRESTO_REQUIRED=1`, presto-server) the send proves natively, so today only the dApp profile's gate count opens bb.js's `keyval-store` there (`delete-after-prove.test.ts:5-10`; `.claude/skills/e2e-testing/SKILL.md:229`).
8. The vendored account's `entrypoint` runs `is_valid_impl`, which reads the signing key note and runs `schnorr::verify_signature` over the payload hash (the Noir source in `packages/aztec-runtime/src/account/artifacts/SchnorrAccount.json`'s file map, `schnorr_account_contract/src/main.nr`).
9. `PrivateKernelTailCircuitPublicInputs` and its accumulated-data classes have no key-validation field.
10. Planning probes ([lessons/phase-0.md](lessons/phase-0.md)) built D3 from `TxSimulationResult.random()`, with both tail variants and an empty `TxEffect`, ran it through `toJsonSafe` and `JSON`, and the dApp's schema parsed it; `offchainEffects`, `gasUsed`, `getPrivateReturnValuesOfAppCall(0)` and the offset held.

**Inferences**

- I1. The emptied side effects are the ones the simulated transaction would publish if it were sent; D6 empties them whether or not it ever is. From the Opus leg's trace; not run.

**Asks**

- A1 (working assumption: `mid`). The spawn prompt names `light`; the lane brief and the planner brief name `mid`.
- A2 (OA-1, not blocking). Restore a dApp `gates` profile signed inside the wallet. What ships now: every dApp `profileTx` refused.

## Phases

Fast gate `F`: `bun run lint && bun run typecheck:all && bun run test && bun run test:all`. Pass: each exits 0. A phase is ✓ only when its gate passes. Each phase logs to `lessons/phase-N.md`.

1. **The simulate shape.** Change: the module, its fixtures and test; wire `executeAztecSimulateTx`; the executor test's harness returns real results ("fast path result returned verbatim" becomes "returned reduced"). Tests, in `app-facing-results.test.ts`:
   - never (wire): a fixture whose root, depth-1 and depth-2 calls each carry a unique sentinel in every emptied field (bytecode, vk, witness, note, counter map, tagging secret, class log; public inputs with a key-validation request, a read request, a note hash, a nullifier, a private log), a tail with nullifiers, note hashes and logs in both phases, a `publicOutput.txEffect` with effects, debug logs and a revert reason, and a non-zero `firstNullifier`. Assert that `JSON.stringify(toJsonSafe(out))` contains no sentinel (buffers decoded first where a sentinel sits inside one), and that every object level of that JSON has exactly the schema's keys;
   - control, after the dApp's own `TxSimulationResultWithAppOffset.schema` parse: `getPrivateReturnValuesOfAppCall` decodes the app call's values, the `offchainEffects` getter keeps contract addresses, `gasUsed` with and without a public output, each frame's four kept public-input fields at depth 2, `publicFunctionCalldata`, the tail's constants, gas, fee payer and call requests, `publicReturnValues`, `stats`, and `appCallOffset` kept for an offset input and absent for a plain one;
   - executor: the standard path's and the fast path's answers both come back reduced.
   UI impact: none. Gate: `F`.
2. **No dApp profile.** Change: `executeAztecProfileTx` refuses; its tests become one refusal test (never: no fence capture, build or `pxe.profileTx`; control: the simulate test in the same harness builds); the fence test drops its profile call. `rpc-cancel.ts` lets `UnsupportedMethodError` ride the code channel, with a test beside "an argument refusal keeps its code across the port" that runs classify → unwrap → envelope to `-32601`; `logOperationOutcome` logs it at debug. `sim-methods`: the profile case leaves the loop and asserts `{ code: -32601, message: "Unsupported wallet method: profileTx", data: { walletErrorCode: "UNSUPPORTED_METHOD" } }`, as #25 does. `delete-after-prove` per D8, and `CI.md:84`. UI impact: none. Gate: `F`.
3. **Network proof and docs.** Change: `execution/README.md`, `UPDATE.md`. Run, at load1 < 150, one `e2e:agent` run at a time in this worktree, retry 0, from the worktree root:
   `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/sim-methods.test.ts tests/e2e/network/selfpay-phase.test.ts tests/e2e/network/sim-from-selfpay.test.ts tests/e2e/network/err-scope-and-cap.test.ts tests/e2e/network/delete-after-prove.test.ts`
   then `sim-methods` and `delete-after-prove` again with `NULO_E2E_BROWSER=firefox` added (the network config retries twice unless `NULO_E2E_RETRY` says otherwise). Pass: all green. Record in `lessons/phase-3.md` each file's wall-clock on this branch, and on `13d5f8d0` for the two changed files. Gate: `F` plus the runs.

## Decision ledger

- **D1, where the reduction runs.** The `ViewExecutor` method, through one module: one package, beside the profile refusal, after the fast-path merge, and it covers any caller of `executeOperations`. Outline B's dispatcher hook would also cover every live route (the Opus leg corrected the first draft here); it splits one operation's policy across two packages and meets dapp-boundary-2's parallel edit of `dispatcher.ts`.
- **D2, allowlist.** Rebuild with upstream named constructors; deleting keys fails the dApp's schema and lets a new upstream field through.
- **D3, what simulate keeps.** What Fact 5's consumers read. `argsHash` stays at every depth. Codex's round-1 point 4 (empty it) was weighed and rejected: plausible, not shown end to end; `selfpay-phase` proves the wallet simulated the dApp's own call by the mint frame's hash; and keeping only dApp-built frames would copy upstream's app-call offset rules. The residual is reported privately; a shown instance reopens it. The final Codex pass kept this disposition.
- **D4, refuse every dApp `profileTx`.** Codex round 1: the brief's own rule refuses every mode, and a signed `gates` profile needs the owner's acceptance; gate counts follow the transaction's private execution, so returning them is execution metadata. The Opus leg sides with a contained `gates` profile on the merits and agrees the choice is the owner's. What ships now is the brief's rule; OA-1 offers `gates`. `UnsupportedMethodError` over `InvalidWalletArgumentsError`: the method, not an argument, is refused, and the dApp can fall back.
- **D5, retired.** The first draft's wallet-built profile options; no profile runs.
- **D6, empty the would-be effects.** Both legs: the tail, `publicOutput.txEffect` and `firstNullifier` hold the nullifiers, note hashes and log tags the simulated transaction would publish, and no consumer reads them (Fact 5). A simulation's answer carries none of them, whether or not the transaction is ever sent (I1). The first draft's "keep whole" is rejected.
- **D7, tests.** Sentinels at depth 2 on the serialised JSON, with an exact key set per level, because the dApp's schema parse strips unknown keys (both legs); the schema parse is the success control. No composition test: `apps/extension/tests/COMPOSITION-TESTS.md` D2 and D3 forbid a canned `simulateTx` and a faked `buildStandard`. No new e2e scenario: two existing ones change (phase 2).
- **D8, `delete-after-prove` opens the CRS store itself.** With no dApp profile, nothing opens `keyval-store` in the Presto lane (Fact 7). The test holds a connection to it in the popup page it drives, the state bb.js leaves after loading its CRS, asserts that page still holds it just before the reset, so a reload cannot make the precondition vanish, and closes it in cleanup. The delete assertions stay. Rejected: dropping the CRS assert (a loosened assertion).

## Review verdicts

- **Codex round 1** (gpt-6.1-sol, high): `reject` (blocking: D4 must keep the no-signature requirement; D6 must also empty the transaction's would-be effects). Accepted: 1 (D4), 2 (gate counts follow private execution), 3 (D6), 5 (wire-level tests). Rejected: 4 (`argsHash`, D3); the composition-test suggestion (D7). Agreed by Codex: D1, D2, the probe, D3's compatibility, D5's refusal.
- **Opus Plan leg**: `conditional approve (with conditions: narrow D6 …; record D4 as an owner ask; the "never" tests check the wire with sentinels nested at least two calls deep)`. Accepted: 1 (D6), 2 (OA-1), 3 (D7), 4 (D1's reasoning), 5 (`UPDATE.md`, named constructors), 6 (always wrap the offset), 7 (D5, now retired).
- **Final fresh Codex pass** (new session, gpt-6.1-sol, high): `conditional approve (with conditions: preserve UnsupportedMethodError through the execution catch; use a type-correct constructor for an undefined appCallOffset)`. Both conditions accepted (Fact 6, Interface, phase 2), and point 3 (`NULO_E2E_RETRY=0` in phase 3). Point 4 kept D3 and corrected its reasoning. D8 judged a faithful precondition: bb.js's `idb-keyval` never closes its connection on `versionchange`; close the test's handle in cleanup. Resumed to verify the fixes: `approve`.

## Delivery

- One arc, one branch (`worktree-dapp-boundary-1`), one PR against `dev`, no stack (the orchestrator's D-orch-1). `code_review: off`. Opened only after phase 3 is green and the Codex loop converges.
- Title (73 chars): `feat(execution): return an app-facing simulateTx result; refuse profileTx`.
- Body: what changed and why (the invariants, in this plan's words), the validation runs with outcomes, each changed e2e file's wall-clock before and after per browser, no `Closes` line. Title, body, commits, test names and comments describe the change and its invariants only.
- Before the PR: merge `origin/dev`, rerun `F`. Open without labels; add `e2e:extension-network` afterwards only if the path filter skipped the network lane.
- Phases are serial: they share `view-executor.test.ts` and the fixtures.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) read at `13d5f8d0`. Plan-specific values:

- **While implementing.** Comments state invariants only. Log attempts in `lessons/phase-N.md`; `agent-worktree status dapp-boundary-1 "phase N green: <next>"` at each gate. Stop after 3 failures on one step (5 under `/loop`).
- **Review loop (step 2), single arc, once over the net diff from `13d5f8d0` after phase 3.** `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`; resume with `resume-codex.sh`. On a quota or 401 error retry once with `CODEX_ACCOUNT=alejo-icloud`, else log the failed consult and continue. The prompt carries the diff, this plan with its ledger, the adversarial ask and the README's two rules verbatim. Hard stop at 3 rounds. A fix that adds state, a lifecycle, a protocol, a recovery policy or a public contract stops for approval.
- **Delivery (step 3).** `gh pr create` as in Delivery, then `gh pr checks <n> --watch`; a known flake gets one rerun.
- **Close-out (step 4)** as the PR's final commits: merge `origin/dev`, read `index.md` and `lessons.md`; the `## Outcome` block (Known limits, Open items, OA-1's answer or its open state, seeds retired); lessons promoted (8 KiB, dedupe); `STATUS.md` deleted; `git mv` into `archive/` in its own commit with the index line moved; `bun run check:plans` green after staging. Then report and wait: the merge is the orchestrator's.
- **Teardown (step 5)** once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/dapp-boundary-1/plan.md` succeeds: `agent-worktree done dapp-boundary-1 --merged` (no `ExitWorktree`: the session started inside the worktree). It never forces; relay a refusal.

## Seeds

Draft until approval; the orchestrator runs no seed in this lane.

```
/goal All phases of implementations-plan/dapp-boundary-1/plan.md marked ✓, each backed by its validation gate reported passing in the transcript; LESSONS_FILE=implementations-plan/dapp-boundary-1/lessons/phase-N.md printed for each phase; /code-review NOT run (code_review: off); the Codex fix loop over the net diff from 13d5f8d0 converged, evidenced by a resumed pass reporting no new material point, quoted; one PR against dev opened only after that (gh pr view output in the transcript), its close-out commits archiving the plan (git show --stat of the archive move); bun run test and bun run lint exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/dapp-boundary-1 forward per its plan.md and the README's § Post-implementation standard at 13d5f8d0. Each firing: read plan.md and lessons/ first; if the plan is archived on origin/dev, run agent-worktree done dapp-boundary-1 --merged and stop; if a PR exists, babysit its checks only; else take the next unchecked phase, run its gate, mark ✓, log the lesson. Decide open questions with Codex (gpt-6.1-sol, high), never by waiting; never merge, never push to main.
```
