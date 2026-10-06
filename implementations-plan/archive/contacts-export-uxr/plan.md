# Contacts export rework

## Outcome

- **Date**: —
- **Status**: abandoned.
- **Shipped**: nothing of this design is in the tree; the export it set out to rework is `apps/extension/src/popup/components/modules/settings/contacts/useContactImportExport.ts`, which still builds the file in the popup and downloads it with the shared download helper.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Keep the contacts export popup-orchestrated and fix three things around it, as three separate commits:

1. Read the sender union across active networks in parallel instead of one network at a time.
2. Show an inline spinner in the page header while the export runs, with a completion toast, instead of a loading toast.
3. Add a thin background-side download primitive that takes a filename and the JSON, so the download survives the popup closing mid-export.

The export file stays the version 2 envelope, one `isSender` flag per contact, true when the address is registered as a sender on any active network of the active profile.

## Why

- The earlier draft moved the whole export into the background service. That would have coupled the contact service to account state, the coupling an earlier audit had warned against, so the popup stays the orchestrator and only the bare download moves.
- Background service workers have no `URL.createObjectURL`, so the primitive had to take a data URL, base64 over UTF-8 so non-ASCII names survive.
- A loading toast shares the toast composable's single timer, so a pending "copied" toast could clear it early. An inline spinner avoids the timer and also removes the double-click path, because the menu trigger becomes the spinner.
- Reading networks serially made one offline network stall the whole export. Parallel reads fix the common case; a single slow network still waits for its status check, and bounding that check risked reporting a briefly flaky node as inactive.
- A parallelism test that throws on one network proves nothing against a serial implementation that catches and continues. The test has to hold one network's read open and assert the other was already called.

## What shipped

Not recorded as delivered, and the tree does not show it: the sender-union read in `apps/extension/src/wallet/services/account-state/service.ts` still loops over networks one at a time, the contact service has no download primitive, and the contacts page has no export spinner. The export builds the version 2 envelope in the popup, compares addresses case-insensitively so an older stored contact still exports as a sender, and prefixes the profile name onto the filename.
