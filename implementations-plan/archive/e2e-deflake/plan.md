# e2e deflake

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Four passes of root-cause e2e fixes: causal-signal waits and the failure-evidence helpers in `apps/extension/tests/e2e/fixtures/helpers.ts` and `apps/extension/tests/e2e/fixtures/popups.ts`, a real service-worker kill in `apps/extension/tests/e2e/network/backup-restore-sw-restart.test.ts`, and the crash-rollback liveness gate in `apps/extension/src/composables/full-backup-restore.ts` backed by `apps/extension/src/utils/background-liveness.ts`.
- **Open items**: the five-second anchor sleep that `withStaleAnchorRetry` may retire, the three-second sleep in `apps/extension/tests/e2e/network/incoming-transfers.test.ts`, the strict-mode opt-out restore with no e2e, the unread `isMinting` field in `TokensView.vue`, and routing the retired e2e gotchas into the e2e-testing skill, tracked in #157, #161, #162 and #185. The three-second sleep and the unread `isMinting` field were closed by a later plan before `follow-ups.md` was retired.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Eliminate the recurring e2e and CI flakes by root cause. Raising a timeout, weakening a gate or skipping a test is not a fix: a fix must change what is awaited, a deterministic causal signal, not how long. A flake that cannot be fixed within that rule stays open in the ledger with its evidence. Success is three consecutive fully green runs of every suite with no re-runs and no consumed retries, and a green only certifies a deflake if the trigger actually occurred during it.

The work ran as four passes. The first mined fifteen red jobs into six distinct failing waits. The second closed the remaining flake classes. The third measured two mechanisms everyone believed in, and both turned out to be wrong. The fourth rewrote the mid-restore crash test so it asks its question for real.

## Why

Every red was cleared by a re-run, so the suite had learned to hide its own failures. Several earlier "fixes" were budget raises justified by a wrong diagnosis, and one was reverted when the larger budget failed identically.

## What shipped

- Waits now poll the causal fact: the confirm button's approvable state instead of op rows rendered, a fresh balance row with a newer update stamp instead of the expected value alone, the purge tombstone instead of a route, and a navigation that waits for the router to commit.
- `ensureUnlocked` decides from the session record's shape and proves the unlock by that record reappearing with a newer stamp. `launchExtension` creates its own page. A duplicate-aggregator merge trap recorded earlier was measured and found unsupported.
- The foundry installer step in the aztec setup action was removed after a preflight that asserts the bundled `forge` and `anvil` exist.

### Flake ledger

The ledger was the evidence base: fifteen red jobs at attempt level, six failing waits, each with a mechanism. Two entries carry the cold-popup class: on a cold shard the gap between the execute popup's rows rendering and its confirm button becoming approvable spans the fee estimate, so the generic ten-second click wait expired. `waitForExecuteApprovable` waits on the button's own state, and the two historically cold callers, the execution canary and `cancel-mid-prove`, pass a longer budget explicitly.

### Stage waits

A wait over a page that can navigate must accept every later state. A terminal predicate that only recognised the import page starved for its whole budget once a clean import finished and routed away between two polls; already-routed counts as terminal.

### Console errors

The console sniffer reroutes app `console.*` over RPC to the worker, so the page's native console never fires and `page.on("console")` cannot see app logs. This is by design. A caught-and-logged error is invisible to both fixture arrays, the worker's log ring is the evidence channel but lags a flush debounce, and `ctx.consoleErrors` restarts empty on every page a helper attaches to, so an empty array is not proof of no errors.

### Respawn gap

After a real kill the messaging client flips to connected on doomed ports before the new worker exists, and every call issued in that gap is rejected within about a second. The rollback therefore never ran. The restore flow now classifies a disconnect failure and waits for the new worker's liveness signal, written only after full service wiring, before the bounded delete; a gate failure fails closed to cleanup-pending and the torn-marker backstop.

### Real kill

CDP `Runtime.terminateExecution` never killed the worker: the target, the session record and the unlocked wallet all survived, and the liveness advance was the surviving worker's own heartbeat. A real target close replaces it (today `stopBackground` in `apps/extension/tests/e2e/fixtures/browser/chrome.ts`): the worker is destroyed, the session record is gone and liveness advances by a cold-boot write. Three skipped resilience tests turned out deterministic, and the one test whose premise was a crash had never crashed.
