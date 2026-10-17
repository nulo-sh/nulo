---
plan: dapp-results-1
tier: light
status: completed
issues: "none (the PR closes nothing)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex pass (gpt-6.1-sol, high) and one Opus Plan leg
base: origin/dev at 563b0627
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-17
- **Status:** completed. One PR against `dev` carries the arc and this close-out; merging it is the orchestrator's call.
- **Shipped:**
  - `trim()` denies `witness`, `newNotes` and `taggingIndexRanges`, and the static log guard refuses the names flattened into a message (phase 1; D3).
  - A dApp's `executeUtility` answer is rebuilt as its return values, offchain effects and anchor timestamp, without the PXE's `stats` (phase 2; D5).
- **Dropped:** kebab-case twins of the keys (D2); a `NoteAndSlot` shape rule (D1).
- **Rejected:** deleting the wire test's comment on the positive search (Arc 1, Codex round 1).
- **Known limits:** none.
- **Open items:** none.
- **Lessons:** none promoted. `lessons.md` is at 8163 of 8192 bytes, and this plan's one cross-task point (a never test pairs with a success control) is already there.
- **Seeds retired:** the `/goal` and `/loop` seeds below.

# dapp-results-1: an app-facing `executeUtility` answer; the log redactor denies three execution keys

One arc, one PR against `dev`. What a dApp receives from simulation and profiling was settled hours before this plan: #701 rebuilds a dApp's `simulateTx` answer from an allowlist and refuses every dApp `profileTx` ([`archive/dapp-boundary-1`](../dapp-boundary-1/plan.md)). This plan adds what #701 left on the log side: `trim()` blanks the keys `witness`, `newNotes` and `taggingIndexRanges`, and the static log guard refuses them, so a value under any of them reaches a log line only as a placeholder. And a dApp's `executeUtility` answer is rebuilt from an allowlist, as #701 rebuilt `simulateTx`'s: the call's result, its offchain effects and the anchor block's timestamp, without the PXE's `stats` (phase 2, added by the orchestrator on approval). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Brief claims that did not hold

- **"The mode a dApp asks for is coerced, and every `witness` field is cleared."** Superseded: every dApp `profileTx` is refused before a fence, a build or the PXE (`view-executor.ts:387-390`), with a test per mode (`view-executor.test.ts:420-434`). No mode is allowed, so there is no witness to clear. Allowing `gates` is #699 (owner decision), whose option B already says the answer carries "never a proof, a witness or a signature".
- **"The simulation answer carries no `partialWitness`, no `newNotes`, no nested private execution results."** Already holds, by allowlist rather than by strip: each call keeps its `returnValues`, `offchainEffects` and rebuilt nested calls; `partialWitness` is an empty map and `newNotes` and `taggingIndexRanges` empty lists at every depth (`app-facing-results.ts:39-61`). Nested results stay, rebuilt: aztec.js and the playground read them, and the dApp's schema requires the key.
- **"A wire-shaped test on the serialised response."** Already in `app-facing-results.test.ts`: sentinels at depth 0, 1 and 2 through `toJsonSafe`, absent after the reduction, present before it, with the dApp's schema parse as the success control.
- **"`partialWitness` joins `REDACTED_KEYS`."** It is already there (`logger/utils.ts:87`).
- **"camelCase and kebab-case."** No producer of a kebab spelling exists today (D2).

## Outcome & Quality Bar

For a person who exports the log viewer's CSV into a bug report, and for the next contributor who logs a simulation or profile object. Excellent: (1) a log argument holding a real upstream note list, tagging range or witness under its own key yields `[<key>]` and none of its values, while a sibling key survives; (2) a log call that flattens any of the three names into a message fails `log-payload-ban.test.ts` at CI. (3) a dApp's `executeUtility` answer on the wire has exactly `result`, `offchainEffects` and `anchorBlockTimestamp`, and aztec.js reads its return values and offchain output unchanged. Good enough: keys matched exactly, as every other entry is.

## Architecture & Implementation

