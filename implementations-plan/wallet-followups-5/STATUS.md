# Status: wallet-followups-5

- 2026-10-11 — homed: adopted worktree `wallet-followups-5` (base `origin/dev` 04137a0), registered in the manifest; tier `light` per the lane brief.
- 2026-10-11 — recon: two Explore agents (sonnet) started: the window-close ownership map (#312) and the scanner opener sweep with the reuse map (#302).
- 2026-10-11 — recon done: `recon.md` written (window ownership map; 11 new opener matches, all loggers, 0 collisions).
- 2026-10-11 — plan drafted (D1–D10); D8 red-on-base claims probed on the base scanner (F10). Audit: Codex (gpt-6.1-sol, high) and an Opus 5.5 Plan lens started.
- 2026-10-11 — audit round 1: Codex reject (kept-paren High), Opus conditional approve (sync-callback High, kept-paren High). Revision 2: D2 sync callback + gone-check, D11 lexer paren fix (probe: rescore exact), D12 measurement, OA-1 disclosure. Codex resumed.
- 2026-10-11 — Codex resume 1: conditional approve; revision 3 (getAll absence check, OA-1 gates #312 only, #302 first). Codex resume 2 started.
- 2026-10-11 — Codex resume 2: conditional approve (catch a synchronous getAll throw); applied verbatim. Plan ready for the orchestrator: #302 ships either way; #312 waits on the owner's answer to OA-1.
- 2026-10-11 — orchestrator approved the plan (cecabc2), decisions D-orch-2 to D-orch-7 recorded in the ledger. OA-1: "Orchestrator no_ask record, 2026-10-11, precedent #205 / #210 / #214: a bug fix that restores intended behaviour with existing words. The log viewer stops gaining an Error row for a window that was already closed; no new log text is added." The planned "This window could not be closed" row is dropped; an unconfirmed failure rethrows the remove's error. Arc 1 started.
- 2026-10-11 — Phase 1 gate pass: scanner vitest 58/58 (red on base: 4 of the 5 D8 tests), lint, typecheck:all, baseline:rescore (23 exact), test:ci-gating (526 pass); match table 11/11, 0 offenders.
- 2026-10-11 — Phase 2 gate pass: base Firefox run (N=1, K=29) printed 4 `Invalid window ID` lines; new unit test red on base (case 1), green after the fix; 40 files / 495 tests, lint, typecheck:all.
- 2026-10-11 — Phase 3: Firefox head run exit 0, 0 window-ID lines (base 4); test:all exit 0. Codex impl round 1 reject (2 High, 1 Medium), Opus approve; all fixed, unit + lint + typecheck green.
- 2026-10-11 — Codex impl round 2 reject; cause named as the column cut. Round 3 (design): both legs chose X (drop the cut); Codex conditions applied verbatim. Chrome run on 454716e: 13/13.
- 2026-10-11 — Phase 3 gate pass on 35c6d62: Firefox 12/1 skipped with 0 window-ID lines (base 4), Chrome 13/13 (454716e, same build), lint, typecheck:all, test:all, test:ci-gating, test:release. Opus round 3 approve.
