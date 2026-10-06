# UI, storage and composable fixes

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Nine UI, storage and composable fixes: scope switches go through the in-flight-send guard (`apps/extension/src/popup/components/popups/SelectProfilePopup.vue`), the storage facade no longer hangs on a failed re-check (`apps/extension/src/utils/storage.ts`), reads never delete malformed rows (`packages/wallet-core/src/storage/entity_storage.ts`), import rollback is one bounded helper (`apps/extension/src/composables/full-backup-restore.ts`), and the send page and profile bootstrap were fixed (`apps/extension/src/popup/pages/send-balance-events.ts`, `apps/extension/src/composables/useProfileBootstrap.ts`).
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Light tier, one arc of the first remediation wave of the mid-size audits (the session and profile arc is [fix-session-profile](../fix-session-profile/plan.md)). Prove each bug first with a test that fails against the old code, fix it at the smallest layer, and finish with one complete-arc review that bounds how many rounds it may run.

## Why

Nine independent bugs sat in popups, the storage facade and composables, each with a concrete counter-example:

- A profile switch in the select popup wrote the active profile directly and skipped the guard that refuses a switch during an in-flight send.
- A transient storage error in the facade's post-subscribe re-check left every storage call waiting forever.
- Decoding a malformed row deleted it by id on the read path, racing a concurrent valid write.
- Three copies of the import-rollback delete swallowed failures.
- The send page's balance-added handler called `push` on a computed and crashed.
- The incoming-trust popup let a double click dismiss the next queued prompt, and labelled its toast with an identity that could change mid-request.
- Two flows constructed the profile's shared clients at once, so import recovery stomped a bootstrap in flight.
- The send page and the execute window left service clients connected on unmount or init failure.

## What shipped

- **Scope switch.** The select popup routes through `commitScopeChange`, so the in-flight-send guard applies.
- **Facade.** The post-subscribe re-check has a rejection handler, so a transient error cannot hang the facade.
- **Reads keep rows.** Decoding keeps a malformed row and leaves deletion to a serialized repair path, so a read cannot race a write.
- **One rollback.** `rollbackCreatedProfile` retries a bounded number of times and surfaces a distinct "Import incomplete" error when cleanup persistently fails, so a rollback cannot report false success.
- **Send page.** Reducers in `send-balance-events.ts` append to the balances array; the page disconnects its execution client on unmount; the execute window disconnects in an outer `finally`.
- **Incoming trust.** A submitting latch plus a payload-key guard on close stop a double click from dismissing the next prompt, and the token symbol is captured before the await.
- **Bootstrap.** `useProfileBootstrap` single-flights the activation core per profile id, so recovery joins the in-flight bootstrap.
- **Proof.** Every fix has a test that fails against the old code, and a bounded review loop converged after several rounds of fixes to the bootstrap, row-repair and rollback changes.
- **Not in this arc.** A generation-aware account selection inside the store action, purging malformed rows when a profile is purged, and an authoritative durable-deletion check in the profile service.
