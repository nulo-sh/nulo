---
plan: authwits-2
tier: mid (thinned: one Codex round on the plan, no Opus leg; one Codex pass over arc 1's net diff)
status: arc 1 merged (#1832); arc 2 open (#1853); arc 3 in progress
issues: "arc 1 closed #1829 and #1830; arcs 2 and 3 close none"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high, read-only
base: origin/dev at 0dc22a9c5
trunk: dev
post_implementation_hardening: not scheduled
---

# authwits-2: the Authwits page's revoke flow, what an imported wallet can recover, and naming what an authwit allows

The owner reviewed Settings → Developer → Account state → Authwits on 2026-11-17: "Revoke Authwit takes forever to load the fee. Are we missing optimizations?"; "the way the tx is sent (simulating, generating proof) and the status is shown differs from everything else in the app. It kept loading forever and I'm not sure it revoked. Check the behaviour and improve the tests."; "an imported wallet does not detect authwits. Should we add a check against the authwit registry on account initiation?"; "now that smart contract verification works, should we parse authwits?". This plan answers each with facts (Q1 to Q5 below), fixes the two demonstrated defects in arc 1, and leaves every visible change to the owner (`OWNER-ASKS.md`).

## Findings

Measured on the sandbox through `e2e:agent`, proverless, retry 0, at the base, Chrome and Firefox, with a throwaway probe (kept outside the repo). Times are from the popup's first frame.

| | Chrome | Firefox |
|---|---|---|
| First fee figure, 1 / 3 / 12 authwits | 1.07 / 1.05 / 1.74 s | 1.16 / 1.41 / 1.69 s |
| Figure after a fee-method change, 1 / 3 / 12 | 0.86 / 0.84 / 1.09 s | 1.06 / 1.00 / 1.27 s |
| Repeated estimates in the next 20 s | 0 | 0 |
| Revoke of 1, Confirm to success toast | 4.7 s | 4.7 s |
| Revoke of 12 (one chunk), Confirm to toast | 4.8 s | 5.3 s |
| Blank stage line after "Submitting..." or the proof | 3.5 s / 2.8 s | 3.3 s / 3.0 s |

Every revoke left the registry reading unauthorized for each hash and the page with no rows; the journal held one `succeeded` record per send.

### Q1, the slow estimate: not reproduced; no local fix shown

- **Trace.** `RevokeAuthwitsPopup` estimates each chunk through `useWalletTxEstimates` → `estimateRevokeFee` → `ExecutionService.estimateSendTransactionFee` → `DappSendExecutor.estimateOperationFee`: one build, one stubbed simulation that doubles as authwit discovery (`fj` and the sponsored FPC; a private FPC takes two), the sponsor, payer and Fee Juice reads, and the fee-cap read. A fee-settings change re-runs that once, after 500 ms. That is the same pipeline a dApp send's estimate runs.
- **Sandbox.** 1 to 1.7 s whatever the count; no repeated estimate. The 12-call transaction adds about 0.6 s.
- **What Send does differently.** (a) Its estimate answers "queued" while a send holds the account's slot; the revoke's estimate takes no slot, so behind a proof it waits until the proof ends or its 60 s request deadline. (b) Its confirm reuses the estimate's built request; the revoke's confirm builds and simulates again (`send_transaction` is carved out of reuse, `execution/service.ts:241-254`). (b) costs time after Confirm, not before the figure.
- **Testnet.** A send estimate measured 2.3 to 2.7 s there (`implementations-plan/archive/pxe-flag-1/recon.md`), and a first PXE sync over four funded tokens 21.8 s. A cold sync or an estimate queued behind a proof are the plausible causes of "forever"; neither was run here (Testnet is out of bounds).
- **Disposition.** Plausible but unverified; both fixes change what the fee card shows (a queued row) or widen a cache's scope, so neither is local. A known limit at close-out; reopening condition: a timed reproduction on Testnet or a user report.

### Q2, the stuck status: two demonstrated defects

**#1829, a landed revoke or registry change reports failure on Testnet and Mainnet** (demonstrated by code trace and the 6.0.0 network constants).
- Initial conditions: Testnet or Mainnet (`@aztec-labs/cli` `testnetConfig`/`mainnetConfig`: 32 slots × 72 s per epoch; an epoch's proof may land until one epoch after it ends, a submission window).
- Actions and order: Confirm → proof → send → `transactionService.waitForTx` (until mined, ≤ 120 s) → `waitForTxProven` polls `getChainTips().proven` until it passes the tx's block, ≤ 120 s (`service.ts:521-531`) → `verifyRevoked` prunes rows (`setRegistryEnabled`: `applyStatus` stores the flag).
- Invariant broken: the outcome shown is the chain's. Under full-epoch proving, the prover's default, the proven tip passes a block only after its epoch (up to 38.4 min) ends and its proof lands, so the wait times out in the ordinary case and throws `waitForTxProven: … not proven within 120000ms` after the transaction mined. (The rollup also accepts a partial-epoch proof, which a prover makes only on request: `prover-node` `proverNodeDisableFullEpochProving`.)
- Consequence: two to four minutes of a moving line with no words, then "Failed to revoke authwit(s)"; the rows stay (nothing else prunes them: `syncRegistry` has no caller); a retry pays again and fails again; the registry popup reports failure and the stored flag keeps the old value, so the page shows the old state. Activity meanwhile shows the transaction confirmed.
- Cause: the wait's premise. Its comment says the sequencer runs public calls against proven state; in 6.0.0 the sequencer forks world state at its synced block, the proposed tip (`sequencer-client` `sequencer.js` `checkSync`: `worldState.hash === l2Tips.proposed.hash`). A consume after the revoke fails once the revoke is in a block. The wait was added when the registry slots were read swapped (`wallet/utils/auth-registry.ts:3-10`), which made a fast consume look like a race.
- The sandbox cannot show it: its automine settler proves every block at once.

**#1830, closing an authwit popup while it sends reports an outcome it never saw, and the revoke popup then sends its next chunk** (demonstrated by code trace; arc 1's tests reproduce it).
- Actions and order: Revoke (or the registry switch) → the person closes the popup (X, Escape or a tap outside, none blocked while sending) → `onHide` empties the chunk list and calls `authwitsService.disconnect()` → the pending request rejects with the disconnect error, while the worker finishes the send.
- Revoke: the loop marks the old chunk object `error` and goes on over the old list; with two or more chunks (29 or more authwits) the next `revokeAuthwits` reopens the port (`client.ts:209-213`), so the worker sends another transaction after the popup closed. The summary then reads the emptied list, finds no error, toasts "Authwit(s) successfully revoked" and emits close (`RevokeAuthwitsPopup.vue:105-117`, `:155-164`).
- Switch: the catch toasts "Failed to change registry status".
- A reopen and a second Revoke while the first run is held is worse: the first run's `finally` clears the second run's latch and stage line, and its summary reads the second run's chunks.
- Invariant broken: a popup reports only an outcome it saw, and starts no send after it closed. Consequence: a success shown for a revoke the popup never saw end (it can still fail in the worker), a failure shown for a switch that may land ("I'm not sure it revoked"), and an unseen send.

**Other paths checked.** "Three authwits, two chunks" does not hold: 28 fit one transaction (`spec.ts:18`). A cancel mid-proof needs a second wallet window (the Cancel control is on Home's Activity, under the popup); the chunk loop then goes on to the next chunk: plausible, multi-chunk only, recorded as a known limit at close-out. A worker restart rejects the request as a disconnect: the popup reports failure, the journal's interrupted record tells the truth, and a landed revoke's rows stay until a re-revoke prunes them (plausible, not run). A node drop during the waits throws from the same tail as #1829 and shrinks with its fix. A failed estimate keeps Revoke off (pinned by `RevokeAuthwitsPopup.test.ts`).

### Q3, the status shape: an owner pick (OA-1), frames captured

Prototype commits on the local branch `proto/authwits-2-status` (never pushed): A, B and C behind a capture switch, so one build photographs all. The code already has most of C.

### Q4, the imported wallet: facts, then a recommendation (OA-3)

Each sentence checked against `@aztec-labs/*` 6.0.0 at the base:
- **True.** Public authorisations live in the AuthRegistry's public storage, `approved_actions: Map<AztecAddress, Map<Field, PublicMutable<bool>>>`, keyed by the approving account, then the message hash; the consumer is only folded into the hash (`noir-contracts.js` `auth_registry_contract-AuthRegistry.json`, source `main.nr`; slot 2 at `wallet/utils/auth-registry.ts:17-18`).
- **True.** They cannot be enumerated from the registry: a map slot is a domain-separated `poseidon2` of the slot and the key (`stdlib` `hash/map_slot.ts`) with no key index, and a revoke writes `false`, which reads as never set.
- **True, narrowed.** A private authwit is an auth witness in the request the PXE simulates; the node's `Tx` carries no witness, so the chain never holds it. The app it was handed to can forward it. A private call can still write the registry (`set_authorized_private`), and that grant then reads like a public one.
- **Partly.** Registry reads alone cannot recover an unknown hash. An indexer could list `set_authorized` calls only from retained transaction bodies (their public calldata) or another source of the hash preimages: the registry emits no event, a block's effects carry the write as a siloed leaf slot and value, and a node archives no mined bodies by default (`p2p` `tx_pool_v2` `archivedTxLimit: 0`).
- **What a check can recover, with no new dependency:** the registry switch, and whether each listed hash is still authorized; `syncRegistry` reads both and has no caller. **What it cannot:** grants made from another install with no backup (a known limit at close-out; reopening: an indexer the owner approves, or a node API that lists a contract's writes by sender).

### Q5, naming what an authwit allows: an owner pick (OA-2), frames captured

A stored row carries the scope, the hash, `pending`, the grant's `txHash` and `content`: for a `call`, the contract, function name, arguments and caller; for an `encoded_call`, the target, selector and arguments; for an `intent`, the consumer and fields; for a `message_hash`, the hash alone. It holds no app, amount or token field. N1 needs nothing more; N2 needs the contract's artifact to place the amount and the token's decimals.

## Assumptions

**Facts** (each verified at the base): the six in `recon.md` § Facts; the Q2 trace above; `TransactionCard` calls a transaction confirmed from its first mined status (`activity/TransactionCard.vue:65-69`); `getChainTips()` returns `checkpointed.block.number` beside `proven` (`stdlib` `block/l2_block_source.d.ts`); the sandbox forces 4-slot epochs and proves at once (`archive/block-time-1/lessons/phase-2.md`).

**Inferences**
- Every tip short of `finalized` can roll back. A checkpoint is undone by an L1 reorg past its L1 block (the archiver handles them), an invalidated checkpoint, or an epoch prune (a missed proof); a proposed block also when its proposer publishes no checkpoint; a proof only by an L1 reorg before L1 finality.
- Testnet timing (`stdlib` timetable, 72 s slots): on the ideal path a checkpoint reaches L1 about 77 s after the earliest receipt in its slot (block 1 at +7 s, publish at +72 s, one L1 slot); the deadline path allows about 137 s. The 120 s bound covers the ideal path only; a late checkpoint fails closed, as today.

**Asks** (none blocks arc 1): OA-1, OA-2 and OA-3 in `OWNER-ASKS.md`.

## Outcome & Quality Bar

- **For whom.** A person in Developer mode who revokes an authwit or switches the registry, on Testnet or Mainnet, and has to trust what the popup says.
- **Excellent.** (1) A revoke or switch whose checkpoint lands on the ideal path reports success within the wait it already has, on every network the wallet serves, and the list matches the chain; a later checkpoint fails closed as today. (2) No popup reports an outcome it did not see; none sends after it closed. (3) Each fix has a test that fails without it, beside a success control.
- **Good enough.** Arc 1 changes no words or layout; the blank wait after the send stays until OA-1.

## Architecture & Implementation (arc 1)

**The wait.** `waitForTxProven` becomes `waitForTxCheckpointed`: the same loop over the same endpoint, reading `getChainTips().checkpointed.block.number`, same 120 s bound and refusal on timeout. Its comment states the invariant: a later transaction's public calls run on the proposed chain, so the revoke binds once in a block; the wallet reports and prunes only once that block is on L1, where an L1 reorg past it, an invalidated checkpoint or an epoch prune can still undo it (a known limit). Both call sites' comments drop the wrong premise. `verifyRevoked`'s `revokeBlock` comparison for pending rows is unchanged.

**The popups.** Each popup reuses `createRunFence` (`composables/runFence.ts`): `begin()` when the handler starts, `invalidate()` in `onHide`. After each await a stale run starts no chunk (its detached chunk object may still take a status no list reads), toasts nothing, writes no `error`, emits no close, and leaves the latch and the stage line to the current run (`onHide` already resets both). `ChangeAuthwitsRegistryPopup.handleChangeRegistry` does the same around its one send. The worker's send runs on and reports in Activity, as Send's does.

**File-level change map**

| File | Change |
|---|---|
| `apps/extension/src/wallet/services/auth-registry/service.ts` | `waitForTxProven` → `waitForTxCheckpointed`; three comments |
| `apps/extension/src/wallet/services/auth-registry/service.test.ts` | one `describe`: the checkpointed wait (see Phase 1) |
| `apps/extension/src/popup/components/popups/RevokeAuthwitsPopup.vue` | run fence in `handleRevokeAuthwits`, `revokeChunks`, `onHide` |
| `apps/extension/src/popup/components/popups/RevokeAuthwitsPopup.test.ts` | one `describe`: a hide while sending, a reopen, and the shown control |
| `apps/extension/src/popup/components/popups/ChangeAuthwitsRegistryPopup.vue` | run fence around `setRegistryEnabled` |
| `apps/extension/src/popup/components/popups/ChangeAuthwitsRegistryPopup.test.ts` | one `describe`: a hide while sending, and its control |

**Trade-offs and alternatives** (decision ledger D1 to D3).

## Phases (arc 1)

### Phase 1: the revoke and the switch wait for the checkpoint (#1829) ✓

1. Rename the wait and read the checkpointed tip. Rewrite the three comments to the invariant above.
2. Add `describe("the revoke and the switch report once their block is checkpointed")` in `service.test.ts`, with a node fake whose receipt names block 5 and whose tips read `checkpointed` 5 and `proven` 1, timers faked:
   - a revoke resolves and prunes its row; a switch resolves and stores the chain's flag (both fail at the base: they throw after 120 s);
   - the transition: `checkpointed` reads 4, then 5 after three polls; each resolves then, not before;
   - control: `checkpointed` stays at 4; after 120 s each rejects with the timeout, the row stays, the flag is untouched, and no registry read runs.
3. Validation gate:
   - Commands: `bun run lint`, `bun run typecheck:all`, `bun run --cwd apps/extension test src/wallet/services/auth-registry/`.
   - Pass: exit 0; the new cases fail on the base copy of `service.ts` (taken with `git show 0dc22a9c5:<path>`).
   - Layers: lint, typecheck, unit.

### Phase 2: a popup's close ends its own follow (#1830) ✓

1. Add the run fence to both popups as above.
2. Tests, mounted as the existing popup tests mount them; the mock holds each send until the test settles it, and its `disconnect` rejects every held send, as the client does:
   - revoke, two chunks (9 rows: the test mock's `MAX_REVOKES_PER_TX` is 8), the first send held: hide, so the disconnect rejects it; no toast of either kind, no close, one `revokeAuthwits` (the base sends the second chunk, then toasts success). Control: shown throughout, both chunks sent, one success toast, one close;
   - revoke reopen: run A's first send held, hide (rejected), show, start run B, then settle every held send in order: B's stage line follows B, its latch holds until B's last chunk settles, one success toast and one close come, and `revokeAuthwits` ran three times (the base also sends A's second chunk, whose settle clears B's latch and line);
   - switch: hide while sending; no toast, no close. Control: a shown popup's rejection toasts the failure and closes.
3. Validation gate:
   - Commands: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run --cwd apps/extension test:components`.
   - Pass: exit 0; each new case fails on the base copy of its popup.
   - Layers: lint, typecheck, unit, component.

### Phase 3: arc gate ✓

- Commands, once, in order, at retry 0: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run --cwd apps/extension test:components`, `bun run check:plans` (after staging), then `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/authwit-lifecycle.test.ts` (Chrome; the spec that sends both flows on chain).
- Pass: every command exits 0. No e2e scenario is added: the unit layer establishes both failure modes (the sandbox cannot show the first).

## Arc 2: the revoke reports through Activity, and a row names its action

Base: `origin/dev` at `6aaebe886` (arc 1 merged as #1832). Branch `authwits-2-a2`.

**The owner's picks** (decision page 166, signed 2026-11-17 at 15:40 UTC at dev `0dc22a9c5`):
- **P166-01 (OA-1) = B**, note: *"\"B\" but once revoke is clicked and.. (sent?) should take you to home? Like any other transaction / transfer?"* Asked whether Revoke should go Home, the owner answered on 2026-11-18 at about 15:05 UTC: *"Authwit: Ok. Stay there. On authwits page."* B as drawn: *"Activity carries it, as every send: Revoke closes the popup at once, a line under Revoke says beforehand "Revoking continues if you close this. Its progress shows in Activity.", each row being revoked carries a "Revoking" chip until the registry confirms and then leaves the list, a failed one reads "Not revoked" with the reason in Activity, and Home's Activity holds the revoke's transaction row."* The person stays on the Authwits page.
- **P166-02 (OA-2) = N1**, no note: *"The title names the action and the contract: "Transfer · " and the contract chip the approval window uses. Nothing the row lacks; every kind of row keeps its details."* A listed token reads its symbol with Nulo's seal; any other contract reads its short address as an unknown contract; `intent` and `message_hash` rows keep today's title and details.
- **P166-03 (OA-3) = S**, the registry check on page open: arc 3, which stacks on this arc. Nothing of it here.

**The popup hands the revoke to the worker.** Revoke posts every chunk's `revokeAuthwits` at once, on the popup's own client, then emits close; Revoke is off while that client's port is not Ready (it reopens after a worker restart), so each request is on the port before the call returns. The worker runs each request to its end whether the popup, the page or the wallet window stays open; its execution lane serializes the sends. The popup reports nothing: no toast, no stage line, no chunk status, no run fence. A latch refuses a second press until the next show. The hide disconnects the client only once no revoke request is outstanding; the last one to settle disconnects it if the popup is hidden (the Send page's rule: the request's settle owns the teardown). Network and account are read once, at Revoke.

**The rows read the worker's revoke tasks.** `revokeAuthwits` already starts a task, `RevokeAuthwitsContent(ids)`, before its grant wait and settles it after the registry read: completed once every row is pruned, failed on any throw, cancelled on a cancel. Tasks live in the worker's memory for an hour after they end, cleared on a profile switch. The task also carries each row's `authwitRowKey` (id, scope, hash, grant transaction), since an id freed by a prune can be reissued. A new composable, `useRevokeTasks`, keeps the revoke tasks from a `getTasks` snapshot plus the task events (as `useBalanceTasks` does) and answers per row from the latest task naming its key: unfinished → `revoking`, failed → `failed`, else none. The page passes that to each card.

**N1.** A pure helper names a `call` row's action: the first word of its function name, capitalised (`transfer_in_public` → `Transfer`). The page builds the chip with `contractChipAt` (the approval window's builder) from the signed list's reader, the profile's tokens on this chain and the default explorer, with no name book, so an unlisted contract reads its short address. The card titles such a row `Transfer · ` then the chip, in its own slot above the row's target, as the Notes page places its chip; the title wraps rather than cut the chip. Every other kind keeps `kindName`.

**File-level change map (arc 2)**

| File | Change |
|---|---|
| `apps/extension/src/popup/components/popups/RevokeAuthwitsPopup.vue` | hand-off at Revoke; the line under Revoke; drop the stage line, the chunk status lines but the resting one, the toasts, the run fence |
| `apps/extension/src/popup/components/popups/RevokeAuthwitsPopup.test.ts` | the hand-off describe replaces the stage-line and hide describes |
| `apps/extension/src/popup/utils/cancellable-rejection.ts` | its doc drops the revoke popup from its callers |
| `apps/extension/src/wallet/services/auth-registry/spec.ts`, `service.ts` (+ `service.test.ts`), `wallet/services/task/spec.ts` | `authwitRowKey`; the revoke task carries each row's key |
| `apps/extension/src/composables/useRevokeTasks.ts` (+ `.test.ts`) | new: per-row revoke state from the task snapshot and events |
| `apps/extension/src/popup/components/modules/settings/authwits/authwit-helpers.ts` (+ `.test.ts`) | `authwitAction(content)` |
| `apps/extension/src/popup/components/modules/settings/authwits/AuthwitCard.vue` (+ `.test.ts`) | props `chip`, `revokeState`; the N1 title; the Revoking and Not revoked chips |
| `apps/extension/src/popup/pages/settings/developer/account-state/authwits/index.vue` (+ `index.test.ts`) | token, price and task clients; the chip context; the revoke state per row |

### Phase 4: a row names its action and contract (N1) ✓

1. `authwitAction` with its unit cases; the card's N1 title and chip slot; the page's chip context.
2. Tests, wire-shaped (every address `0x` + 64 hex): a `call` row on a listed token titles `Transfer ·` with the symbol chip sealed `nulo`; one on an unlisted contract titles with its short address, level `none`; an `intent` row keeps `Intent` and no chip; pressing the chip opens its press, not the data viewer; the row's name reads the action, the chip and each status chip.
3. Gate: `bun run lint`, `bun run typecheck:all`, `bun run --cwd apps/extension test src/popup/components/modules/settings/authwits src/popup/pages/settings/developer/account-state/authwits`. Pass: exit 0.

### Phase 5: Revoke hands off; the rows carry its state (B) ✓

1. The popup's hand-off and line; `useRevokeTasks`; the card's two chips; the page's task client.
2. Tests: Revoke posts every chunk at once with the network and account read at the press, closes once, toasts nothing, and a second press posts nothing (the shared keyboard contract's in-flight pin holds); a hide while a request is out keeps the client, whose settle disconnects it; Revoke is off and posts nothing while the port reopens, then posts once Ready; the line reads under Revoke; the composable's snapshot, events, latest-wins, failure, cancel and dispose, and a reissued id inheriting nothing; the page draws Revoking from a task snapshot taken on open, then drops the row when the registry prunes it, and reads Not revoked from a failed task.
3. Gate: `bun run lint`, `bun run typecheck:all`, `bun run --cwd apps/extension test <the dirs touched> type-role-ban copy-dash-ban red-text-ban`. Pass: exit 0.

### Phase 6: arc gate ✓

- Once, in order, at retry 0: `bun run lint`; `bun run typecheck:all`; from `apps/extension`, `bun run test -- <the dirs touched> type-role-ban copy-dash-ban red-text-ban`; `bun run test` (the type-roles inventory pins producers); `bun run check:plans` after staging; smoke from `apps/extension`, `bun run test:e2e tests/e2e/type-roles.test.ts`, Chrome then `NULO_E2E_BROWSER=firefox`; network from the root, `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/authwit-lifecycle.test.ts tests/e2e/network/authwit-variants.test.ts tests/e2e/network/authwit-consume-smoke.test.ts`, Chrome then Firefox. The brief names `tests/e2e/authwit-consume-smoke.test.ts` as smoke; the file is a network spec, so it joins the network run.
- Pass: every command exits 0. No e2e scenario is added: the lifecycle spec already closes the wallet window right after Revoke and then reads the registry, which is the hand-off's failure mode; the rest is component-level.

## Arc 3: the page checks the registry when it opens

Base: `authwits-2-a2` at `b4905adfd` (#1853, open). Branch `authwits-2-a3`, stacked on it; the close-out rides as its last commits.

**The owner's pick** (decision page 166, signed 2026-11-17 at 15:40 UTC at dev `0dc22a9c5`): **P166-03 (OA-3) = S**, as OWNER-ASKS.md § OA-3 states it: *"On opening the page, run `syncRegistry`: one read for the switch plus one per listed row (at most 256). Effects a person sees: the warning matches the chain; consumed grants and grants revoked from another install leave the list."* That is the whole visible budget; no checking line, spinner or error line is built (D17).

**The check.** Once per page open, after the page's first list read and its stored-flag read have landed, the page calls `syncRegistry` for the shown network and account and draws nothing of its own: a prune reaches the list through `onAuthwitDeleted`, the switch through `onRegistryEnabled`/`onRegistryDisabled`, both of which the page already applies. In the worker (D14 to D16):
- Reads: one for the switch; one per confirmed row, the 256 lowest ids; none for a pending row, whose grant may still land (its transaction's outcome settles it). On a network with two or more endpoints, a row the route reads unauthorized is asked once more of its grant's endpoint, as today.
- Each verdict stands on its own read: a failed read leaves its row, a failed switch read the stored flag. The call settles once every read and prune has ended, then rejects with the first failure.
- One check per (profile, chain, account) at a time: a call while one runs joins it.
- The page logs a failure at `debug` and shows nothing. A page closed mid-check disconnects; the worker's check runs to its end, and the next open reads what it stored.

**A revoke skips a row already gone** (D18). The revoke popup acts on the rows it opened with, and the check prunes rows right after the page opens, when a person is likeliest to press Revoke all; the estimate would then fail on the pruned id and Revoke stay off. A missing id is now skipped as already revoked; a request naming none of its scope's rows is refused as before.

**File-level change map (arc 3)**

| File | Change |
|---|---|
| `apps/extension/src/wallet/services/auth-registry/service.ts` (+ `service.test.ts`) | `syncRegistry`: the join, the bound, settled reads; `revokeOperation`: a missing id skipped, none left refused; the revoke task names the rows found |
| `apps/extension/scripts/type-roles/identifier-sites.expected.json` | `service.ts` re-attested (no operation builder changes) and its digest re-pinned |
| `apps/extension/src/composables/useEntityCrud.ts` (+ `.test.ts`) | `loaded`: the first read's promise |
| `apps/extension/src/popup/pages/settings/developer/account-state/authwits/index.vue` (+ `index.test.ts`) | the check on open |

### Phase 7: the worker's check, and a revoke of a row already gone

1. `syncRegistry` and `revokeOperation` as above.
2. Tests in `service.test.ts`, every hash and address `0x` + 64 hex: the chain's switch disagreeing with the stored flag stores the chain's and emits once each way, agreeing emits nothing; a consumed grant and one revoked elsewhere leave with `onAuthwitDeleted`, a live one stays, a pending one is never read; every read failing leaves every row and the flag, one failing leaves its row while the other's prune lands before the call rejects; two calls in flight make one set of reads, a call after it settles reads again, another account's runs its own; 300 confirmed rows read the 256 lowest ids plus the switch; a revoke naming a pruned row and a live one sends one action and its task names the live row, one naming only pruned rows is refused.
3. Gate: `bun run lint`, `bun run typecheck:all`, from `apps/extension` `bun run test -- src/wallet/services/auth-registry src/wallet/services/cross-profile-isolation.test.ts scripts/type-roles`. Pass: exit 0.

### Phase 8: the page runs it on open

1. `useEntityCrud` returns `loaded`; the page awaits it and the flag read in `onMounted`, then starts the check.
2. Tests: the check starts once, only after a held list read lands, with the shown network and account; the warning shows once the check's switch read reports the registry off; a failed check leaves the rows and the warning, shows no error and logs at `debug`, nothing at `warn` or `error`; an unmount mid-check rejects quietly; `loaded` resolves once the first read settles, a failed one included.
3. Gate: `bun run lint`, `bun run typecheck:all`, from `apps/extension` `bun run test -- src/composables/useEntityCrud src/popup/pages/settings/developer/account-state/authwits type-role-ban copy-dash-ban red-text-ban`. Pass: exit 0.

### Phase 9: arc gate

- Once, in order, at retry 0: `bun run lint`; `bun run typecheck:all`; from `apps/extension`, `bun run test -- <the dirs touched> type-role-ban copy-dash-ban red-text-ban`; `bun run check:plans` after staging; smoke from `apps/extension`, `bun run test:e2e tests/e2e/type-roles.test.ts` (it seeds authwit rows and opens the page, whose check meets the stand-in node), Chrome then Firefox; network from the root, `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/authwit-lifecycle.test.ts tests/e2e/network/authwit-variants.test.ts tests/e2e/network/authwit-consume-smoke.test.ts tests/e2e/network/popup-escape-layered.test.ts`, Chrome then Firefox (`popup-escape-layered` opens the page too).
- Pass: every command exits 0. No e2e scenario is added: the lifecycle spec opens the page with its consumed first grant still listed and a live one beside it, then presses Revoke all at once, so on the sandbox the check keeps a live grant against a real node and may prune the consumed one around the press (D18's case); the rest is established at the unit layer.

## Security & Adversarial Considerations

- **Threat model.** A dApp holding a public grant wants to consume it after the person revokes it; a network that drops or reorders blocks; a popup closed mid-send.
- **The wait change.** The consume a revoke must stop runs on the proposed chain, so its binding point is the revoke's block, not its proof; that holds before and after the change. What the proven wait added, by accident, was durability: a revoke whose block is later rolled back returns its grant while the row is gone. Waiting for the checkpoint leaves that window to an L1 reorg past the checkpoint, an invalidated checkpoint or an epoch prune; the proven wait narrowed it to an L1 reorg before finality, at the cost of a wait that ordinarily outlasts its bound on Testnet. Restoring a pruned row would need recovery machinery, so it is a known limit at close-out, reopening condition: a rolled-back checkpoint seen on a network the wallet serves. Front-running a revoke with a consume is unchanged by either wait.
- **The endpoint stays trusted.** A node that lies about its tips or the registry can make the wallet prune a live grant, before and after the change; the same-endpoint reads only keep the wait and the verify consistent. A slow node can hold an awaited read past the nominal bound.
- **Fail closed.** A timeout still refuses and keeps the rows; the verify still reads the endpoint the wait read (`receiptNodeFor`), never the route.
- **The popups.** The run fence only drops a hidden popup's reading of a result and stops its next chunk; it sends, signs and stores nothing. Least privilege, cryptography and supply chain: no change, no dependency.
- **Arc 2, the chips.** They read the worker's in-memory tasks through `getTasks` and the task events, as Home's Activity does; nothing new is written, stored or sent, and no stored shape changes (no stamp, no migration). A task names each row by its id, scope, hash and grant transaction, and the page matches all of them, so a grant that later takes a pruned row's id, in any scope, inherits nothing. The chip shows no task error text, so nothing of a failure reaches the screen or a log line beyond what the journal already holds.
- **Arc 2, the hand-off.** The popup closing at Revoke changes nothing the run fence did not already cover: the worker owned each send from its request (arc 1), and the popup now reports nothing at all. Each request still captures the execution fence before any read, builds from the scope's own rows and refuses foreign ids, so a request the person no longer watches authorizes nothing a watched one would not. A switch, lock or reset before a posted request runs refuses it there. A row revoked again while it reads Revoking sends a second transaction, as two windows could already: a second fee, no wrong state (D9).
- **Arc 2, the title.** A `call` row's method and contract are the inputs its hash was computed from (`computeCallMessageHash`), so the title names what the grant allows; only `call` rows are titled (D10). The method is wire text: shown through `sanitizeWireString`, never as HTML. A restored backup's row is hostile input: its title restates the method its details already show, and claims nothing more.
- **Arc 3, the check.** Reads only: it sends, signs and authorizes nothing, and stores only what the chain answered (a row deleted, the flag set), under the lock and the whole-identity re-read every writer uses. It reads through the active profile's own network row (`getNetwork` refuses another profile's). A restored backup is hostile input: it can hold more than 256 rows for a scope (restore keeps every grant), so the check reads at most 256 and a hostile backup cannot turn a page open into an unbounded burst of node reads. The page logs a failure as `{ error }` at `debug` (projected by `trim`, endpoint URLs scrubbed), never a hash, address or row.
- **Arc 3, the trust it adds.** The check is the first caller of `syncRegistry`, so the endpoint's answers now prune rows on every page open. The endpoint stays trusted, as for the revoke's verify: a node that answers a stale or false read (a load-balanced backend behind the grant's block, a lying node) can make it prune a live grant, which then no longer shows and cannot be revoked from the page. With two or more endpoints the grant's own endpoint is asked first, as today; with one, nothing more. A known limit at close-out; reopening: a stale or false read seen on an endpoint the wallet seeds.
- **Arc 3, a revoke of a row already gone.** Missing and foreign ids are both skipped and an all-missing request is refused with the same words as before, so the request still revokes nothing outside its scope and still discloses nothing about another scope. A pruned row's id can be reissued to a later grant (ids grow from the current maximum), and a popup opened before both would revoke that grant: pre-existing in kind (a revoke from another window prunes too), only in the safe direction (an authorization removed, a fee paid), and narrowed by the check running before most presses.

## UI impact

- Revoke and registry popups: no new words, rows or layout. On Testnet and Mainnet a landed send whose checkpoint reaches L1 on the ideal path now ends in the success they already show on the sandbox, instead of the failure toast; a later checkpoint still ends in today's failure; a popup closed mid-send shows no toast of either kind. Both end a wrong state, so the existing copy stays.
- Authwits page: none in arc 1. Arcs 2 and 3 wait for OA-1, OA-2 and OA-3.
- **Arc 2, each signed by P166-01 or P166-02 (quoted above):**
  - Revoke popup, under Revoke: one body line, "Revoking continues if you close this. Its progress shows in Activity.", shown while the popup is open. Before: the stage words appeared there only while sending.
  - Revoke popup, at Revoke: it closes at once and the person stays on the Authwits page. Before: it stayed open with a moving line and the stage words, then closed on a success toast or stayed on a failure toast. Now no toast either way.
  - Authwits page rows: a "Revoking" chip beside the title from the press until the registry read prunes the row, which then leaves the list; a "Not revoked" chip in danger text when the revoke failed, until the next revoke of the row or the worker drops the task (at its first read of tasks an hour or more after the failure; a page left open keeps it longer, which stays true while the row is listed). Before: nothing on the row.
  - Authwits page rows, one status chip (P188-01 = change, decision page 188, signed 2026-11-18 at 19:12 UTC at dev `b22893f42`, the owner's note: *"Why does somethinbg have "Pending" + "Revoking"? It's either one or the other? This is looking a bit confusing."*): a row shows ONE status chip, by this precedence: Revoking, then Not revoked, then Pending. Revoking covers the wait for the grant's block; the row's accessible name reads the one chip shown. Before (as first shipped on this branch): a pending grant being revoked drew Pending and Revoking side by side, and a pending grant whose revoke failed drew Pending and Not revoked. The chips keep their words, look and colours; the rest of the row is unchanged.
  - Authwits page rows, a Not revoked row whose failure Activity does not record: the chip alone, as shipped (P188-02 = R0, approved, the default; OA-4).
  - Authwits page, a `call` row's title: "Transfer · " and the contract chip (a listed token's symbol, mark and solid seal; an unlisted contract's short address, no seal), pressing it opens the chip's card; the title wraps under the row's width rather than cut the chip. Before: "Call". Every other kind, and every row's details, unchanged.
  - Home's Activity: unchanged; it already lists the revoke's journal and transaction rows.
- **Arc 3, each signed by P166-03 (quoted above):**
  - Authwits page, the "registry disabled" warning: a moment after the page opens it follows the chain's switch for the account, showing or leaving if the stored flag disagreed (after an import, a restore, or a switch made from another install). Before: it read only this device's stored flag.
  - Authwits page rows: a confirmed grant the chain no longer authorizes (consumed by the app it was granted to, or revoked from another install) leaves the list a moment after the page opens. Before: it stayed listed until a revoke from this page pruned it.
  - Nothing else: a check that fails leaves the page exactly as it opened; no line, spinner or error is drawn (D17). A revoke popup opened before a prune lands shows the selected count as before, and revokes the rows still listed (D18).

## Decision ledger

- **D1, the wait.** Chosen: the checkpointed tip, same bound, best effort on the ideal path. Rejected: the proposed tip (a dropped proposal loses the row while the grant comes back); the proven tip with a bound past an epoch (40 to 80 min of a popup, a raised timeout over a wrong premise); a bound derived from the node's slot length to cover the deadline path (a new read, still no guarantee under L1 congestion; the tail fails closed and keeps the rows); reporting at the block and pruning at the proof from the transaction watcher (a new background lifecycle and a row state the page would have to show: a plan change, and OA-1 B covers the display).
- **D2, a hidden popup.** Chosen: its run ends through the existing `createRunFence`; the worker's send continues and Activity reports it. Rejected: cancel the send on close (a close is not a cancel, and Send never cancels on leave); keep sending the remaining chunks (a send the person can no longer see).
- **D3, Q1.** No arc 1 change: no defect was shown and both candidate fixes are visible or widen a cache.
- **D4, the brief's two-chunk case.** Did not hold; multi-chunk paths are covered by the Phase 2 tests.
- **D5, captures.** One prototype build with a runtime switch (A, B, C, N1, N2), so one sandbox run takes every frame.
- **D6, Revoke stays on the page** (the owner, 2026-11-18): the popup closes and nothing navigates. Rejected: going Home as Send does (the owner's own answer).
- **D7, the chip's source: the worker's revoke task, not the journal record.** OWNER-ASKS suggested the in-flight journal record; read against the tree it cannot carry the chip: the record holds no row id or hash (only the primary call's contract and argument count), it turns `succeeded` when the node accepts while the revoke still waits for its block, its checkpoint and the registry read, and a failure after the send never reaches it. The task the service already starts per revoke names the ids, spans the request to the registry read, fails on any throw, and lives in worker memory (no storage), so it survives the page and the popup closing while the wallet runs. Rejected: a new journal field (an additive stored-shape stamp the brief asked to avoid); a page-side set of revoking ids (lost on reopen). Limits, both visible only as plain rows: a worker restart drops the tasks (the journal's interrupted record says what happened); a request the worker refuses before its task starts (an unreadable network, a locked wallet) leaves no task.
- **D8, what "the registry confirms" reads.** `verifyRevoked`: once the revoke's block is checkpointed (arc 1), the endpoint that took the send reads each hash unauthorized, and a pending grant's block is at or below the revoke's; the row is then deleted (`onAuthwitDeleted`) and leaves the list before the task completes. A row it cannot verify stays, and the task fails: Not revoked.
- **D9, the hand-off: every chunk posted at once.** Chosen: the worker holds every chunk from the press, so closing the popup, the page or the wallet window loses none, and every chunk's rows read Revoking from the start (the owner's "each row being revoked"). Rejected: chunks one after another from the hidden popup (a closed wallet window drops the later chunks, and their rows read plain while they wait); one worker RPC that loops the chunks (a new public contract). Costs, both multi-chunk only: the lane caps a requester's queue at eight, so a Revoke all of 225 or more authwits (nine or ten chunks) has its last chunks refused and reading Not revoked (a known limit at close-out, reopening: a report, or the cap or Revoke all leaving Developer mode); and a later chunk may build before an earlier one is mined, as today's per-chunk shortfall check already allowed. A row revoked again while Revoking keeps its control (drawn so) and sends a second transaction.
- **D10, N1's reach.** `call` rows only, as the pick draws them: their method is bound to the hash (`computeCallMessageHash`). `encoded_call` rows keep "Encoded Call"; their `name` is bound too (the wallet overwrites it from the ABI before hashing, `authwit-discoverer.ts`), so titling them is a one-line change the owner did not see drawn: noted under OA-2. No name book: the pick says an unlisted contract reads its short address. The press carries the default explorer's link, as the approval window's does.
- **D11, "the reason in Activity".** Holds for a failure the journal records (a simulation, a proof or a send refused): Activity's failed card names it. It does not hold for a failure outside the journal: a grant not yet in a block (refused before any send), or one after the send (the checkpoint wait timing out, the registry still reading authorized), where Activity shows the transaction confirmed. Those rows read Not revoked with no reason on screen; the popup's old raw-error tooltip went with the popup. Where such a reason should show is a visible choice: OA-4, shipped without; the owner approved that (P188-02 = R0, D20).
- **D12, accessibility (owner's 2026-10-19 delegation).** The row's name is the action, the chip's own name ("TST, Nulo verified"), then the one status chip shown (D20); the middle dot is hidden from it. The chip is its own Tab stop above the row's target, as on the Notes page. Revoke is off while the popup's port reopens after a worker restart (under a second, a state the button already has while estimates land).
- **D13, the Not revoked chip's lifetime.** It ends when the worker drops the task, which it does lazily at a read of its tasks. Rejected: a page-side expiry timer (a new lifecycle for a chip that stays true while the row is listed).
- **D14, when the check runs: on page open only.** Once per mount, after the first list read (`useEntityCrud`'s new `loaded`) and the flag read land, so neither older read overwrites what the check prunes or sets (both answer on the same port, before any event the check causes). Rejected: at account start or unlock (the pick: the page is where the answer is read; every start would read the node for a page nobody opened); on a scope switch while the page stays open (only another window can switch it; the next open checks); a refetch after the check (its loading state would flash the list).
- **D15, the bound.** Confirmed rows only, the 256 lowest ids (`MAX_TRACKED_AUTHWITS_PER_ACCOUNT`): a scope passes 256 only through a restored backup, since restore keeps every grant, and the rows past the bound wait until earlier ones leave. One read per row plus the switch, and at most one more for a row the route reads unauthorized on a network with two or more endpoints (the existing guard). The node client batches calls that queue together, up to 100 per request.
- **D16, failures and concurrency.** Per-row verdicts (`allSettled`), so one failed read neither keeps nor removes another row, and the call settles only after its last prune, which makes "one in flight" exact: a second call for the same scope while one runs joins its promise (an in-memory entry removed when it settles). Rejected: a page-side flag only (two windows, or a reopen while the worker still runs the closed page's check, would run two); a retry (a failure leaves the page as it was, and the next open checks).
- **D17, nothing drawn for the check.** The pick names two effects; a checking line, a spinner or an error line would be a third surface, not asked for. Shipped without; not raised as an ask, since a failure leaves today's page and nothing in the pick or the frames shows one.
- **D18, a revoke of a row already gone is skipped.** Cause: the popup's rows are the page's list when Revoke was pressed, and the check prunes right after the page opens; a pruned id made `revokeOperation` throw, so that chunk's estimate failed and Revoke stayed off until the popup reopened. Chosen: skip a missing id (its row is already gone, which is the revoke's own end state), refuse a request with none left. Rejected: the popup re-chunking on deletions (a new popup state, and an empty popup when all leave: visible); Revoke off while the check runs (a visible state beyond the pick); waiting for the check before opening the popup (a press that stalls on a slow node).
- **D19, no merge of `origin/dev` before the close-out.** The README's close-out step merges the trunk first; this branch is stacked on #1853, and a merge would put dev's commits into a diff that must read as arc 3 alone. `index.md`, `archive/index.md` and `lessons.md` were read at `origin/dev` instead; the rebase onto dev after #1853 lands is the orchestrator's.
- **D20, one status chip per row (the owner, decision page 188, signed 2026-11-18 at 19:12 UTC at dev `b22893f42`).** P188-01 = change, the owner's note, verbatim: *"Why does somethinbg have "Pending" + "Revoking"? It's either one or the other? This is looking a bit confusing."* A pending grant being revoked drew Pending (its grant's transaction not yet in a block) and Revoking side by side, since the revoke waits for that block (`awaitGrantBlocks`). Chosen: a row shows one status chip, by this precedence: Revoking, then Not revoked, then Pending. Revoking covers the wait for the grant's block, and the row's accessible name reads the one chip shown. The chips keep their words, look and colours; the rest of page 188's item was not questioned and stays. P188-02 = R0, approved (the default): a Not revoked row whose failure Activity does not record shows the chip alone, as shipped (OA-4, D11).

## Audit verdicts

- Codex round 1 (plan, gpt-6.1-sol, high, read-only): **conditional approve**, six findings, all accepted after checking the cited sources:
  1. "Always times out" was too strong: partial-epoch proofs exist (on request). Reworded to the ordinary case.
  2. A checkpoint is not undone only by a prune: an L1 reorg or an invalidated checkpoint can too. Inferences, Security and the known limit broadened.
  3. 120 s covers the ideal path, not the deadline path (about 137 s). Promise narrowed in Outcome; D1 records the derived bound as rejected; Phase 1 adds the transition case.
  4. #1830's revoke trace was wrong: the summary reads the emptied list, so a hidden revoke toasts a false success. Trace and tests corrected (zero toasts, zero close, one send; the test mock chunks at 8).
  5. `createRunFence` already exists; reused, and the reopen race added to the tests.
  6. Q4's third and fourth sentences narrowed (`set_authorized_private`, a forwarded witness, retained calldata from any source).
- Codex round 1, follow-up on the same session: **conditional approve**, three leftovers, all accepted: the Architecture invariant still said only a prune undoes a checkpoint; three sentences still promised more than the ideal path; the reopen test needed an order the mock can run (each send held, the disconnect rejecting what is held, A's stale second chunk named as the base's failure).
- Codex round 1, second follow-up: **approve**.
- Codex pass over arc 2's diff and plan amendment (gpt-6.1-sol, high, read-only, bounded form): **conditional approve**, four findings, each checked against the tree:
  1. Accepted. A task matched rows by id alone; `recordPendingAuthwits` allocates from the current maximum, so an id a prune frees can be reissued and inherit Revoking or Not revoked. The task now carries each row's `authwitRowKey`; a regression test pairs the reissued id with the revoked row's own reading.
  2. Accepted. A client reopening its port after a worker restart posts only at Ready, so a window closed in between could lose the requests. Revoke is now off, and refused in the handler, while the port is not Ready; a test covers the reconnect and the post once Ready.
  3. Path holds, fix rejected (D13): the chip outlives an hour on an open page because the worker drops tasks lazily; an expiry timer is a new lifecycle and the chip stays true. The UI impact line now says so.
  4. Accepted. The helper's comment and D10 said an encoded call's name is unbound; the wallet binds it from the ABI. Reworded; the restating comment on `stateOfTask` removed.
- Codex pass over arc 1's diff (gpt-6.1-sol, high, read-only, bounded form): **approve**, one low finding accepted: `transaction/service.ts`'s `waitForTx` comment still named the removed proven wait and its premise; reworded. One caveat recorded above: a stale revoke run may still mark its detached chunk object.

## Delivery

- Arc 1, phases 1 to 3: branch `authwits-2-a1` off `origin/dev`, carrying the plan commit; `gh pr create`; title `fix(authwits): a landed revoke reports success, and a closed popup reports nothing` (82 characters); body ends with `Closes #1829` and `Closes #1830`; no label. Code review: off.
- Arc 2, phases 4 to 6: arc 1 merged before arc 2 began, so arc 2 is branch `authwits-2-a2` off `origin/dev` and a plain PR against `dev`; title `feat(authwits): a revoke reports through Activity, and a row names its action and contract` (88 characters); the body quotes P166-01, the owner's 2026-11-18 answer and P166-02 as the sign-off; no Closes line; no label; not merged by the lane.
- Arc 3, phases 7 to 9, plus the close-out: branch `authwits-2-a3` off `authwits-2-a2`, a DRAFT PR with `--base authwits-2-a2` so its diff reads as arc 3 alone (CI's e2e lanes skip a PR whose base is not `dev`, so the local gates are the proof until the orchestrator rebases it onto `dev` after #1853 lands and marks it ready); title `feat(authwits): the page checks the registry when it opens; the plan closes` (75 characters); the body quotes P166-03 as the sign-off; no Closes line; no label. The close-out rides as this PR's final commits, not a separate `authwits-2-close-out` layer.
- Parallelism: none.

## Post-implementation

Follows `implementations-plan/README.md` § Post-implementation standard at `0dc22a9c5`, with these values:
- Step 1 is absent (`code_review: off`).
- Step 2, bounded form: after arc 1's Phase 3, ONE Codex pass (`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`) over arc 1's diff against `origin/dev`, with the plan, the arc map ("arc 1 of up to 3; arcs 2 and 3 change the popup and the page on the owner's picks") and the README's two verbatim rules; then targeted verification of each material fix. Log it in `lessons/phase-3.md` and above.
- Step 3: `gh pr checks <n> --watch` once; a known flake gets one rerun.
- Arc 2, step 2, bounded form: after Phase 6's gates, ONE Codex pass over this plan's arc 2 sections and arc 2's diff against `origin/dev`, arc map "arc 2 of 3; arc 3 checks the registry on page open", the README's two verbatim rules; fix what is material, re-run the gates the fixes touch, log it in `lessons/phase-6.md` and § Audit verdicts. A second round only on a finding. Captures (capture-only code, never committed) go to the orchestrator with the PR.
- Arc 3, step 2, bounded form: after Phase 9's gates, ONE Codex pass over the arc 3 sections and arc 3's diff against `authwits-2-a2`, arc map "arc 3 of 3, then the close-out", the README's two verbatim rules; fix what is material, re-run the gates the fixes touch, log it in `lessons/phase-9.md` and § Audit verdicts. A second round only on a finding.
- Step 4 (close-out) runs as arc 3's final commits, before any arc merges, since arc 3 is the lane's last (D19 for the trunk merge): the known limits named above (Q1, the cancel loop, the foreign grants, a rolled-back checkpoint, a checkpoint past 120 s, D9's refused chunks past the lane's cap, arc 3's endpoint trust) are filed then, each deduped and closed as not planned. Step 5, teardown: `agent-worktree done authwits-2 --merged` once `implementations-plan/archive/authwits-2/plan.md` is on `dev`.

## Seeds (not run; the orchestrator drives this lane)

```
/goal Arc 1 of implementations-plan/authwits-2/plan.md: phases 1-3 marked ✓, each gate reported passing, the Codex pass logged, PR open with Closes lines and checks green.
/goal Arc 2 of implementations-plan/authwits-2/plan.md: phases 4-6 marked ✓, each gate reported passing, the Codex pass logged, captures delivered, PR open against dev with checks green.
/goal Arc 3 of implementations-plan/authwits-2/plan.md: phases 7-9 marked ✓, each gate reported passing, the Codex pass logged, captures delivered, the plan archived, draft PR open on authwits-2-a2.
```
