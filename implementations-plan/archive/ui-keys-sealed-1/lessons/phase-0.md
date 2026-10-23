# Phase 0: planning consults

Every panel consult of the planning run, with its verdict. Transcripts stay local (`audit-*.md`, gitignored).

## Consult 1: Codex audit, round 1 (2026-10-22, gpt-6.1-sol, high, read-only)

- Packet: plan.md (outline A), outline B, recon.md, OWNER-ASKS.md, the four asks, the re-cut as a gate change.
- Verdict: **reject**, blocking findings F1-F8. A is the better foundation (D1, D3, D4, D5, D6, D7, D8, D9 agreed in substance); per-profile pointer preferred architecturally.
- F1 (demonstrated, in-memory reproducer): a non-envelope JSON string at a sealed root is served by the shared dual read, so "a string is an envelope or refused" is false.
- F2: the bare pointer claim gives one profile another's address. F3: an interrupted pointer claim needs an "occupied destination wins" rule.
- F4: `whileHeld` checks only that the keys are held, which a lock or a switch does not change; the methods need the session and deletion fences (the `ContactService` pattern).
- F5: `scope-follow`'s `unless` cannot cross the RPC; its two facade-suspension tests prove a guarantee the plan must carry or surface.
- F6: different-phrase profiles can share an imported account, so OA-1 understates who is affected; a visible default cannot ship before sign-off.
- F7: the unfrozen generator recomputes every expectation, so the re-cut could bless an unrelated change; compare against the merge base once.
- F8: `shapeOfKey` does not classify the bare pointer key and the verifier would count the converted keys as lost; specify the exact adaptation.

## Consult 2: Opus audit, round 1 (2026-10-22, Plan agent, beside Codex r1)

- Verdict: **reject**, blocking F1 (demonstrated: the update replay reads every release row through the candidate's registry, `stored-shapes/reads.ts` `unreadRows`, and a service-only conversion leaves the structured maps and the bare pointer unread before unlock) and F2 (the re-cut has no equivalence check).
- Also: F3 a nightly pre-release carries stamps 0-1 (`git tag --contains 11439b1be` → `v0.31.0-nightly.26296`); F4 the unfreeze stays possible after the re-cut; F5-F6 fences; F7 reads that throw stall two callers with no catch; F8 the follow's `unless`; F9 a planted JSON string stays plaintext; F10 the bare claim (today's exposure).

## Decisions after round 1

- D4 flipped to the shared store option (`legacy: "structured"`), against Codex r1's preference, on Opus F1's evidence: the registry's read path is the store's dual read.
- D1/D2: the bare pointer key stays registered unchanged; the sealed pointer is a new per-profile root; OA-1 rewritten (A one last selection, B per profile, C unsealed) and the PR waits for it.
- D10: a planted non-envelope JSON string is served and sealed, as at every sealed root (#1053), not made unreadable (Codex F1's fix).
- D11: the follow's `unless` is checked right before the post; a send starting during the worker's processing is KL-1.
- The re-cut gains its equivalence proof (step 5) and keeps every golden, the six pre-seal map goldens included, so R3 keeps proving the structured read.

## Consult 3: Codex audit, round 2 (2026-10-22, resumed session)

- Verdict: **reject**, blocking R2-1 (OA-1 A as per-profile rows plus removal of the others: a worker stop between the seal and the removals leaves two remembered selections that no reopen repairs), R2-2 (the pointer equality applied after both scenarios change the selection on purpose: the replay activates Testnet before unlock and the recorded pointer is a sandbox-chain account, confirmed in the recording), R2-3 (waiting for `onConnected` before the call escapes the request deadline). Also R2-4: KL-1's visible consequence was in no owner ask; OA-1 C's contract was inconsistent.
- Accepted from r1: D4 now justified; D10 provided `sealLegacy` keeps its JSON-string path; F2, F4 (fences also on the claim's mutations), F7 (with a per-id projection, the exact added ids and unchanged old records).

## Decisions after round 2

- D2: the pointer's layout follows OA-1's answer (A one device row naming its writer's profile, B per-profile rows), each write one `set`; the pointer phase is built after the answer.
- D11: no connection waiter; `unless` is checked before the call, which the client's deadline bounds; the send window becomes KL-1, now inside OA-1's sign-off.
- `verify.ts` checks per phase: locked readability, then envelopes plus "bare gone and a sealed row stored", and the exact pointer only where the scenario keeps the selection (live update right after unlock; replay the bootstrap's Testnet choice).
- OA-1 C is a variant with its own contract (three goldens, no root, the plaintext pointer's writer and census kept, `Refs #1062`).

## Consult 4: Codex audit, round 3 (2026-10-22, resumed session, the last resumed round)

- First attempt failed: "Selected model is at capacity"; the retry 45 s later on the same model ran.
- Verdict: **reject**, blocking R3-1 (demonstrated in an in-memory interleaving of A4's `purgeSealedRowsOf`): with OA-1 A the device row is the one slot two profiles write; deleting A while B is active, the sweep's re-read snapshots A's envelope, B's write lands, the sweep removes B's row. Also R3-2: KL-1's owner text said "milliseconds" while the window includes the request's connection wait.
- R2-1 to R2-4 and the C contract verified resolved; no further objection to D4 or D10; the device-row attacks (retained-key read, swap, rollback, two windows, same-id adoption) hold.

## Decisions after round 3

- R3-1: with A, `UiPreferenceService.purgeForProfile(p)` (the `ContactService.purgeForProfile` pattern) runs among the coordinator's typed purges, before `dropRowKeys` and the sweep, under the lock every pointer writer holds; keyless, so a resumed deletion works. No exclusion list, retry or reconciliation.
- R3-2: OA-1's KL-1 text says "after the switch's request has left the window", with the longer case named.

## Consult 5: Opus audit, round 2 (2026-10-22, Plan agent, beside Codex r3)

- Verdict: **conditional approve**, U1-U5. F1-F10 verified resolved; the device row held every attack asked (retained-key read, the owner's deletion with Codex R3-1's purge, same-id adoption, rollback, two windows, a crash mid-claim); D11's removed send case is an owner-gated change, not a loosening.
- U1 (demonstrated): sealed `.full`/`.minimal` goldens for `uiSelectedAccount` red the goldens block's property check (`snapshot.test.ts`); A4 keeps every sealed shape's `.full`/`.minimal` plaintext plus a `.sealed`. U2: `default-network-arrival-update.test.ts` also calls `updateProblems` after an unlock with the bare pointer written. U3: the C variant inherited A/B-only gates. U4: the map records may differ only in `encoding`, `sealed`, `legacy`; `--argjson`, not `--slurpfile`. U5: OA-1's KL-1 wording.
- All five adopted.

## Consult 6: Codex final pass (2026-10-22, fresh session, gpt-6.1-sol, high, read-only)

- Verdict: **conditional approve** (with conditions: fix F1-F3; record explicit OA-1 and OA-2 sign-off before delivery). No new architectural blocker; the A deletion purge verified.
- F1 (demonstrated): P2's smoke gate runs `accounts.test.ts` and `fixtures/extension.ts`, which read the bare pointer P2 stops writing; fix: the raw e2e reads move into P2, and `saveFeePick` leaves `ProfileService` with its callers. F2: P2's grep banned the key helpers D8 keeps for the `onChanged` trigger. F3: the seed and the re-cut note assumed `Closes #1062` under C.
- Qualifications kept in the plan: the RPC deadline bounds the caller's wait, not an operation the worker took; `ContactService`'s reads lack the final session re-check.
- All adopted; the conditions are plan text now, and the sign-off is the orchestrator's and the owner's.
