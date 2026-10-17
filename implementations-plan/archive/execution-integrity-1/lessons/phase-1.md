# Phase 1: completion past a broadcast (#669)

- `WrappedTask.completeIfTracked()` landed with its five call sites (D1). Every new test was run against the pre-change source of its file first and failed there: the coordinator's send step, `TransferExecutor.execute`, `executeOperations` for both broadcasting kinds, and the registry toggle.
- One shared helper, `task/test-task-service.ts` (`startedTaskService`), gives the four suites a started `TaskService` whose profile switch clears the registry as in the wallet. It replaces copying the stub `ProfileService` wiring into each file.
- The coordinator test went into `execution-coordinator.test.ts`, not a new file: the existing harness already builds the context, so a second file would only repeat it.
- The fakes in seven suites gained `completeIfTracked`. In `transfer-executor.test.ts`, the three assertions on the task's completion now read `completeIfTracked`, so they still prove the step they name.
- `scripts/type-roles/identifier-sites.expected.json` pins a digest of `auth-registry/service.ts` as evidence that its operations never reach the execute window. Re-attested: both `send_transaction` builders are unchanged and still go through `executeSendTransaction`, so only the digest was re-pinned. Phases 2 and 3 touch the same pinned files and will need the same re-attestation.
- Gate F, run once at load 198 (188 cores): lint and typecheck green; unit tests 13 408 passed, with one red, the digest pin above. Green after the re-pin.
