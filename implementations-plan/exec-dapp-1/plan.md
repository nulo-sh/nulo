---
plan: exec-dapp-1
tier: light
status: arc 1 implemented; Codex fix loop converged (R3 clean); PR next
issues: "#1425, #1427, #1428"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high review round trip + Opus Plan leg
base: origin/dev at 51ea220b1
trunk: dev
post_implementation_hardening: not scheduled
---

# exec-dapp-1: the standard dApp send honours its wait, its additional scopes and its capsule scopes

Three places where the wallet's dApp send drifts from what the dApp asked: the wait mode (#1425), the additional scopes at estimate and discovery (#1427), and a capsule's scope (#1428). One arc, one PR. Recon: [recon.md](recon.md). Every issue claim holds at `51ea220b1`, with one correction: the playground comment at `apps/playground/src/sections/transactions.ts:144-150` says a waiting send blocked on mining; the wallet has read the receipt once since the first commit.

## Outcome & Quality Bar

- **For whom**: a dApp built on `@aztec-labs/wallet-sdk` that awaits `send()`, reads a second approved account's notes, or passes a scoped capsule.
- **Excellent**: (1) the wallet waits as upstream `BaseWallet.sendTx` does for the same options: the transaction hash for `NO_WAIT`, else a receipt that reached the requested status; where upstream throws, the dApp gets a failed request carrying the wallet's constant text for an unclassified error (`wallet-sdk/error-envelope.ts:198-214`), never the node's text; (2) discovery, sizing and proving of one send run under one scope set, and the build carries the capsule the dApp sent; (3) no working flow's screen changes; the flows these fixes unblock show what the wallet's existing logic shows for them.

## Assumptions

**Facts**
- F1. Both send paths read the receipt once after `proveAndSend` and return it (`execution/dapp-send-executor.ts:1146-1150`, `:1327-1331`); the existing pin asserts one read (`dapp-send-executor.test.ts:598-623`).
- F2. Upstream waits with `waitForTx(node, txHash, { ...callerWaitOpts, initialDelay })` for every wait but `NO_WAIT` (wallet-sdk `base_wallet.ts:541-559`); `waitForTx` throws on dropped, reverted (unless `dontThrowOnRevert`) and timeout, and `timeout: 0` means no deadline (aztec.js `src/utils/node.ts`).
- F3. `runInSlot`'s `finally` frees the execution slot and the origin's place (`dapp-send-executor.ts:404-418`); its `catch` marks the journal failed (`:403`); `proveAndSend` marks it `succeeded` after the send (`execution-coordinator.ts:356`).
- F4. The approval window detaches at approve (`dapp-interaction/service.ts:300-310`); dApp `ExecuteOperation` tasks are never surfaced on Home (`RecentActivityView.vue` `isExecutingTask`).
- F5. Every fee strategy simulates with `[account]` (`fee/fee-strategy.ts:201,208` and their nine callers), and so does classic discovery (`authwit-discoverer.ts:127`); proving uses `[account, ...additionalScopes]` (`dapp-send-executor.ts:1121`). The bridge admits only session accounts there (`packages/wallet-bridge/src/scope-enforcement.ts:80`).
- F6. `opts` already reaches every build at run time: the estimator and the strategy dispatcher spread the operation (`discovery-aware-estimator.ts:117`, `execution/service.ts:1432`, `:502-513`).
- F7. `newCapsule` drops `action.scope` (`tx-request-builder.ts:537-539`); the planner keeps it (`operation-planner.ts:189`); stdlib's `Capsule` takes it fourth.
- F8. An estimate is reused only inside its own interaction: the preview snapshot binds interaction, index and fingerprint (`dapp-send-executor.ts:653-661`).

**Inferences**
- I1. A pending receipt reaches dApps today; upstream never returns one (F1, F2).
- I2. The PXE filters notes by scope, so an estimate under `[A]` misses B's note and the send fails before approval completes (#1427's verified path; not reproduced against a PXE, which no cheaper layer runs).
- I3. No shipped contract reads a dApp-supplied scoped capsule (recon), so #1428 has no e2e path. (aztec-nr's own internals do read scoped capsules; Security.)
- I4. Discovery decodes every authorization request and the build signs each as the sender (`decode-authwit-effects.ts` ignores `onBehalfOf`; `tx-request-builder.ts:166-172`). Once #1427 lets a send carrying another approved account's witness estimate, its window lists that request ("Lets B move 1 from A to X", `SendTxSummary.vue:121-126`) and the build adds a redundant witness signed as the sender; the PXE uses the dApp's, the first for that hash. The witness itself renders nowhere; for a recognised token transfer the call line already reads "1 from A to X" (`SendTxSummary.vue:85-90`).

