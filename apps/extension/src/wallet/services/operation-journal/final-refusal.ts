import { TX_ERROR_EXISTING_NULLIFIER, TX_ERROR_INVALID_EXPIRATION_TIMESTAMP } from "@aztec-labs/stdlib/tx"

/**
 * The node's `sendTx` refusals that a later block rarely lifts for the same tx: one of its
 * nullifiers is already in the tree, or it expired. Only a chain prune or a node clock running
 * ahead lifts them; every other refusal, a fee or a lagging node's, can answer a send another node
 * took. The node words a validator's refusal `Invalid tx: <reason>`.
 */
const FINAL_REFUSALS: ReadonlySet<string> = new Set(
	[TX_ERROR_EXISTING_NULLIFIER, TX_ERROR_INVALID_EXPIRATION_TIMESTAMP].map((reason) => `Invalid tx: ${reason}`),
)

/** Exact match only: any other wording, an unknown node version's included, keeps the send unanswered. */
export function isFinalRefusal(message: string | undefined): boolean {
	return message !== undefined && FINAL_REFUSALS.has(message)
}
