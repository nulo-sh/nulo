# e2e-fixed-cost-1 status

- 2026-10-21 08:35Z: homed in the worktree at `b3d6e0a2a`; briefs, #991, block-time-1's record (PR #993) read.
- 2026-10-21 08:55Z: measure-first done: baseline spans re-attributed per launch; probes on Chrome and Firefox (fresh vs template launch); aztec import per fork (inline, inline after global setup, native); native-load experiment green on three network files.
- 2026-10-21 09:20Z: plan drafted (D1: no per-worker reuse; three cause fixes); entering the dual audit.
- 2026-10-21 09:49Z: round 1 (Codex reject, Opus conditional approve) taken; relaunch probe refuted F4; plan revised to one phase (the first-run settle on every launch, liveness at 200 ms), native loading a known limit; entering Codex round 2.
- 2026-10-21 10:00Z: Codex round 2 conditional approve, all four conditions taken (page targets for the converted window, the fresh-install id kept, measurement terms, timing range); entering the final fresh Codex pass.
- 2026-10-21 10:07Z: final fresh Codex pass conditional approve, conditions taken (confirmed close, asserting probe, quotations); verification turn on the final session.
- 2026-10-21 10:07Z: final pass verification turn approve; plan committed; auto-continue into arc 1.
- 2026-10-21 10:43Z: arc 1 on `e2e-fixed-cost-1-a1`: fixture change committed; asserting probe pass on both browsers, base fails as required; smoke gate files green on both browsers; #997 filed closed (known-limit); network gate files running; Codex fix round 1 and the Opus review running.
- 2026-10-21 11:02Z: network gate files green on both browsers; Codex fix round 1 approve, Opus conditional approve, fixes taken; resuming Codex to verify; full smoke suites next.
