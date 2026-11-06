# pxe-flag-1: owner asks

## OA-1: approve the bridge's keyed run (pending: the request is filed in Phase 1 step 4)

- **What it does:** one run of a scratch smoke-lane test that creates a throwaway Nulo profile in memory and bridges Sepolia USDC, USDT, EURC and GBPC to it, each as "Token + gas", through unleashed's tools app, with Nulo as the Aztec wallet and an L1 wallet answered from Node. It signs with a throwaway L1 key that 1Password generates; no other key is involved. The L1 wallet works on Sepolia only, sends only zero-value transactions to the four test tokens, Permit2 and the bridge's router and portals, signs typed data only for Permit2, and refuses everything else. That narrows but does not bound what a compromised tools page could get signed: the most at stake is the throwaway key's Sepolia ETH and free test tokens.
- **What you do:** `op-remote create <host> <id>` once (creates the `Nulo-Probe-Testnet` item from the template's `generate eth-key` directive; prints no value), then `op-remote <host> <id>`. The run prints the key's L1 address first and waits up to 60 minutes for Sepolia ETH (about 0.05 is plenty: mints, approvals and four deposits); send it from any Sepolia wallet.
- **What the pin covers:** the pushed commit's sources (the harness and the template). The extension builds and `node_modules` it loads are outside the pin.
- **If you do not approve within six hours:** the probe finishes without the bridge; the verdict does not depend on it.
- **Request id and exact command:** written here when filed.
