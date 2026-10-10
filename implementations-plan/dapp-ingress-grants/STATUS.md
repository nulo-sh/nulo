# Status: dapp-ingress-grants

- 2026-10-09: homed in the lane worktree (adopted, base `origin/dev` ac259a7); registered in the manifest.
- 2026-10-09: recon done (2 Explore agents on sonnet); all 16 issue claims checked; recon.md written.
- 2026-10-09: plan.md drafted with the lane map's four arcs (outline A) and a competing outline (B); OWNER-ASKS.md has 6 asks.
- 2026-10-09: dual audit done. Codex: reject (12 findings); Opus: conditional approve (7 conditions). Every finding verified and dispositioned in plan.md § Panel; OWNER-ASKS now has 8 asks.
- 2026-10-09: final fresh Codex pass converged: reject → reject → approve over three rounds (11 findings, all dispositioned in plan.md § Panel). Plan status: audited, awaiting the orchestrator's approval.
- 2026-10-09: orchestrator approved the plan with D-orch-1 (no stack, arc 1 PR on `dev`) and D-orch-2 (arc 1 only); arc 1 started.
- 2026-10-09: gate 1.1 green (lint, typecheck:all, wallet-bridge 663, root test 10724).
- 2026-10-09: gate 1.2 green (lint, typecheck:all, root test 10736; composition checklist holds). First run red on copy-dash-ban (`bun run test`), fixed by rewording a log reason.
- 2026-10-10: Codex round 1 reject (C1 High, C2/C3 Med, C4 Low), Opus approve with 3 Lows; fixes applied, C3 recorded as a residual.
- 2026-10-10: Codex round 2 approve (1 Low fixed), round 3 approve with no findings: loop converged.
- 2026-10-10: final head 089a541: audit:vue 0 (extension 10742 passed), test:all 0; smoke run 1 void (unarmed build, stopped); smoke run 2 on the armed source build in progress; network waits for a free host.
- 2026-10-10: merged origin/dev (index.md conflict resolved); merged head 45ea5c7: lint 0, typecheck:all 0, test:all 0. Draft PR #254 opened; network gate not run locally (host held through two 90-min waits by e2e-harness-gaps); CI network lane stands in until the host frees.
- 2026-10-10: gate 1.3 green: smoke (local, armed build, Chrome, retry 0) 47 files / 198 tests passed on 45ea5c7; network files green in PR #254's required CI lanes on 45ea5c7, Chrome and Firefox, retry 0 (local run held by G1, D-impl-6).
