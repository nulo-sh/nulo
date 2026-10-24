# Phase 0: consults

## Codex r1 (plan audit), gpt-6.1-sol high, session 01a155ca

Verdict: conditional approve. Findings, each checked against the tree:
1. Unreadable record read as absent re-adds a deleted default (medium, demonstrated by trace). Accepted: three read states; unreadable adds nothing and keeps the bytes; a storage failure propagates.
2. `servesChain` reading rows before the record can refuse a chain the bootstrap is writing (medium, plausible). Accepted: read the record first (the writer writes rows first); a test drives that interleaving.
3. A2's take-once `announce` loses an arrival after a worker kill between the row and the record, and on a popup closed before render (medium). Accepted: announce also covers a not-offered kind a row of that kind holds; at-most-once vs until-acknowledged goes into OA-1.
4. The baseline needs a release cutoff (medium, plausible). Accepted: A1 lands before any build that adds a default; stated on #80 and in Assumptions.
5. The update test must change `__VERSION__` (medium, plausible). Accepted: A2 reuses migration-rule-1's `build-update-candidate.sh`.
6. The A1 network gate omitted `NULO_E2E_RETRY=0`; `vitest.e2e.network.config.ts:28` defaults to two retries (low, demonstrated). Accepted.

## Opus r1 (plan audit), Plan agent on opus

Verdict: conditional approve. All ten findings checked and accepted:
1. Arming the extra seed in `agent.sh` would give every network-suite profile a third default and change `seedStaleMainnet`'s verdicts: arm it only in the update candidate's build.
2. A plan-base `from` needs a second build path the harness lacks, and the gate must name `NULO_E2E_UPDATE_FROM`/`_TO` or the file skips itself: `from` is the pinned v1.0.0 release.
3. The red-on-base gate cannot be met for a new module's tests or a never-happens check: success controls must fail on the base; never-happens checks must fail under named mutations.
4. Nothing stops a later edit of `KINDS_SEEDED_BEFORE_RECORD`: a pin test hard-codes it with the reason.
5. Same as Codex r1 #2 (read order).
6. Same as Codex r1 #3 (announce after an interrupted pass).
7. A person who added Mainnet by hand gets no default row and no arrival: into OA-1.
8. If A1 lands first, migration-rule-1's constructor rule flags `new ValueStorage(` outside `wallet/storage/`: the plan says so, and the orchestrator is told (this lane cannot write in that worktree).
9. "One entry in `DEFAULT_SEEDS`" holds only for an unused kind: reworded; a pin for unique seed chainIds.
10. `seedingProfiles` must be set before the first write: the caller reads rows once and passes them in; the seed append is removed in `finally`.
Ask raised: whether the update e2e runs by hand or in CI. Panel call: as the harness decides (migration-rule-1 D12: opt-in, by hand before each promote, and in this lane's A2 gate).

## Codex final pass r1 (fresh session 01a155da), gpt-6.1-sol high

Verdict: conditional approve. (1) Test 15 as worded passes under either read order: the reader must park between its two reads while a whole pass commits (demonstrated by trace). Accepted. (2) A rename already survives on the base (`service.ts:266-267`), so it is proven only under a mutation. Accepted. (3) A new profile whose first seeding is interrupted reopens with rows and no record and would announce once in A2 (plausible). Accepted as an OA-1 disclosure; suppressing it needs a second marker, not proposed.

## Codex final pass r2 (resumed 01a155da)

Verdict: approve. "All three conditions are addressed ... No new material regressions found. A1 can start."
