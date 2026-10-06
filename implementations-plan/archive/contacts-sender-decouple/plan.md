# Contacts and sender registration decoupled

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: contacts no longer touch sender registration, in `apps/extension/src/popup/components/popups/NewContactPopup.vue`, `apps/extension/src/popup/components/popups/EditContactPopup.vue` and `apps/extension/src/popup/components/modules/settings/contacts/useContactImportExport.ts`, with colocated tests.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The contacts feature is non-mutating toward sender state, except for the explicit adds an import makes. Adding, editing or deleting a contact never registers, unregisters or migrates a sender. The "Register as sender" toggles, the delete-confirm toggle and the silent sender migration on address edit and on import merge are gone. Sender registration stays as a power-user surface under Settings, Advanced, Account State, Senders. The read-only sender chip on a contact row stays.

## Why

With handshake-backed note delivery, receiving a token transfer from the bundled token needs no sender registration, so toggles that imply otherwise are misleading. Constrained delivery is registration-free by construction. Unconstrained delivery depends on the sender wallet's tag strategy, so registration-free receive is the ecosystem default there, not a guarantee. Sender registration therefore survives only for contracts and wallets that use address-derived tagging.

The old migration was also a privacy regression: it registered a new address without consent and deleted a discovery source, even when the imported row said it was not a sender. A stale registration left behind is visible in Advanced and harmless, which is strictly better than a consent-free write.

## What shipped

- The popups and the delete flow no longer talk to the account-state service. Import adds only rows that explicitly carry `isSender: true`, on the active network only, and the banner states the count and the network, or that registrations will be skipped when no network is active. Cross-network fan-out was left as later work.
- Import treats the file as hostile: a byte cap is checked before parsing, staged rows are rebuilt with only the known fields, a row cap applies, and addresses are lowercased and deduplicated before any call to the node.
- Copy changed: the token empty state no longer says contacts are needed to receive, a typo in the import toast is fixed, and the Advanced copy describes the niche as transfers delivered with address-derived tagging.
- First component tests for the new and edit popups and the import hook, including a keyboard path that must not bypass the dirty check.
- A network e2e proves the behaviour the change relies on: a fresh node-side sender that the wallet has never seen sends a private transfer and the wallet shows the exact balance delta with zero registrations. This was a required gate with no skipped fallback.
- The `aztec_registerSender` dApp RPC and the Senders page are unchanged.
