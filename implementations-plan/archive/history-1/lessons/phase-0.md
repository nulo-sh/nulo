# Phase 0: planning consults

- 2026-10-30 recon: two Sonnet explorers, one per issue. Their reports are folded into [recon.md](../recon.md). Two #1394 claims did not hold (the detail page shows `updatedAt`; the lists are live views of one store, not copies).
- 2026-10-30 audit round 1: Codex (gpt-6.1-sol, high, read-only) and an Opus 5.5 Plan leg, in parallel, on the full packet (adversarial, assumption-attack, implementation critique, proportion).
- Round 1 verdicts: Codex (session `01a18f11`) conditional approve, five findings; Opus 5.5 Plan conditional approve, nine findings. All folded or dispositioned in the plan's § Audit verdicts. New: D11 (a new question closes the failure's snack by id), D12 (tests read the real row), D9 revised (keyboard focus to the method trigger), F3 restated (the order is when a send reached the node). The recon's "no e2e reads the snack" was wrong; `snack-placement` joins Phase 3.
- Round 2 (Codex, resumed in session `01a18f11`, verification): approve, no new material findings. Two low notes folded: recon's stale "broadcast order is Confirm order" and D1's "only"; Send's toast double needs ids, a `toast` ref and `closeToast` for D11's test.
