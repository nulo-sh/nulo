# Status: e2e-flakes-2

- 2026-10-18: recon done (1 sonnet explorer); root cause traced; probe run once per browser through `agent.sh` (both green): live projection at +1.35 s (Firefox) and +0.61 s, +30.3 s (Chrome) after the fixture; zero writes for 35 s with the worker stopped and the wallet locked.
- 2026-10-18: plan drafted; Codex audit and Opus Plan leg started.
- 2026-10-18: audit r1: Codex conditional approve (5), Opus conditional approve (8), all accepted; plan revised (D3 baseline, D6 gate parity, waitForLockScreen, negative control).
- 2026-10-18: audit r2 (Codex resume): conditional approve, 4 findings; 3 accepted, the recorder rejected (D7).
- 2026-10-18: final Codex pass (fresh): approve; two wording fixes applied. Plan approved by the panel; no owner ask.
- 2026-10-18: phase 1 negative control (unlock reconcile removed, Firefox, proverless, taskset 0,1): red at waitForFreshBalanceRow, rows: [] (354.5 s run); line restored, src diff empty.
- 2026-10-18: lint, typecheck:all, test:all exit 0 on bf7db153.
- 2026-10-18: Firefox 10/10 green at retry 0 (proverless, taskset 0,1): 81.4 89.1 162.0 81.5 81.2 131.2 108.9 124.4 73.4 67.5 s.
- 2026-10-18: Chrome 5/5 green; review round 2 (Codex resume): approve, loop converged; comments fixed in 78b82faa.
- 2026-10-18: merged origin/dev (7eada4c6); final head: lint, typecheck:all, test:all, check:plans exit 0; spec green once per browser (Firefox 64.0 s, Chrome 38.5 s). PR opened.
- 2026-10-18: arc 2 (#816) started on `e2e-flakes-2-a2` off origin/dev a4edec20. CI logs read (two red runs, eight green); probe run once per browser: the header copy's snack sweeps the band under its resting place (y 588-608) on enter and leave, where About's foot points sit (y 590.5-593); Firefox's note hit test met the leaving card. The sub-page header (y 64-120) is not the cover.
- 2026-10-18: arc 2 fix committed (232d3581); base runs green (Firefox 51.0 s file / 5.6 s test, Chrome 34.7 / 3.4 s); control A red at the original :253 with #816's message, control B green; lint and typecheck:all exit 0.
- 2026-10-18: test:all exit 0 on 628141e3 (spec at 232d3581); 15-run batch started (Firefox 10, then Chrome 5, taskset 0,1).
- 2026-10-18: batch on 232d3581: Firefox 10/10, Chrome 5/5, all 8 passed. Review round 1: Codex approve (seeds fixed), Opus approve (presence check, comment, cost wording) — fixes committed; batch reruns on the final head.
- 2026-10-18: Codex r2 conditional approve (presence check moved before the storage read, 455f7b90); r3 approve, loop converged. Merged origin/dev (30821a65); rebuilt; lint, typecheck:all, test:all exit 0; Firefox 10/10 and Chrome 5/5 green on the merged head.
- 2026-10-18: pushed e2e-flakes-2-a2 (c70221c6); PR #829 opened; watching checks.
- 2026-10-19: PR #829 checks green at attempt 1 (all five required aggregators); smoke envelopes Firefox 17 min (before 18), Chrome 12 min (before 11). Not merged; close-out waits for #743.
