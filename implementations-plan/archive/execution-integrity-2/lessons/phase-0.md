# execution-integrity-2 · phase 0 (planning)

## Recon

- 2026-10-20 · one Explore agent (sonnet), batched reuse sweep over six capabilities: the +10% rule, the payer classification, the question loop, figure travel popup → worker, the figure on screen, the tests. Verdicts in [recon.md](../recon.md). The lead re-read `transfer-executor.ts`, `fee-reask.ts`, `queued-fee-cap.ts`, `service.ts`, `send.vue`, `send-submit.ts` and `useFeeEstimation.ts` (`result` is `null` while an estimate is pending, so the page's figure always belongs to its current settings).

## Consults
- 2026-10-20 · Codex plan audit round 1 (gpt-6.1-sol, high, default `~/.codex` login; session `01a15b89-31c6-7f21-882e-16a314632fcf`): **conditional approve**, five findings (C1–C5), all accepted; pick Outline A. Detail in plan.md § Audit verdicts.
- 2026-10-20 · Opus Plan leg round 1: **conditional approve**, six findings (O1–O6), all accepted; its pre-build classifier alternative rejected (D4: Codex holds the refusal belongs after the build). Pick Outline A.
- 2026-10-20 · Final fresh Codex pass (gpt-6.1-sol, high; session `01a15b99-a14f-7322-b718-ac3bcd6f94c7`): **conditional approve**, one condition (the network gate lacked `NULO_E2E_RETRY=0`); applied; resumed: **approve**.