- **Where.** The one redactor, `apps/extension/src/wallet/logger/utils.ts` (`REDACTED_KEYS`); the static guard imports the set (`log-payload-ban.test.ts:83`), so it extends with no edit.
- **Change.** Add `"witness"` beside the proof-material keys, and `"newNotes"` and `"taggingIndexRanges"` in a group for a private call's execution material. No kebab-case entry (D2).
- **Flow.** A log call → the service logger or the page logger client → `trim()` → `LoggerStore` (`store.ts:76`, `services/logger/client.ts:51`). `trim()` replaces a denied key's value with `[<key>]` before it walks it (`utils.ts:261`).
- **File-level change map.** Phase 1: edit `apps/extension/src/wallet/logger/utils.ts` (three entries, one group comment) and `apps/extension/src/wallet/logger/utils.test.ts` (one test); no README lists the keys one by one. Phase 2: edit `execution/app-facing-results.ts`, `app-facing-results.test.ts`, `view-executor.ts`, `view-executor.test.ts`, and `execution/README.md` where its file map describes `app-facing-results.ts`.
- **Phase 2, where.** `apps/extension/src/wallet/services/execution/app-facing-results.ts` gains `toAppFacingUtilityResult(result: UtilityExecutionResult): UtilityExecutionResult`, pure, no options: `new UtilityExecutionResult(result.result, result.offchainEffects, result.anchorBlockTimestamp)`. `ViewExecutor.executeAztecExecuteUtility` returns it (`view-executor.ts:385`). Only dApp operations reach that method (Fact 9); the wallet's own utility reads (`executeSimulateUtility`) call PXE directly and keep the full object.
- **Phase 2, flow.** dispatch (or a `batch` leg, or `DappInteractionService`) → `executeOperations` → `executeAztecExecuteUtility` → `pxe.executeUtility` → `toAppFacingUtilityResult` → `unwrapOperationResult` → `toJsonSafe` → the page, which parses it with `UtilityExecutionResult.schema` (Fact 8).
- **Alternative not taken (phase 2).** Deleting `stats` from the PXE's object. A rebuild names what the dApp gets, so a field upstream adds later does not pass through, and it matches #701's simulate answer.
- **Alternative not taken (phase 1).** A shape rule for upstream `NoteAndSlot`, like Nulo's own `Note` rule (`utils.ts:229-246`). It adds a branch to the walker's ordered precedence, whose complexity is an accepted baseline at 45 (`utils.ts:185`), for an object no log line passes (D1).

## Adversarial Considerations

- **Threat model.** The person exports the log buffer as CSV into public bug reports (logging-policy skill). What reaches it holds no note preimage, tagging secret or witness value.
- **Invariant this change establishes.** A value under the key `witness`, `newNotes` or `taggingIndexRanges` reaches `LoggerStore` as `[<key>]` at any depth the walker reaches, and the static guard refuses those names flattened into a message.
- **Invariant phase 2 establishes.** A dApp receives a utility call's result, never the wallet's own bookkeeping: its `executeUtility` answer carries the return values, the offchain effects and the anchor block's timestamp, and nothing else.
- **Scope of the rule.** It matches key names, as every entry does; the guard's textual scope is stated in its header.
- **Input validation, crypto, least privilege, supply chain.** No new input, dependency, key, permission or workflow.

## Assumptions

**Facts**

