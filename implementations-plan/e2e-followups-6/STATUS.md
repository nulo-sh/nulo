# Status: e2e-followups-6

- 2026-10-12 phase 0: briefs, issues #325/#326 and the tree read; #326's race reproduced and the fix shape proven by scratch probes (lessons/phase-0.md); recon done (recon.md)
- 2026-10-12 plan drafted (light tier, one arc, one PR against dev); audit pending
- 2026-10-12 Codex R1: reject (7 findings, all accepted); Opus lens: conditional approve (9 findings, all accepted, one in part); plan revised; Codex R2 running
- 2026-10-12 Codex R2: conditional approve (3 findings, all accepted); plan revised; Codex R3 running
- 2026-10-12 Codex R3: approve (final). Plan committed for orchestrator approval
- 2026-10-12 phase 1 gate: pass (widened base 5/5 ENOENT; fixed 10/10 unpinned, 20/20 pinned core 150 + 3 busy loops, widened fixed 20/20; lint 0, typecheck:all 0)
- 2026-10-12 phase 2 smoke: capture test red on base twice per browser (missed capture; double count); 3 files green both browsers; full Chrome smoke 49 passed/4 skipped; sweep: control nonces only
- 2026-10-12 phase 2 sweep: network window files 74+4 per browser all green, 0 recorded window errors; smoke the same; merged origin/dev (17c6727, #328 close-time print → Firefox clause 55d6a86); lint/typecheck/test 0 on merged head
- 2026-10-13 phase 2 gate: pass (merged head 36d8ea5: lint/typecheck/test 0; smoke 3 files both browsers + full Chrome green; 8 asserting files x3 rounds per browser green; send-chaos 2 seeds x2 browsers green; 0 window errors recorded; tap removed, diff clean)
