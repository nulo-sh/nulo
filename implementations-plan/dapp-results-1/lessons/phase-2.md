# Phase 2: an app-facing `executeUtility` answer

- 2026-10-17, verified first: at `563b0627` the dApp's `executeUtility` answer is the runtime client's parsed `UtilityExecutionResult` with `stats` (Fact 7), so the phase runs.
- 2026-10-17, red before wiring. With `toAppFacingUtilityResult` added and the executor not yet calling it, `view-executor.test.ts`'s new test failed on its never assertion (`expected { nodeRPCCalls: …, … } to be undefined`); the helper's two wire tests passed, their in-test search finding every stat on the unreduced answer. Wired: 34 passed in both files.
