- 2026-10-19 19:40Z phase 0: briefs read; worktree adopted at 60fde7e7 (origin/dev now e5b447c6, landing only); recon started.
- 2026-10-19 19:47Z recon: inventory 19 error-text sites (7 Text, 12 stylesheet); issue's count of 23 does not hold; recon.md written.
- 2026-10-19 20:01Z plan round 1: Codex conditional approve (3 findings), Opus conditional approve (7); all accepted; guard moved before the change (D11).
- 2026-10-19 20:02Z plan round 2: Codex approve, no new finding. Plan gate passed.
- 2026-10-19 20:07Z arc1 phase 1 green (no drift at 2f591ddd); phase 2 green: guard red on the untouched tree with exactly the 19 rows, self-tests and ProcessingErrorNote green, lint 0, typecheck 0.
- 2026-10-19 20:13Z phase 3 green: 19 sites moved in 14 files + story; --nulo-surface pair; README + CLAUDE.md rule. lint 0, typecheck:all 0, test 0 (863 files), design theme-contrast 97/97, guard 29/29.
- 2026-10-19 20:30Z phase 4 browser: armed Chrome builds of the arc base and the head; capture spec exit 0 (7/7 on the head in one run, 77 s; 3/3 on the base). Readings:

| Rows | Background | Light | Dark | How |
|---|---|---|---|---|
| 1, 2-4, 6, 9, 11 "Wrong password", 12 | page `--app-bg` | 6.00 (base 3.56) | 6.24 (base 5.13) | Chrome, the real text |
| 5, 7, 8, 11 torn import, 13, 14, 17, 18 | page `--app-bg` (17-18 in a transparent box) | 6.00 | 6.24 | token gate; the state needs a failure, a protected file or a passkey profile |
| 15, 16, 19 | a row or card: at rest the page, hovered `--nulo-surface-low`, pressed `--nulo-surface-high` | 6.00 / 5.68 / 5.20 | 6.24 / 5.39 / 4.50 | token gate |
| 10 | window footer `--nulo-surface` | 6.54 | 5.82 | token gate (pair added) |
| hero "Delete" (stays `--red`) | page | 3.56 (large text, 3:1) | 5.13 | Chrome |
- 2026-10-19 20:38Z phase 4 green: audit:vue 0, test:all 0 (every workspace), tests/e2e clean; 12 pictures committed.
