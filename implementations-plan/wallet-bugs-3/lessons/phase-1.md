# Arc 1: implementation and review

- 2026-11-05 Phase 1: the new rejecting-write test red on the base source (one task left unfinished), green after; the thrown-path control green on both.
- 2026-11-05 Codex review round 1 (gpt-6.1-sol, high, read-only, net diff from 4b250dfe4): clean, no functional or security defect; two comment findings (narrating doc comments in `FeePriorityRow`, its test, `balance-job-queue.ts` and the sweep helpers; an ambiguous caption comment), both applied.
- 2026-11-05 Opus diff review (alongside Codex round 1): clean; two test-strength findings applied (Shift+Tab returns onto the chosen tab; the capped caption stays inside its row, which tells the gap-reserving cap from 100%); its comment finding was already fixed by Codex's wording.