1. `REDACTED_KEYS` holds `partialWitness`, `acir`, `vk`, `publicInputs`, `authWitnesses` and none of the three (`logger/utils.ts:83-120`); the match is exact (`:261`).
2. `trim()` prints a `Map` as `[Map(n)]` (`:204`). An in-memory kernel `witness` is `Map<number, string>` (`@aztec-labs/stdlib` `kernel/private_kernel_prover_output.d.ts:26`); its serialised form is an array of `[index, value]` pairs (`@aztec-labs/foundation` `schemas/utils.js:56-60`). `AuthWitness.witness` is `Fr[]` (`auth_witness/auth_witness.d.ts:11`).
3. `NoteAndSlot` is a class (`tx/private_execution_result.d.ts:17-25`); `TaggingIndexRange` is an object type whose `extendedSecret` is an `AppTaggingSecret` class instance (`logs/tagging_index_range.d.ts`, `logs/app_tagging_secret.d.ts`). Neither has a shape rule in `trim()`, and their `Fr` fields walk to `asBigInt` (`curves/bn254/field.js`), so the denied key is what turns each into its placeholder.
4. The static guard builds its names from `REDACTED_KEYS`, blanks string text before matching, matches on word boundaries and asserts the parity (`log-payload-ban.test.ts:83`, `:173`, `:361`, `:872`). Run in memory with the new names, it reports no offender in 1,861 files (Codex round 1).
5. No dApp route returns a kernel witness or a populated execution intermediate: a simulate answer is the rebuilt result with every such field empty (`view-executor.ts:234`, also for `batch` legs, `dispatcher.ts:466-473`), `profileTx` is refused, `sendTx` returns a hash or receipt with offchain output (`dapp-send-executor.ts:1088-1093`, `:1251-1256`), and `createAuthWit` returns the authentication witness it was asked for, by design (`execution/service.ts:1230`).
6. No wallet log call passes a result object, a witness, a note list or a tagging range today (traced, recon.md § Paths). The wallet does hold these types: full simulation results in the fee strategies and `authwit-discoverer.ts:121`.
7. `PXE.executeUtility` returns `{ result, offchainEffects, anchorBlockTimestamp, stats: { timings, nodeRPCCalls } }`, where `timings` includes the sync time (`@aztec-labs/pxe` `dest/pxe.js:808-850`). The runtime client parses it into a `UtilityExecutionResult` (`packages/aztec-runtime/src/pxe/client.ts:455-458`), and `ViewExecutor.executeAztecExecuteUtility` returns that as is at `563b0627` (`view-executor.ts:385-388`).
8. aztec.js parses the answer with `UtilityExecutionResult.schema`, where `stats` is optional (`stdlib` `tx/profiling.js:128-137`; `aztec.js` `wallet/wallet.js:348`). It reads `result`, `offchainEffects` and `anchorBlockTimestamp` and forwards `stats` as metadata without reading it (`contract/contract_function_interaction.js:91-103`, `contract/batch_call.js:107-110`).
9. Today only dApp operations reach `executeAztecExecuteUtility`: the operation switch (`execution/service.ts:1018-1019`), fed by the dispatcher, its `batch` legs and `DappInteractionService` (`dapp-interaction/service.ts:740`). The wallet's own `simulate_utility` reads go through `executeSimulateUtility`, which returns decoded values and no `stats`. No current caller of `executeAztecExecuteUtility` reads `stats` (Codex, amendment pass).

**Inferences**

- I1. No exported backup JSON, and no wire format the wallet reads, uses a kebab spelling of these keys (`witness` has none; `new-notes` and `tagging-index-ranges` have no producer). A backup slice or wire format that carries one reopens D2.

**Asks**

- None. Tier: the spawn prompt and the lane brief name `light`; the planner brief's `mid` is the default they override. Scope: three set entries and one test (phase 1); one allowlist rebuild and its tests (phase 2).

## Phases

Gate `F`: `bun run lint && bun run typecheck:all && bun run test && bun run test:all`. Pass: each exits 0.

1. **Three redactor keys.** ✓ (gate F, 2026-10-17) Warning: `JSON.stringify` throws on a bigint, and `trim()` returns `Fr` values as bigints; serialise with a replacer that turns a bigint into its decimal string, so a red is the sentinel check and not a `TypeError`.
   - Test, in `utils.test.ts` (`trim — secret key names`), one `test.each` row per key, each with its own sentinel: `newNotes`, a list of one real `NoteAndSlot` whose randomness is the sentinel; `taggingIndexRanges`, a list of one range whose real `AppTaggingSecret` holds the sentinel; `witness`, its serialised form `[[0, <sentinel hex>]]`. For each row pass `[{ [key]: value, keepMe }]` to `trim()`, as `LoggerStore` passes its argument list. Assert the sentinel is absent from the serialised output, the key reads `[<key>]`, and `keepMe` survives (control).
   - Run the new test against base `563b0627`'s `utils.ts` first. Record the red, one per key, in `lessons/phase-1.md`.
   - Add the three keys. Run `cd apps/extension && bun --bun vitest run src/wallet/logger/utils.test.ts src/utils/log-payload-ban.test.ts`.
   - If the guard flags an existing line, change the line to pass the value under its named key or to log a count. Never add the line to the guard's allowlist.
   - UI impact: none. Gate: `F`.
