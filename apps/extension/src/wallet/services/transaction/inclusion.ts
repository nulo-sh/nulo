import { Fr } from "@aztec-labs/foundation/curves/bn254"
import type { BlockData } from "@aztec-labs/stdlib/block"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { MerkleTreeId } from "@aztec-labs/stdlib/trees"
import { TxHash, type TxReceipt } from "@aztec-labs/stdlib/tx"
import type { SendExpiry, SendInclusion } from "@nulo/wallet-core/jobs"
import { MINED_STATUSES, txStatusFromReceipt } from "./receipt-status"

export type InclusionNode = Pick<AztecNode, "getBlockData" | "findLeavesIndexes" | "getTxReceipt">

/** How often a mined row asks whether its block is final: finality trails a block by tens of
 *  minutes or more, so a faster read only costs the endpoint. */
export const FINALITY_READ_INTERVAL_MS = 60_000

/**
 * What the finalized chain proves about the block a send was read in. `final`: that chain holds
 * the block's hash at its number. Once the chain is past the block without it, the block was
 * pruned and a fresh receipt says where the send is now: `moved` (mined in another block, its
 * receipt attached) or `pruned` (not mined). `unsettled`: the chain has not reached the block.
 * `unknown`: no claim, e.g. the receipt still names the pruned block. Throws on a missing or
 * malformed answer, and before any read once `live()` is false.
 */
export type FinalityProof = { kind: "final" | "unsettled" | "unknown" | "pruned" } | { kind: "moved"; receipt: TxReceipt }

export async function proveFinal(
	node: InclusionNode,
	txHash: string,
	inclusion: SendInclusion,
	live: () => boolean,
): Promise<FinalityProof> {
	const finalized = await finalizedBlock(node, live)
	if (finalized.header.getBlockNumber() < inclusion.block) return { kind: "unsettled" }
	const leaf = await leafAt(node, live, finalized, MerkleTreeId.ARCHIVE, inclusion.hash)
	if (leaf !== undefined) return { kind: leaf === BigInt(inclusion.block) ? "final" : "unknown" }
	assertLive(live)
	const receipt = await node.getTxReceipt(TxHash.fromString(txHash))
	if (!MINED_STATUSES.has(txStatusFromReceipt(receipt.status))) return { kind: "pruned" }
	return receipt.blockHash?.toString() === inclusion.hash ? { kind: "unknown" } : { kind: "moved", receipt }
}

/**
 * What the finalized chain proves about a send's expiry. `expired`: its time is past the expiry
 * and the send's first nullifier is absent, so no block holds the send and no later one can (block
 * times never decrease, and a tx whose expiry is below a block's time is refused). `present`: the
 * nullifier is there, which proves nothing about this send, since a replacement can share it. A
 * number: the chain seconds still to pass. Throws as `proveFinal` does.
 */
export async function proveExpired(node: InclusionNode, expiry: SendExpiry, live: () => boolean): Promise<"expired" | "present" | number> {
	const finalized = await finalizedBlock(node, live)
	const ahead = BigInt(expiry.timestamp) - finalized.header.globalVariables.timestamp
	if (ahead >= 0n) return Number(ahead)
	const leaf = await leafAt(node, live, finalized, MerkleTreeId.NULLIFIER_TREE, expiry.nullifier)
	return leaf === undefined ? "expired" : "present"
}

/** A caller that stopped (a lock, a purge, its watch ended) sends nothing more: not even the hash
 *  or nullifier the next read would carry. */
function assertLive(live: () => boolean): void {
	if (!live()) throw new Error("proof stopped")
}

async function finalizedBlock(node: InclusionNode, live: () => boolean): Promise<BlockData> {
	assertLive(live)
	const finalized = await node.getBlockData("finalized")
	if (!finalized) throw new Error("no finalized block")
	return finalized
}

/** The leaf's index in `tree` as of the finalized block. The read names that block's number and
 *  hash together, so a node on another branch, or one that has not reached it, refuses instead of
 *  answering for its own chain. */
async function leafAt(
	node: InclusionNode,
	live: () => boolean,
	finalized: BlockData,
	tree: MerkleTreeId,
	value: string,
): Promise<bigint | undefined> {
	assertLive(live)
	const anchor = { number: finalized.header.getBlockNumber(), hash: finalized.blockHash }
	const found = await node.findLeavesIndexes(anchor, tree, [Fr.fromString(value)])
	if (found.length !== 1) throw new Error("malformed leaf answer")
	return found[0]?.data
}
