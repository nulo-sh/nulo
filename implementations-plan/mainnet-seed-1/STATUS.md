# mainnet-seed-1: status

- 2026-10-24 adopted the lane worktree at `dda72e321` (6.0.0 line confirmed); recon done (2 Sonnet explorers, 3 live reads).
- 2026-10-24 plan drafted (tier light): one draft arc, D1-D8, OA-1..OA-4; Codex audit and Opus leg next.
- 2026-10-24 audit round 1 started: Codex (gpt-6.1-sol, high) and the Opus Plan leg in parallel.
- 2026-10-24 round 1: Codex conditional approve (4 P2), Opus conditional approve (1 P1, 9 P2-P3); plan revised (arm out in Phase 1, D9 exports skip unused networks, D2 a script, D6 no declaration, OA-5, OA-6); Codex resume verifying.
- 2026-10-24 round 2: Codex conditional approve (3 P2, accepted): D9 withdrawn for a known limit, D2 reuses assertLiveChainIdentity, D6 a declared refusal again; Codex round 3 next.
- 2026-10-24 round 3: Codex approve, no new material finding. Plan gate passed; auto-continue to arc 1.
- 2026-10-24 Phase 1 gate: pass (lint, typecheck:all, test:all 15162 pass, test:ci-gating 686 pass, no stamp, no arm left).
- 2026-10-24 Phase 2 gate: pass (lint:actions, test:ci-gating 686, test 15162, lint, tsc scripts; check:seeds: Testnet OK, Mainnet MISMATCH rollup 4248422647 vs chainId 2070860441, exit 1, no URL).
- 2026-10-24 Phase 3 gate: pass. Four release builds exit 0, marker loop clean. Retry 0, every file green, no egress failure: network-arrival, stale-network, legal-acceptance, contacts-import, security-backup on Chrome and Firefox; default-network-arrival-update and update-replay (v0.31.0) on both. Smoke wall-clock base → head, Chrome 296 → 317 s, Firefox 431 → 512 s; D6's cost is 4 to 8 s per full backup export (security-backup +10 s / +9 s), the rest noise. The build also regenerated the auto-import types for `MAINNET_ROLLUP_VERSION`, which Phase 1 missed.
- 2026-10-24 Phase 4: #808 reopened with the trace (OA-6); D9's known limit filed and closed as #1115.
- 2026-10-24 Phase 4: arrival and Mainnet Home captured on both browsers (`screenshots/`), capture-only edit reverted. Base update scenarios: replay 43 → 64 s Chrome, 54 → 69 s Firefox (two full backup exports, one arrival Stay); arrival update 46 → 44 s, 75 → 58 s.
- 2026-10-24 fix loop: Codex r1 conditional (2 P2: `check:seeds` error text fixed; chain id collision → #1116), Opus 4 P3 fixed or recorded (OA-7, OA-1 extended), Codex r2 approve. Arrival and stale smoke rerun green on both browsers.
