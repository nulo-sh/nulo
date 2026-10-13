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
import { type InclusionNode, proveExpired, proveFinal } from "./inclusion"

const EXPIRY = { timestamp: 1_000, nullifier: `0x${"0e".repeat(32)}` }
const FINALIZED_HASH = BlockHash.fromString(`0x${"1f".repeat(32)}`)

function nodeAt(time: bigint, leaves: unknown[] = [undefined], finalizedNumber = 7) {
	const header = BlockHeader.empty({
		globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(finalizedNumber), timestamp: time }),
	})
	const getBlockData = vi.fn(async () => ({ header, blockHash: FINALIZED_HASH }))
	const findLeavesIndexes = vi.fn(async () => leaves)
	const getTxReceipt = vi.fn(async (): Promise<unknown> => ({ txHash: TX_HASH, status: "pending" }))
	return {
		node: { getBlockData, findLeavesIndexes, getTxReceipt } as unknown as InclusionNode,
		getBlockData,
		findLeavesIndexes,
		getTxReceipt,
	}
}

const TX_HASH = `0x${"2e".repeat(32)}`
const INCLUDED = { block: 5, hash: `0x${"0b".repeat(32)}` }
const leafFound = (index: bigint) => [{ data: index, l2BlockNumber: 7, l2BlockHash: FINALIZED_HASH }]
const minedIn = (blockHash: string, blockNumber: number, status = "proposed") => ({
	txHash: TX_HASH,
	status,
	executionResult: "success",
	transactionFee: 10n,
	blockHash: BlockHash.fromString(blockHash),
	blockNumber,
})

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

describe("proveFinal", () => {
	test("a finalized chain below the block is unsettled, and nothing else is read", async () => {
		const f = nodeAt(0n, [undefined], 4)
		expect(await proveFinal(f.node, TX_HASH, INCLUDED)).toEqual({ kind: "unsettled" })
		expect(f.findLeavesIndexes).not.toHaveBeenCalled()
	})

	test("the block's hash at its number in the finalized archive is final, read at that block's number and hash", async () => {
		const f = nodeAt(0n, leafFound(5n), 5)
		expect(await proveFinal(f.node, TX_HASH, INCLUDED)).toEqual({ kind: "final" })
		expect(f.findLeavesIndexes).toHaveBeenCalledWith({ number: 5, hash: FINALIZED_HASH }, MerkleTreeId.ARCHIVE, [
			Fr.fromString(INCLUDED.hash),
		])
		expect(f.getTxReceipt).not.toHaveBeenCalled()
	})

	test("the hash found at another index claims nothing", async () => {
		const f = nodeAt(0n, leafFound(6n))
		expect(await proveFinal(f.node, TX_HASH, INCLUDED)).toEqual({ kind: "unknown" })
	})

	describe("the hash absent from the finalized archive: the receipt says where the send is", () => {
		test("mined in another block is a move, with that receipt", async () => {
			const f = nodeAt(0n)
			const receipt = minedIn(`0x${"0c".repeat(32)}`, 6)
			f.getTxReceipt.mockResolvedValueOnce(receipt)
			expect(await proveFinal(f.node, TX_HASH, INCLUDED)).toEqual({ kind: "moved", receipt })
		})

		test("still mined in the recorded block, as an upstream behind the prune answers, claims nothing", async () => {
			const f = nodeAt(0n)
			f.getTxReceipt.mockResolvedValueOnce(minedIn(INCLUDED.hash, 5))
			expect(await proveFinal(f.node, TX_HASH, INCLUDED)).toEqual({ kind: "unknown" })
		})

		test.each(["pending", "dropped"])("%s is pruned", async (status) => {
			const f = nodeAt(0n)
			f.getTxReceipt.mockResolvedValueOnce({ txHash: TX_HASH, status })
			expect(await proveFinal(f.node, TX_HASH, INCLUDED)).toEqual({ kind: "pruned" })
		})
	})

	test.each([
		["a refused anchor", (f: ReturnType<typeof nodeAt>) => f.findLeavesIndexes.mockRejectedValueOnce(new Error("block hash mismatch"))],
		["a receipt read that fails", (f: ReturnType<typeof nodeAt>) => f.getTxReceipt.mockRejectedValueOnce(new Error("fetch failed"))],
		["an unknown receipt status", (f: ReturnType<typeof nodeAt>) => f.getTxReceipt.mockResolvedValueOnce({ status: "mystery" })],
	])("%s throws instead of answering", async (_name, arrange) => {
		const f = nodeAt(0n)
		arrange(f)
		await expect(proveFinal(f.node, TX_HASH, INCLUDED)).rejects.toThrow()
	})
})
