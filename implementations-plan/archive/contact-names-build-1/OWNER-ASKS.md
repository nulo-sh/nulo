# Owner asks: contact-names-build-1

## OA-1. What an app granted the address book receives for a stored name that reads as an address (answered)

- **Surface.** Not a wallet screen: `aztec_getAddressBook` (`wallet/services/execution/view-executor.ts`) answers an app the person granted the address book. Only a name already stored, or restored from a full backup, can read as an address; entry, edit and import refuse one.
- **The question.** "A stored name that reads as an address, sent to an app you gave your address book: sent as stored (A), left out (B), or sent with the contact's own address as its name (C)".
- **The owner's pick, 2026-11-24: C.** "Send such a contact with its own full address as the name. The app shows the true address where it would have shown the name."
- **Ships.** Such a contact is answered with its own full address (`0x` + 64 hex) as the alias; every other contact with its name; the same rows, in the same order and shape (plan D10).
