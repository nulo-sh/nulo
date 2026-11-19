# Phase 0: planning consults

Every consult of the planning run, failed ones included. Codex runs `gpt-6.1-sol` at `high`, read-only; the same-family leg is Opus 5.5.

## Research (2026-11-03)

Six read-only Explore agents (Sonnet) mapped the node client, the PXE's node use, the network service and its UI, execution and pending checks, the background readers, and the test and CI tooling. Their reports are in `research/`, persisted verbatim, scrubbed of one sentence each that named the endpoint-constants file's provider host.

Findings that changed the brief's framing:

- A changed `rpcUrl` disposes and rebuilds the offscreen PXE runtime under the chain write guard (`research/pxe.md` § 1), so any design that swaps the URL the PXE is built from waits behind an in-flight proof and rebuilds on every switch.
- The PXE's synced store is per (profile, chain), never per URL (`research/pxe.md`, answer first), so one PXE can follow several endpoints of one chain.
- A PXE that syncs from a node whose tip is behind its anchor emits `chain-pruned` and deletes notes above that tip (`research/pxe.md` § 2); a lagging fallback is a state regression, not only a failed call.
- `getNodeForUrl(primaryEndpointUrl(network))` serves two different intents today: a pending transaction's pin (privacy § 5.1) and "this row's node, not the active profile's" (#658's fix shape). Only the first must stay pinned.

## Independent designs (2026-11-03)

