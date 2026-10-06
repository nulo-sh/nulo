# Faucet add-token

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The wallet side of a dApp's "add this token" request: the `registerToken` route in `packages/wallet-bridge/src/dispatcher.ts`, the schema extension in `packages/wallet-sdk-schema-patch/src/apply.ts`, and the approval window `apps/extension/src/popup/windows/execute/index.vue` with `OperationCard.vue`. The faucet's own button is not in this repository.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

A dApp can ask the wallet to watch a token through a Nulo-custom `registerToken` call on the existing encrypted wallet-sdk channel. Every call opens an approval window. The window shows the token's resolved name, symbol, decimals and contract address, fetched through the PXE before Allow or Deny, plus the requesting origin's host only. The call is gated behind the `accounts` capability.

The schema extension is applied at runtime for the SDK's proxy, on both sides of the channel, before anything reads the schema. It covers only `registerToken`. The dApp-facing `getCompleteAddress` and `simulateViews` calls were dropped in the same change, while the internal `simulate_views` operation kind stayed for its internal callers.

## Why

- The route needed fixing, not just adding. The dispatcher sent every operation other than `sendTx` straight to execution, bypassing the popup, and the access level for token registration sat below the confirmation level. The call now routes through the dApp-interaction service, and `register_token` always asks.
- A malicious dApp could try to add a lookalike token. Showing the on-chain name, symbol and decimals next to the contract address, with the origin rendered as a host only, lets the person cross-check before approving.
- Storage is scoped to profile and chain, not to an account. The dApp-supplied account is checked against the session's authorised accounts and refused when it is not one of them, never silently substituted; it serves as an audit record of who asked.
- A repeat add of a contract already registered returns early with no journal write and no live metadata fetch, so a looping dApp cannot force unbounded work. Junk addresses still reach the approval window, which stays the only gate.
- A token's name can be forged by its own contract. The popup shows the address beside it, and the person is responsible for the comparison.

## What shipped

- The `registerToken` special case in the dispatcher and an explicit confirm-always rule for `register_token` in the dApp-interaction service.
- Token metadata pre-fetch and the register-token card in the execute window.
- A signature guard in the schema patch: if the upstream schema ever gains a differently shaped `registerToken`, it fails loudly at start-up.
- The schema patch is now a single package shared by the extension and the playground (`packages/wallet-sdk-schema-patch`), not the three inline copies the first version used.
- Reachability pins in `packages/wallet-bridge/src/dispatcher.test.ts` and a network spec for the allow and cancel paths.
