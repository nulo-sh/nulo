# Connect on another chain

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the dispatcher derives a dApp chain's default account on demand (`packages/wallet-bridge/src/dispatcher.ts`, `apps/extension/src/wallet/services/account/service.ts`) and the connect window offers a switch to that chain (`apps/extension/src/popup/windows/capabilities/chain-mismatch.ts`, `apps/extension/src/composables/useNetworkActivation.ts`).
- **Open items**: `AccountService` has no chain-scoped critical section, tracked in #99. Account creation and import lock different profile, chain and type tuples and a network purge takes neither, so a purge between a derivation's read and write can leave an orphan row, and a same-address import during a creation is overwritten.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

When a dApp asks for accounts on a chain other than the wallet's active one and the profile has no rows there, derive that chain's default account on demand where the popup's account list is built. The window tells the user which chain the app is on and offers, but never requires, switching the wallet to it. Approve is not blocked by the mismatch itself.

## Why

Accounts are per chain, because the L1 chain id is an input to key derivation. The wallet derived a chain's default account only for the active network, at bootstrap and on a network switch, so a chain the user had never visited had no rows and the connect popup refused with "No accounts on this chain". Nothing downstream needs the active network to match the dApp's: the dispatcher already resolves the dApp's own chain, and sessions and execution are chain-scoped.

Derivation on a dApp's request is bounded so a dApp cannot steer the wallet. It happens only for a chain with no rows of any kind (hidden and imported rows count) whose L1 identity needs no endpoint probe, meaning the built-in mainnet, testnet and local kinds. A custom or legacy chain is declined without probing, and the popup shows the hard error, so a dApp can never make the wallet contact an endpoint or retry one. A derivation failure propagates to the dApp as an error rather than being read as "no accounts".

## What shipped

- A provisioning method on the bridge's service contract, kept separate from the read-only account reader, implemented by the account service under the same per-tuple serialization as default-account creation. The dispatcher reads visible rows, provisions if empty, then re-reads, so a concurrent or derived-then-hidden row is settled by the re-read.
- An `unattended` option on L1 identity resolution that throws instead of probing. Its error constant must not contain the uppercase token the bundle guard greps for in release builds; the first name did and reddened every network shard although the tests passed.
- A composable that extracts the Settings screen's guarded network activation, including the in-flight-send check and failure messages, so the connect window and Settings share one path.
- A neutral banner in the connect window with an invitation state and a settled state, shown only when a matching network row exists and no hard error is up. While an in-window switch runs the footer buttons are held, but the window's own reject path stays unconditional so a lock mid-switch still rejects the pending request.
- The same banner button accepts a test id, and the e2e suite covers the mismatch case it used to avoid by switching networks before connecting.
