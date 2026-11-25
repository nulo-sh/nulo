# Recon: contact-names-build-1

Read at `0aabc016d`. Paths are under `apps/extension/src/` unless they name another root. One Sonnet Explore agent took the census of every reader and writer of a contact's name; the rest was read by hand.

## Since the options were verified (`8ae2c06a4`)

Only moves and style composes touch the surfaces: `publish-facts.ts` and `fee-helpers.ts` moved to `utils/fee/`; `ImportContactsPopup.vue`, `RecipientField.vue`, `send.vue` and `SendTxSummary.vue` compose the shared `visually_hidden` and text-action recipes; `ContactService` names its dependency by `PROFILE_SERVICE_NAME`. Every behaviour the options describe reads the same.

## Writers of a name

| Writer | Where | With this change |
|---|---|---|
| New contact | `NewContactPopup.vue` → `addContact` | `contactNameError` (`utils/contact-rules.ts`) returns the address-shaped verdict, then the duplicate one |
| Edit contact, and an import row's edit | `EditContactPopup.vue` → `updateContact`, or the row's `onSave` | same verdict |
| Contacts file | `utils/contact-import-rows.ts` `classifyImportRow`; writes in `modules/settings/contacts/useContactImportExport.ts` `upsertOneContact` | kinds `invalid`, `name` and `conflict` are not importable |
| Service | `wallet/services/contact/service.ts` `addContact`, `updateContact` (an omitted name keeps the stored one) | refuses an empty name and a name that breaks the rule, a kept one included |
| Full backup | `service.ts` `restore` | sanitizes and keeps, untouched |

All of them store `sanitizeContactName` (`utils/contact-name.ts`): letters of any script, ASCII digits, space and `-._`, invisible characters gone, cut to 25.

## Readers that print a name for an address

- `components/AddressDisplay.vue` (`getContactByAddress`, `@name` for a name that passes the rule, a press shows the address; then an own account's name). Used by history detail (`modules/tx/DetailAddressCard.vue`), the developer Senders page and every `AddressDisplay` in the approval window (`CallArguments`, `OperationCard`, `OperationActionRow`, `AuthwitDetails`, `ValueTree`, `SendTxSummary`).
- `popup/windows/execute/contract-chips.ts` `nameBookOf` (`@name` for a name that passes the rule, then an own account's name). Used by the approval window, the raised-fee window and the developer Contracts page (whose search also reads it).
- `popup/pages/send.vue`: `recipientCandidates`, built from contacts whose names pass (suggestions, and the names of Recent rows through `candidateFor`), `applyQueryContact` (a Contacts row's `?contact=<id>`), `payeeName` (the committed row and Review), `payeeSentenceName` (the fee warning's sentence).
- Readers that stay: the Contacts list (`ContactRow.vue`), its delete dialog and the contacts export, where the name is renamed or carried as it is.
- Not a person's screen: `wallet/services/execution/view-executor.ts` `executeAztecGetAddressBook` answers an app granted the address book with every contact, a name that breaks the rule answered as the contact's own address (OA-1, plan D10). The wallet API's answer schema reads the alias as any string; the playground prints the answer as it comes.

## Send

- `modules/send/recipient-search.ts` `matchRecipients`: a term whose name key begins `0x` and a hex digit matches only a whole address; any other term matches a name holding it, initials equal to it, or an address equal to it.
- `RecipientField.vue`, a mechanism this change leaves untouched: Enter with no highlight takes the first suggestion; the field's blur takes a candidate whose address equals the term exactly.
- `SendPersonStep.vue`: every Recent row prints `send-recent-address`, under the name on a named row.
- `modules/send/recent-sends.ts` `isKnownAddress`: an own account or a past send; `PayeeBlock.vue` prints "You have not paid this address before…" when it is false.

## Existing art

- Field refusal in `txt-danger`: `components/composite/ProfileNameField.vue` (`:error`, `:ariaInvalid`, `<Text variant="body" color="txt-danger" height="150" role="alert">`).
- `contactNameKey` keeps scripts apart on purpose (a duplicate check, not a shape check); the look-alike fold lives only in `isAddressShapedName`.
- Tests of which candidate a held press picks: `RecipientField.test.ts` and smoke `send-keyboard.test.ts` ("a mouse press held on a suggestion while the field's blur matches another candidate at that address picks the pressed one") use a contact `Fan` saved at the account's own address, so the blur's match and the pressed row are two candidates at one address (plan D6).
