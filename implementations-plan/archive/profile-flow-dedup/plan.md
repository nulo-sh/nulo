# Profile flow dedup

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the popup and onboarding profile import and create flows share `apps/extension/src/composables/useProfileImportFlow.ts` and `apps/extension/src/composables/useProfileCreateFlow.ts`, and the shared passkey UI lives in `apps/extension/src/components/passkey/PasskeyCeremonyDialog.vue` with its ceremony helper in `apps/extension/src/wallet/utils/passkey-ceremony.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Extract two parameterised composables for the near line-for-line duplicated orchestration of profile import and profile create (state refs, name validation, passkey ceremony or secret entry, the profile-service call, error routing), and move the shared passkey dialog and ceremony helper out of popup-only paths. The work was behaviour-preserving except for two ratified fixes.

The composable owns everything up to activation. Each shell injects one `onComplete` (or `completeImport`) callback for activation, routing and toasts, plus a few narrow reporting adapters. The composable body never bootstraps, routes or toasts. The seam is the one `useFullBackupImport` already used.

- The dialog went to `components/passkey/` and the helper to `wallet/utils/`, because the helper imports wallet-domain types and a pure `utils/` home would be a layering smell.
- `onKeydown` stays page-local. Onboarding create has a native form submit the popup lacks, so a shared handler would let its pin pass for the wrong reason and risk dropping the submit handler.
- Secret zeroing stays page-owned, with its existing asymmetry (onboarding zeroes, popup does not), and composables never own `onUnmounted`.

## Why

The two shells differ only in how the UI reacts after the service opens the session: the popup relies on an active-profile event listener to bootstrap, onboarding calls the bootstrap explicitly. Duplicating the orchestration around that difference let the copies drift, and the shared passkey dialog was still housed under popup paths, so onboarding reached across a shell boundary to use it. This is the fund-access critical path and handles secret material, so every behaviour that moved nowhere was pinned before it was touched.

## What shipped

- The relocation, with every importer and the stale path strings in comments updated, and the dialog's own tests passing at their original count.
- `useProfileImportFlow`, with a pin that the injected completion runs exactly once per import path. That fixed a double bootstrap in onboarding import by construction. The import catch-all is now one shared handler that falls through to a generic "Import failed" error, which also fixed the popup showing `[object Object]`.
- `useProfileCreateFlow`, with the popup's activation sequence kept verbatim and in order. Popup create gained the house Enter guard (only inputs submit), so Enter on a method tab no longer submits; this was ratified as intrinsic to the guard and is pinned by an event-target test on the popup page.
- Shared e2e import drivers in `apps/extension/tests/e2e/helpers/import-drivers.ts` and a new `apps/extension/tests/e2e/onboarding-import.test.ts`, since onboarding import had no e2e at all.

Smoke e2e drives create by click, never Enter, so the Enter behaviour is guarded by unit pins only.
