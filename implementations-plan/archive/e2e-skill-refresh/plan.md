# E2E skill refresh

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: one shared worker-kill helper used by every e2e spec (`apps/extension/tests/e2e/fixtures/browser/index.ts`), a rewritten `.claude/skills/e2e-testing/SKILL.md`, and a refreshed `apps/extension/tests/e2e/README.md`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Delete the six local copies of the service-worker kill and make every caller import the single helper. Rewrite the e2e-testing skill from a chronological lesson dump into a procedure-first document: run it, write a test, kill the worker, diagnose a red run, flake ledger, editing the harness, references. Replace the README's stale failure snapshot and file count with the current shape.

## Why

The helper that reliably stops the worker already existed, but four specs still carried the older copy and two prover-ON canaries "restarted" the worker with a runtime termination call that never stops it. A restart stage that does not restart anything is vacuous in a single-shot release gate, not just a flake source. The skill meant to stop the next copy still described the old inline helper and carried about ten claims that no longer matched the tree.

## What shipped

- Six call sites now use the shared helper; no spec calls `Runtime.terminateExecution` or `worker.close()` to stop the worker any more. The canaries keep one absence-only path, because Chrome's idle reaper can stop the worker during a long prover-ON stage and the helper cannot wake one.
- The skill states only claims traceable to a file on the tree, says plainly where a rule is convention rather than enforcement, and keeps dated narrative in its flake table instead of the procedure.
- The README no longer carries a failure snapshot or a hard-coded network test count.
- A post-restart liveness gate must read its threshold after the stop returns; a pre-kill snapshot can be satisfied by the old worker's last heartbeat.
- Retry zero for smoke is the `--retry=0` flag; the `NULO_E2E_RETRY` variable is ignored by the smoke config, so earlier "retry 0" smoke claims that used the variable were really retry 2.

## Lessons

### Locked reconnect

Making the canary restart real exposed a product defect the fake kill had hidden. After a real restart the replacement worker holds no in-memory session while the persisted record survives, so the Lock click cleared the record without emitting the active-profile change that drives the redirect to the auth page. The reconnect boot's locked result only routed a popup with no selected profile, so an open popup kept its page and a logged-in shell. The product was fixed afterwards (lock emits when closing the session did not, the connected-flag watcher is synchronous, a locked reconnect under an auth-required route locks the shell) and the canary now asserts the automatic landing.
