# Phase 0: planning consults

## Recon (2026-10-17)

- One Explore agent (sonnet), the batched reuse sweep (eight capabilities). Its report is persisted in [recon.md](../recon.md).
- Lead's own trace changed one design call before any consult: a grant row stays `pending` until its transaction is Proven (`auth-registry/service.ts:165-186`), so refusing a `pending` row would block a revoke for the whole proving lag and fail `authwit-lifecycle`'s grant-then-revoke step. The draft waits for the grant's inclusion instead.

## Panel round 1 (2026-10-17)

- Codex, gpt-6.1-sol, high, read-only (session 01a14a84-be18-7b51-a3eb-347d0efb3089): `reject`, on two blocking points: D1 removed an estimate guard without replacing it, and D3's waiter did not establish grant inclusion. Seven points; all verified against the tree and accepted or recorded as known limits (plan § Panel record).
- Opus 5.5 Plan leg: `conditional approve (with conditions: close the post-broadcast startSubtask throws in the revoke and registry-toggle tails; delete a pending row only when its grant is in a block at or below the revoke's block)`. Ten points; all accepted except its global orphan-handle rule, rejected for Codex's estimate path.
- The two legs disagreed on one thing: whether every orphaned task handle should go inert (Opus) or only completion past a broadcast (Codex). Decision: past a broadcast only. Before a broadcast the fence already refuses a switched send, so the narrower rule loses nothing there, and it keeps today's early stop for an estimate whose profile switched.

## Final Codex pass (2026-10-17)

- Fresh session 01a14a94-498c-7501-bca1-5f880d5dc950, gpt-6.1-sol, high, read-only. Round 1: `conditional approve`, on the D3 grant-provenance gaps and its deadline contract. Round 2 (resumed with the fixes): `approve`, two minor notes accepted.
- Considered and rejected after reading the history: making wallet sends join the account's send line (it would order a repeated grant too). The rule that a wallet send never waits there is recorded in the archived send-queue-activity plan (D70) and pinned by a test; a wait there is a spinner with no card or cancel. The residual is known limit KL3.
