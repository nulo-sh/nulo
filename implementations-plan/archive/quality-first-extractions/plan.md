# Quality first extractions

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `PxeLifecycleCoordinator` in `packages/aztec-runtime/src/pxe/lifecycle-coordinator.ts` (used by `packages/aztec-runtime/src/pxe/service.ts`) and the exported `validateAndMigrateBackup` stage in `apps/extension/src/composables/useFullBackupImport.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Take the two highest-risk extraction findings of the first quality remediation wave, each scoped to its smallest safe first step, with zero behavior change. The rest of each finding stayed a documented follow-up.

- **PXE lifecycle.** Extract only the purge-epoch fence, the counter plus its capture and assert-unchanged check, into a coordinator. Teardown methods stay on `PxeService` because they are coupled to the chain guards, profile barriers and registry shared with the operation path, and the two best-effort orphan sweeps deliberately use a different policy, so unifying them would change behavior.
- **Backup restore.** Extract only the validation and migration stage of `restoreBackup`, which reads and writes none of the service clients or rollback state declared downstream. The stage returns a discriminated ok or rejected result, and the caller maps a rejection back to the status and error fill.

## Why

Both were the riskiest changes of the wave: a concurrency primitive in the runtime package and a large security-sensitive restore closure. The byte-identical epoch fence was the recurring bug class in the first, and the validation stage was the only part of the second with no closure-state hazard. Moving anything shared with the rollback state or the guards was the risky part, so it was left out.

## What shipped

- **Fence.** `current` (the capture), `assertUnchanged` and `bump` are identical to the code they replaced, including the thrown message, and the double bump stays inside the chain guard's critical section. The incarnation-fence test's private reach-ins moved in lockstep, and the coordinator test pins the complete fence string.
- **Validation stage.** The trust-gate order is unchanged: checksum, then compatibility epoch, then version range, then migration. The user-facing titles are preserved, and exact-title-and-message pins cover each rejection.
- **Accepted drift.** Extracting an awaited stage adds one promise-reaction turn before the caller continues. It is unobservable against the real crypto and migration awaits and re-entrancy-safe, and it is documented at the call site.
- **Deferred.** The other PXE service split pieces, the other restore stages and the composition-root initializers. The last became the composition-root pilot, see [composition-root-pilot](../composition-root-pilot/plan.md).
