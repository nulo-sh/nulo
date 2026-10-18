# Phase 0: planning log

## Recon and captures

- One Explore agent (sonnet) mapped the e2e, capture and window-test tooling; the estimate-to-owner path was traced by hand (recon.md).
- Capture run 1 (`bun run e2e:agent` on a scratch spec, Chrome, retry 0, 56 s for two tests): the A and B pictures, and the runtime facts in recon.md. The scratch spec patched the playground's `TextEncoder.encode` as `scope-refusal.test.ts` does; for the no-sender send it patched only strings that carry `sendTx`, since the same click registers the sponsor's artifact, whose function list names `sponsor_unconditionally` too.
- Capture run 2 (the account paying its own fee): failed at `selectFeeMethod(…, "public")`, the row disabled: the fixture account holds no Fee Juice. Not retried; the Confirm-off state is traced in code (F1).
- The spec was deleted from the worktree after each run; `git status` showed only the plan directory.

## Consults
- **Codex round 1** (gpt-6.1-sol, high, session `01a1515d`; it ran on the `alejo-icloud` roster account because the environment carries `CODEX_ACCOUNT=best`): `reject`. Six findings, all accepted:
  1. D2 as drafted (any end of the window settles with the refusal) only delays S1: the timeout and a lock answer differently on the two branches. → Only the window's OK settles with the refusal; every other end answers as today (D2 revised, `settleRefusedInteraction`).
  2. A feed cancel after a refusal would hand the dApp the refusal while the row reads cancelled. → Gone with the mapping: a feed cancel answers as today.
  3. A superseded estimate could record a refusal the window never showed. → The hand-off reads the admission signal (D7); the first recorded refusal is final, stated as a policy, not a fact (I1).
  4. "Whatever ends the window" overclaimed: a service-worker restart drops the record. → F5 states the in-memory lifetime.
  5. The tests missed cancellation order, automatic ends, a superseded refusal and a fee-question control. → Added to Phase 1.
  6. F3 named the wrong authorization path at `authwit-discoverer.ts:197`. → Corrected: an encoded-call authorization the dApp supplies.
- **Opus 5.5 leg** (Plan agent, `model: opus`; it read the first draft, before the Codex r1 revision landed): `conditional approve`. Its conditions on S1, D2 and the feed cancel were already met by the r1 revision (only OK settles; a feed cancel answers as today). Residual findings applied: branch on the refusal before both `onError`s' `console.error` and log at `debug`; approve's catch cancels after its rearm, with a test; F1 also covers an app-set fee; F4 names the feed cancel as `cancelledAt`'s live writer (`cancelInteraction` has no production caller); `refuseStoredRequest` stays off the RPC list, with a test; resolve's throw tested (a page can call `resolveInteraction` on an execute id); estimate tests reuse `service.display-decode.test.ts`'s stub; the Alternatives paragraph folded into D1. Declined: filing S1 as a closed known limit; D2 prevents the leak, and the residual (the person's OK) equals today's Confirm.
- **Codex round 2** (verification, session `01a1515d` resumed): `conditional approve (with conditions: qualify D7's cancellation ordering and test both orders)`. One Low finding, plausible but unverified: the popup's `cancelEstimate` is fire-and-forget, so a superseded estimate can throw before the SW processes its cancel and record a refusal. Accepted as a wording and test fix, no handshake: the record is prevented only by a cancel processed first, the check and the record share one synchronous step, both orders tested; compatible with the first-refusal policy (I1). F5 narrowed to ends before approval. Converged: the panel holds Codex conditional approve (conditions applied) and Opus conditional approve.
