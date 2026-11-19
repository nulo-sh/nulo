# authwit-copy-1: phase 0 (planning)

Every consult of the planning panel, with its verdict and what was folded.

## Round 1 (2026-11-05)

- **Codex**, gpt-6.1-sol at high, read-only, fresh session: conditional approve. Q1: keep 4100 and `SCOPE_VIOLATION` with an own constant text (the sibling envelopes). Q2: attribute in the executor's app-paid listing; a decoder mode or bucket spreads route policy into shared discovery code. Q3: the sender comparison is sound. Material: "carried" is a hash match, not a signature check, so the plan's I1 overstated what the line proves (folded into I1, I2, Security, OA-1, OA-3); the smoke command lacked the armed build and its run flags (folded into Phase 3). Nits: narrow `scopeRefusalKind`'s return type; assert that the app-paid control signs nothing. All accepted.
- **Opus 5.5** (Plan agent): conditional approve. Material, demonstrated by trace: holding the app-paid confirm to the sender's own listed record stops a send after a failed estimate that goes out today (`index.vue:236-238`, `fee-figure.ts:41-45`, `preview-snapshots.ts:105-107`); a behaviour a person notices, outside the brief's budget, so it became OA-4 and the confirm keeps today's keys. Nits, all accepted: take the sender from `built.account.address`; reuse `sameFieldAddress` with `op.accountAddress`; the return type; five stale comments and the README paragraph; fee-payment witnesses get a row too (OA-1 says so); read the History row in the existing `tx-sendTx-fields` step. Its recon correction holds: the cited executor test's `record("own")` is uncarried, so the test stays green and becomes the never-happens case.
- Recon: the explorer's claim about `discovery-probe.test.ts:143` (a record naming the signer) did not hold; that record names `0xother`.

## Final fresh Codex pass (2026-11-05)

- New session, gpt-6.1-sol at high: conditional approve. Material: OA-4 named only the failed-estimate path; keeping the sender's records out of confirm's check also lets a rebuild that asks for a different sender authorization than the window listed still send (the guard's absence demonstrated by trace; an exploiting contract unverified). Folded: D2, OA-4 broadened, a Phase 1 test pinning B on both paths beside the other-account control. Nit: recon, Security and OA-4 sentences overstated I1 or D2; corrected.
- Resumed, same session: approve, no regressions.
