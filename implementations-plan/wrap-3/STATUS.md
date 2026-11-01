# wrap-3 status

- 2026-11-01: recon done (1 Sonnet explorer); base `f738cba62`.
- 2026-11-01: measured the five places with 25-character names at 360 and 240 px, Chrome and Firefox (network and smoke capture specs, base and trial rules); every place overflows; seed names nowhere.
- 2026-11-01: plan drafted (tier light, two arcs); two owner asks on arc 2's surfaces (OA-1 buttons, OA-2 chip); panel next.
- 2026-11-01: panel round 1: Codex and Opus conditional approve; folded (D6 to OA-3, gates completed, arc 2 boundary); final fresh Codex pass next.
- 2026-11-01: final fresh Codex pass: conditional approve (capture evidence from uninjected records), folded; resumed: approve. Plan approved; arc 1 next.
- 2026-11-01: arc 1 phase 1 gate green: T1-T3 red at 13c1168d7, green at 482f8e7e0; lint, typecheck:all, the touched tests (42 files) and test:all exit 0.
- 2026-11-01: arc 1 phase 2 gate green: cap-chain-mismatch before 16.1 s Chrome / 30.0 s Firefox, after 17.9 / 33.3 s; red with D1 reverted (identity line 146.6 px); lint and typecheck:all exit 0; armed smoke security-backup + stale-network green on both browsers at retry 0; captures after (uninjected records) at ≤ 0 px for every arc 1 place, both names, both widths, both browsers, seed rows unchanged.
- 2026-11-01: arc 1 review loop converged (Codex round 2 clean); final head gates green: lint, typecheck:all, test:all, cap-chain-mismatch on Chrome (17.7 s) and Firefox (27.7 s), armed smoke security-backup + stale-network on both browsers at retry 0. PR next.
