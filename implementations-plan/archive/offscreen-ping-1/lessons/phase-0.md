# Phase 0: planning consults

Every consult of the planning panel, in order. Transcripts stay local; verdicts and dispositions are in `plan.md` § Audit verdicts.

## Codex r1 (fresh session, gpt-6.1-sol, high, read-only), 2026-10-22

Verdict: *conditional approve* (scope invalidation to the current lifecycle, correct the recovery bound and assumptions, strengthen the tests). One blocking, six should-fix:

1. Blocking, demonstrated: an unqualified mark lets a request sent to an earlier document, timing out after a successor is trusted, clear the successor's trust; the successor, busy with its cold sync, then misses a ping and is closed. "At worst one ping" was wrong: the ping can destroy.
2. F1, F7 and I-1 claimed more than their code: concurrent callers share one pass; the offscreen stale-anchor retry re-runs a prove; one broadcast call site is not once per journal entry.
3. D2 is not a wall-clock bound: with no later request nothing is replaced; a hung close keeps `pendingClose`; a PONG does not measure PXE progress.
4. I1-I3 are hypotheses; D7 must not lean on the records as proof of I1.
5. A delayed READY or PONG from an earlier Chrome document can establish trust (no nonce); keep the ghost-message limit explicit.
6. Asks: cite the lane brief's delegation for D2, D4, D5 instead of "nothing changes on screen".
7. Tests: the reproducer must assert the close at the simulated time and drain pending work, or a red base hangs to A's deadline; add a stale-terminal regression and a readiness-timeout control; keep healthy-PONG controls asserting a PING was sent.

Also: outline B keeps the idle-renderer failure; the subclass is the right seam (forward `tag`); acceptor writes are right; `RpcTimeoutError` fits D3; `probedAt` stays 4.

## Opus r1 (Plan agent, opus, fresh), 2026-10-22

Verdict: *conditional approve* (clear trust only for a request sent after the document last answered; finish the red case's pass; keep the Firefox L636 case from passing without a ping; I4 and a known limit for long PXE work; quote the delegation for D2). Five should-fix, six nits:

1. The same defect as Codex r1 #1, traced further: within one document, N requests queued behind one long op each clear trust in turn, so one long op costs N pings. Fix: record when the document last answered and clear only for a request sent at or after it (`record.startedAtMs`), no tag plumbing.
2. On the base code the red `offscreen.test.ts` case leaves a pass running into later cases; drive it to its end.
3. The cases at L96 (second pass), L600, L619, L636, L674 need a mark; L636 would pass vacuously, so it also asserts the PING.
4. "The thread is free between sync steps" is an inference the 1,000-sender record contradicts: I4, and a known limit.
5. Quote the lane brief's delegation for the slower hang detection and the dApp-facing error class.
6. I3 is unmeasured (the harness kept the worker alive); the common restart is the popup after an idle kill. D5 stays a known limit; the owner-level fix would persist the answering `documentId`.
7-11. Reword the ghost-READY sentence; forward `tag` to `super` (no extension test would catch dropping it); `send_failed` also fires on an oversize message (cost one ping, leave it); outline B also never reaches zero under continuous traffic; use `getNoteSchemas` in the reproducer (profile-bound ops need a generation provider), and assert the close before awaiting A.

Also: placement traces (READY timeout, close-and-retry, detached Firefox frame, worker restart, close tail) hold; `probedAt` stays 4; the `onTerminal` seam runs inside `settle` before the caller's handlers; F1-F9 citations hold.

## Codex r2 (resumed `01a162a3`), 2026-10-22

Verdict: *reject* (wall-clock timestamps do not order requests and answers). Two blocking, one should-fix:

1. Blocking, demonstrated comparator failure: a request sent while untrusted and a PONG in the same millisecond compare equal, so the request's later timeout clears the newer trust; `>` instead of `>=` fails the opposite control. Fix: an answer token, a fresh integer on each accepted READY or PONG, captured through `requestTag` at the send and compared for equality at the terminal, the base tag forwarded.
2. Blocking: a backward `Date.now()` step suppresses every later mark until wall time catches up (hours), so a hung document is never replaced; the plan's "one missed mark" was false.
3. Should-fix: tests must pin the boundaries (a request sent while untrusted, a re-trust within one document, a late send rejection across a re-trust).

Verified: the other revisions, the five marks, the forwarded tag, the typed timeout, `probedAt` = 4.

## Opus r2 (resumed), 2026-10-22

Verdict: *conditional approve* (fix the clock-step claim; move the fake clock in the stale-terminal and step-6 tests; give the forwarded-tag test a generation). Three should-fix, two nits: a backward clock step keeps a hung document trusted for the step's length (proposed: also clear when `Date.now() < heardAtMs`); vitest's fake `Date` puts A's send and Y's READY on one millisecond, so the stale-terminal case fails as written; `simulateTx` needs `registerPxeGenerationProvider` or the base throws before the send; the readiness-phase control must hold `getContexts` past the deadline while trusted; the gate's diff allowlist omits the two new cases. Verified: joiners, `requestAlreadyReady`, send failure, N queued, the reset, the five marks, Phase 1 red on base.

Disposition (planner, on the two legs): the answer token (Codex r2) replaces `heardAtMs`. Both legs found the clock defect; the token removes the clock from the comparison instead of adding a second comparison over it, and also removes Opus r2 #2's fake-clock trap. Opus r2 #3-#5 accepted.

## Round 3 (both resumed), 2026-10-22

- **Codex r3**: *approve*. The token fixes both r2 blockers; `answerSeq` is never reset, so no token is reused; every send passes `requestTag`, `requestAlreadyReady` included; the override shape compiled clean under TypeScript 6.0.3 strict (in memory). Nit: F4's wording; fixed.
- **Opus r3**: *conditional approve*. Declare `PxeRequestTag` (property access on `unknown` fails TS18046); give the fake document "drop one request" and "remove without `closeDocument`", or step 5 (a) and (c) cannot be built; name `requestTag` in Phase 2 step 1. All accepted. Verified: `entry.tag` has one reader, every token ordering, the reset, the readiness and failed-send controls, step 6 without a clock.

## Opus r4 (resumed), 2026-10-22

*approve*: the three r3 fixes verified; a send-time phrase left in D2 corrected.

## Final Codex pass (fresh session `01a162bd`), 2026-10-22

Verdict: *conditional approve*, then **approve** on resume once the conditions were applied. Two should-fix: Outcome (1) overstated the guarantee (a 90 s read expiring during a 30 min `proveTx` can still clear trust; K3 widened, the sequence case keeps a long request pending and asserts no re-send); the amplified ghost-READY effect needed a disposition (K4). Two nits: nine construction sites, not ten, and recon's boolean wording; the seed's five failures become three. It judged the answer token the smallest correct design and found no further owner ask.
