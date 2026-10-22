# fpc-create-flake-1 phase 1: the order proof

- **BASE** = `origin/dev` at 6ec79be30, merged as 0a6eaacee; the merge touched no file the arc reads (`fpc/`, `lock.ts`, `sealed-entity-storage.ts`, the vitest configs and setup).
- **Step 2** (base + the decrypt-delay spy, `let spy` form): exit 1, T3 `AssertionError: expected false to be true` at the `settled` assertion; 13 passed. Reverted.
- **Step 3** (the edit): 14 of 14.
- **Step 4** (edit + the same spy): exit 0, 14 of 14. Reverted; the file matched the edited copy byte for byte.
- **Step 5** (edit + the FPC lock held across `registerContract`): exit 1, T1, T3 and T6 `Test timed out in 5000ms` (5008, 5006, 5006 ms); 11 passed. `service.ts` restored.
- **Step 6** (smoke): 100 of 100 runs green at retry 0, `reds=0`, 21:37 to 21:47 UTC, load1 80.7 at the start and 45.2 at the end, with lint, `typecheck:all` and `test:all` running beside it for part of the soak.
- **Gate:** the fpc unit files 2 files, 20 tests, exit 0; `test:all` exit 0 in every workspace (extension 917 passed, 3 skipped); `lint` exit 0 (no finding in the edited file); `typecheck:all` exit 0; `service.ts` unchanged against `origin/dev`; `crypto.subtle` count 0 in the test file.

## Review loop

- **r1, Codex** (`gpt-6.1-sol`, high, fresh session on `git diff origin/dev...HEAD`): one finding, demonstrated by trace. Under the lock-held mutation a case times out and its `finally` never runs, so the gate, the discovery and the lock's watchdog stay pending and T1's write recorder stays installed; it proposed an `onTestFinished` release. Rejected: it happens only in a run already red on a regression; the mutation re-run with a clock exits 1 in 22 s (`Tests 3 failed | 11 passed`), with no hang and no unhandled-error report; the recorder wraps the case's own harness; T6 has had the same shape on `dev`.
- **r1, Opus** (general-purpose, diff review): `clean`. It notes the edit removes one hazard: the old `track(...).finally` chain could leave a rejected promise behind when the `settled` assertion threw first.
- **r2, Codex** (resumed): `clean`, rejection accepted, no new finding. Converged; no code change.
