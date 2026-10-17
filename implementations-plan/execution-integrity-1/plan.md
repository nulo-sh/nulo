---
plan: execution-integrity-1
tier: mid
status: planned; final Codex pass approved (round 2); awaiting the orchestrator
issues: "#662 #664 #669 (the one arc closes all three)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex plan review (gpt-6.1-sol, high) and one Opus Plan leg in parallel; one fresh final Codex pass
base: origin/dev at 13d5f8d0
trunk: dev
post_implementation_hardening: not scheduled
---

# execution-integrity-1: three send-bookkeeping invariants

One arc, one PR against `dev`. A transfer goes only to the token contract the person approved (#662). A transaction the node accepted is recorded and reported as sent (#669). A revoke reports success only when the chain shows the authorization gone (#664). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Issue claims, checked at 13d5f8d0

- **#662** (demonstrated by code trace): every cited line holds. `deleteToken` tombstones the removed contract (`token/service.ts:643-652`), so the row that takes the freed id is another token, as the issue says.
- **#669** (demonstrated by reproduction): holds. More post-broadcast task calls throw after a profile switch than the issue names: `executeOperations`' `operationTask.complete()` (`execution/service.ts:910`); in the revoke and registry-toggle tails, `startSubtask` in `syncAuthwits`, `syncAuthwit` and `syncStatus` (`auth-registry/service.ts:491,511,539`), which run before their final `task.complete()`. The transfer's catch cannot mark the journal `failed`: the row is already `succeeded`, and the transition is refused and logged (`transfer-executor.ts:237-246`); the caller is still told it failed.
- **#664** (plausible but unverified for the harmful order; every wallet-side step holds): a grant row stays `pending` until its transaction is Proven or Finalized (`auth-registry/service.ts:165-186`), not merely mined. Refusing `pending` rows (the issue's first option) would refuse a revoke for the whole proving lag and fail `authwit-lifecycle`'s grant-then-revoke step (`tests/e2e/network/authwit-lifecycle.test.ts:172-187`). The plan takes the second option (wait for the grant's inclusion) and the verification step.

## Outcome & Quality Bar

For a person who sends from Send or approves an app's send, and may lock or switch profile while it goes out; and for a person who revokes an app's grant under Settings → Developer.

Excellent:
1. A transaction the node accepted is in its profile's history, its record reads `succeeded`, and its caller gets its hash, through a lock or a profile switch. Deleting the profile or the account still refuses the record, by design (F3).
2. A transfer calls only the token contract the Send page showed, or fails before any proof.
3. A revoke ends in success only when each revoked authorization reads as not authorized after the revoke is proven, and the list drops only rows whose grant is known to sit at or below the revoke's block.

Good enough: the lock prompt and the profile picker keep today's counts and words (OA-1); the list shows no pending marker (OA-2).

## Assumptions

**Facts**
- F1. `WrappedTask.complete`/`fail`/`cancel`/`startSubtask` throw `Invalid task id` once a profile change clears the registry (`task/service.ts:47-52,127-180,238-245`; `task/wrapped-task.ts`). Task ids are 8 random hex characters.
- F2. `sendTxTask` is the only `node.sendTx`; `onSent` and `task.complete()` run inside its try after the send, so the catch reports a post-send throw as a send failure (`execution-coordinator.ts:286-309`). `proveAndSend` records only after it returns (`:350-356`).
- F3. `addTransaction` under a fence checks the deletion epoch and account ownership, not the session (`transaction/service.ts:208-212`). `transitionOperation` has no active-profile check (`operation-journal/service.ts:338-380`).
- F4. `buildTransferOperation` is the one place a fresh build, for execute and for estimate, resolves the token row (`operation-planner.ts:129`). Token ids are max + 1 (`id-allocators.ts:17-21`). The reuse ladder matches `tokenId`, not the contract (`transfer-estimate-reuse.ts:146-157`). `sequence()` keys on the row's contract (`transfer-executor.ts:192-210`).
- F5. `waitForTx` proves only that a hash is not in this worker's pending map: it returns at once for a Dropped, untracked, purged or restored hash (`transaction/service.ts:257-300,551-570`). A tx receipt's status maps to a block status through `txStatusFromReceipt` (`transaction/receipt-status.ts:12`). A `pending` authwit row may carry no `txHash` (`auth-registry/spec.ts:61-62`), and restore keeps that shape.
- F6. The journal page shows `error.message` only in developer or debug mode (`popup/pages/journal/[id].vue:14,143`). `RevokeAuthwitsPopup` shows a chunk's error in its tooltip (`RevokeAuthwitsPopup.vue:267-307`). The activity view renders only UI transfer tasks (`RecentActivityView.vue:636-657`), so revoke and toggle subtasks are never shown. The revoke RPC's transport deadline is 1 h (`auth-registry/client.ts:27-29`).
- F7. An estimate stashes its build under the active profile read after the build, not its fence's (`transfer-executor.ts:790`, `dapp-send-executor.ts:714`); today a settle that throws after a switch stops some of those estimates early.

**Inferences** (each checked in the phase named)
- I1. Before a broadcast, a profile change is refused by the fence (`assertFence` compares the profile id) whatever the task registry does, so tolerance only past the broadcast removes no guard (phase 1).
- I2. A grant whose receipt shows a block at or below the revoke's proven block is itself proven, so a row dropped on that evidence cannot come back by a prune (phase 3). This holds only as far as the row's `txHash` truly names its grant and the node's reads are of one canonical chain (the known limits below).

**Asks** (working assumption in brackets)
- A1. Tier: the spawn prompt says `light`, the lane brief `mid` [mid, written to the light size where it can].
- A2. What a person sees: OA-1 and OA-2 in [OWNER-ASKS.md](OWNER-ASKS.md) [ship each ask's "what ships now"].
- A3. The wording of the new failure reasons, shown only on Developer and debug surfaces [the strings below; OWNER-ASKS lists them].

## Architecture & Implementation

**D1, #669: past a broadcast, task bookkeeping never replaces the outcome.** `WrappedTask` gains `completeIfTracked()`: it calls `complete()` when the registry still holds the task and does nothing otherwise, so a live task keeps every refusal `complete` has. Only code past its point of no return calls it:
- `sendTxTask`: the try covers the Terms check, `assertLive` and `node.sendTx` only; `onSent?.()` and `task.completeIfTracked()` follow it, so the catch classifies only a send that did not go out.
- `TransferExecutor.execute`, after `proveAndSend`.
- `executeOperations`, after the dispatch of an operation in `BROADCASTING_OPERATION_KINDS`; other kinds keep `complete()`.
- `revokeAuthwits` and `setRegistryEnabled`: their steps after the send start no subtask (D3's check; the registry-status write is lifted out of `syncStatus` into a task-free helper that `syncStatus` keeps calling), and they end with `completeIfTracked()`. `waitForTx` already tolerates a cleared parent. These subtasks are never rendered (F6).
Everything before a broadcast keeps the strict settle, and `fail` keeps its cause-attaching catch.
*Not taken:* (a) every orphaned settle and `startSubtask` inert (the Opus leg's proposal): one rule for all sites, but an estimate whose profile switched during its last simulation would run on and stash a signed build under the new profile (F7), which today's throw happens to stop; (b) an `exists` guard copied at each site; (c) a registry generation per handle, against a 1-in-2³² id reuse whose cost is a wrong progress row.

**D2, #662: the transfer request names its token contract.** `executeTransfer` and `estimateTransferFee` take `tokenContract: string` right after `tokenId`; the Send page passes `activeToken.contract`. Both entry points refuse a value `isFieldAddress` (`@nulo/wallet-bridge`) rejects with `InvalidWalletArgumentsError.forMethod(...)` and carry `fieldAddressKey(...)` in `TransferRequest.tokenContract`. That contract is then the request's one token identity:
- `sequence()` keys on it, and `queuedFeeCapFor` reads fee history with it; neither reads the row any more (`getTokenContract` leaves `TransferExecutorDeps`).
- `buildTransferOperation`, right after `getTokenRaw`, refuses unless `sameFieldAddress(token.contract, req.tokenContract)`: `"The token changed after this send was approved"`. This covers the queued build, the fee re-ask's rebuild and the estimate.
- The reuse ladder's input match adds `sameFieldAddress(entry.token.contract, inputs.tokenContract)`; a reuse hit sends the approved build.
- `send.vue`'s estimate watch also keys on `activeToken.value?.contract`, so a row swap under the same id re-estimates.
`FEE_SETTINGS_OF` moves both readers one position.
*Not taken:* record the contract the worker reads at entry (no wire change). It binds what the worker saw, not what the person approved.

**D3, #664: a revoke waits for every selected grant's block, then verifies and prunes.** In `revokeAuthwits`, after `revokeOperation` and the task start, before `executeSendTransaction`:
- `awaitGrantBlocks(rows)`: for each distinct `txHash` of a `pending` row, in parallel, poll `getTxReceipt` every second through the network's single-attempt node (`networkService.getSingleAttemptNodeForUrl(primaryEndpointUrl(network))`, so one read never retries) until `txStatusFromReceipt` is past Pending and Dropped. A failed read counts as not in a block. Polling stops at the first poll after 120 s, so the wait ends within 120 s plus one read's timeout. It checks that every `pending` row has a `txHash` before starting any poll, and returns only after every poll has ended, so no poll outlives the call. A `pending` row with no `txHash`, or a grant not in a block when polling stops, refuses before any send: `Authwit #N's grant is not in a block yet. Revoke it again later.`
- `waitForTxProven` returns the revoke's block `R`.
- `verifyRevoked(node, scope, rows, R)`, task-free: a hash that still reads as authorized fails the revoke (`Authwit #N is still authorized after the revoke`) and keeps its row. A non-pending row that reads not authorized is deleted. A `pending` row is deleted only when its grant's receipt, read again through the same single-attempt node, shows a block at or below `R` (a reverted grant included). Otherwise, a failed read included, it is kept and the revoke fails with the not-in-a-block reason.
- Deletion is one helper extracted from `syncAuthwit`: under the lock, delete only if the stored row still has the same id, scope, hash and `txHash`. `syncAuthwit` keeps its `!pending` condition; the revoke's caller does not, since `reconcileAuthwits` may clear `pending` concurrently.
`syncAuthwits` and `syncRegistry` are unchanged. The helpers keep `revokeAuthwits` within the complexity budgets.
*Not taken:* refuse `pending` rows (see the #664 claim; a dropped grant's lingering row would also become unrevocable); refuse while the grant is unconfirmed (a failure the person must retry, where a wait of seconds does the same); `waitForTx` as the wait (F5: it does not prove inclusion); wallet sends joining the account's send line as dApp sends do (`dapp-send-executor.ts:344-345`). That line would also order a repeated grant of a tracked hash, but it reverses the recorded rule that a wallet send never waits there (pinned by "a wallet send (Settings) never waits", `dapp-send-executor.test.ts:1097`): such a wait is a spinner with no card and nothing to cancel, behind unrelated sends too.

## Security & Adversarial Considerations

- **Trust boundaries.** The transfer RPCs are extension-page RPCs: the port accepts only this extension's own pages (`packages/extension-messaging/src/core/sender-auth.ts:22`). The new argument is still validated, and the compare goes through `sameFieldAddress`, which never matches two malformed values. A stored row naming another contract fails closed.
- **What an attacker would target.** No dApp can drive the three paths: #662 and #669 need the person's own removal or profile switch, and #664's order is the sequencer's. A restored row's `pending` and `txHash` are trusted as its grant's provenance, as reconciliation already trusts them; a crafted backup can misstate them (a known limit below). No dApp-reachable surface is added.
- **Trusted node.** D3 reads receipts and storage through the network's own primary endpoint, as `syncAuthwit` does today; a dishonest node can lie to both, as it can to every read the wallet makes.
- **Fail-closed directions.** D1 is tolerant only past a broadcast; a refused send still fails its task and rethrows its own classified error. D2 refuses before any proof. D3 waits without a slot or a lock, under the fence captured first, and fails every outcome it cannot verify.
- **Not in play:** cryptography, dependencies, CI, permissions. No new log line carries an address or a hash.

## UI impact

- **#669:** none. The lock prompt and the pickers are OA-1, not shipped.
- **#662:** none for a person without developer or debug mode: a refused send reads as today's "Send failed" with "Nothing was sent. You can try again." The reason shows only on the journal page in developer or debug mode (F6).
- **#664:** Settings → Developer → Account state → Authwits → Revoke. A revoke of a grant not yet in a block keeps its progress state up until it is (seconds). A revoke that cannot verify ends in the existing failure toast, with its reason in the existing error tooltip. After a verified revoke, a revoked row leaves the list whether or not its grant was still pending; today only confirmed rows leave, and a revoked pending row stays listed as if live (the consequence #664 names). The orchestrator's record in the lane brief covers this: "Revoking a public authorization whose grant is still pending either waits for the grant's inclusion or refuses with a reason". The pending marker is OA-2, not shipped.

## Phases

Fast gate `F`: `bun run lint && bun run typecheck:all && bun run test`. Pass: each exits 0. Targeted runs: `cd apps/extension && bun --bun vitest run <files>`. A phase is ✓ only when its gate passes. Log each phase in `lessons/phase-N.md`.

1. **#669, completion past a broadcast.** Change `task/wrapped-task.ts`, `execution/execution-coordinator.ts`, `execution/transfer-executor.ts`, `execution/service.ts` (`executeOperations`), `auth-registry/service.ts` (the toggle tail; the revoke tail lands in phase 3), per D1.
   Tests:
   - `task/service.test.ts`: after a switch, the old handle's `completeIfTracked()` throws nothing and emits no `onTaskUpdated`. Control: on a live parent with an open subtask it still throws.
   - `execution/execution-coordinator.task-registry.test.ts` (new): a real `TaskService` with the `switchToProfile` stub, a fake node whose `sendTx` switches profile before it resolves. Assert `recordTransaction(hash)`, `markJournal({ stage: "succeeded", txHash })` and the resolved hash. Control: the same run without the switch. A node refusal still rejects with its own error.
   - `transfer-executor.test.ts`: with a real `TaskService` and a `proveAndSend` stub that switches profile and resolves, `execute` resolves with the hash.
   - The cheapest `executeOperations` harness (`service.fence-entry.test.ts` or `service.composition.test.ts`): a broadcasting operation whose registry clears during dispatch returns `{ status: "ok" }`. Control: a non-broadcasting operation cleared the same way still fails.
   - `auth-registry/service.test.ts`: a toggle whose profile switches during its proof wait writes the status row and resolves.
   Gate: `F`.
2. **#662, the bound contract.** Change `execution/spec.ts` (signatures, TSDoc), `execution/service.ts` (validation, `FEE_SETTINGS_OF`, the request, `queuedFeeCapFor`), `execution/operation-planner.ts` (`TransferRequest.tokenContract`, the refusal and its constant), `execution/transfer-executor.ts` (`sequence`, the dep), `execution/transfer-estimate-reuse.ts`, `popup/pages/send.vue` (estimate params, watch, executor dep), `popup/pages/send-submit.ts` (signature, call; the snapshot's `contract` doc says it binds the send). Update every positional call site recon lists, the `TransferRequest` literals in `transfer-estimate-reuse.pins.test.ts` and `transfer-executor.cancel-window.pins.test.ts`, and the composition token mocks.
   Tests:
   - `operation-planner.test.ts`: a row whose contract differs is refused before anything is encoded. Control: the same contract in another letter case builds.
   - `transfer-estimate-reuse.test.ts`: an entry for another contract is an input-drift miss.
   - `transfer-executor.test.ts`, beside "its sponsor row re-pointed while it waits", with the real `OperationPlanner` over a stub token service: a send queued behind a held send, whose row takes another contract during the wait, rejects with `JournaledRejection`; `buildAndEstimate` and `proveAndSend` are never called; the slot is released. Control: an unchanged row proves. One more: a reuse hit after the swap sends the approved build under the approved contract's keys.
   - One boundary test: a malformed `tokenContract` is refused by both entry points with `InvalidWalletArgumentsError`.
   - `send-submit.test.ts`: the snapshot's contract reaches `executeTransfer`.
   Gate: `F`.
3. **#664, wait, verify, prune.** Change `auth-registry/service.ts` per D3; `syncAuthwit`'s "wedged" comment states what its `pending` skip now guards.
   Tests (`auth-registry/service.test.ts`):
   - A `pending` row's revoke sends only after its grant's receipt reads Proposed (receipt Pending first). Control: a non-pending row reads no receipt.
   - Refused before any send: a `pending` row with no `txHash`; a grant still Dropped when polling stops; a grant whose every read rejects (fake timers).
   - After the proof: a hash still authorized fails and keeps its row. Control: not authorized deletes the row, `pending` included, when its grant's block is at or below `R`.
   - A `pending` row whose grant's re-read receipt is above `R`, Dropped, or a rejected read is kept and the revoke fails (one parameterized test).
   - `reconcileAuthwits` clearing `pending` between the read and the lock still lets the delete land. Never: a row replaced under the same id with another `txHash` between the read and the lock is not deleted.
   - A profile switch during the proof wait (real `TaskService`): the revoke prunes and resolves.
   - Existing revoke tests keep their assertions; their log gains the receipt read where a row is `pending`.
   Gate: `F`.
4. **Arc gate.** Run `bun run test:all`. Run the smoke specs that open Send: `cd apps/extension && bun run test:e2e -- tests/e2e/send-keyboard.test.ts tests/e2e/send-fee-privacy.test.ts tests/e2e/legal-acceptance.test.ts --retry=0`. Then, with load1 below 150, one at a time: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/authwit-lifecycle.test.ts`, and the same for `tests/e2e/network/transfers.test.ts`. No e2e scenario is added or changed; record both wall-clocks in `lessons/phase-4.md`. Pass: all exit 0 at retry 0. A red: one rerun only when the failure matches an open flake issue; otherwise a fix.

## Delivery

One arc, one PR, base `dev`, branch `worktree-execution-integrity-1`, no stack. Open it only after phase 4 and the review loop converge. Title (85 characters): `fix(execution): bind transfers to their token, record every broadcast, verify revokes`. Body: what changed and why per issue, the gate runs with outcomes, `Closes #662`, `Closes #664`, `Closes #669`. Open without labels; add `e2e:extension-network` or `e2e:extension-smoke` only if a lane's path filter skipped it. Parallel lanes: none.

## Panel record

**Round 1** (Codex gpt-6.1-sol high: `reject`; Opus Plan leg: `conditional approve`). Every claim below was checked against the tree.

| Point | From | Disposition |
|---|---|---|
| Inert-everywhere settles let an estimate whose profile switched in its last simulation stash a signed build under the new profile | Codex (blocker) | **Accepted.** D1 narrowed to code past a broadcast (`completeIfTracked`). The stash's profile binding is older than this lane and is filed at close-out (below). |
| `waitForTx` returning is not inclusion: Dropped, untracked or restored hashes return at once, and a later-landing grant leaves an untracked authorization | both (blocker / major) | **Accepted.** D3 reads the grant's receipt from the network's node, and prunes a `pending` row only on a grant block at or below the revoke's block. |
| Post-broadcast `startSubtask` in the revoke and toggle tails still throws after a switch | both (major) | **Accepted.** Those tails start no subtask; they end with `completeIfTracked()`. The Opus fix (orphaned `startSubtask` returns an orphan) is not taken, for the estimate reason above. |
| Sequencing keys and reuse used different token identities | Codex (major) | **Accepted.** The request's contract is the one identity for keys, fee history, reuse and build. |
| A shared address comparator exists (`sameFieldAddress`); `isValidAztecAddress` is a note-recipient check | both (minor / nit) | **Accepted.** `isFieldAddress` / `fieldAddressKey` / `sameFieldAddress`; recon corrected. |
| Concurrent `reconcileAuthwits` blocks the delete | Opus (minor) | **Accepted**, with a test. |
| Sequential grant waits could reach 28 × 120 s | Opus (minor) | **Accepted.** One deadline over all grants. |
| Keep `fail`'s cause-attach | Opus (minor) | **Accepted** (D1 no longer touches `fail`). |
| Send's estimate watch keys on the token id only | Opus (minor) | **Accepted.** |
| A refused send's journal card resolves `tokenId`, so it can show the new row's symbol | Opus (minor) | **Known limit**, filed at close-out: fixing it persists the contract in the journal row. |
| A proof wait that compares block numbers, not hashes, can pass on a pruned branch | Codex (minor) | **Known limit**, filed at close-out; D3's storage read still fails a revoke that is not applied. |
| Finality waits or automatic re-revokes | Codex (ask) | **Not taken**: outside the visible budget; no ask needed while the plan stays at inclusion. |
| Change-map gaps, Outcome wording, the rerun rule | Opus (nit) | **Accepted.** |

**Round 2** (fresh Codex pass, gpt-6.1-sol high: `conditional approve (with conditions: dispose the D3 grant-provenance gaps and correct its deadline contract)`).

| Point | Disposition |
|---|---|
| A restored row's `pending`/`txHash` are trusted provenance; a crafted row can skip the wait | **Known limit** (KL3); the Security section now states the trust. |
| "One 120 s deadline" did not bound a retrying receipt read | **Accepted.** Single-attempt reads; the bound is stated as 120 s plus one read. |
| A repeated grant of a tracked hash keeps the first grant's row, so the revoke does not wait for the second | **Known limit** (KL3). Closing it means tracking every grant per hash (new persisted shape) or reversing the wallet-send line rule (see D3, not taken). |
| The delete's identity check should include `txHash` | **Accepted**, with a replacement-row test. |
| Qualify I2 | **Accepted.** |

Verdict after the fixes (same session, resumed): `approve`, with two minor notes, both accepted: a rejected post-proof re-read joins the retention test, and `awaitGrantBlocks` checks every `txHash` before it starts a poll and returns only after every poll ends.

**Close-out items** (filed by the implementer, deduplicated first; each a closed `known-limit` issue unless named otherwise):
- KL1: a refused send's journal card resolves `tokenId`, so it can show the new row's symbol. Reopen if the journal row comes to carry the contract, or on a user report.
- KL2: the revoke's proof wait compares block numbers, not block hashes, so a prune that replaces the revoke's block can pass it; the post-proof storage read still fails a revoke that is not applied. Reopen on a prune observed on Testnet or Mainnet, or a user report.
- KL3: a revoke waits only for the grant its row records. A second grant of the same hash that the row does not name (a repeated grant while the first is tracked, a grant sent from another install of the account, or a crafted restored row) can land after the revoke. Reopen if the index starts to track more than one grant per hash, or on a user report.
- An open issue (not a known limit): an estimate stashes its build under the active profile read after the build rather than under its fence's (F7). Trace it first; label it from the traced path.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard, read at 13d5f8d0. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2 runs once over the net diff from 13d5f8d0, after phase 4: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh <session> <followup> <codex-dir> high`. Hard stop after three rounds with material points; then report.
- Step 3: `gh pr create --base dev` with the title and body above; `gh pr checks <n> --watch`.
- Step 4: close-out as the PR's final commits (slug `execution-integrity-1`, trunk `dev`), including the close-out items above.
- Step 5: teardown after the merge with `agent-worktree done execution-integrity-1 --merged`. The lane is headless: the orchestrator notices the merge.

## Seeds

Draft until approval. Recommended: `/goal`.

```
/goal Phases 1-4 of implementations-plan/execution-integrity-1/plan.md are marked ✓, each backed by its validation gate passing in the transcript and LESSONS_FILE=implementations-plan/execution-integrity-1/lessons/phase-N.md printed; the Codex review loop (gpt-6.1-sol, high) converged on the net diff from 13d5f8d0, quoted; one PR against dev exists with Closes #662 #664 #669, opened only after that; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/execution-integrity-1 forward per its plan.md: reality check (plan, lessons, git status, PR checks), take the next pending phase, run its gate, mark ✓ only on a green gate, settle decisions with Codex (gpt-6.1-sol, high), stop after 5 failures on one step, never merge.
```
