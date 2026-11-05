# Status: release-notes-1

- 2026-11-05: planning; recon done, plan drafted (tier light), audits next.
- 2026-11-05: Codex and Opus audits: both conditional approve; plan revised (lessons/phase-0.md consults 1-2); final Codex pass next.
- 2026-11-05: final Codex pass: approve. Plan committed; arc 1 starts (auto-continue).
- 2026-11-05: phase 1 gate: lint 0, typecheck:all 0, test:release 381/388 pass; the 7 failures are zip-read/zip-reproducible spawning `zip`, absent on this host (ENOENT; files unchanged from base; CI's runner has it).
- 2026-11-05: phase 2 gate: test:ci-gating, lint:actions, lint, typecheck:all, test, test:all and `check` exit 0; test:release as phase 1 (the 7 host `zip` failures only); rehearsal (a)-(d) pass (lessons/phase-2.md).
