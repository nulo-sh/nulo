# ui-cosmetics-1: status

- 2026-10-21: recon done (2 explorers); #1019 item 2's facts did not hold (Tabler set; double painting demonstrated by probe).
- 2026-10-21: plan drafted; OA-1 written with pictures.
- 2026-10-21: Codex audit round 1: conditional approve; seven findings accepted and applied.
- 2026-10-21: Opus leg: conditional approve; findings applied, one rejected (D8).
- 2026-10-21: Codex verification: approve. Plan committed; awaiting the orchestrator.
- 2026-10-21: P1 gate green: lint, typecheck:all, test, test:all; both controls red as expected.
- 2026-10-21: P2 gate green: lint, typecheck:all, audit:vue; S1 control red on base (both browsers); six feedback e2e files green on Chrome and Firefox at retry 0. Full smoke deferred to the final head.
- 2026-10-21: Codex fix loop converged (round 1 clean plus Opus's two test rows; round 2 clean). Final head: lint, typecheck:all, test:all green.
- 2026-10-21: full smoke at retry 0 before the dev merge: Chrome 61 files passed, 7 skipped, 2279 s; Firefox 64 passed, 4 skipped, 3195 s.
- 2026-10-21: merged dev (#938 froze the stored-shapes baseline); the presto flag re-stamped as additive stamp 1 with its pin. Merged head: lint, typecheck:all, test:all, check:plans green; at retry 0, 11 e2e files on the touched surfaces (the six feedback files plus type-roles, passkey-paths, security-backup, stale-network, firefox-sidebar) green on Chrome (608 s) and Firefox (931 s).
- 2026-10-22: draft PR #1027 opened at 61df54b64; CI 50 pass, 6 skipped; smoke Chrome 9.9 min, Firefox 14.8 min. Waiting on OA-1.
- 2026-10-22: OA-1 answered (P80-01: C). Phase 3 built: each icon paints once, the bottom bar at 24 px; whole-pixel check measured on both browsers; Codex round 3 clean; lint, typecheck:all, test:all, build-storybook and full smoke on both browsers green.
