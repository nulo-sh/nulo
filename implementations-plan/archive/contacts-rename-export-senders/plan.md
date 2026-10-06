# Contacts: rename and sender export

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the token menus point at the contacts page, and contacts export and import carry sender state: `apps/extension/src/utils/contacts-export-format.ts`, `apps/extension/src/popup/components/modules/settings/contacts/useContactImportExport.ts`, and `getSendersAcrossActiveNetworks` in `apps/extension/src/wallet/services/account-state/service.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Two changes. First, rename "Manage senders" to "Manage contacts" in the Assets and token menus and repoint them to the contacts settings page, with shorter empty-state copy. A sender is a PXE concept under a contact, so users reason about contacts. The senders entry under Advanced stays for power users. Second, persist `isSender` across contacts export and import.

## Why

Exporting contacts silently dropped which ones were registered as senders, so a restored wallet could not receive from them until each was re-added by hand. Contacts are per profile while senders are per network, so the export has to pick a rule: a contact is a sender if it is one on any reachable network.

## What shipped

- Export format: a versioned envelope with `isSender` per contact, plus a strict parser that still accepts the old flat array and rejects any other shape. The parser now lives in its own module with a row-count and byte ceiling checked before parsing, since an import file is hostile input.
- Export: `getSendersAcrossActiveNetworks` returns the union of sender addresses across networks whose node reports active, and skips the rest, mirroring how account-state backup treats a down network.
- Import: the active network is read once before the loop, and sender registration runs after either a create or a merge of an existing contact. A row that fails registration does not stop the others, and one summary reports created contacts against registered senders. A legacy array never registers senders.
- The precision loss is by design: senders are registered on the active network at import time, not the network they came from, and the import dialog says so.
