# Status: testers-fixes-3

- 2026-10-17 10:45Z: adopted worktree at f695dea4; read the briefs, #583 (Decision block) and #629.
- 2026-10-17 11:10Z: recon (one Sonnet explorer) and two layout measurements done; D as drawn has room for one letter only below about 10 USDC and covers the amount from about 1,000 USDC. OA-1 written; ships A.
- 2026-10-17 11:20Z: plan drafted; panel (Codex round 1, Opus Plan leg) started.
- 2026-10-17 11:03Z: panel round 1: Codex conditional approve (5), Opus conditional approve (9 + 6 facts); plan, recon and OA-1 revised; Codex resumed for round 2.
- 2026-10-17 11:06Z: Codex round 2 conditional approve (one test gap, fixed); round 3 approve. Plan committed for the orchestrator's approval.
- 2026-10-17 11:25Z: arc 1 started on the approved plan (dev unmoved at f695dea4).
- 2026-10-17 11:31Z: Phase 1 red proof, Chrome, base layout plus the direction testid: the dApp transfer's chip `below: true` at 96 px, the large row's direction chip on 1 line at 96 px; both scenarios red as planned.
- 2026-10-17 11:45Z: Phase 1 gate pass: lint, typecheck:all, test (826 files) exit 0; armed Chrome build, rows.test.ts 9/9 at --retry=0 (60 s); armed Firefox build, 9/9 (93 s). Rows 62 px Chrome, 64 px Firefox; drawn-regime chip 41 px in both; large row at its 19 px floor, direction on 2 lines (Firefox 11 px short of one line).
- 2026-10-17 11:53Z: Phase 2 red proof, Chrome, base journal row plus its testids: the App value one line, 29.8 px past the box's inner edge; red as planned.
- 2026-10-17 12:00Z: Phase 2 gate pass: lint, typecheck:all, test exit 0; armed Chrome build, rows.test.ts 9/9 at --retry=0 (72 s); armed Firefox build, 9/9 (104 s). Both App values two lines, flush with the box (0 px), 16 px after the label; the large row 11 px short of one line in both browsers.
- 2026-10-17 12:10Z: Codex round 1 approve (2 nits), Opus diff review approve (3 nits); shots on Chrome. High-scale shots showed the floor chip drawn "S…" (Chrome) and a hard-cut "SH" (Firefox): fixed with an empty inline-block `::before` (D5), rows.test.ts 9/9 both browsers.
- 2026-10-17 12:40Z: Codex round 2 conditional approve (leading space, demonstrated); fixed (D6), rows.test.ts 9/9 both browsers; Codex round 3 approve. OA-1's table re-measured in the extension, both browsers.
