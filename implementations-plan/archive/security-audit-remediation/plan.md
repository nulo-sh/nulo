# Security audit remediation

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Scope enforcement in `packages/wallet-bridge/src/scope-enforcement.ts` and `packages/wallet-bridge/src/dispatcher.ts`, session-revocation teardown and subframe rejection in `apps/extension/src/wallet/services/wallet-sdk/background.ts`, the RPC URL allowlist in `packages/aztec-runtime/src/adapters/aztec-node-factory-adapter.ts`, live-chain rebinding in `packages/aztec-runtime/src/utils/chain-identity.ts`, and the structured transfer summary in `apps/extension/src/utils/transfer-intent.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Fix the findings of a whole-codebase security audit as a sequence of small, separately reviewed phases rather than one unifying trust primitive, because the fixes live in different layers: scope enforcement, session lifetime and runtime chain validation. The one shared structure is the dispatcher's session lookup, consolidated first so every later phase works from one captured session.

## Why

- The dispatcher looked up the dApp session independently at six call sites, which left a window where a session could change between decisions. One capture at entry, threaded through every handler, closes it for every later phase.
- A single stored session can back several live channels (several tabs on one dApp), so teardown matches live sessions by origin and chain, not by a single id field.
- An approved discovery can re-establish a session through key exchange after the session is terminated, so revocation also has to purge approved-but-unused discoveries and refuse a key exchange with no stored session.
- The sanitization sweep was ordered ahead of the approval-card redesign so the new components adopt an established pattern instead of introducing one.
- Frame-targeted replies are not possible on the upstream transport, so the wallet-side defence is rejecting subframe senders.

## What shipped

- Dispatch captures the session once and fails closed for any non-exempt method when it is missing. `getAccounts` is no longer exempt, and the grant response no longer echoes accounts the dApp was not granted. The address-book and sender-registration methods require their own grant, and account-scope arrays are validated against the session's accounts, including the empty-calls shortcut.
- Passkey unlock rejects a credential whose id does not match the profile's, mirroring the check on export.
- Deleting a stored dApp session terminates every matching live session and purges its approved discoveries.
- Subframe-originated content messages are rejected by default. A build-time flag, not a runtime setting, re-enables them, so a compromised page or popup cannot flip it.
- RPC URLs must be `https:`, or `http:` only for loopback (`localhost`, `127.0.0.1`, bracketed `[::1]`, since URL parsing keeps the brackets), and may not carry userinfo. The schema applies it to every network and endpoint input, backup restore runs the full schema on each entry, and the node factory refuses a disallowed URL as the last line.
- Every trust-bearing live-node read in the execution layer rebinds the node's chain identity to the selected network before it signs, proves or derives an authwit. The comparison uses the stored composite chain id and skips the local network, which the loopback allowlist covers.
- Dapp-controlled display strings are sanitized at the surfaces that show them and at the persistence boundary for a discovery's app name.
- Transfer and mint calls with a documented signature and exact arity render a structured card with the source, recipient and amount in canonical forms. Any call that does not match falls back to the function-name render and is not presented as verified.