- **Codex** (session `01a1a26f-923d-7632-8bd7-5abc75b0a0a5`, gpt-6.1-sol, high): a routed `AztecNode` facade over endpoint-bound clients; per-context in-memory health; pin each PXE operation to one endpoint and let a mid-proof failure end the attempt; 10 s read attempts; admission by identity and a tip floor; two passing probes 30 s apart to restore; leave existing rows untouched when the proxy is seeded; relay in the extension test tree, no new package.
- **Opus 5.5** (Plan agent): the same facade and per-context health; per-call hop to an admitted endpoint so a proof continues; 60 s attempts kept; a 4xx hops unless its JSON-RPC code is in the reserved range; a floor from the PXE's synced header and served tips; `pickForSend` by anchor; holdDown doubling per flap; a one-time append of the proxy with a durable record; relay fixture plus a browserless sandbox suite skipped on the Firefox lane.
- **Main draft**: a routing fetch under one client. Both reviewers rejected it independently with the same reason (one client sizes a batch for one endpoint's cap; the transport would have to sniff `aztec_sendTx` from bodies); accepted, D2.
- Consolidation took the facade (all three agree on everything around it), Opus's per-call hop with the floor over Codex's per-operation pin (D5), Opus's 60 s attempts over Codex's 10 s (D4), Opus's reserved-code rule with Codex's no-substring rule (D3). The ledger in `plan.md` records each.

## Audit round 1 (2026-11-03)

Contradiction check merged into round 1 (one Codex pass and one Opus pass each answered it first), a deviation from the tier's separate contradiction round, recorded here.

**Codex** (session `01a1a289-8a67-7832-891f-51e448b96a3c`, gpt-6.1-sol, high): `VERDICT: revise`, 2 blockers, 12 majors, 3 minors. It ran in-memory SDK traces for findings 4 and 9 and checked Facts 2 and 3 directly (a failed batch shares the fetch's error at `cause.data`; a plain object of the 58 schema methods works under `withCache`).

| # | Finding | Disposition |
|---|---|---|
| 1 | Phase 6 gates on OA-1 but not OA-8 | accepted |
| 2 | 408/425/429/refused vs four rounds; one timeout = down vs parity; a cold 5 s admission probe breaks parity | accepted: an endpoint that answered `overloaded`/`refused` is spent for that call; a down endpoint is still tried when no other can take the call; the primary takes calls under today's identity checks with no router probe, so one endpoint means no probe |
| 3 | the pending poll's stall falls to 60 s, not to zero | accepted: claim corrected and the 60 s bound tested |
| 4 | blocker: time-based floor lowering lets a stale survivor prune the PXE while the newest endpoint is unreachable | accepted: no time-based lowering; the floor moves down only with the endpoint the PXE is already on, as today |
| 5 | blocker: the PXE's sender sync reads pending receipts through the routed node, so a pending hash reaches a non-submission endpoint and one `DROPPED` drops the pending tag indexes (`classify_pending_txs.js:28-51`) | accepted: the send pick moves into the offscreen route, which pins the hash to the picked endpoint for every node call that takes it |
| 6 | the pick falls back to the active endpoint even after it answered for another chain | accepted: an affirmative identity failure refuses the send; the claim about a send-time identity check corrected |
| 7 | a redirect could carry a submission to a second endpoint | rejected, needs unsupported conditions: only a configured endpoint can redirect, and the same endpoint can forward server-side; refusing redirects removes neither |
| 8 | "no URL, ever" overclaims for the existing error pipeline | accepted: the claim is limited to the router's own events |
| 9 | a proposed-only floor misses checkpointed, proven and finalized regressions | first accepted (per-tier floor), then reversed after the Opus leg's finding 7 and a code check (D10); Codex conceded in round 2 |
| 10 | I2 and I4's gates do not test their claims | accepted: an explicit unknown-anchor request; I4 described as synthetic |
| 11 | bounded readers own their budgets (sponsor funding 5 s); concurrent in-flight calls all pay the timeout | accepted: `singleAttempt(timeoutMs)`; parallel pick probes bounded at 5 s; the 60 s claim restated |
| 12 | file map misses `shared-send-deps.ts`, `execution/service.ts`, the coordinator's result, package exports, `seed-identity.ts`, per-grant receipts | accepted |
| 13 | `failed-send-check.test.ts` and the proof gate need a proverless build | accepted: proverless runs per browser plus the prover-on canaries |
| 14 | the composition test exceeds its seam | accepted: narrowed to a canned picked handle at the coordinator |
| 15 | E1 pauses before `proveTx`; no sandbox runtime estimates | accepted |
| 16 | known-limit dispositions contradict the threat model; flap state needs a trace | accepted for the dispositions; the flap rule kept with its trace and simplified |
| 17 | "In use" has no wallet-wide truth; OA-2's "order Settings shows" is wrong when the primary is not first | accepted: OA-3 asks which context's endpoint and when it refreshes; OA-2's wording fixed; reorder dropped |

Conceded by Codex: D4 (60 s attempts) and D12 (same-URL submission retries).

**Opus 5.5 Plan leg** (round 1): `VERDICT: revise`, 1 blocker, 10 majors, 10 minors. Read `3b845ef02` and the installed 6.0.0 packages.

| # | Finding | Disposition |
|---|---|---|
| 1 | blocker: one-endpoint parity contradicted by `down`, admission and the floor | accepted (with Codex 2); one part rejected: an endpoint never admitted never takes a call, even as the last candidate, since its chain is unknown; the primary needs no router probe, so parity holds |
| 2 | I3 is answerable now; the plan creates its trigger | accepted; its known-limit disposition superseded by Codex 5's pin |
| 3 | auth registry wired two ways; grants have no recorded URL; the revoke's own wait | accepted: lookup by hash through `TransactionService`, no stored field |
| 4 | Phase 8 gate needs proverless; E1 pauses before `proveTx` | accepted (with Codex 13) |
| 5 | the D3 table's 408/425/429 with a non-JSON body; untagged 200 bodies; I2 settled by code; D13's bound; S3's order; a frozen active tip | accepted |
| 6 | a fallback a block behind waits 30 s | accepted: a `behind` endpoint is re-probed by the next call that has nowhere else to go |
| 7 | the proposed tier is enough; the active endpoint's own lag; background floor | accepted for the tier (verified: `syncChainTip` is never set, so 'proposed'; tier events touch only the tips store); the background floor kept (D20) |
| 8 | refusals counted toward `down` put the free primary down and bill the relay; the peak measured at the wrong layer | accepted |
| 9 | a URL in logs through `RouteEndpoint.url` and the pinned retry logger | accepted for the field name (`rpcUrl`); rejected for silencing pinned clients, since the redactor reduces URLs to origins by design (D19) |
| 10 | no new path for two endpoints or wrong chain | noted |
| 11 | Facts 2-4 hold; `withCache` is not importable from the package | accepted: that check moves to the sandbox |
| 12 | `readPublicStorageOnce` would lose its 5 s budget | accepted (with Codex 11) |
| 13 | eviction misses `updateEndpoint` and retirement on non-primary endpoints | accepted |
| 14 | `retryWhile` is also checked after each sleep today | accepted |
| 15 | the tip gate reads the background's endpoint | accepted as a known limit |
| 16 | gate commands exist; Phase 2's pathspec excludes the fake; the dApp-wait type | accepted |
| 17 | composition outside its limits | accepted (with Codex 14) |
| 18 | missing scenarios; runtime estimate; Firefox skip sound | accepted |
| 19 | drop the background floor; D13 its own commit; fix auth and logging rather than file | D13 commit and auth accepted; background floor rejected (D20); logging rejected (D19) |
| 20 | OA-5's A adds the relay behind people's own nodes | accepted: option D, recommended |
| 21 | OA-3's view; OA-4 removable; arc 4 may be empty; D4's visible cost in OA-8 | accepted, OA-4 kept with the empty-arc note |

The two legs disagreed on the floor's tiers (Codex: per tier; Opus: proposed only). Settled on the code: the wallet never sets `syncChainTip`, the PXE's default is 'proposed', and the tier events only update the tips store (`block_synchronizer.js:57-94`); the finalized number reaches sender sync as a bound that only delays finalizing (`private_execution_oracle.js:271-275`). Round 2 asks Codex to attack that.

## Audit round 2 (2026-11-03)

Split as the tier asks: the round-1 Codex session resumed for a self-critique, and a fresh Opus 5.5 Plan agent for a hostile audit. The resume script's third argument is its output directory, not the working directory: the first resume wrote its session files into the worktree root; they were moved to the scratch folder before anything was staged.

**Codex** (session `01a1a289`, resumed): `VERDICT: revise`, 6 majors, 3 minors. Self-critique: all 17 round-1 findings judged right in substance; conceded D18 (redirects) and the per-tier half of finding 9 (D10). Confirmed the installed PXE's outbound pending-hash reads are all `getTxReceipt` (`classify_pending_txs.js:29`, `resolve_pending_txs.js:36`, `tx_resolver_service.js:18`, `utility_execution_oracle.js:826-841`); no `getTxByHash` or `getTxEffect` call needs a pin.

| # | Finding | Disposition |
|---|---|---|
| 1 | a fallback cannot be admitted at cold start while the primary is dead: there is no primary rollup address to compare | accepted: the trust root is the row's chain identity plus, in the offscreen, the store's rollup stamp; a cold-start test |
| 2 | a window between the proof and the send | outside routing: any node answers that window the same way today; handed to the orchestrator for triage, no plan change |
| 3 | a pin lost when the runtime is rebuilt contradicts the promise | accepted: pins live in the offscreen service per (profile, chain) for the document's life, so a rebuild keeps them; the remaining limit is the document itself reopening inside the pending window, stated in OWNER-ASKS |
| 4 | a grant can exist without a transaction row; the accessor follows the active profile; the revoke's caller gets only a hash | accepted: the journal or transaction row, profile-scoped, else fail closed; the send returns its endpoint |
| 5 | OA-3's account-engine marker has no offscreen snapshot; contexts can differ for longer than seconds; scans attribution | accepted |
| 6 | S4 kills A during the build, not inside `proveTx` | accepted |
| 7 | the narrowed composition test still needs a proving stub outside the allowed seams | accepted: the composition file is dropped; coordinator units and E1 cover it |
| 8 | stale per-tier text; parity must exclude the send pick | accepted; a one-endpoint network picks without a probe |
| 9 | the new PXE request also needs `pxe/spec.ts`'s `Methods`, dispatch, validation and fencing | accepted; kept off `IPXE` |

**Opus 5.5 Plan, fresh** (round 2): `VERDICT: revise`, 3 blockers, 3 majors, 8 minors, none repeating round 1.

| # | Finding | Disposition |
|---|---|---|
| 1 | blocker: one moved tips or block read lets a fallback behind (or ahead) prune the PXE; a `ready` fallback's tip is never refreshed | accepted: the block stream's reads never move (D21); no call moves to an endpoint not seen at or above the floor; S3b |
| 2 | blocker: at cold start with the primary dead, admission has no reference and the floor is seeded too late | accepted: the store opens first and its stamp is the reference; the floor is seeded before the first operation and demotes a non-primary active endpoint below it; the background checks ids only |
| 3 | blocker: a dead pinned endpoint fails every later execution that syncs the secret | accepted: the pinned read answers `PENDING` (D22); S7b |
| 4 | the pick waits behind another proof under the chain guard, and `ensure` can rebuild a stale runtime | accepted: profile barrier only, `registry.peek`, the primary when no runtime |
| 5 | a parallel pick contacts every endpoint on every send | accepted: no request while the active endpoint is ready; sequential otherwise |
| 6 | the return rule breaks one-endpoint parity | accepted: probes gate only a change of active endpoint; a lone endpoint returns on a success |
| 7 | all-down rounds double the worst case | accepted: only the most-preferred is tried |
| 8 | `behind` re-probes have no spacing | accepted: one per 5 s |
| 9 | gateway codes inside a 200 never move | accepted: per-entry and whole-body non-reserved codes are `refused` |
| 10 | the revoke's handle cannot reach its wait | accepted: the same lookup as grants (D23) |
| 11 | `reportEndpointFailure` would evict the wrong client | accepted: removed in the poll commit |
| 12 | E1's "A sees nothing" is vacuous with A dead | accepted: A restored before the block |
| 13 | the smoke command and the hang-case timeout cannot run as written | accepted: the armed build per browser; the blackhole waits the real 60 s |
| 14 | S2 duplicates a unit test; the 30-min cap is spend; Fact 3's wrapper | accepted: S2 cut, the cap in OA-8, Fact 3 fixed |

## Audit round 3 (2026-11-03)

**Codex** (fresh session `01a1a2b3-3e60-7da2-9f89-2f069835baae`): `VERDICT: revise`, 3 majors, 4 minors. All accepted: a JSON 429 or refusal on the active endpoint's `getBlock` (including `PXE.create`'s `getBlock(0)`, `pxe.js:110`) wedged sync with "sync reads never move", so a failed sync read now passes the active role and is re-sent once (D21); `openChainStore` checks and writes the stamp inside the open (`opfs-store.ts:171,197`), so the open is split from the check; the anchor store throws on a store that never synced (`anchor_block_store.js:23`), so the floor starts at genesis there; a pick with no active endpoint refuses before recording (D25); E1 sends a second transfer to trigger the PXE's sender sync; the smoke loop runs under `set -e`; the restart exception lasts until the block, not once.

**Opus 5.5** (the round-2 auditor, resumed to verify): `VERDICT: approve with changes`, 13 of 14 round-2 findings resolved, 3 majors and 6 minors new, all accepted: leaving the no-active state by probing (D24) and doubling `holdDown` only when another endpoint served; seeding the floor takes the role from any active endpoint below it when another exists, so a rebuilt runtime never starts on a primary still catching up; an out-of-route pinned URL gets its own health record; every node read after the store's open sits inside the close-on-throw; reads by hash move, reads by number follow the active endpoint; a no-runtime pick probes the request's endpoints; a pin ends once its endpoint places the hash in a block; ledger row D3 fixed; known limit 6 extended to a pool's upstream sampled once.

## Audit round 4 (2026-11-03)

**Codex** (session `01a1a2b3`, resumed): `VERDICT: revise`; all 7 round-3 findings resolved, confirming D25 fits the coordinator (`execution-coordinator.ts:367` precedes dispatch; `operation-journal/service.ts:691` records a pre-submission failure as not sent). Two majors, both accepted: an out-of-route pinned URL marked `down` never recovered, so a pinned read now makes one attempt once its `nextProbeAt` passes; a pin ended at inclusion was lost when the block was pruned (`sender_tagging_store.js:53` keeps pending indexes through a rollback), so pins hold to finality.

## Audit round 5 (2026-11-03)

**Codex** (session `01a1a2b3`, resumed): `VERDICT: approve`. Round-4 findings 8 and 9 resolved; no new blocker or major. The panel closes: Codex approve, Opus approve with changes (round 3, every change applied).
