# fixes-1.2.0-1 recon

One Sonnet explorer (reuse sweep) plus the driver's own reads, at `origin/dev` `3b845ef02`.

## The defect's surface

- `apps/extension/src/popup/components/modules/general/TokensView.vue`: `setRowUpdating(tbId, updating)` (:147-150) is the one writer that sets a row's `isUpdating` from a single event: `onTaskCreated` writes `true` (:151-153), `onTaskUpdated` and `onTaskDeleted` write `false` (:154-159). The other two writers already derive it from the remaining tasks: `withTaskFlags` (:166, the balance snapshot's `mapRow`) and the reconnect loop (:219-228).
- `apps/extension/src/composables/useBalanceTasks.ts`: drops the event's task by id (:42-57), then `isUpdating(tbId)` (:59-60) is true while any kept task of that row is unfinished. `onTaskUpdated` and `onTaskDeleted` return `true` for any balance task, of any account; `onTaskCreated` keeps only the active account's.
- Readers of the row flag: Home's section dot `anyRefreshing` (TokensView.vue:89) and `TokenCard`'s `syncFailed` (TokenCard.vue:84), which hides a failed row's dim while its retry runs. `TokenList` forwards the whole row (`TokenList.vue:148-163`), but holdings.vue never decorates its rows, so they lack the flag; Holdings' dot reads `balanceTasks.isUpdating` directly (holdings.vue:72).
- A third writer: `useTokenBalanceSnapshot`'s `onBalanceUpdated` replaces a listed row as received, without `mapRow` (`useTokenBalanceSnapshot.ts:24-25, :54-58`), while the snapshot (:100) and the add (:45-52) apply it; TokensView is its only `mapRow` caller. Found by the Codex plan audit.

## Other task-event subscribers (same defect shape?)

- `useExecutingTask.ts:48-76`: keyed by task id, clears only its own task: no.
- `NewTokenPopup.vue:132-149`: resolves once on the first finished task for its row, keeps no flag: no.
- `holdings.vue:65-72`: derives from `isUpdating`: no.

## Producer: can one row hold two unfinished balance tasks?

- Normally no. `balance-job-queue.ts` mints a task only when no pointer exists (`enqueue`, :144-152; `startBatchTasks`, :270-290) and releases the pointer only after the batch (:442-451), by which point every normal path has completed, failed or cancelled the task. `reset()` cancels before it clears.
- One path orphans an unfinished task: in `failBatchOnProjectorError` (:422-440), a `writeSyncFailure` that throws aborts the loop, the remaining owned tasks are never failed, and `finally` still releases their pointers; the next `enqueue` mints a second task. Plausible but unverified: it needs a storage write to throw.

## Retention

- `TaskService.getTasks`, `getTask` and `getTaskSync` each run `cleanupStaleTasks` (service.ts:192-227), which deletes finished root tasks older than `TASK_RETENTION_PERIOD_MS` (60 minutes, spec.ts:7) with their subtrees and emits `onTaskDeleted` for each. Readers: Home's `useBalanceTasks` snapshot, Holdings', `useExecutingTask` (RecentActivityView), and the balance queue's `getTaskSync`.

## Reuse

- Holdings' rule (#1565) is `useBalanceTasks.isUpdating`; the fix reuses it. No other helper re-derives a row flag. The component harness in `TokensView.test.ts` (:16-50, :165-242) emits task events directly and has `balanceTask` and `sectionDot`.
