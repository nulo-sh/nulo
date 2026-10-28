# lock-window-1: phase 0 (planning)

## Recon

Three Sonnet explorers, read-only: the background sites (B1-B3, B5), the person-asked sites (B4, B6-B9), and the arc 2 screens with the restore path and SECURITY.md. Their findings are in recon.md; the lead re-read every line the plan cites.

## Consults

(Each Codex and Opus consult is logged here with its verdict.)

### Round 1 (2026-10-27)

- **Codex** (gpt-6.1-sol, high, read-only; session recorded in the local transcript): `reject` with four blocking findings. (1) An ownerless legacy row's commit re-reads before it dispatches, so F3 overstated the synchronous dispatch. (2) At the seed attempt cap, a refused marker is never repeated. (3) The import completion outlives its page. (4) Scenario B waits for Import's terminal state, which the new landing unmounts. Also: (5) D5 changes what a race shows; (6) a lock during the preview is already caught on the base. All verified against the tree and accepted; see plan.md § Audit verdicts.
- **Opus** (Plan): `conditional approve`. It added: `watchLockStart` already exists (recon missed it); raw facts in `LockLandingState`; the session joins `guardsHold`; a capture throw in `runWorker` must be silent; known limits KL-2 and KL-3; B3' and the reading of the owner's words go to the owner. All verified and accepted.
- Lead's own check while folding them: the seeder's `run()` reruns after an in-flight pass (`seeder.ts:226-249`), so an aborted pass is always followed by a fresh one.

### Round 2 (2026-10-27)

- **Codex** (resumed): `reject`. The session in `guardsHold` strands the capping seed attempt after a lock and re-unlock (verified: `seeder.ts:98-101,538-545,561`); KL-2 and KL-3 have observable outcomes. Resolution: the seeder leaves arc 1 (its markers are a deliberate exception, D4), KL-3 is shown in OA-2, KL-2 stays a known limit with the boundary argument recorded in plan.md § Audit verdicts.

### First final pass (2026-10-27)

- **Codex** (fresh session): `reject`. A refused poll is not always polled again: a Dropped row's watch is evicted at its window even while locked and never re-armed, and a lock past `waitForTx`'s 120 s bound leaves a registry toggle stale. Both verified (`transaction/service.ts:170-175,373-377,521-526`). Also: `clear()` keeps "keep open" for a second reveal; an overclaim about node work; the smoke gate's armed build. Resolution: the poller is a recorded exception (D1, alternative F), since D2 already lands the same write by design; `start()` re-enables the countdown; arcs reshaped.
- Lesson: "the next batch repeats it" was a claim about every exit of the watch, and the eviction path is one; check every way a retry set loses a member before calling a refusal self-healing.

### Second final pass (2026-10-27)

- **Codex** (fresh session, then resumed to verify): `conditional approve`, twice. Fixed: the network gate runs from the root with `NULO_E2E_PROVERLESS=1` and `NULO_E2E_RETRY=0`; the seed reset reverses `seed.test.ts:183-193`, now a planned rewrite with a UI impact line; `gh stack init` takes no `--adopt`. Held: OA-1's option B toast is seen on the lock screen, so the orchestrator decides whether arc 1 starts.
- Lesson: an owner ask is located by where the person sees it, not by which component renders it; write each ask's visible effect with its page, then check it against every arc's surfaces before claiming none overlaps.
