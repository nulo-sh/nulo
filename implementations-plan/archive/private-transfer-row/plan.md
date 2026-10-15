# Private transfer row

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The standard Token's four transfers read as the approval card's transfer row (From, To, Amount in the token's units) in a transaction payload, an authorization request and a discovered authorization, in `apps/extension/src/utils/token-transfer-vocabulary.ts`, `apps/extension/src/popup/windows/execute/call-surface.ts` and `apps/extension/src/popup/windows/execute/CallArguments.vue`, with one network e2e, `apps/extension/tests/e2e/network/tx-transfer-row.test.ts`.
- **Open items**: the playground's multicall nonces, a node test running the real selector hash with the decoder and `callSurface` together, a discovered-authorization e2e and a private-transfer e2e, all tracked in #164 and #165. The node test of the real selector hash was closed by a later plan before `follow-ups.md` was retired.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Give the card and the wallet's own transfer matching one list of authwit nonce names (`AUTHWIT_NONCE_NAMES`, owned by `apps/extension/src/wallet/services/token/functions/descriptors.ts`), so the standard Token's `_nonce` spelling reads as a transfer. Before the row trusts a call, it checks the call's selector against the selector its own signature hashes to (`VOCABULARY_SELECTORS`, a static table recomputed by a node test with the real hash), and its title comes from the function that selector runs. A random authwit nonce of 2^64 or more reads as trimmed hex, whole on hover. Display only: no change to the bridge package, background decoding, interface resolution or any message.

## Why

The standard Token names its nonce `_nonce` where the card's vocabulary expected `authwit_nonce`, so all four of its transfers fell to the decoded rows: raw base-unit amounts and a 32-byte nonce. Widening the row alone would have made it believe two things a dApp controls, which function a call runs (taken from an interface the dApp may have registered) and the row's title (taken from the dApp's own label). The selector check closes both without touching interface resolution.

Alternatives not taken: running the descriptors' predicate in the background and sending a verdict (it accepts any integer width, so a stricter check on an attacker-supplied interface authenticates nothing, and it widens a cross-package wire type); pinning the row to the standard Token's class (narrower than the rule for other tokens); a second role list per name; renaming `_nonce` in the decoder (the decoded rows would stop showing the contract's own words).

## What shipped

- The four transfers read as the transfer row on a registered token, in all three places the card shows a call.
- A call whose selector does not match, such as a relabeled interface or a lookalike address, falls to the decoded rows; component tests pin it, and a node test recomputes the table with the real hash because the hash cannot run under jsdom.
- The nonce value carries its own test id, so tests read its text and hover title from that element.
- The network e2e drives the two dApp windows (a transaction and an authorization request).
- Declined: relabeling the decoded rows for an unrecognised interface, which would have needed the compiled-in-class resolution alternative.
