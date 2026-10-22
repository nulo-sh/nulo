# e2e-tmp-1 status

- 2026-10-22: recon done; #1064's caller list did not hold (26 call sites, not 5); #1071 filed for the stage-log leak.
- 2026-10-22: plan drafted (D1: the calling test owns the dir through `onTestFinished`); sent to Codex and Opus.
- 2026-10-22: Codex r1 and Opus r1 conditional approve; conditions applied; Codex r2 running.
- 2026-10-22: Codex r2 approve; plan committed; auto-continue into A1 (OWNER-ASKS: none).
- 2026-10-22: A1 phase 1 green (self-test red on base, green after; lint, typecheck:all, test, test:all); D7 module split.
- 2026-10-22: A1 Codex r1 clean; Opus review 3 findings fixed (eight redundant caller removals dropped); smoke Chrome running.
- 2026-10-22: smoke Chrome retry 0 green (61 passed, 9 skipped, 31 min, residue 0); the two re-indented smoke files green again at 4a95e6650.
