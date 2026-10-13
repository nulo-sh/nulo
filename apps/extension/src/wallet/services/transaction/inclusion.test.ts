/**
 * The finalized-chain proofs behind a send's outcome, against a node fake that answers as
 * `AztecNode` does: real block headers and hashes, absent leaves as `undefined`.
 */
import { BlockNumber } from "@aztec-labs/foundation/branded-types"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { BlockHash } from "@aztec-labs/stdlib/block"
import { MerkleTreeId } from "@aztec-labs/stdlib/trees"
import { BlockHeader, GlobalVariables } from "@aztec-labs/stdlib/tx"
import { describe, expect, test, vi } from "vitest"
import { type InclusionNode, proveExpired } from "./inclusion"

const EXPIRY = { timestamp: 1_000, nullifier: `0x${"0e".repeat(32)}` }
const FINALIZED_HASH = BlockHash.fromString(`0x${"1f".repeat(32)}`)

function nodeAt(time: bigint, leaves: unknown[] = [undefined]) {
	const header = BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(7), timestamp: time }) })
	const getBlockData = vi.fn(async () => ({ header, blockHash: FINALIZED_HASH }))
	const findLeavesIndexes = vi.fn(async () => leaves)
	return { node: { getBlockData, findLeavesIndexes } as unknown as InclusionNode, getBlockData, findLeavesIndexes }
}

describe("proveExpired", () => {
	test.each([
		[999n, 1],
		[1_000n, 0],
	])("a finalized time of %s is not past the expiry: the seconds left, and no nullifier read", async (time, left) => {
		const f = nodeAt(time)
		expect(await proveExpired(f.node, EXPIRY)).toBe(left)
		expect(f.getBlockData).toHaveBeenCalledWith("finalized")
		expect(f.findLeavesIndexes).not.toHaveBeenCalled()
	})

	test("past the expiry with the nullifier absent at the finalized block is expired, read at that block's number and hash", async () => {
		const f = nodeAt(1_001n)
		expect(await proveExpired(f.node, EXPIRY)).toBe("expired")
		expect(f.findLeavesIndexes).toHaveBeenCalledWith({ number: 7, hash: FINALIZED_HASH }, MerkleTreeId.NULLIFIER_TREE, [
			Fr.fromString(EXPIRY.nullifier),
		])
	})

	test("past the expiry with the nullifier present proves nothing about the send", async () => {
		const f = nodeAt(1_001n, [{ data: 5n, l2BlockNumber: 3, l2BlockHash: FINALIZED_HASH }])
		expect(await proveExpired(f.node, EXPIRY)).toBe("present")
	})

	test.each([
		["no finalized block", (f: ReturnType<typeof nodeAt>) => f.getBlockData.mockResolvedValueOnce(undefined as never)],
		["a leaf answer of the wrong length", (f: ReturnType<typeof nodeAt>) => f.findLeavesIndexes.mockResolvedValueOnce([])],
		["a refused anchor", (f: ReturnType<typeof nodeAt>) => f.findLeavesIndexes.mockRejectedValueOnce(new Error("block hash mismatch"))],
	])("%s throws instead of answering", async (_name, arrange) => {
		const f = nodeAt(1_001n)
		arrange(f)
		await expect(proveExpired(f.node, EXPIRY)).rejects.toThrow()
	})
})
