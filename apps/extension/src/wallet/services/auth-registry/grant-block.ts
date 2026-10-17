/** Where a grant's transaction sits, read from its receipt: the one source that proves a block. */
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { TxHash } from "@aztec-labs/stdlib/tx"
import { MINED_STATUSES, txStatusFromReceipt } from "@/wallet/services/transaction/receipt-status"
import { TxStatus } from "@/wallet/services/transaction/spec"
import { sleep } from "@/wallet/utils"

/** How long a revoke waits for the grants it names to reach a block before it refuses. */
export const GRANT_BLOCK_WAIT_MS = 120_000
const GRANT_BLOCK_POLL_MS = 1_000

/** A grant's transaction as `node` reads it now: its block, `"dropped"`, or `undefined` while it is
 *  pending and when the read fails, so a caller that cannot see the block never acts as if it could. */
export type GrantRead = number | "dropped" | undefined

async function readGrant(node: AztecNode, txHash: string): Promise<GrantRead> {
	try {
		const receipt = await node.getTxReceipt(TxHash.fromString(txHash))
		const status = txStatusFromReceipt(receipt.status)
		if (status === TxStatus.Dropped) return "dropped"
		return MINED_STATUSES.has(status) ? receipt.blockNumber : undefined
	} catch {
		return undefined
	}
}

/** The block of `txHash`, or `undefined` for every read that names none. */
export async function grantBlockOf(node: AztecNode, txHash: string): Promise<number | undefined> {
	const read = await readGrant(node, txHash)
	return typeof read === "number" ? read : undefined
}

/** {@link readGrant} every second until it names a block, or its first read at or past `deadline`.
 *  `node` must not retry, so the last read ends within one request's timeout. */
export async function awaitGrantBlock(node: AztecNode, txHash: string, deadline: number): Promise<GrantRead> {
	for (;;) {
		const read = await readGrant(node, txHash)
		if (typeof read === "number" || Date.now() >= deadline) return read
		await sleep(GRANT_BLOCK_POLL_MS)
	}
}
