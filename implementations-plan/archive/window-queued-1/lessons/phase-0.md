# Phase 0: planning consults

## Recon

- One Explore agent (sonnet) mapped the fee-race composition driver and the e2e that hold a window. Finding: the driver runs no window component and keeps no window queued flag, so the catalog cannot observe the fix (plan D5). Its claims were spot-checked against `tests/helpers/fee-race-in-process.ts` (`:611`, `:831-864`).

## Audit round 1

- Codex (gpt-6.1-sol, high, read-only, session `01a189a5`): conditional approve, 4 findings (F2's waiting send, I1's other re-emits, I2's return to queued, the test's engine mimicry). All verified and folded.
- Opus 5.5 Plan leg: conditional approve, 6 findings plus fact corrections (the priority pick and recommits in UI impact, the unpinned `!signal.aborted` guard, the mimicry, Confirm held by a missing payer, the missing picture, the e2e files). All verified and folded; `tx-sendTx-noFrom` kept on the lane's word.
- One call made by the panel: D7, the priority pick and the card's re-derivations take the same clear. Rejected an owner ask: the reading they get is the one fee-race-1's D18 already signed off, and a method-only filter would keep the false sentence.
- **Round 2** (Codex, same session): approve; two low notes on the picture's capture and D8's wording, folded.
