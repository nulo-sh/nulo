# Status: wallet-followups

- 2026-10-10: worktree adopted and registered (base af4afcc); briefs, ruleset and the five issues read with comments, plus #262 and #277; one open PR on the repo (#271, draft).
- 2026-10-10: #259 reproduced on af4afcc; shrunk tape traced: the oracle owes a recovery the store already made, then reads a debt-free forced failure as a miss. Corrected oracle passed 3,000 random runs in a scratch copy.
- 2026-10-10: recon (1 sonnet explorer) returned; recon.md, plan.md, OWNER-ASKS.md (OA-1, OA-2) drafted; dual audit round 1 started.
- 2026-10-10: round 1 Codex verdict: reject (3 blockers, 10 findings), all verified and accepted (1 in part); plan.md revised (#258 compares through state.toText, invariant argued, real EditorState tests; Asks became approval conditions, OA-3 added; fixture-only test changes; NULO_E2E_RETRY=0). Waiting on the Opus leg.
- 2026-10-10: round 1 Opus verdict: conditional approve (4 conditions, 17 findings); 16 accepted, 1 rejected (D8). The #256 validator now follows the record as worded (OA-1 reworded), the pages' reread never calls applySetting, smoke runs name the armed build. Final fresh Codex pass next.
- 2026-10-11: final fresh Codex pass: conditional approve (6 findings, all verified and folded): I1 corrected (the fee cards can co-mount; consequence filed as an issue at close-out), OA-2/OA-3 fallbacks carried through code, tests, title and `Closes`; confirmation round: conditional approve, seeds now accept a phase omitted under a fallback. Plan committed; awaiting orchestrator approval.
- 2026-10-11: orchestrator approved the plan at c9c07a3: OA-2 A (trim ships), OA-3 A (blank counts as empty), OA-1 B (record as worded; owner page 11). Recorded as D-orch-2..4. Arc 1 started.
- 2026-10-11: phase 1 gate pass: lint, typecheck:all, store + co-mount + fuzz tests (39), seed -2034686224, 2000 runs; red/green proof in lessons/phase-1.md.
