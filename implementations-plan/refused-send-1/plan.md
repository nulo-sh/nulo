---
plan: refused-send-1
tier: light
status: planned, Codex approve (round 3)
issues: "#112 (arc 1 closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one Codex audit (gpt-6.1-sol, high) with its resume; one Opus Plan leg
base: origin/dev at 01c279124
trunk: dev
post_implementation_hardening: not scheduled
---

# refused-send-1: a send the network refused ends at once (#112)

One arc, one PR against `dev`, not stacked (D-orch-1), opened as a draft until OA-1 is answered. It closes #112 with the owner's pick, decision page 76, P76-03, option **C**: "Fail at once, the page-10 design: a red \"Refused by the network\"; through the load-balanced default endpoint the row can be wrong, and a re-send can pay twice." Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Issue claims that did not hold

- **#112 `Where`.** The lines drifted: `journal-state.ts:61-67, 203-218`, `transaction/service.ts:59`, `send-check.ts:174`, and the refusal test is `service.composition.test.ts:1339-1368`.
- **#112 `Possible fix`** ("needs the transport to report an earlier failed attempt"). The transport cannot prove a single attempt behind the default endpoint (D1); the plan gates the refusal on the network's own answer instead (D2).
- **The page-10 design keys on "the first attempt".** No signal in the wallet can say so behind dRPC's gateway. D2 replaces that condition with evidence the wallet can read; the owner's words and look stay.

## Outcome & Quality Bar

For a person whose send the network refused because its spend was already recorded or it expired. Excellent: (1) once the check's first read (it starts within about 5 s) finds the send nowhere, Home, History and the transaction page read "Refused by the network" in the failed style, instead of 30 minutes of "Not confirmed yet"; (2) a send that went through after all, the case the load balancer allows, turns to "Sent" on the first read inside 30 minutes that reaches an up-to-date node. Good enough: every other refusal keeps today's check (OA-2), and a wrong red the 30 minutes do not correct stays (OA-3).

## Assumptions

