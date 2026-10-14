# send-followups-1: phase 0 (planning) log

## Recon, 2026-10-14

- Explore (sonnet) on the cap basis: speed is stored on no durable record; privacy and fee method are on the Tx row; the re-ask e2e case uses a Fast basis for an Urgent send and fails under the keyed rule.
- Explore (sonnet) on the fee card and AmountCard: #406's claim holds on all four mounts; the wire kind `embedded` is live elsewhere; `.derived_type` is carved out by selector in the type-role exceptions; `send-amount-exact.test.ts` is the real-layout check of the USD line.

## Consults
- 2026-10-14, Codex round 1 (gpt-6.1-sol, high, read-only, session `01a13ab3-2e65-7ae3-865d-e6b8464ae3ca`): conditional approve, six findings; all accepted after checking the tree (plan.md § Audit verdicts).
- 2026-10-14, Opus Plan agent round 1: conditional approve, ten findings; nine accepted, one (export one fee-method map) rejected for scope as D13.
- 2026-10-14, Codex final fresh pass, first attempt (session `01a13ac3-7029-7b81-a3d4-2914221dee48`): failed with 429 Too Many Requests on the default account; retried once with CODEX_ACCOUNT=alejo-icloud.
- 2026-10-14, Codex final fresh pass, retry on `alejo-icloud` (session `01a13ac3-b296-77e3-9360-97fb4a4a2b5b`): conditional approve, three findings (smoke command completeness, resume invocation, failure threshold); all accepted.
- 2026-10-14, the same session resumed to confirm the three fixes: approve.
