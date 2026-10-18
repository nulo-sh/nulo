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
