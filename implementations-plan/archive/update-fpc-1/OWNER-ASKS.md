# update-fpc-1: owner asks

Nothing here blocks this lane's arc: it changes test fixtures only, and its allowance follows `offersSponsoredFpc`, so it stays right whichever answer the owner gives.

## OA-1 (informational): the Sponsored fee payer on a custom network

**What the update test showed.** The row the update deletes is the canonical Sponsored fee payer on a **custom network** (the scenario adds its local sandbox as one), not on Alpha Mainnet. Since the fixed per-network list (#1652, "sponsored FPC being hidden via a fixed per-network list please"), a custom network is off the list unless its derived chain id is a listed one. So after the update a person who added a custom network whose derived chain id is unlisted (any network not on Testnet or the local chain id 0) loses its "Sponsored" row and any fee pick that named it, and Settings → Fee payers refuses to add the canonical sponsor back there. #1652's UI impact names Alpha Mainnet only; its description says "An unlisted or custom chain gets no sponsor."

**Surface:** Send's fee method picker, the app windows' fee card and Settings → Fee payers, on a custom network.

**Options:**
- **A, keep as shipped.** A custom network on an unlisted chain id never offers the Sponsored fee payer. The rows read as today on Alpha Mainnet.
- **B, offer it on a custom network whose L1 is the local development chain** (a developer's own sandbox on another port). The picker and Settings would show "Sponsored" there again, as they do on the seeded Local Network.

**Recommendation:** A. It is the list the owner asked for, custom networks are a developer setting, and the seeded Local Network keeps the sponsor. B is a product change for its own lane.
