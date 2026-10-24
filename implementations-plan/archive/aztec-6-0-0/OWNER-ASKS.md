# aztec-6-0-0: owner asks

Two decisions block the bump. Each has a recommendation and says what ships before the answer.

## OA-1. Rotate the account artifact in place (blocks arc 1)

**Why it is asked.** Aztec 6.0.0's private environment (the PXE) runs only contracts compiled for its oracle interface, major 33. The frozen account artifact every Nulo account is derived from (regime `nulo-v6.1`, the `6.0.0-rc.3` Schnorr account) is compiled for major 32. The PXE refuses it on its first private execution: no account can deploy, send, or authorize an action on 6.0.0. The address tests stay green because they never execute the contract; the execution canaries would go red. Evidence: `recon.md` finding 1 (the PXE source and an ACVM run of the vendored artifact). CLAUDE.md § Account-address freeze makes the response the owner's: hold the line, or rotate on a recorded decision.

**Surface.** Every account address on Testnet and on the Local Network; the first unlock after the update; account-file import.

| Option | What a person sees |
|---|---|
| (a) Rotate in place: append regime `nulo-v6.2` (the 6.0.0 Schnorr account; same functions, parameters and constructor) and bind it, as the rc.3 bump did with `nulo-v6.1` | On the first unlock after the update, the existing full-screen reset offers to reset Testnet. The chain move already forces this offer. The reset re-creates each account with its name, index and visibility at a new address, and its closing line reads "Your accounts have new addresses." (existing copy). Every other non-Mainnet network that holds derived accounts (the Local Network, any user-added one) gets the existing "NETWORK UPGRADE" screen: "New account addresses" and "Tokens at your old addresses stay there. This version cannot reach them." A chain that holds only imported accounts gets no offer, and those accounts stop working (known limit #427). Account files exported by an earlier build are refused. A full backup made by an earlier build still opens, but its Testnet accounts are skipped one by one with a per-row error, as at every earlier reset, because the old chain is no longer a built-in network. The first Mainnet build will freeze `nulo-v6.2` for that extension. |
| (b) Hold the line at 6.0.0-rc.3 | Nothing changes, and nothing works on Testnet: its rc.3 network is gone. 1.0.0 cannot launch on Testnet. |
| (c) A new extension major and store listing | Not required off Mainnet (CLAUDE.md § Account-address freeze); rejected for rc.3 (`archive/aztec-rc3`, F2). |

**Recommendation: (a), with the id `nulo-v6.2`.** Rotating now costs Testnet users one reset, which the chain move already imposes. A rotation after the first Mainnet build would need a new extension.

**What ships now:** the plan only. Arc 1 starts on the answer.

## OA-2. The Testnet token list: empty first, the new chain's list later

**Why it is asked.** Changing a list entry is an owner UI decision (CLAUDE.md). The 6.0.0 bump moves the Standards Token class. The token list's tree check refuses any listed class the wallet does not bundle. So today's published list (four tokens on the old chain, old class) fails the check after the bump. A list of new-class tokens fails it before the bump. Only an empty list passes on both sides. unleashed has not yet deployed its 6.0.0 Testnet generation, so no new-chain token addresses exist. The plan never invents them.

**Surface.** Home, Holdings and Send's token picker on Testnet: the default token rows.

| Option | What a person sees |
|---|---|
| (a) Publish an empty list before the bump. Publish the new chain's list once unleashed's 6.0.0 generation exists. | Testnet shows no default token rows from the empty publish until the new list. The four removed rows sit on a chain that no longer exists. The new list reaches wallets with no release. Nightly's advisory `token-list-host-live` check is red while the list is empty, as after rc.3 (#480). |
| (b) Keep today's list | The bump cannot pass CI. Any later order still needs an empty list in between. |

**Recommendation: (a).** The list PR changes one file (`infra/token-list/list.source.json` to `{"tokens": []}`). The owner then dispatches `publish-token-list.yml` on `dev`, approves its `sign` step and merges the publish PR, which raises the floor. Each new-chain entry keeps its `priceId` and is re-checked with both preflights against the new node (aztec-update skill, Branch B step 3).

**What ships now:** nothing. The empty-list PR is prepared on the owner's yes. The bump merges after that publish.

## Owner actions, not decisions

- For the record: the bump bypasses the seven-day npm age gate for 44 Aztec-line packages, as the lane brief approves. `@aztec-labs/*` publishes no SLSA attestation (at 6.0.0, as at rc.3), so those packages rest on npm's registry signature and the publisher's identity alone. The other bypassed packages carry attestations, which the PR checks against their tags. The alternative is to wait for the `@aztec-labs/*` names to clear the gate (2026-10-29 about 10:31Z) and exclude only the attested names that clear later (standards, presto, fee-juice); that delays arc 1 by about six days. The plan proceeds on the lane brief's approval unless the owner says wait.

- unleashed's 6.0.0 Testnet generation must name the PrivateFPC `0x0516ebb4f9c7988eb3cf6dd9459a47556f7a92db06b17cfa47ffb37fd35c6915`, which `@alejoamiras/private-fee-juice@6.0.0` publishes and the wallet will pin. Its manifest names the rc.3 address today. No release ships until the two agree (aztec-update skill, Branch B step 4).
- After the bump is on `dev`: dispatch `publish-packages.yml` for the `@nulo-sh/*` release on the new line. A follow-up PR prepares it; no agent dispatches it.
- The live Testnet send from the 1.0.0 candidate (#864, decision page 68, option B).
