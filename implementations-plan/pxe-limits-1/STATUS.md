# pxe-limits-1 status

- 2026-10-21: recon done (two Sonnet explorers); tracking issue #1016 filed; plan drafted.
- 2026-10-21: Codex r1 reject, Opus r1 conditional approve; plan revised (D1-D7).
- 2026-10-21: Codex r2 conditional approve; four conditions applied. Codex r3 approve. Awaiting the orchestrator.
- 2026-10-21: orchestrator approved the plan as committed; implementation started.
- 2026-10-21, budget re-projected after phase 1: a run's fixed cost is 3-4 min at load1 170-220 (5 min projected). Phase 1 took 0.5 h of runs locally plus one CI soak; phase 2 locally 0.75 h (3 h budgeted) and three CI soaks of about 45 min each, serial behind other lanes. Phase 3 is the one that can overrun: a 4-note mint is one block, about 6.4 s at that load, so 1,000 notes is about 30 min of mint, and the 10,000-block growth cell's cost is set by the empty-block rate, measured in the catch-up cells before the growth run is queued. Projected total about 15 h serial, under the 25 h budget.
- 2026-10-22: phases 1-5 measured (the 10,000-block growth and the tokens axis last); phase 6's review loop ran three rounds; the comment on #1016 and the issues posted; this PR carries the record and the close-out.
