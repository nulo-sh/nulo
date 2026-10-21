# Phase 0: recon and the plan's panel

## Recon (2026-10-20)

Two Sonnet Explore agents (the node client's error shapes; the journal's failed path and its consumers), plus direct reads of the rc.3 node source on the host (`aztec-node` `server.ts` `#sendTx`, the `p2p` validators, `stdlib` `error_texts.ts`). Findings in [recon.md](../recon.md). The node's reason texts are exported by the wallet's own `@aztec-labs/stdlib/tx`; the `Invalid tx: ` prefix is a literal in the node's server.

## Codex audit, round 1 (2026-10-20)

Codex (gpt-6.1-sol, high, read-only, default login), session `01a15ab0-dd5a-73e0-9059-62c2896d27f5`. Verdict: `reject (with blocking findings: D3's permanence argument is false; the recovery window can end without any corrective read)`.

Each claim checked against the tree before acting:
1. High, demonstrated: an existing-nullifier refusal is reversible. Checked: `isValidTx` reads `worldStateSynchronizer.getCommitted()` (`server.ts:821`) and `handleChainPruned` unwinds it (`world-state` `server_world_state_synchronizer.ts:555-557`). Adopted: D3 and F3 no longer claim permanence; the list is a floor.
2. High, demonstrated: a wrong red can outlive the window (lock or closed wallet through the 30 minutes, or failed reads; past the window the plan unwatches with no read). Adopted as disclosure: D8 states it; OA-3 offers the expiry-proof correction, which changes the row's words a day later, so it is the owner's.
3. Medium: `Invalid proof` is not final evidence (checked: `bb_verifier.ts:110`, "any other failure returns `valid: false`"); the expiry check uses the node's next-slot prediction (checked: `server.ts:824-836`). Adopted: the list shrinks to the brief's two reasons, `Existing nullifier` and `Invalid expiration timestamp`; every other text keeps today's check.
4. Medium: the stored text is the endpoint's assertion, not its provenance (checked: `safe_json_rpc_client.ts:141-155` maps a malformed object's top-level `message`). Adopted: F1 and D4 qualified; classification stays in the send check under the existing trust model.
5. Medium: OA-1 overstated ("finds no node", "rare", "within seconds" unmeasured); D6's later Dropped can come from another replica; "≤5 s" ignores the 60 s request timeout. Adopted: wording fixed in OA-1, D2, D5, D6 and the flow.
6. Medium: tests repeat success paths and miss the boundaries. Adopted: a classifier table with near misses; a throwing read and an unparseable status; a refused row past the window at `start()`; a `checkSince` row; the move matrix requires a refused destination with neither inclusion nor `checkSince`; the composition cases cut to two. A real rc.3 text check appended to an existing send by resending its captured tx (`wait-for-tx-mined.test.ts`), no new proving scenario. Rejected: a second classifier inside `setSendCheck` (Codex agreed it adds coupling without new evidence).

## Opus Plan leg, round 1 (2026-10-20)

`conditional approve`. Checked: `minedVerdict` folds a failed read into no verdict (`send-check.ts:254-263`), so a status beside it could read a failure as Dropped (O1, adopted); `isSendCheckMove` sits near the ceiling (O8, adopted as a `switch`); recon's enum line was `spec.ts:242`, not `:216` (fixed). O2's probe through the default endpoint was replaced by reading dRPC's public gateway source: `parseJsonRpcBody` keeps the upstream error's raw bytes and `EncodeResponse` writes them back as `"error"`; `errors.yaml` retries by message text and lists no `Invalid tx` text (`drpcorg/nodecore` main, read 2026-10-20). Dispositions in plan.md § Audit verdicts.

## Codex rounds 2 and 3 (2026-10-20)

Same session. Round 2: `conditional approve`, three mediums, each checked: `presentAnswer` records only a mined success and unwatches otherwise (`send-check.ts:215-228`), so OA-3 B is no guarantee; the prune and clock exceptions had not reached I1, OA-1, OA-2; `firstAnswer`'s `now` is captured before its await (`send-check.ts:166-178`), so a read crossing the deadline needs a fresh clock reading. All adopted. Round 3: `approve`, no new material defect.
