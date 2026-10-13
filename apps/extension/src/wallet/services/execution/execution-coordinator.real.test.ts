// @vitest-environment node
/**
 * The expiry `proveAndSend` records with a send, read from REAL kernel outputs (`mockTx` builds
 * them and hashes the tx). Node environment on purpose: under jsdom, foundation's hashing takes the
 * sync `BarretenbergSync` branch, which fails under vitest (`authwit-discoverer.real.test.ts`).
 */
import { BlockNumber } from "@aztec-labs/foundation/branded-types"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { mockTx, mockTxForRollup } from "@aztec-labs/stdlib/testing"
import { BlockHeader, GlobalVariables } from "@aztec-labs/stdlib/tx"
import { describe, expect, test } from "vitest"
import { sendExpiryOf } from "./execution-coordinator"

const anchoredAt = (blockNumber: number) =>
	BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(blockNumber) }) })

describe("sendExpiryOf", () => {
	// `mockTx(seed)` puts `seed + 1` as the tx's one non-revertible nullifier.
	test.each([
		["a private-only tx", () => mockTxForRollup(4, { anchorBlockHeader: anchoredAt(5) })],
		[
			"a tx with public calls and revertible nullifiers",
			() => mockTx(4, { anchorBlockHeader: anchoredAt(5), numberOfRevertibleNullifiers: 2 }),
		],
	])("%s: its expiry, and its first non-revertible nullifier", async (_label, build) => {
		const tx = await build()
		expect(sendExpiryOf(tx)).toEqual({ timestamp: Number(tx.data.expirationTimestamp), nullifier: new Fr(5n).toString() })
	})

	test("a tx anchored at genesis: none", async () => {
		expect(sendExpiryOf(await mockTxForRollup(4))).toBeUndefined()
	})
})
