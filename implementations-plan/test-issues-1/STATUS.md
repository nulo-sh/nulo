# test-issues-1: status

- 2026-11-11: recon done (two sonnet Explore agents); base `dev` at 4c931737a.
- 2026-11-11: #1743 reproduction started on Chrome (10 runs, intercept log on).
- 2026-11-11: plan drafted; Codex audit and Opus Plan leg running.
- 2026-11-11: #1743 not reproduced (Chrome 10/10, Firefox 5/5 at retry 0, load 154 to 330).
- 2026-11-11: Codex round 1 conditional approve, Opus leg conditional approve, Codex round 2 approve; plan committed.
- 2026-11-11: arc 1 on test-issues-1-a1; phase 3 scratch stall red on the base (4998, 2499, 2497) and green with the clock pin; phase 1 base evidence 2/5 runs swept mid-load.
- 2026-11-11: phase 1 gate green: lint, typecheck:all, type-roles 5/5 Chrome and 5/5 Firefox at retry 0; loading-state at the Senders sweep 0/10 (base 2/5).
- 2026-11-11: phase 2 gate green but test:release (7 zip-binary failures, host lacks zip; CI authoritative); guard and arrival specs green on both browsers with the flag.
- 2026-11-11: phase 3 gate green: service.test.ts 20/20 at retry 0.
- 2026-11-11: phase 4 gate green: comment-only diff, lint, typecheck:all.
