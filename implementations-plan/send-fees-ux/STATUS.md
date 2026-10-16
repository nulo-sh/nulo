# Status: send-fees-ux

- 2026-10-15: worktree adopted and registered; five issues read with their decisions (#316 P18-09 A, #340 P18-11 A signed); recon done (3 sonnet explorers). #505 traced to the signed OA-10 A, not a defect; #504's trigger waits on the forced balance snapshot, not the estimate.
- 2026-10-15: plan.md and OWNER-ASKS.md (OA-1 to OA-3, I-1) drafted; Codex audit and Opus Plan leg started.
- 2026-10-15: round 1: Codex conditional approve (7), Opus conditional approve (16); all accepted. The #504 preview moved into OA-2 C; phase 3 measures opens during a proof; OA-3 B gains a fail-closed payer rule; edit-form rule limited to a changed address. Codex resume next.
- 2026-10-15: round 2 (Codex resume): conditional approve (5), all accepted: phase 3 collection and a prover-on run, per-attempt bound, OA-2 wording, payer rule in buildPass keyed on entry with Nulo's sponsor, re-cased own address now OA-4. Final fresh Codex pass next.
- 2026-10-15: round 3 (Codex resume, confirmation): approve. Plan committed; awaiting the orchestrator's approval and OA-1 to OA-4.
- 2026-10-15: arc1 started; merged origin/dev (4edf2c8f). Phase 1 (#316) gate F pass: lint, typecheck:all, test (795 files).
- 2026-10-15: phase 2 (#340) gate F pass: lint, typecheck:all, test (795 files).
- 2026-10-15: review round 1 (Codex conditional approve, Opus approve-after-fix): fixture fix 84e49ca0; known limits #528 #529; OA-5 added. Phase 3 network run started (load1 118).
- 2026-10-15: phase 3 (#504 measure) pass: one prover-on run of fee-methods (-t fee-timing), green, 198 s; idle opens settle in 0.25-0.37 s, an open during a proof in 5.8 s with both legs held; probes reverted (git diff --stat -- apps empty); numbers on #504. Codex round 2: approve (loop converged).
- 2026-10-16: phase 8: test:all pass on rerun (first run: zod-jitless cold-import timeout, #500); test:ci-gating pass; check:plans 0 findings; smoke Chrome pass (send-fee-privacy 1, send-keyboard 5, send-outcome-rows 2, settings-crud 9); screenshots taken (Chrome, both themes).
- 2026-10-16: phase 8 gates pass: smoke Firefox (1, 5, 2, 9); network Chrome fee-methods 8/8 (381 s), NULO_E2E_PROVERLESS=1 same-token-concurrent-sends 16/16 (691 s); final lint and typecheck:all 0. PR next.
- 2026-10-16: arc 2 started on send-fees-ux-arc2 off origin/dev c5e9c8e8 (page 20: OA-1 B, OA-3 B, OA-4 B; OA-2 waits on the skeleton mockup). Phase 1b (OA-4 B) gate F pass: lint, typecheck:all, test (797 files).
- 2026-10-16: phase 5 (#503, OA-1 B) gate F pass on rerun (first: type-role-ban 5 s timeout at load 215, file alone 2 s); network spec fee-sponsor-funding pending a host under load 150.
- 2026-10-16: phase 6 (#505, OA-3 B) gate F pass: lint, typecheck:all (after adding `sponsored` to two test literals), test (797 files). Network specs next.
- 2026-10-16: phase 6 network gate pass: NULO_E2E_PROVERLESS=1 same-token-concurrent-sends 16/16 (875 s wall). Review round 1: Codex conditional approve (2), Opus approve (3 notes); fixes applied; known limit #569.
- 2026-10-16: arc 2 review round 2 (Codex resume): approve; loop converged.
- 2026-10-16: phase 8 (arc 2): test:all pass (extension 797 files), test:ci-gating pass (571).
