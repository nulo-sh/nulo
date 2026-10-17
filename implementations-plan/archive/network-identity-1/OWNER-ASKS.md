# network-identity-1: owner asks

Neither ask blocks arc 1. Each one ships its "what ships now" form, which the lane brief already records ("UI impact: none; a reason line for a refused endpoint, if one is needed, is an `OWNER-ASKS.md` entry").

## OA-1: a line that says why an endpoint was refused

- **Surface**: Settings → Networks. Three places show the refusal: Add network (a toast), Add endpoint / Edit endpoint (the line under the RPC URL field), and Make primary (a toast).
- **When it shows**: when one of four inputs is refused, all of them Developer-Mode settings:
  1. An endpoint off this computer added to the Local Network, or to another network on chain 0.
  2. A new network whose node reports chain 0. Chain 0 is kept for the Local Network.
  3. A network at the Local Network's address whose node runs on another L1.
  4. A remote endpoint made primary on chain 0.
- **What ships now**: the popup's existing lines.
  - (1): "Wrong chain. This network is chain 0."
  - (2) and (3): the toast "Something went wrong".
  - (4): the toast "Failed to update primary endpoint".
- **Options**:
  - A. Keep the existing lines (what ships now).
  - B. One new line for (1) and (4), under the field or in the toast: "The Local Network only runs on this computer. Use a localhost address."
  - C. B, plus a line for (2) and (3): "Chain 0 is kept for the Local Network on this computer."
- **Recommendation**: A. Chain 0 is reserved by the wallet, and no supported network reports it. (1), (3) and (4) reach only a developer, and "Wrong chain. This network is chain 0." already says the node is not the Local Network.

## OA-2: the Local Network's identity (the lane brief's stored rollup version)

- **Surface**: the Local Network and any network on chain 0, in Settings → Networks and in every operation on it.
- **What ships now**: chain 0 is the local development chain, anvil's L1 (31337) on this computer. Two consequences follow, and the plan accepts both:
  - **Chain 0 on another L1 is not supported.** A node at the Local Network's address that runs on another L1 is refused when added. At any other address, the same node is an ordinary network.
  - **The Local Network's rollup version is not stored.** A redeployed sandbox on L1 31337 stays the same network, as today. It is recorded as a known limit at close-out.
- **Options**:
  - A. Ship it as described (plan D1).
  - B. Also store each network's rollup version (the lane brief's sketch). When a Local sandbox redeploys, every action on Local refuses until the developer confirms a reset on a new prompt. B adds new copy, a new flow and a stored field.
- **Recommendation**: A. On every other network the stored chain id already fixes the rollup version exactly. On chain 0, the L1 rule binds the metadata the wallet builds and the accounts it allocates to L1 31337. Both reviewers agreed after the L1 rule was added.