2. **An app-facing `executeUtility` answer.** ✓ (gate F and the e2e run, 2026-10-17) First confirm the tree still returns `stats` (Fact 7); if it does not, record that in `lessons/phase-2.md` and skip the phase.
   - Change: add `toAppFacingUtilityResult` and wire `executeAztecExecuteUtility` through it.
   - Test, in `app-facing-results.test.ts`, on the serialised wire: build the PXE's plain object with return values, one offchain effect and a `stats` whose timings and node-call record each hold a unique sentinel. Pass it through `toAppFacingUtilityResult`, `toJsonSafe` and `JSON.stringify`. Never: no sentinel, and the parsed keys are exactly `result`, `offchainEffects`, `anchorBlockTimestamp`; the same search finds the sentinels on the unreduced object. Control: after `UtilityExecutionResult.schema` parses the wire JSON, the return values, the effect's data and contract address, and the timestamp equal the input's.
   - Test, in `view-executor.test.ts`: the harness's `pxe.executeUtility` returns a full `UtilityExecutionResult` with `stats`. The executor's answer has `stats === undefined` (the constructor keeps an own `undefined` key, which `JSON.stringify` drops, so exact keys are asserted only on the wire) and keeps `result`, `offchainEffects` and `anchorBlockTimestamp`.
   - Run one existing network e2e file that reads a dApp utility answer through the playground's SDK parse, as a smoke check, at load1 < 150, from the worktree root: `NULO_E2E_BROWSER=chrome NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/connect-locked-queue.test.ts`. The unit tests prove the omission; no e2e scenario is added or changed.
   - UI impact: none. Gate: `F` plus the e2e run green.

## Decision ledger

- **D1, keys over a shape rule.** Three entries match the existing `partialWitness` handling and touch no walker precedence. A shape rule is the larger change, re-stamps an accepted complexity baseline, and covers an object no log line passes.
- **D2, no kebab-case entries.** CLAUDE.md asks for the kebab spelling "used by exported backup JSON"; no producer uses one for these keys (I1). The proof-material keys follow the same rule.
- **D3, `taggingIndexRanges` joins the brief's two keys.** A private call's execution result also holds its tagging ranges, each with an app tagging secret (Fact 3), and #701 empties the same field for the dApp. Denying the result field completes the lane's own invariant with one entry and one test row; Codex judged it in scope and preferred the result field over the inner `extendedSecret`. Nothing else joins: the other fields #701 empties are public inputs already denied, a `Map`, or would-be public effects.
- **D4, ship the arc.** No log line passes these keys today (Fact 6). The basis is the logging-policy rule "when adding a sensitive field to a type, add its name to `REDACTED_KEYS`": the wallet holds these types, and the entries put the written rule "never log decrypted note contents" into the guard CI runs. Closing the lane as done is the fallback if the orchestrator prefers no change with no present effect.
- **D5, the utility answer joins arc 1.** Raised by the Opus leg, triaged by the orchestrator, and added on approval as phase 2 under the lane's invariant. The tree still returns `stats` (Fact 7). The rebuild follows #701's shape, so it adds no new pattern.

## Review verdicts

- **Codex round 1** (gpt-6.1-sol, high): `conditional approve (with conditions: narrow the claims, correct Fact 6, and state only the change in committed files)` (paraphrased). Accepted: 1 (Fact 5 now names the rebuilt simulate result and the authorised authentication witness), 3 (D2 states the producer assumption and its reopening condition), 4 (bigint-safe serialisation, phase 1's warning), 5 (the tier resolved, not an Ask), 6 (the plan, recon and lessons state the change and the invariant only). Agreed: no route left (2); two-key scope, D1, D4.
- **Opus Plan leg**: `conditional approve (with conditions: put Fact 6's trace into the plan and base D4 on the policy rule; make the test's red a real one; correct Fact 3; record the tagging-secret boundary; fill the verdicts)`. Accepted: 1 (D5), 2 (Fact 3 restated; Fact 6 traced; the tagging ranges, D3), 3 (the witness in its serialised form, the bigint replacer, D1's complexity reason), 4 (D4's basis), 5 (wording, verdicts).
- **Codex, resumed to verify** (same session): `conditional approve (with conditions: correct remaining claims, state only the change, make each key's red independent)` (paraphrased). D3 judged in scope, `taggingIndexRanges` the right key. Accepted: recon's route line narrowed to Fact 5; Fact 3 (`TaggingIndexRange` is a type); one test row per key; D5 kept off committed text and sent to the orchestrator; Fact 3, D3 and the lessons restated around denied fields; the before-#701 table dropped from Delivery; the coverage sentence under the invariant deleted.
- **Codex, resumed again** (third and last round): `conditional approve (with conditions: correct the remaining TaggingIndexRange description in recon.md)`. Applied; every other fix verified, no regression. The loop stops here: the one condition is a wording fix to recon.md.
- **Orchestrator, on approval**: D3 kept; phase 2 added.
- **Codex, amendment pass** (new session, gpt-6.1-sol, high): `conditional approve (with conditions: correct the executor assertion, qualify Facts 7-9, update phase-2 completion instructions, rename a heading)` (paraphrased). Kept set `result`, `offchainEffects`, `anchorBlockTimestamp` confirmed (aztec.js attaches the timestamp to offchain messages; the schema requires it); no other route or caller found. All applied: Facts 7 and 9, the executor test's `stats === undefined`, one e2e file with the browser named, the seeds, the heading.

- **Arc 1, Codex round 1** (new session, gpt-6.1-sol, high, over `git diff 563b0627 -- apps/`): `conditional approve (with conditions: correct the README and pass the planned Chrome smoke gate)`. No runtime defect; every route traced to the rebuilt answer. Accepted: the README says the wallet's own reads bypass both shapes; the helper's comment cut to its two constraints; `lessons/phase-2.md` reworded. Rejected: deleting the wire test's comment on the positive search (it states why that assertion exists, as the sibling simulate test's identical comment does).
- **Arc 1, Opus diff review**: `conditional approve (with conditions: commit the working-tree edits; run phase 2's e2e)`. Correctness traced (dispatch, `batch`, `DappInteractionService`; aztec.js and the playground read only the kept fields). Accepted: the redundant `parsed.stats` line removed; the executor describe renamed to cover the answer; "too" restored in the helper's comment; README grammar.

