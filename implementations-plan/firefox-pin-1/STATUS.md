# Status: firefox-pin-1

- 2026-10-28 recon done (two Explore agents, plus a read of the Firefox 153.0.4 and 158.0 remote-agent sources); every claim of #1111's comment held.
- 2026-10-28 plan drafted; audit started (Codex gpt-6.1-sol high, Opus Plan).
- 2026-10-28 red at the base on Firefox 158: 10 of 21 failed on the three signatures (lessons/phase-0.md).
- 2026-10-28 Codex r1: conditional approve (6); Opus Plan: conditional approve (8); all folded, see the audit table.
- 2026-10-28 Codex final (resumed): approve. Plan committed; arc 1 starts (auto-continue).
- 2026-10-28 Phase 1 gate green: lint, typecheck, unit; Chrome 21/21, Firefox 153 21/21 and 6/6 at retry 0; seam bite red without the rule (lessons/phase-1.md).
- 2026-10-28 Phase 2: pin on 158, its list green (21/21, 6/6); static gates green; fix loop converged (Codex r1 approve, r2 approve; Opus folded).
- 2026-10-28 Phase 2 gate RED: full Firefox smoke pass 1 failed 1 of 290 (`import-errors-scroll.test.ts:230`, a 158 fractional scroll end). Arc stopped per § A fourth difference; D7 proposed, awaiting approval (OWNER-ASKS.md).
- 2026-10-28 while blocked: Chrome smoke green (273/273, 1954 s); Firefox network green on 158 (133 files, 0 failed; proverless, in two runs, lessons/phase-2.md). Waiting on D7.
- 2026-10-28 D7 approved by the orchestrator; applied; the arc resumes.