- **F1** A node refusal reaches the wallet as `Error(message)` with the node's text verbatim, never retried (recon § send path); `normalizeError` stores that text as `error.message` on both send paths. The text is the endpoint's assertion, not proof of its origin: a malformed HTTP-200 object's top-level `message` reaches the same field through the client's synthetic `-32000` path (`safe_json_rpc_client.ts:141-155`).
- **F2** The rc.3 node's text is `Invalid tx: <one validator reason>`; the reasons are `@aztec-labs/stdlib/tx` constants (recon).
- **F3** The double-spend validator reads the node's committed tree, which a chain prune unwinds (`world-state` `server_world_state_synchronizer.ts:555-557`); the timestamp validator compares the expiry with the node's own prediction of the next slot's time (`server.ts:824-836`). Neither reason is final against a prune or a node whose clock runs ahead.
- **F4** `getTxReceipt` answers Dropped for a hash the node's pool and archive both lack, Pending for a pooled one (stdlib `aztec-node.ts:470-474`; probe record).
- **F5** The send check already reads every failed-from-`submitting` row with a hash, not failed by a lock (`isSendCheckable`, `spec.ts:276-279`), on its recorded endpoint: every 5 s for 2 minutes, then every 15 s, for 30 minutes (recon § send check).
- **F7** dRPC's gateway passes an upstream's JSON-RPC error object through byte for byte (`drpcorg/nodecore` `internal/protocol/parse_response.go` `parseJsonRpcBody`, `response.go` `EncodeResponse`), and its retry list (`pkg/errors_config/errors.yaml`) matches no `Invalid tx` text. Source read on 2026-10-20, not a live probe: a probe needs the keyed Testnet endpoint this lane may not open, and Testnet funds.
- **F6** dRPC's gateway retries a timed-out request on another upstream, with optional hedges, and the wallet sees none of it (archived send-queue-activity, `lessons/phase-3a.md`).
- **I1** One read reaches one upstream, and a node gossip has not reached yet reads Dropped for a just-sent tx (`transaction/service.ts:42-52`). Per reason: after `Existing nullifier` the expected wrong red is a send already mined, which an up-to-date node answers mined; after an expiry refusal a copy another node pooled can still enter the current slot's block, which the 5 s reads of the first 2 minutes see. Either can also follow F3's exceptions (a pruned conflicting spend, a node clock ahead), with no relay retry at all. How often the relay's nodes lag is not measured.
- **I2** A wallet-built tx meets only the state reasons (nullifier, expiry, fee, header); the malformed reasons need a wallet or prover bug.
- **Asks** OA-1 (the page's second sentence), OA-2 (which refusals end at once), OA-3 (a wrong red past 30 minutes); the arc ships each one's "What ships now".

## Architecture & Implementation

**Flow.** Send refused → the journal fails the row as today (`check` absent, "Not confirmed yet") → the send check's first read (it starts within about 5 s; a slow node can hold it up to the 60 s request timeout) → if the read lands inside the window, the stored message is a listed refusal (D3) and the receipt is Dropped, `setSendCheck` records `check: "refused"`; a first read past the window records `unconfirmed` as today → the row reads "Refused by the network" → the check keeps reading on the same cadence until 30 minutes past `terminalAt`, while the profile is unlocked; a mined receipt records `sent` or `reverted` as today → past the window the watch ends with no further read and the row stays refused (D8).

**File-level change map.**
- `packages/wallet-core/src/jobs/types.ts`: `SendCheckOutcome` gains `"refused"` (doc: the node refused it for a listed reason and a read found it neither pooled nor mined).
- `operation-journal/spec.ts`: the schema enum gains `"refused"`; `isSendCheckMove` allows none → `refused` only from a row never answered (`from.checkSince` absent) and only to `{ check: "refused" }` (no inclusion, no `checkSince`); `refused` → `sent` or `reverted`; nothing else leaves `refused`. It branches on `from.check` (a `switch`) to stay under the cognitive-complexity ceiling of 15.
- New `operation-journal/final-refusal.ts`: `isFinalRefusal(message)` and the two listed texts (D3), so the send check, its tests and the network e2e import it without the service graph or the popup bundle.
- `operation-journal/send-check.ts`: `OpenRow`'s `unanswered` gains `refusal: boolean`, true only for a listed message on a row without `checkSince` (so the check never tries a write the journal refuses), and a `refused` kind `{ txHash, url, since }`; `minedVerdict` becomes a read that returns `TxReceipt | undefined` (undefined: no read), and callers apply `verdictOf` and an explicit Dropped test inside the status parse's `try`, so a failed read, a missing node or an unknown status is never Dropped; `firstAnswer` order: a mined verdict, then past the window `unconfirmed`, then a listed refusal on Dropped `refused` only if a fresh `clock.now()` taken after the read is still inside the window (a read that crosses the deadline is not "inside"), else the next read; `refusedAnswer` reads until the window ends, then unwatches without a read; `expectedOf` maps the new kind.
- `utils/journal-state.ts`: `CHECKED_DISPLAYS.refused` `{ state: "failed", subtitle: "Refused by the network", icon: square-cross, color: "red" }`; `CHECKED_LABELS.refused` with the page-10 words.
- `stored-shapes/snapshot.json`, `goldens.json`: `bun run baseline:storage` re-stamps; a `journal.refused` golden.
- Not touched: `execution-coordinator.ts` (D4), `transaction/service.ts` (it holds no failed send), the Send snack (UI impact).

### Decision ledger

- **D1 Attempt proof: not built.** The wallet could count its own POSTs, but the POST that carries `sendTx` is a batch shared with the tick's other calls, and the gateway's retries and hedges are invisible (F6). A single-attempt send would drop today's retry after a lost answer and still prove nothing behind the gateway. On one node, D2 already covers the wallet's own retry: an attempt the node took reads Pending or mined there.
- **D2 Receipt-gated refusal (chosen) vs the page-10 attempt rule.** Window: the attempt rule is wrong whenever the gateway retried onto a node that refused (upstream A includes, B answers "Existing nullifier"), and nothing corrects it. D2 is wrong while the reads reach only upstreams behind the block that holds the send and without it pooled (I1, one upstream per read); the first read inside the window that reaches an up-to-date node turns the row to Sent (D8 bounds that). Neither proves absence. Stored shape: both add a `check` value; the attempt rule also needs a new field and the counting transport. Tests: D2 is unit plus composition on existing harnesses.
- **D3 A conservative list: the two reasons the brief names.** The message must equal `Invalid tx: ${TX_ERROR_EXISTING_NULLIFIER}` or `Invalid tx: ${TX_ERROR_INVALID_EXPIRATION_TIMESTAMP}` (`@aztec-labs/stdlib/tx` constants; the prefix is the node's literal, `server.ts:595`). They are the reasons that stay true for this exact tx as the chain moves on: the nullifier tree and the clock only grow, barring a prune of the block that holds the conflicting spend or a node clock that runs ahead (F3). For them, a pooled copy elsewhere cannot be included either, barring F3, so the expected wrong red is a send already included, which the receipt reads find. Every other text keeps today's check: the fee, balance and `Block header not found` texts (a top-up, a fall in fees or a node catching up lifts them, and a node behind can refuse a send another took), `Invalid proof` (a node whose verifier fails answers it), the intrinsic data texts (a correctly built tx never meets them), node configuration texts, `no connected peers`, a pool rejection, and any text not matched. A `DuplicateInitializationError` row stores the wallet's message, so it keeps today's check. The list is a floor, not a taxonomy.
- **D4 The refusal is read from the record, not recorded at send.** The stored `error.message` already holds the endpoint's exact answer (F1), and the journal discards a caller's failed fields by design. Classifying in `sendTxTask` would need a new field, both catch sites and the journal's failed transition to carry what the record already holds, and would prove no more: the `cause.code` is the endpoint's assertion too. The brief named `execution-coordinator.ts`; this is the deviation, with that reason. The send check, the sole writer of `check`, decides; `setSendCheck` keeps its structural guards only (no second classifier in the journal).
- **D5 One Dropped read decides vs `TransactionService`'s debounce (60 s and three reads).** The owner picked "at once"; one read keeps that. The debounce would shrink D2's window and delay every refusal by a minute: OA-1 option C.
- **D6 Pending is never a refusal.** A Pending read leaves the row checking; a later Dropped read inside the window may still record `refused`. That read can come from another replica while one upstream still pools the tx; for a listed reason that copy cannot be included either, barring F3.
- **D7 A pruned row is never refused, and the window decides first.** A first read past the window records `unconfirmed` (today's path, with its expiry proof), never `refused`: a refusal rests on a read made while the send was fresh. A row with `checkSince` had a `sent` or `reverted` that was pruned: it was included once, so its refusal proves nothing.
- **D8 The window bounds the correction.** A refused row is read like an unanswered one, then the watch ends at 30 minutes with no read, as `TransactionService` ends a Dropped row's re-check (`transaction/service.ts:56-59`). A read past the window would repeat at every worker start, since nothing records it. So a wrong red that no read corrects inside the window stays: the wallet locked or closed through it, or every read failed or reached a node behind. Reusing the expiry proof (`expiryAnswer`) would add one more chance a day later, but no guarantee: `presentAnswer` records only a mined success read from the node it reaches and otherwise retries at the next worker start; and the row would then read "Won't go through", a change on screen. OA-3, not built now.

## Security & Adversarial Considerations

- **Threat model.** A hostile or broken RPC endpoint (a custom network, or an upstream of the default gateway) can answer `Invalid tx: Existing nullifier` for a send it forwarded, then Dropped: the row reads refused and a re-send pays twice. Capability: control of the endpoint the person chose. No new boundary: the same endpoint already decides every receipt the check reads, and a lying RPC is outside the trust model the proofs claim. Exploitability unknown.
- **Input.** The stored message is endpoint-controlled text. It is only compared for exact equality with a fixed set, never rendered (the page shows it only in developer mode, as today) and never logged; the check's debug line logs the outcome `refused` only.
- **Privacy.** No new read, endpoint or hash: the gate is the read the check already makes, inside the same fence.
- **Storage.** A build without `refused` drops such a row on read (the codec refuses an unknown value). Pre-production: no downgrade is supported, no migration (CLAUDE.md § Persisted-storage).
- **Least privilege, crypto, supply chain.** No dependency, permission or workflow change; `bun.lock` unchanged.

## UI impact

- **Home card and History row**, for a listed refusal once a read finds the send nowhere: before, grey half-square, "Not confirmed yet"; after, the failed style, red square-cross, "Refused by the network" (target `112-row-refused`). Record: P76-03 C (quoted above).
- **Transaction page:** before, "Your wallet is checking whether this reached the network. Don't send it again yet.", Outcome "Not confirmed yet", State "Checking", no Ended; after, "The network refused this transaction, so it won't go through. Check the details before sending it again.", Outcome "Refused by the network", Ended shown, State "Failed" (target `112-page-refused`). Record: P76-03 C with the page-10 words; the second sentence is OA-1.
- **Unchanged:** the Send snack at the failure ("Send not confirmed"), every other refusal (OA-2), and a refused row past 30 minutes (OA-3).
- Pictures light and dark of the row and the page, at 360 px, in the PR.

## Phases

Fast gate `F`: `bun run lint && bun run typecheck:all && bun run test` (each exits 0). Smoke: `cd apps/extension && bun run test:e2e -- tests/e2e/<file>.test.ts --retry=0`. Network: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts` at retry 0 through `agent.sh`. A phase is ✓ only when its gate passes; each logs to `lessons/phase-N.md`.

1. **Contract.** Change: `types.ts`, `spec.ts`, `bun run baseline:storage`, the `journal.refused` golden. Tests (`operation-journal/service.test.ts` move matrix rows): none → `{ check: "refused" }` written; → `refused` with an inclusion or a `checkSince` refused; from a row with `checkSince` refused (never-happens) beside its `unconfirmed` control; `refused` → `sent` and → `reverted` written; `refused` → `unconfirmed`, `expired`, `refused` and a pruned reset refused. Gate: `F` + `bun run test:all` (the snapshot test reads the golden).
2. **Send check.** Change: `final-refusal.ts`, `send-check.ts`. Tests: `final-refusal.test.ts`, one table: both listed texts match; a prefix alone, a listed reason with a suffix, another case, `Invalid tx: Insufficient fee payer balance`, `Invalid tx: Invalid proof` and `Cannot accept tx: node has no connected peers to propagate it` do not. `send-check.test.ts`: a listed refusal whose first read is Dropped records `refused` and refreshes nothing; with a Pending first read it records nothing, then `refused` on a later Dropped read; a throwing read, a missing node and a receipt whose status does not parse record nothing (never-happens, beside the Dropped success case); a first read past the window on Dropped records `unconfirmed`, not `refused`; a Dropped read that starts inside the window and settles past it records nothing (a deferred receipt); a refused row later mined records `sent` and refreshes the account; a refused row past the window is unwatched, undialed, including at `start()` after a restart; a row with `checkSince` and an unlisted text each reach `unconfirmed` at the window on Dropped reads, as today. Gate: `F`.
3. **Display.** Change: `journal-state.ts`. Tests: one appended `CHECKED` row (`journal-state.test.ts`), run for transfer and dApp sends by the existing `test.each`. Gate: `F`.
4. **Composition and e2e.** Change: `service.composition.test.ts`: the `:1339` test keeps `Insufficient fee payer balance` checking after a Dropped read (the not-listed control; title fixed); one new test: `Existing nullifier`, a Dropped read reads "Refused by the network" through `buildJournalTerminalCardProps`, then a mined read reads "Sent" and refreshes balances. `tests/e2e/network/wait-for-tx-mined.test.ts`: the public-mint test captures its `Tx` with a spy on the test wallet's `node.sendTx` and, once mined, resends it: the real rc.3 node's refusal must pass `isFinalRefusal` (distinct failure: the node's text drifts from the classifier and the feature silently never fires; no cheaper layer runs a node; no new tx, measured). `tests/e2e/send-outcome-rows.test.ts`: one more seeded row, `check: "refused"`, its icon fill equal to its line colour in light and dark (no new scenario; distinct failure: the red row's style in a real browser; wall-clock before and after). Gate: `F`, the smoke file on Chrome and Firefox, `wait-for-tx-mined.test.ts` and `failed-send-check.test.ts` (network, Chrome; the latter's Terms refusal must stay checking).
5. **Arc gate.** `bun run audit:vue`, `bun run test:all`, `bun run check:plans`; pictures of `112-row-refused` and `112-page-refused` light and dark.

## Delivery

- Branch `refused-send-1-a1` off `origin/dev`, carrying the plan commit. PR, as a draft: `fix(activity): a send the network refused for good ends at once` (63 chars). Body: `Closes #112`; P76-03 C quoted by id and text; OA-1 and OA-2 stated with what ships; UI impact; pictures; validation runs; smoke wall-clock per browser. No label at creation; add `e2e:extension-network` afterwards if the path filter skips the network lane.
- Before the PR: merge `origin/dev`; if #924 or #938 landed, re-run `bun run baseline:storage` (with `-- --additive "a new check value; every stored row still reads"` and the printed pin once `pins.ts` holds one).
- The close-out (Outcome, `STATUS.md` deleted, the `git mv` into `archive/` in its own commit) is the PR's last commits. `code_review: off`.

## Post-implementation

Steps 2-5 of [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `01c279124`: reviewer `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus review (`general-purpose`) beside round 1; one loop over the arc's diff from `dev` after phase 5; hard stop at three rounds. Merging is the orchestrator's call.

## Audit verdicts

**Code review, round 1 (2026-10-20).** Codex `approve` (two comment lows) and the Opus review `approve` (six lows: comments, two test titles, a duplicate alias, three classifier rows); all adopted ([lessons/phase-5.md](lessons/phase-5.md)).

**Round 3 (Codex resume, 2026-10-20).** `approve`: "All three round-2 conditions are addressed … No new material defects found. The bounded correction window remains an explicitly disclosed design choice."

**Round 2 (Codex resume, 2026-10-20).** `conditional approve (with conditions: correct OA-3's recovery guarantee, propagate the accepted exceptions into owner-facing explanations, and specify the deadline-crossing case)`. All three verified and adopted: OA-3 B and D8 say the expiry path is one more chance, not a guarantee (`presentAnswer` records only a mined success); the prune and clock exceptions reach I1, D3, OA-1 and OA-2; `refused` needs a fresh clock reading after the read, with a deferred-receipt test.

**Round 1 (2026-10-20).** Codex (gpt-6.1-sol, high): `reject (with blocking findings: D3's permanence argument is false; the recovery window can end without any corrective read)`. Opus Plan leg: `conditional approve (with conditions: a failed read is never Dropped; a probe of the text through the default endpoint; D3, I1 and F3 per reason; the window's end defined and tested)`. C = Codex, O = Opus; every claim checked against the tree ([lessons/phase-0.md](lessons/phase-0.md)).

- **Adopted.** No permanence claim; the list shrinks to the brief's two reasons, `Invalid proof` out (C1, C3, O3). D8 states the bounded correction and OA-3 offers the expiry proof (C2). F1 and D4 say the text is the endpoint's assertion (C4). OA-1, D2, D5, D6 and I1 reworded, per reason (C5, O4). A failed read, a missing node or an unknown status is never Dropped, with never-happens tests (O1). The window decides before the refusal: a first read past it records `unconfirmed` (O5). The refusal flag is false on a `checkSince` row, tested (O6, C6). The move matrix requires a bare `{ check: "refused" }`; `isSendCheckMove` branches on `from.check` for the complexity budget (C6, O8). The test list gains the classifier table and the boundary cases and loses the repeated composition cases (C6, O7). F7 records dRPC's error passthrough from its source (O2).
- **Rejected, with reason.** A second classifier in `setSendCheck` (C6 agreed: coupling without new evidence). A live probe through the default endpoint (O2): it needs the keyed endpoint the lane may not open; the gateway's source and the local node e2e stand in. Dropping the composition flip to Sent and the smoke row (O7): the flip is one more step in the one new composition test and proves the real journal's `refused` → `sent` move; the smoke row is the brief's, no new scenario, and the source of the PR's pictures. O2's "a permanent e2e is not worth it": resending the mined tx a test already sends produces the refusal on demand with no new tx (C6).

## Seeds

Recommended: `/goal`. Use exactly one per session.

```
/goal implementations-plan/refused-send-1/plan.md phases 1-5 are ✓, each backed by its gate's output in the transcript; LESSONS_FILE=implementations-plan/refused-send-1/lessons/phase-N.md printed per phase; code_review is off and /code-review was not run; the Codex loop converged (a resumed pass with no new material finding, quoted); the draft PR exists against dev, opened after that loop, with Closes #112; bun run test and bun run lint report exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/refused-send-1 forward per its plan.md: reality check (plan, lessons, git status, the PR's checks), the next pending phase with its gate, Codex for decisions (gpt-6.1-sol, high), the loop before any PR, stop at 5 failures on one step, never merge.
```
