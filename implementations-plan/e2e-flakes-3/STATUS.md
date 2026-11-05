# e2e-flakes-3 status

- 2026-11-05 recon: #1667 traced to the spec's Puppeteer target count over Firefox BiDi; not reproduced locally (13 runs and probes). #1590 traced to the default simulation cap `getCurrentMinFees() × 1.5`, matched by the node's two refusals in 5 of 5 CI failures.
- 2026-11-05 probe runs: Chrome network shard 2/5, instrumented, green (27 files, 2094 s).
- 2026-11-05 plan drafted: one arc, two phases (#1667 test-only, #1590 `completeFeeOptions` on the predicted worst minimum).
- 2026-11-05 probe runs: Firefox network shard 2/5, instrumented, green (26 files, 1770 s).
- 2026-11-05 Codex audit round 1: approve-with-changes (5 findings: availability tradeoff, F7 scope, probe contract, #1667 prose, PR title).
- 2026-11-05 Opus Plan leg: approve-with-changes (10 findings; 8 accepted, 1 rejected per the lane brief, 1 noted).
- 2026-11-05 control and probe: #1667 control reds with CI's message on the old count and passes on `chrome.tabs`; #1590 probe red at base on Chrome and Firefox, green with the fix on Chrome.
- 2026-11-05 plan revised for round 1; Codex round 2 next.
- 2026-11-05 Codex audit round 2 (resumed): approve.
- 2026-11-05 final fresh Codex pass: approve-with-changes, then approve on resume. Plan panel-approved; no open owner ask.
- 2026-11-05 arc 1 phase 1 gate: pass (lint, typecheck:all; control green; onboarding-tab 10/10 Firefox, 5/5 Chrome at retry 0).
- 2026-11-05 fix loop: Codex round 1 approve-with-changes, Opus diff review approve-with-changes, Codex round 2 approve. Close-out issues filed: #1681, #1682 (closed known-limit), #1683.
- 2026-11-05 fix loop round 3 (Codex, with the README's verbatim rules): two comment nits, applied; converged.
- 2026-11-05 arc 1 phase 2 gate: pass (lint, typecheck:all, test, test:all; probe red at base and green after on both browsers; pairs 5/5 per browser; shard 2/5 green on both).
