# service-structure-1: arc 3, phase 3 (#547)

## Implementation

- Base 77aad1e5. The outbox block had shifted by a few lines since the plan (D11); its content was unchanged.
- The original block was cut by line number, the expected renames applied with `sed` (`this.repo.` → `this.deps.repo.`, the two services, `logWarn`, `withServiceLock`, the two method names), and diffed against the class body. Only the active-profile read differed, and after round 1 (D13) only its call site.
- `services.get` is `get<T extends IService>`, so a `Pick<…>` dep cannot be inferred from it; the wiring names the service type explicitly.
- Mutation check, red: `anchorFreshTask` without its `isCurrent()` check fails the class suite's revoked case. The scenario suite's displaced-holder case fails too, since it revokes the ticket during the refresh request.
- One gate run showed 2 failures. The same-family reviewer was running a temporary mutation on `balance-outbox.ts` at that moment; it restored the file, the rerun was green, and the moved block was re-diffed. Reviewers running mutations share the tree with the implementer's gates.

## Codex round 1 (gpt-6.1-sol, high, session 01a14cbb)

- Verdict: findings. Medium, demonstrated with an in-memory reproduction over the real `Lock`: the `activeProfileId` adapter (`async () => (await getActiveProfile())?.id`) put one more microtask before `listOutbox`. A receipt writer that released the lock in that window was listed, and anchored, one drain earlier than before. Accepted (D13). Low: the class suite's header claimed the service fixture could not time its window; reworded.
- Confirmed: init order, late binding, the deps' width, the lock guards and the write spans.

## Opus review (alongside round 1)

- Verdict: findings, low and nit. The same two points, plus the class doc omitting the delete on a gone balance pair. All folded into a036c0d1. Checked clean: the four `markDirty` sites hold the lock; the log strings and the static guard's match are unchanged.

## Codex round 2 (resumed session 01a14cbb)

- Verdict: clean. Its real-lock reproducer gives the original ordering again. The loop converged at round 2.
- Part B, the decomposition map: the recommendation is defensible (moderate confidence). Corrections taken: the tail range ends at `:2749` (99 lines); both arms dedupe own sends before trust, and their commits differ in where the pure record build sits and in return semantics; the scheduler set is also reached through `stopPublicScheduler`, `watchedContracts` and `publicWatched`; the six public-arm describes span about 1,140 lines, not 1,800; "nothing to gain" from the read API was overstated.

## The decomposition map (panel)

- Codex (round 2, Part B) ranked the public arm next, after a shared commit collaborator, with moderate confidence. The Opus Plan lens answered "rethink" and was verified in the tree. The scenario suite already runs over an in-memory repository fake and the constructor's fake-reader seam, so a split buys no cheaper tests. A collaborator extracted first would have one caller. 206 of the public arm's 222 changed lines come from two PRs. The issue recommends stopping at the map and splitting the public arm when its next substantial change is scheduled (D15).
- Line counts from a `split('\n')` include the empty string after the final newline: the first map's tail range overran the file by one line.
