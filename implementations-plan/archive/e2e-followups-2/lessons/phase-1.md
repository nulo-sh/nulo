# Phase 1: a zombie owner is dead (#284)

- **Red before the fix (2026-10-11).** The new case in `apps/extension/scripts/e2e/owned-processes.test.ts` ("a zombie owner is dead to the identity check and to the reap") failed at its first post-kill assertion: `readStartTime(pid)` returned the zombie's start time (`expected '339460146' to be undefined`). The live control (`identityIsDead` false while the child runs) passed.
- **Fix.** `readStartTime` reads `/proc/<pid>/stat` once and returns `undefined` when the state field is `Z`. One read, so no window between the state and the start time.
- **Green after.** `bun --bun vitest run scripts/e2e/owned-processes.test.ts scripts/e2e/webdriver-ownership.test.ts scripts/e2e/reconcile-lock.test.ts`: 42/42, three runs. The #284 case ("an agent run's service, adopted by a bare run, outlives every reap until its adopter dies") green in all three.
- **Gate.** `bun run lint` 0, `bun run typecheck:all` 0, `bun run test` 0, `bun run test:all` 0 (extension 11187 passed, 4 skipped, 7 todo), `bun run test:ci-gating` 0 (517 pass).
- **Child shape.** `sh -c 'sleep 120 & echo $!; exec sleep 120'`: the exec'd `sleep` never waits, so the killed child stays a zombie until the test kills the parent; the control is read while the child certainly runs.
