# connect-split-1 status

- 2026-10-19 phase 0.4: recon done (two Sonnet explorers + direct reads); recon.md written.
- 2026-10-19 drafting: plan.md, OWNER-ASKS.md (OA-1 sign-off, OA-2 after-Allow behaviour), outline B kept local.
- 2026-10-19 audit round 1: Codex reject (prefers B), Opus conditional approve (prefers A); revised (pin, isOpen, OA-3, OA-4, stallPage).
- 2026-10-19 audit round 2 (Codex resumed): conditional approve, C1 withdrawn, A preferred subject to OA-2; five conditions applied.
- 2026-10-19 final pass (fresh Codex 01a154d9): reject on an A→B→A navigation trace that missed the content-script approval filter; four other findings accepted; resumed: approve.
- 2026-10-19 arc 1: branch connect-split-1-a1 off origin/dev f214e5cb with the plan cherry-picked (9c512d06). Phase 1 gate: sdk 6.0.0-rc.3, pass. Base wall-clock runs deferred to a detached checkout of f214e5cb after the arc's commits (load 271; the plan's pre-commit timing would block edits).
- 2026-10-19 phase 2 gate: lint 0, typecheck:all 0, test:all 0 (extension 14095 passed; its `test` script is the one `bun run test` runs), the standby/expiredUrl/step-bar/navigateWindow grep empty. Pass.
