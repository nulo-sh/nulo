# e2e-followups-3: status

- 2026-10-11 — homed (adopted worktree, base ca79036); recon: 2 sonnet explorers; recon.md written.
- 2026-10-11 — re-land verified as an exact revert of 9094cf9 (relay files identical between 9094cf9 and ca79036; `git apply --check` clean).
- 2026-10-11 — draft plan.md: one arc, Phases 0-4; Phase 2 leading hypothesis H1 (`waitForLockScreen` reload of a pending `/popup/auth` navigation).
- 2026-10-11 — panel round 1: Codex reject (C1 D3 hides non-landing redirects; C2 no causal chain; C5 failure branch), Opus conditional (O1 dist-rebuild cause, O3/O5 probe validity and D3 budget). All blockers accepted; plan revised (D2, D3 by measurement, D6, D7); archived logs read (no build overlapped pool 5; "early" unsupported).
- 2026-10-11 — panel round 2 running (Codex resumed; Opus re-check).
- 2026-10-11 — panel round 2: Codex reject (R2-1 D3 kept a recovery hatch; R2-2 H2 had no action-specific proof), Opus conditional (archived line order may rule out H1; settlement precedence). All accepted: D3 observational with explicit reopen for reopen scenarios, P2c per action, import-start markers, in-place P2a, D8/D9.
- 2026-10-11 — panel round 3: Codex conditional approve (R3-1 stage timing never attributes; R3-2 reopen carve-out keeps pre-reopen assertions, callers classified and frozen first). Both applied. Opus re-check running.
- 2026-10-11 — Opus re-check (round 3): conditional approve; the reopen carve-out deleted, D3 made unconditional, P2a polls `page.url()` (BiDi `framenavigated` misses pushState), markers posted to a sibling page over a proved channel. Codex round 4: approve. Panel converged; plan committed, awaiting orchestrator approval.
- 2026-10-11 — orchestrator approved 765adbe (D-orch-2 to D-orch-6 recorded). Phase 0 gate PASS: #297 closed by #300 on dev; origin/dev 27af8d7 merged clean; lint, typecheck:all, test exit 0.
