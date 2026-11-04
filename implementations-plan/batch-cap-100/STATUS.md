# STATUS: batch-cap-100

- 2026-11-04: recon done (1 Sonnet explorer); live probe of 100 and 101 entries on both keyless origins: 100 answered, 101 refused (HTTP 400, code 31).
- 2026-11-04: plan drafted (light); the brief's "uncapped sends more than 100" did not hold (upstream default 100).
- 2026-11-04: Codex plan r1 conditional approve; six findings folded in (forwarding tests, D6 known limit, gate subshell).
- 2026-11-04: Codex plan r2 approve; plan committed; auto-continue to arc 1.
- 2026-11-04: phase 1 gate green: lint, typecheck:all, the three files 14/14 at retry 0 (4 red on base; forwarding cases red with the cap dropped), test:all exit 0, check:seeds live OK on Testnet and Alpha (15:23 UTC).
- 2026-11-04: arc 1 r1: Codex clean; Opus 2 findings accepted (checkSeed lookup case, comment).
- 2026-11-04: arc 1 r2: Codex 1 minor finding (mock leak) fixed.
