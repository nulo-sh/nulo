import { TX_ERROR_EXISTING_NULLIFIER, TX_ERROR_INVALID_EXPIRATION_TIMESTAMP } from "@aztec-labs/stdlib/tx"

/**
 * The node's `sendTx` refusals no copy of the tx held elsewhere can outlive, barring a chain prune
 * or a node clock running ahead: a nullifier already in the tree, or an expired tx. A wrong one
 * answers a send already included, which a receipt read finds. The node words a validator's
 * refusal `Invalid tx: <reason>`.
 */
const FINAL_REFUSALS: ReadonlySet<string> = new Set(
	[TX_ERROR_EXISTING_NULLIFIER, TX_ERROR_INVALID_EXPIRATION_TIMESTAMP].map((reason) => `Invalid tx: ${reason}`),
)

/** Exact match only: any other wording, an unknown node version's included, keeps the send unanswered. */
export function isFinalRefusal(message: string | undefined): boolean {
	return message !== undefined && FINAL_REFUSALS.has(message)
}
