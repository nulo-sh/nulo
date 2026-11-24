# Recon: contact-names-build-1

Read at `0aabc016d`. Paths are under `apps/extension/src/` unless they name another root. One Sonnet Explore agent took the census of every reader and writer of a contact's name; the rest was read by hand.

## Since the options were verified (`8ae2c06a4`)

Only moves and style composes touch the surfaces: `publish-facts.ts` and `fee-helpers.ts` moved to `utils/fee/`; `ImportContactsPopup.vue`, `RecipientField.vue`, `send.vue` and `SendTxSummary.vue` compose the shared `visually_hidden` and text-action recipes; `ContactService` names its dependency by `PROFILE_SERVICE_NAME`. Every behaviour the options describe reads the same.

## Writers of a name

| Writer | Where | Today |
|---|---|---|
| New contact | `NewContactPopup.vue` → `addContact` | `contactNameError` (`utils/contact-rules.ts`) refuses only a duplicate |
| Edit contact, and an import row's edit | `EditContactPopup.vue` → `updateContact`, or the row's `onSave` | same verdict |
| Contacts file | `utils/contact-import-rows.ts` `classifyImportRow`; writes in `modules/settings/contacts/useContactImportExport.ts` `upsertOneContact` | kinds `invalid` and `conflict` are not importable |
| Service | `wallet/services/contact/service.ts` `addContact`, `updateContact` (an omitted name keeps the stored one) | refuses only an empty name |
| Full backup | `service.ts` `restore` | sanitizes and keeps |

All of them store `sanitizeContactName` (`utils/contact-name.ts`): letters of any script, ASCII digits, space and `-._`, invisible characters gone, cut to 25.

## Readers that print a name for an address

- `components/AddressDisplay.vue` (`getContactByAddress`, `@name`, a press shows the address; then an own account's name). Used by history detail (`modules/tx/DetailAddressCard.vue`), the developer Senders page and every `AddressDisplay` in the approval window (`CallArguments`, `OperationCard`, `OperationActionRow`, `AuthwitDetails`, `ValueTree`, `SendTxSummary`).
- `popup/windows/execute/contract-chips.ts` `nameBookOf` (`@name`, then an own account's name). Used by the approval window, the raised-fee window and the developer Contracts page (whose search also reads it).
- `popup/pages/send.vue`: `recipientCandidates` (suggestions, and the names of Recent rows through `candidateFor`), `applyQueryContact` (a Contacts row's `?contact=<id>`), `payeeName` (the committed row and Review), `payeeSentenceName` (the fee warning's sentence).
- Readers that stay: the Contacts list (`ContactRow.vue`), its delete dialog and the contacts export, where the name is renamed or carried as it is.
- Not a person's screen: `wallet/services/execution/view-executor.ts` `executeAztecGetAddressBook` answers a dApp granted the address book with every contact's name as its alias (OWNER-ASKS OA-1).

## Send

- `modules/send/recipient-search.ts` `matchRecipients`: a name holding the term, initials equal to it, or an address equal to it.
- `RecipientField.vue`: Enter with no highlight takes the first suggestion; the field's blur takes a candidate whose address equals the term exactly.
- `SendPersonStep.vue`: a named Recent row prints the name only; `send-recent-address` is on unnamed rows.
- `modules/send/recent-sends.ts` `isKnownAddress`: a contact, an own account or a past send; `PayeeBlock.vue` prints "You have not paid this address before…" when it is false.

## Existing art

- Field refusal in `txt-danger`: `components/composite/ProfileNameField.vue` (`:error`, `:ariaInvalid`, `<Text variant="body" color="txt-danger" height="150" role="alert">`).
- No look-alike folding exists in the tree; `contactNameKey` keeps scripts apart on purpose (a duplicate check, not a shape check).
- Tests that build on a name written like an address: `RecipientField.test.ts` (`namesake`, "0xaaaa fan") and smoke `send-keyboard.test.ts` ("a mouse press held on a suggestion while the field's blur matches another destination…", a contact named after the account's address). Both meet the new matching (Phase 1).
