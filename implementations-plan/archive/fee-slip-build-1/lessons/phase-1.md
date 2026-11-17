# Phase 1: build, gates, review

- 2026-11-17, `e2088c251`: `bun run test` passed every test but reported one `EnvironmentTeardownError` ("Closing rpc while onUserConsoleLog was pending") from `src/popup/windows/execute/OperationCard.fallback.test.ts`, a file this change does not touch, at load1 ~190; the file alone and the full rerun (load1 ~258) were green. The same host-load teardown flake as `archive/import-retry-1/lessons/phase-1.md`.
- 2026-11-17: the smoke harness needs the armed smoke build in `dist/chrome` first (`global-setup-smoke.ts` names the command); `agent.sh` builds its own.
- 2026-11-17, Codex round 1 (session `01a1ea6b`), gpt-6.1-sol high read-only, over the plan and `origin/dev...e2088c251`: approve, high confidence; one comment nit accepted (`b544ebbc2`). Verdict and findings in `plan.md` § Audit verdicts.
