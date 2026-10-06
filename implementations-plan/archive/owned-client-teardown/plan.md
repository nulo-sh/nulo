# Owned client teardown

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `documentLogger` in `apps/extension/src/wallet/services/logger/client.ts`, which gives each extension document one shared logger connection, a port-count test in `apps/extension/src/wallet/services/logger/client.ports.test.ts`, and port fixes for three account clients in `apps/extension/src/popup/pages/auth.vue`, `apps/extension/src/popup/pages/profile/new-profile-helpers.ts` and `apps/extension/src/composables/useFullBackupImport.ts`.
- **Open items**: profile creation waits for activation with no identity check or deadline, and document log lines are not level-gated on the client, both tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Stop building a private logger per service client. The logger class is no longer exported; a document obtains its loggers from `documentLogger(context?)`, context-tagged views over one shared client whose port the first log line opens and Chrome closes when the document unloads. Nothing is torn down, so none of the teardown hazards (reconnect flap, late lines reopening the port, rejected in-flight lines, double disconnect) can occur. The same change also fixes the three outer account clients that leaked their own ports the same way.

## Why

Each of about twenty service clients built its own logger, a port-based messaging client that nothing ever closed: `disconnect()` closed the client's port and then logged "Disconnected", which kept or reopened the logger's. A page mount, profile switch, unlock or backup import left one logger port behind per client for the life of the document. The leak was an ownership mistake, a document-lifetime resource with a per-client owner, so the fix gives it the owner it really has. The messaging package needed no change and its connect, disconnect and reconnect state machine stayed byte-identical.

## What shipped

- Module-level shared client with `documentLogger` views and a test-only reset. The twenty service-client constructors and the three standalone logger sites (popup and onboarding console forwarding, the offscreen console and PXE logger) take their logger from it.
- One module mock in the extension unit-test setup gives every unit test a silent document logger; the logger's own tests opt out.
- A port-count test that fails on the old code and passes on the fix.
- Account clients: the auth page and profile creation keep an account client the wallet already holds instead of constructing another, and backup import closes its client in a `finally` after reconciliation, resolved or rejected.
- Out of scope and unchanged: the worker's PXE clients (one per worker, no port, not a leak), and the messaging package.
- The log viewer and CSV export are unchanged, because log lines keep their context tags.
- Fix a leak at the resource's real owner instead of teaching every consumer to release it.
- A port-count assertion on the document is a cheap proof that fails on the old code for the right reason.
