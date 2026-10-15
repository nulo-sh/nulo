# Backup import: one slow public node cannot stall it

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A full-backup import that skips what every PXE rebuilds, runs each network on its own pipeline, and offers a Retry for the networks that did not restore: `apps/extension/src/composables/importChainSync.ts`, `apps/extension/src/composables/useFullBackupImport.ts` and `apps/extension/src/components/composite/import/ImportFullBackupForm.vue`, proven by `apps/extension/tests/e2e/network/backup-import-stalled-network.test.ts` and `apps/extension/tests/e2e/import-errors-scroll.test.ts`.
- **Open items**: the import warning's light-theme contrast, a Retry that fails again looking unchanged, the error viewer and onboarding notice not naming networks, the export duplicating contracts every PXE rebuilds, skipping the profile's own account contracts, and a popup closed during the tail losing its outcome, each tracked in #189, #191, #192 and #221.
- **Seeds retired**: the plan's goal and loop seeds are spent; nothing to resume.

## Decision

Three changes, in order. First, the import skips the protocol contracts and the standard contracts the PXE preloads, so a network whose slice holds only those is neither probed nor booted. Second, each network runs on its own pipeline with its own clock inside the unchanged 45-second budget, so a stalled network marks only itself. Third, the finished-with-errors screen gets a Retry that replays only the networks that ran out of time or could not be reached and swaps only their rows. The skip set is upstream's own list, pinned by a test so a version bump that changes the preload fails loudly.

## Why

Restoring a full backup, usually on a fresh install, ran every network's registrations through one shared path. When one public node answered slowly or not at all, it held the others up, and a network holding nothing the person owned still dialled out and could fail. The target outcome is that a stalled network costs exactly one "ran out of time" row, the healthy network's registrations land and appear nowhere in the errors, and the wait never exceeds the old tail. Retry had to be safe to overlap a late first run: at most one row per network, and replaying writes the same address-keyed instance, while entries the normalizer discarded stay discarded.

## What shipped

- The skip rule and its pin test, a pipeline per network, and a fake-clock test that the tail settles by the budget with a probe that answers late and a registration that never settles.
- Retry on both import pages. A new pick, a new import, Back, Continue and unmount drop a running Retry; Back is disabled while it runs, and Enter on a focused Retry runs only Retry.
- The warning names the unrestored networks by their seeded names, in seed order, and says "review the details" when another error remains. It scrolls into view as the screen opens and carries an alert role, with the landing adjusted where the popup's collapsing hero would cover the title.
- A Chrome-only network spec that stalls one network while another is healthy and reads a restored sender back through the account-state reader, a smoke spec on both browsers for the scroll landing, the shared helpers `rpc-stub.ts` and `backup-export.ts`, and test ids on the data viewer and the hero's scroller, bar and title.
- Not done: the options for Retry that were pictured and not picked, and the changes listed under Open items, several of which are colour or design calls left open.
