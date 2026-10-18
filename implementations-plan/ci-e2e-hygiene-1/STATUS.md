# Status: ci-e2e-hygiene-1

- 2026-10-18: worktree adopted at 18d29f23 and registered; six issues read (#749 #630 #612 #643 #620 #555); recon done (3 sonnet explorers).
- 2026-10-18: planner measurements at retry 0: #749's trim refuted (38-39 lines at open, both browsers); #630's purge is 9.1-9.2 s of FPC lock wait (#553) out of 10.2-10.6 s; #612's path removed by #701.
- 2026-10-18: plan.md, recon.md and OWNER-ASKS.md (OA-1) drafted; Codex audit and Opus Plan leg started.
- 2026-10-18: round 1 (Codex and Opus, both conditional approve) folded in; Codex round 2 conditional approve, folded in (D5 → passkey row in CI; backend recorded per inventory run).
- 2026-10-18: Codex round 3 approve; plan committed for the orchestrator's approval.
- 2026-10-18: arc 1 branch ci-e2e-hygiene-1-a1 (off origin/dev 9470d4e9, plan commit cherry-picked). Phase 1 gate: lint 0, typecheck:all 0, viewers-csp 5/5 Chrome and 5/5 Firefox at retry 0 (third attempt; lessons/phase-1.md). #616's search-panel race stays visible (OA-3).
- 2026-10-18: phase 2 gate: lint 0, typecheck:all 0, security-reset 5/5 per browser at retry 0 with the trail overlay (purge ≤ 2.3 s, a PXE retry in flight at submit in every run), committed test 1/1 per browser (lessons/phase-2.md).
