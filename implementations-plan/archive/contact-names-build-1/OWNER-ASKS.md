# Owner asks: contact-names-build-1

## OA-1. What a dApp granted the address book receives for a stored rule-breaking name

- **Surface.** Not a wallet screen: `aztec_getAddressBook` (`wallet/services/execution/view-executor.ts`) answers a dApp the person granted the address book with every contact, its stored name as the alias. A dApp may print that alias in place of the address. Only a name stored before the rule, or restored from a full backup, can break it; new ones are refused at entry and import.
- **Options.** (a) Unchanged: the dApp receives the name as stored. (b) The row is left out of the answer. (c) The row is sent with its address as the alias.
- **Recommendation.** (a) in this lane: the picks name the wallet's own screens, and (b) or (c) changes what the standard wallet-sdk surface answers. A follow-up on the owner's word.
- **Ships now.** (a), unchanged. No surface of arc 1 depends on it.
