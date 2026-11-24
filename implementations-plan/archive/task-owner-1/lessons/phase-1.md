# Phase 1: the ownership rule and its owners

- Base: the arc branch is cut from `origin/dev` at `5a2b43ec1` (one commit past the plan's `9c913679b`, #1984, which touches no task code).
- Reproducer (`auth-registry/service.test.ts`, "a revoke's task joins the list only of the profile it runs for"): red at `9c913679b`, green here; its control green on both.
- First suite run after the change: 55 red, every one a test double or spy that predates the owner argument (argument-index spies, balance doubles without `exists`, a fee context without a fence, a profile stub without `getActiveProfile`). Fixed in the tests; no production change.
- Mutation checks, each reverted and re-verified green: dropping the balance queue's `enqueue` guard, dropping `owner === undefined` from `createRoot`, and dropping the whole check each turn at least one new test red.
- `executeOperations` crossed the cognitive-complexity budget (16) with the owner read inline; the read moved to a private `batchOwner`, no suppression.
- Deviations from the plan text, none changing behaviour: the coordinator's constructor loses its `TaskService` parameter (unused once its root branch goes, D5); the fee-strategy lifecycle harness becomes async to build its registry through `startedTaskService`; the fence-entry test's profile stub answers `getActiveProfile`; the `classifyOperationCatch` test carries a control showing a dropped handle still throws `Invalid task id`.
- Gate: `bun run lint` 0; `bun run typecheck:all` 0; the seven-path vitest run 110 files, 2254 passed, 1 skipped, 7 todo.