**Asks**
- A1. [OWNER-ASKS.md](OWNER-ASKS.md) OA-1: should the window keep that line (I4), and the build its redundant signature? [Working assumption: arc 1 ships today's discovery unchanged and captures the window; arc 1 is the same under either answer.]

## Architecture & Implementation

- **#1425 cause and change.** The wait runs inside the slot as one read. Both slot bodies return the submission `{ txHash, offchainOutput, node }`; `executeAztecSendTx` then calls one private helper, after `runInSlot` resolves: `NO_WAIT` returns `{ txHash, ...offchainOutput }`; otherwise `waitForTx(node, txHash, opts)` with the dApp's object, `initialDelay` defaulting to the interval as upstream does, `wait: null` read as omitted, and `interval` clamped to [1 s, 60 s]. Below 1 s the poll is a tight loop; above about 24.8 days `setTimeout` fires at once; and `retryUntil` sleeps a whole interval before it checks the deadline, so the ceiling keeps a dApp's own `timeout` honoured within 60 s. `waitForStatus` is outside the wire schema and arrives raw, as upstream gets it; an unknown value only ends the wait at the first non-pending receipt. Released before the wait: the execution slot, the origin's lane place, the session baton, the journal controller; a revert or timeout stays outside `runInSlot`'s `catch`, so the `succeeded` journal row stands. Held until the wait settles: the operation task (off Home, F4), the interaction's approved payload and preview claim, and one of the transport session's 32 admission places (`wallet-sdk/background.ts:599-606`). A failed wait logs through the existing `executeOperations … failed` line at `error` (D9), as a fixed category: timed out, or failed (D14). A profile switch during the wait makes the task's `fail` throw, as it does for a failure during the prove: an existing class, with the session already gone.
- **#1427 cause and change.** The builds know the account but not the additional scopes. `buildStandard`'s op type gains `opts?: { additionalScopes?: unknown }`; it returns `scopes`: the account, then each additional scope once by canonical hex, from one module helper `sendScopes(account, additionalScopes)` in `tx-request-builder.ts`. `probedFirstSimOpts`, `validatedSimOpts` (now taking the scope list), the nine strategy calls, classic discovery (its stub list stays the account), `view-executor.ts:362` and the dApp prove read `built.scopes`; the reused-estimate branch calls the same helper. The op types of `FeeStrategyContext`, `buildAndEstimateTxRequest`, `discoverPrivateAuthwits` and `buildForDiscovery` gain the same optional field, so F6's run-time carry is typed; `buildForDiscovery`'s projection and the discoverer's build type forward `scopes`; `BuiltNoFromTx` omits it (NO_FROM keeps its own sets).
- **#1428 change.** `newCapsule` passes `action.scope === undefined ? undefined : AztecAddress.fromStringUnsafe(action.scope)` (D11).
- **Change map.** `execution/dapp-send-executor.ts`, `execution/tx-request-builder.ts`, `execution/fee/fee-strategy.ts`, `fee/{fee-juice,fee-juice-with-claim,embedded,fpc}-strategy.ts`, `execution/authwit-discoverer.ts`, `execution/discovery-aware-estimator.ts` (type), `execution/service.ts` (types, `buildForDiscovery`), `execution/view-executor.ts`; `apps/playground/src/sections/transactions.ts` (two buttons, the stale comment); tests below.
- **Not taken** (ledger): waiting inside the slot or in the bridge (D1); clamping `timeout` (D2); the scope set on the context (D3); scopes in the fingerprint (D4); an e2e for #1428 (D6); a discovery filter on `onBehalfOf` (D10).

## UI impact

No working flow changes: the approval window closes at approve (F4), dApp tasks stay off Home, and no code of a screen changes. One flow #1427 unblocks reaches the execute window for the first time: before, an estimate error; after, the approval with the discovered line of I4, from today's logic. The PR body carries that before/after capture; OA-1 asks the owner about the line. The test playground (`apps/playground`, never shipped, driven only by e2e) gains two buttons (D7). The owner approved the lane on decision page 94 (P94-01, signed 2026-11-01), under the rule of 2026-10-30: "if they are bugs, work on them. all of them sound very worth fixing. Merge those on green, I review the captures if needed." The PR body quotes both.

## Security & Adversarial Considerations

- **Wait options are dApp input.** The bridge checks their types only (recon). An `interval` below 1 s, or above the timer range (it wraps to an immediate fire), would make the wallet poll the node in a tight loop; the clamp bounds the poll to one public receipt read per second at most. `timeout: 0` keeps upstream's meaning. With it, a receipt that never qualifies (a dropped transaction under a long `ignoreDroppedReceiptsFor`) holds what the wait holds (Architecture) until the service worker stops, after a disconnect too: the dApp spends its own admission place and a 1 Hz public read. Known limit, filed closed at close-out; cancelling a wait on disconnect adds a lifecycle, which this lane does not take.
- **Error text.** A wait failure crosses to the dApp through the error envelope's constant; no receipt, node or revert text reaches it. Typing those failures would be a new public error contract, not taken.
- **Scopes.** Estimate and discovery now read what proving already read: the session accounts the bridge admitted (F5). No new account becomes readable.
- **Capsule scope.** The dApp supplies the data and the scope, and upstream `BaseWallet` passes both. A dApp capsule at the same contract, slot and scope shadows what aztec-nr's internals load there during private execution (`@aztec-labs/pxe` `capsule_service.ts:44-51`); utility runs get no dApp capsules, and the PXE refuses a scope outside the send's own. Exploitability unknown, as upstream; today's zero scope already lets a dApp shadow unscoped loads.
- **One broadcast line.** `sendTxTask` is untouched; the wait follows `proveAndSend`, so nothing enters between `assertLive()` and `node.sendTx` (`legal/call-sites.test.ts` stays green unedited).
- **Logging.** No new log line. A failed wait now reaches the existing `error` line (D9) as a fixed category, never upstream's message, which quotes the transaction hash and the node's reason (D14). Crypto, supply chain, permissions: no change; no wallet-sdk change.

## Phase 1: the wallet honours the three fields ✓

- Change the wallet as in Architecture.
- **Tests** (each red at the base, green after):
  - `dapp-send-executor.test.ts`: the existing wait pin becomes: a fake node answering `pending` then `checkpointed` (real `TxReceipt` objects, fake timers) → the dApp gets the checkpointed receipt; the slot is released before the first receipt read; NO_FROM the same; a reverted receipt rejects and leaves the journal `succeeded`; `interval: 0` polls at 1 s and `interval: 4294967.296` at 60 s, never at once; `wait: null` waits as omitted; never-happens: `NO_WAIT` reads no receipt. The proving pin asserts `built.scopes`, for a fresh build and for a reused estimate.
  - `tx-request-builder.pins.test.ts`: `scopes` is `[account, B]` for `additionalScopes: [B, B, account]` and `[account]` without opts; a capsule with `scope` carries it; one without carries none.
  - `fee/strategies-structural.test.ts`: every simulate of all four strategies, probed and validated, receives the build's `scopes`.
  - `authwit-discoverer.test.ts`: discovery simulates under the build's scopes and stubs only the account.
- **Validation gate.**
  - `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`: exit 0.
  - `cd apps/extension && bun --bun vitest run src/wallet/services/execution --retry=0`: green; the new cases red with the base SHA's sources.
  - `cd packages/wallet-bridge && bun run test`: green (unchanged package, lane gate).

## Phase 2: the playground exercises the fields; two e2e scenarios ✓

- Playground (generic, wallet-sdk only): `pg-btn-sendTx-wait` sends the default transfer with `wait` omitted; `pg-btn-sendTx-onBehalf` asks `createAuthWit` of the owner (`pg-input-authwitOwner`) for `transfer_private_to_private(owner, recipient, amount, nonce)` with the sender as caller, then sends from the sender with that witness and `additionalScopes: [owner]`. Rewrite the stale comment to say why the other buttons pass `NO_WAIT` (popup-shape tests).
- New `apps/extension/tests/e2e/network/tx-sendTx-fields.test.ts`, one scenario in two labelled steps on fixture `dappConnectedExtensionWithFirstTwoAccountsCap` (A first, B second); first mint public and private tokens to A (as `account-switch-isolation.test.ts` delivers a private note; no sender registration, `receive-unregistered.test.ts`):
  - **Step wait** (#1425): A sends the default transfer through `pg-btn-sendTx-wait`; approve; assert `receipt.status` in `checkpointed|proven|finalized` and a successful execution. Failure mode: the receipt's trip back through the wallet-sdk channel and the real node's statuses, which no cheaper layer runs; the deterministic pending→checkpointed proof is the unit test (a real node can, rarely, answer checkpointed at the first read). The send also initializes A: its `verify_private_authwit` reads the constructor's signing-key note, and the vendored artifact gives it no `abi_noinitcheck` (Codex R1, Opus R1). Continue only on a successful execution.
  - **Step additional scope** (#1427): `pg-btn-sendTx-onBehalf` with owner A and sender B (`pg-input-from`), so B's first send wraps its own deployment; approve A's signing window (the fixture's grant leaves consent Off), capture the execute window, approve it; assert the result is ok with a hash. Failure mode: a real PXE missing A's note at a simulate the unit tests do not enumerate. The pre-attached witness takes the classic discovery route; the folded route is pinned by the strategy test only.
  - Estimate 120-150 s per browser, against two separate scenarios' ~190 s (the fixture and A's initialization are shared).
  - No scenario for #1428 (I3, D6).
- **Validation gate.**
  - `cd apps/playground && bun test`: green; `bun run typecheck:all`, `bun run lint`: exit 0.
  - From the root, Chrome then `NULO_E2E_BROWSER=firefox`: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/tx-sendTx-fields.test.ts tests/e2e/network/tx-sendTx-noFrom.test.ts tests/e2e/network/tx-sendTx-sponsoredFpc.test.ts tests/e2e/network/tx-sendTx-delegated-authwit.test.ts tests/e2e/network/multi-account-from.test.ts --retry=0`: pass. With one fix's Phase 1 sources reverted at a time, its step fails: the wait step reads a pending receipt; the additional-scope step fails at estimate (the before capture). Record the scenario's measured time per browser.
  - `bun run check:plans` after staging: exit 0.

## Decision ledger

- D1. The wait runs after `runInSlot`, inside the operation task (F3, F4). Inside the slot it holds the execution slot and an origin place for minutes, and a revert would reach the journal's failure path. The bridge dispatcher has no node and would need a new port method for one caller.
- D2. Upstream parity for the options, plus the interval clamp: Codex R1 found the timer overflow, Opus R1 the 60 s ceiling (the deadline is checked only after each sleep). Clamped, not refused: no real dApp passes such a value, and a refusal would fail a schema-valid call. No timeout clamp: it would break a dApp that waits for `proven` on a slow network; `timeout: 0` held forever is a known limit (Security).
- D3. The scope set lives on the build: `validatedSimOpts` already says its scope must match the simulated build, and the build resolves the account. A context field could disagree with the build's account.
- D4. No fingerprint change: an estimate is reused only inside its interaction (F8), so its scopes cannot differ from the send's.
- D5. B-11 (a call whose static flag disagrees with the contract) is out: these fixes do not touch the fingerprint's normalisation.
- D6. #1428 gets unit proof only: no contract reads a scoped capsule, and adding one needs a Noir toolchain and a vendored artifact, which is outside the lane. #1428's PR comment records this.
- D7. The playground is test infrastructure no person sees: not shipped, driven only by e2e, and the lane brief asks for its scenarios. Its two buttons are no UI change (Codex R1 asked for owner sign-off; rejected on these grounds).
- D8. One e2e scenario in two steps, not two scenarios: the owner's initialization is the wait step's send, and the fixture runs once (Codex R1; Opus R1 the owner/sender order).
- D9. A failed wait logs at `error`, as any failed send does. Opus R1 offered `debug`; each failure costs an approved or self-funded send, and routing it lower needs a new error class for one caller.
- D10. No discovery change in arc 1. Opus R1 proposed skipping hashes the request already witnesses; filtering on `onBehalfOf` is the cause-level form. Either changes which rows the window shows (I4), and for NO_FROM a row that can show today: the owner's call (OA-1). Codex R2: the redundant signature has no security or correctness consequence, so #1427 is complete without it.
- D11. The capsule's scope parses with `AztecAddress.fromStringUnsafe`, as its contract beside it does: 6.0.0 has no `AztecAddress.fromString`. The planner parsed it through `Capsule.schema` first, so the string is a canonical address.
- D12. The network gate runs with `NULO_E2E_PROVERLESS=1`: the agent's guard refuses `tx-sendTx-noFrom` without it, and CI runs the new file in its proverless shard pool. The new scenario also passed once prover-ON on Chrome.
- D13. The playground binds its named sends (`sendTx-wait`, `sendTx-onBehalf`, `sendTx-appSponsored`) from one table, so `bindTransactions` stays within the 80-line budget. No suppression is added.
- D14. A failed wait rethrows as a fixed category ("The dApp's wait for its receipt timed out", for foundation's `TimeoutError`, or "… failed"). Upstream's message quotes the transaction hash and the node's reason, and the failure line reaches every user's log at `error`. The logging-policy skill says a `txHash` links private activity, and a message quoting such input is logged as a category. Found by the Opus review. The dApp's text is unchanged: the error envelope's constant.
- D15. The first three fix-loop prompts carried the program's panel rules, not the standard's two verbatim rules (bugs and small fixes only; the comment audit). A corrective resumed pass with the two rules and the standard's adversarial ask audited the comments: the accepted edits tighten or delete comments in the arc's diff, with no functional change. Two pre-existing comment sentences the arc did not write stay as they were.

## Panel verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex R1 | conditional approve | timer-overflow clamp; owner initialized first; the error envelope's constant; what the wait holds; one scenario; classic route stated | owner sign-off for the playground buttons (D7) |
| Codex R2 (final, resumed) | approve | the call line already shows the transfer from A (I4, OA-1 qualified); continue only on a successful first receipt | `verify_private_authwit` has `noinitcheck` (the vendored artifact lists `abi_private`, `abi_view` only) |
| Opus R1 | conditional approve | owner/sender order; 60 s ceiling and `wait: null`; error-level logging stated; held resources; F3 lines; scope forwarding in discovery and NO_FROM types; reused-estimate pin; capsule shadowing in Security; I4 to the owner | `debug` logging (D9); a discovery filter in arc 1 (D10, OA-1) |

## Audit verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex fix R1 | clean | n/a | n/a |
| Opus review (beside R1) | one medium, one low | a failed wait's log line carried the hash and the node's reason (D14); the scope list now forms before the build's task completes | none |
| Codex fix R2 (resumed) | one finding | D14 verified: the category reaches `task.fail`, the failure log and the dApp, with no cause kept, and the `TimeoutError` identity holds in the bundle | the retrying node client's own retry logging of a node's error text: known limit #432, the owner's option B of 2026-10-15, unchanged by the wait |
| Codex fix R3 (resumed) | clean | "Checked #432's owner decision, the unchanged arc, and existing receipt polling: the wait adds reads without widening the accepted data exposure or log levels. No new material point; high confidence." | n/a |
| Codex corrective pass (resumed; the standard's two rules, D15) | comment findings only | precise wording on `dappWaitOpts`, the receipt helper, the faked clocks, `sendScopes`, the discoverer and `validatedSimOpts`; comments that restated code deleted; the e2e header trimmed to its constraints | rewriting comments the arc did not write |

## Delivery

- One arc: branch `worktree-exec-dapp-1`, one PR to `dev` with `gh pr create` after the Codex loop converges and the gates pass, no labels at creation; add `e2e:extension-network` afterwards only if the path filter skips the network lanes.
  - Title: `fix(execution): a dapp send waits as asked and keeps its additional and capsule scopes` (86 characters; `dapp` lower-case for commitlint's `subject-case`).
  - Body: the change and why, the gates with outcomes, each browser's network suite wall-clock before and after (the e2e-testing skill's job-envelope method), the two scenarios' measured times, the owner quotes, `Closes #1425`, `Closes #1427`, `Closes #1428`.
- Close-out: the PR's final commits (README portable rule 5), moving this folder to `archive/exec-dapp-1/`.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `51ea220b1`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2, once over the arc's diff from `51ea220b1`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; both verbatim rules and the adversarial ask in every prompt; one Opus `general-purpose` review beside round 1; hard stop at three rounds.
- Steps 3 and 4 as written. Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/exec-dapp-1/plan.md`, then `agent-worktree done exec-dapp-1 --merged`; the orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Both phases ✓ in implementations-plan/exec-dapp-1/plan.md, each gate passing in the transcript; the Codex loop converged on the arc's diff (a resumed pass with no new material point, quoted); a ready PR to dev with the close-out commits; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/exec-dapp-1 from plan.md and lessons/: the next unchecked phase, its gate, the Codex loop, delivery, close-out; never merge.