- **Arc 1, Codex round 2** (resumed): `conditional approve (with conditions: planned Chrome smoke gate passes)`. Every accepted fix verified, no regression, no new point; the smoke check then passed (2/2). The loop converged.

## Delivery

- One arc, branch `worktree-dapp-results-1`, one PR against `dev`, no stack (the orchestrator's D-orch-1). `code_review: off`.
- Title (≤ 93 chars): `feat(execution): return an app-facing executeUtility result; redact three log keys`.
- Body: what changed; a table of the fields a dApp's `executeUtility` answer carries before and after, and nothing else about why; the denied log keys before and after; the validation runs with outcomes; no `Closes` line. Title, body, commits, test names and comments describe the change only.
- Before the PR: merge `origin/dev`, rerun `F`. Open without labels, then add `e2e:extension-network` only if the path filter skipped the network lane.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) read at `563b0627`. Plan-specific values:

- **While implementing.** Comments state invariants only. Log attempts in `lessons/phase-N.md`; `agent-worktree status dapp-results-1 "phase N green: <next>"` at each gate. Stop after 3 failures on one step.
- **Review loop, once over the net diff from `563b0627`.** `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`; resume with `resume-codex.sh`. On a quota or 401 error retry once with `CODEX_ACCOUNT=alejo-icloud`, else log the failed consult and continue. The prompt carries the diff, this plan with its ledger, the adversarial ask and the README's two rules verbatim. Hard stop at 3 rounds.
- **Delivery.** `gh pr create` as above, then `gh pr checks <n> --watch`; a known flake gets one rerun.
- **Close-out** as the PR's final commits: merge `origin/dev`, read `index.md` and `lessons.md`; the `## Outcome` block (Known limits, Open items, seeds retired); lessons promoted only if new (8 KiB, dedupe); `STATUS.md` deleted; `git mv` into `archive/` in its own commit with the index line moved and the `../archive/` links repaired; `bun run check:plans` green after staging. Then report and wait: the merge is the orchestrator's.
- **Teardown** once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/dapp-results-1/plan.md` succeeds: `agent-worktree done dapp-results-1 --merged` (the session started inside the worktree, so no `ExitWorktree`). It never forces; relay a refusal.

## Seeds

Draft until approval; the orchestrator runs no seed in this lane.

```
/goal Phases 1 and 2 of implementations-plan/dapp-results-1/plan.md marked ✓, each backed by its gate reported passing in the transcript and LESSONS_FILE=implementations-plan/dapp-results-1/lessons/phase-N.md printed for each; /code-review NOT run (code_review: off); the Codex loop over the net diff from 563b0627 converged, evidenced by a resumed pass reporting no new material point, quoted; one PR against dev opened only after that (gh pr view output in the transcript), its close-out commits archiving the plan (git show --stat of the archive move); bun run test and bun run lint exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/dapp-results-1 per its plan.md and the README's § Post-implementation standard at 563b0627. Each firing: read plan.md and lessons/ first; if the plan is archived on origin/dev, run agent-worktree done dapp-results-1 --merged and stop; if a PR exists, babysit its checks only; else run the next unchecked phase, its gate, mark ✓, log the lesson. Decide open questions with Codex (gpt-6.1-sol, high), never by waiting; never merge, never push to main.
```
