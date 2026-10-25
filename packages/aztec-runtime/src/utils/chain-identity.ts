/**
 * Live-node chain identity verification.
 *
 * The wallet trusts `node.getNodeInfo()` for `(l1ChainId, rollupVersion)` at every
 * signing/proving boundary. A malicious or drifted RPC endpoint could otherwise change
 * the chain context after enrollment and have the account sign against a chain the user
 * never selected. `assertLiveChainIdentity` compares the live pair to the stored network
 * and throws on any drift; apply it at every site that has BOTH the stored network AND
 * the live node response in scope, before `chainInfoFrom`. A site that needs only the
 * `ChainInfo` calls `liveChainInfo`, which does both.
 *
 * NOT applied inside `nulo-account.ts:buildTxExecutionRequest` (no network in scope) —
 * every caller of that method asserts first.
 */

import { Fr } from "@aztec-labs/foundation/curves/bn254"
import type { ChainInfo } from "@aztec-labs/entrypoints/interfaces"
import { LOCAL_L1_CHAIN_ID, walletChainId } from "@nulo/wallet-core/chain-id"
import { assertCanonicalL1ChainId } from "@nulo/wallet-crypto"

export interface LiveNodeChainInfo {
	l1ChainId: number
	rollupVersion: number
}

/** The stored network's identity: the XOR composite used for storage scoping (`0` for the local
 *  development chain) AND the exact L1 chain id written at enrollment. */
export interface SelectedNetworkChainInfo {
	chainId: number
	l1ChainId: number
}

const U32_MAX = 0xffffffff

/**
 * Throws if the live node's chain identity drifts from the network the user selected.
 *
 * Both live values must be canonical unsigned 32-bit integers: the composite is
 * `(l1ChainId ^ rollupVersion) >>> 0`, so without the range bound a `rollupVersion` that
 * differs only above bit 32 (e.g. `4248422647` vs `8543389943`) collides with the stored
 * value. Within u32, XOR with the pinned `l1ChainId` is a bijection, so exact-L1 equality
 * plus the composite pins `rollupVersion` exactly.
 *
 * `chainId === 0` is the local development chain, whose rollup redeploys with every sandbox, so it
 * has no composite to compare: there the stored row must name `LOCAL_L1_CHAIN_ID` and the live L1
 * must equal it, which binds everything built for the row to the development L1. The network
 * service grants 0 only to a loopback node and refuses a composite that computes to 0.
 */
export function assertLiveChainIdentity(network: SelectedNetworkChainInfo, nodeInfo: LiveNodeChainInfo): void {
	assertCanonicalL1ChainId(nodeInfo.l1ChainId)
	if (!Number.isSafeInteger(nodeInfo.rollupVersion) || nodeInfo.rollupVersion < 0 || nodeInfo.rollupVersion > U32_MAX) {
		throw new Error(
			`Chain identity mismatch: live node reports non-canonical rollupVersion=${nodeInfo.rollupVersion}. Refusing to sign/prove against a drifted endpoint.`,
		)
	}
	if (nodeInfo.l1ChainId !== network.l1ChainId) {
		throw new Error(
			`Chain identity mismatch: selected network has l1ChainId=${network.l1ChainId} but live node reports l1ChainId=${nodeInfo.l1ChainId} (rollupVersion=${nodeInfo.rollupVersion}). Refusing to sign/prove against a drifted endpoint.`,
		)
	}
	if (network.chainId === 0) {
		if (network.l1ChainId !== LOCAL_L1_CHAIN_ID) {
			throw new Error(
				`Chain identity mismatch: selected network is chain 0 with l1ChainId=${network.l1ChainId}, but chain 0 is the local development chain (l1ChainId=${LOCAL_L1_CHAIN_ID}). Refusing to sign/prove.`,
			)
		}
		return
	}
	const liveComposite = walletChainId(nodeInfo.l1ChainId, nodeInfo.rollupVersion)
	if (network.chainId !== liveComposite) {
		throw new Error(
			`Chain identity mismatch: selected network has chainId=${network.chainId} but live node reports composite=${liveComposite} (l1ChainId=${nodeInfo.l1ChainId}, rollupVersion=${nodeInfo.rollupVersion}). Refusing to sign/prove against a drifted endpoint.`,
		)
	}
}

/**
 * Throws unless the live node serves `chainId`; run before a PXE store opens. A store keeps the
 * rollup address it was first opened against and refuses every other, so one first opened against
 * another chain's node never opens on its own. Chain 0 redeploys its rollup with every sandbox and
 * has no composite to compare.
 */
export function assertNodeServesChain(chainId: number, nodeInfo: LiveNodeChainInfo): void {
	if (chainId === 0) return
	assertCanonicalL1ChainId(nodeInfo.l1ChainId)
	const { rollupVersion } = nodeInfo
	const canonical = Number.isSafeInteger(rollupVersion) && rollupVersion >= 0 && rollupVersion <= U32_MAX
	if (!canonical || walletChainId(nodeInfo.l1ChainId, rollupVersion) !== chainId) {
		throw new Error(
			`Chain identity mismatch: network chainId=${chainId} but live node reports l1ChainId=${nodeInfo.l1ChainId}, rollupVersion=${rollupVersion}. Refusing to open its PXE store.`,
		)
	}
}

/**
 * Build the `ChainInfo` (Fr-encoded `l1ChainId` + `rollupVersion`) that the
 * account entrypoint commits to, from a live node's raw identity. On the
 * signing path the caller MUST pass a `nodeInfo` already checked with
 * `assertLiveChainIdentity`; this helper performs no validation itself.
 */
export function chainInfoFrom(nodeInfo: LiveNodeChainInfo): ChainInfo {
	return { chainId: new Fr(nodeInfo.l1ChainId), version: new Fr(nodeInfo.rollupVersion) }
}

/** The `ChainInfo` of a live node pair, refused unless it matches the selected network: the one
 *  way to project a pair that has not already been checked. Synchronous, so the caller's fetch
 *  stays where it is. */
export function liveChainInfo(network: SelectedNetworkChainInfo, nodeInfo: LiveNodeChainInfo): ChainInfo {
	assertLiveChainIdentity(network, nodeInfo)
	return chainInfoFrom(nodeInfo)
}
