# pxe-flag-1: owner asks

## OA-1: approve the bridge's keyed run (pending: the request is filed in Phase 1 step 3)

- **What it does:** one run of a scratch smoke-lane test that creates a throwaway Nulo profile in memory and bridges Sepolia USDC and USDT (flag off), then EURC and GBPC (flag on), to it, each privately as "Token + gas", through unleashed's tools app, with Nulo as the Aztec wallet and an L1 wallet answered from Node; then six balance refreshes in each build on the funded profile. It signs with a throwaway L1 key that 1Password generates; no other key is involved. The L1 wallet works on Sepolia only and signs four things: a test-token `mint` to its own address, an ERC-20 `approve` whose spender is Permit2, the router's `bridgeWithPermit`, and a Permit2 witness transfer whose spender is the router and whose token is one of the four. It sends no ETH and refuses everything else. An allowed call can still carry an amount the page chose, so the most at stake is the throwaway key's Sepolia ETH and free test tokens, a known limit.
- **What you do:** `op-remote create <host> <id>` once (creates the `Nulo-Probe-Testnet` item from the template's `generate eth-key` directive; prints no value), then `op-remote <host> <id>`. The run prints the key's L1 address first and waits up to 60 minutes for Sepolia ETH (about 0.05 is plenty: mints, approvals and four deposits); send it from any Sepolia wallet.
- **What the pin covers:** the pushed commit's sources (the harness and the template). The extension builds and `node_modules` it loads are outside the pin.
- **If you do not approve within six hours:** the probe finishes without the bridge; the verdict does not depend on it.
- **Request id and exact command:** written here when filed.
