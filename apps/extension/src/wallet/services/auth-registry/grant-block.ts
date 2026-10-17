/** Where a grant's transaction sits, read from its receipt: the one source that proves a block. */
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { TxHash } from "@aztec-labs/stdlib/tx"
import { MINED_STATUSES, txStatusFromReceipt } from "@/wallet/services/transaction/receipt-status"
import { sleep } from "@/wallet/utils"

/** How long a revoke waits for the grants it names to reach a block before it refuses. */
export const GRANT_BLOCK_WAIT_MS = 120_000
const GRANT_BLOCK_POLL_MS = 1_000

/** The block `txHash` is in as `node` reads it now; `undefined` while it is pending or dropped,
 *  and when the read fails, so a caller that cannot see the block never acts as if it could. */
export async function grantBlockOf(node: AztecNode, txHash: string): Promise<number | undefined> {
	try {
		const receipt = await node.getTxReceipt(TxHash.fromString(txHash))
		return MINED_STATUSES.has(txStatusFromReceipt(receipt.status)) ? receipt.blockNumber : undefined
	} catch {
		return undefined
	}
}

/** {@link grantBlockOf} every second until it names a block, or `undefined` from the first read at
 *  or past `deadline`. `node` must not retry, so the last read ends within one request's timeout. */
export async function awaitGrantBlock(node: AztecNode, txHash: string, deadline: number): Promise<number | undefined> {
	for (;;) {
		const block = await grantBlockOf(node, txHash)
		if (block !== undefined || Date.now() >= deadline) return block
		await sleep(GRANT_BLOCK_POLL_MS)
	}
}
