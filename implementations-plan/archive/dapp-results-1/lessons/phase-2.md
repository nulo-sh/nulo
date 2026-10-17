# Phase 2: an app-facing `executeUtility` answer

- 2026-10-17, verified first: at `563b0627` the dApp's `executeUtility` answer is the runtime client's parsed `UtilityExecutionResult` with `stats` (Fact 7), so the phase runs.
- 2026-10-17, red before wiring. With `toAppFacingUtilityResult` added and the executor not yet calling it, `view-executor.test.ts`'s new test failed on its never assertion (`expected { nodeRPCCalls: …, … } to be undefined`); the helper's two wire tests passed, their in-test search detecting every stat on the unreduced answer. Wired: 34 passed in both files.
- 2026-10-17, review round 1. Codex (session `01a14bb6`): `conditional approve`, no runtime defect; README, helper comment and this file's wording fixed; one comment kept (plan.md § Review verdicts). Opus diff review: `conditional approve`; redundant assertion removed, describe renamed, comment and README wording fixed. Affected files: 97 passed.
- 2026-10-17, e2e. `NULO_E2E_BROWSER=chrome NULO_E2E_RETRY=0 … e2e:agent tests/e2e/network/connect-locked-queue.test.ts` at load1 139: 2/2 passed (password 33.5 s, passkey 27.5 s; tests 61 s, run 295 s with the build). Both read a dApp utility answer through the playground's SDK parse after the change.
- 2026-10-17, review round 2. Codex resumed: `conditional approve` on the smoke check only, which passed. Converged.
