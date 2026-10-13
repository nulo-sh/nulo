import { Fr } from "@aztec-labs/foundation/curves/bn254"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { MerkleTreeId } from "@aztec-labs/stdlib/trees"
import type { SendExpiry } from "@nulo/wallet-core/jobs"

export type InclusionNode = Pick<AztecNode, "getBlockData" | "findLeavesIndexes">

/**
 * What the finalized chain proves about a send's expiry. `expired`: its time is past the expiry
 * and the send's first nullifier is absent, so no block holds the send and no later one can (block
 * times never decrease, and a tx whose expiry is below a block's time is refused). `present`: the
 * nullifier is there, which proves nothing about this send, since a replacement can share it. A
 * number: the chain seconds still to pass. Throws on a missing or malformed answer.
 *
 * The read names the finalized block's number and hash together, so a node on another branch, or
 * one that has not reached that block, refuses instead of answering for its own chain.
 */
export async function proveExpired(node: InclusionNode, expiry: SendExpiry): Promise<"expired" | "present" | number> {
	const finalized = await node.getBlockData("finalized")
	if (!finalized) throw new Error("no finalized block")
	const ahead = BigInt(expiry.timestamp) - finalized.header.globalVariables.timestamp
	if (ahead >= 0n) return Number(ahead)
	const found = await node.findLeavesIndexes(
		{ number: finalized.header.getBlockNumber(), hash: finalized.blockHash },
		MerkleTreeId.NULLIFIER_TREE,
		[Fr.fromString(expiry.nullifier)],
	)
	if (found.length !== 1) throw new Error("malformed nullifier answer")
	return found[0] === undefined ? "expired" : "present"
}
