/**
 * The `maxFeesPerGas` a build commits, by who pays. Every basis is the node's predicted worst
 * minimum: a transaction is proven seconds to minutes after its estimate, and a cap priced off the
 * current minimum is refused when the base fee rises in that window. The node charges a Fee Juice
 * payer the base fee plus at most the priority fee, never more than the cap, so a margin costs
 * nothing unless the price rises; private fee juice charges the whole cap, so its margin is fixed.
 * An app's own cap goes on chain as given, whoever pays, below the network's minimum too.
 */

import { GasFees } from "@aztec-labs/stdlib/gas"
import { type MinFeeNode, predictedWorstMinFees } from "@nulo/aztec-runtime/fee-juice"

/** Private fee juice's margin over the predicted worst minimum, at every speed level. */
export const PRIVATE_FEE_JUICE_CAP_MARGIN = 1.2

/** An app's own per-gas fees (its `maxFeesPerGas` or its `maxPriorityFeesPerGas`), as the wire
 *  carries them. */
export type AppFeeCap = { readonly feePerDaGas: bigint | number | string; readonly feePerL2Gas: bigint | number | string }

/** What an app set: its cap is committed verbatim; its priority fee alone raises the payer's basis by
 *  that fee, so the protocol, which bounds base plus priority by the cap, pays it in full. */
type AppFees = { readonly appCap?: AppFeeCap; readonly appPriority?: AppFeeCap }

export type FeeCapRule =
	/** The account's own Fee Juice, with or without a claim: the speed level's multiple. */
	| ({ readonly payer: "account"; readonly multiplier: number } & AppFees)
	/** A sponsor row: the speed level's multiple. */
	| ({ readonly payer: "sponsor"; readonly multiplier: number } & AppFees)
	/** Private fee juice: a fixed margin the speed level does not move. */
	| ({ readonly payer: "private-fee-juice" } & AppFees)
	/** The app's own fee payment: the predicted worst minimum with no margin, for a fee contract that
	 *  may budget against the cap. */
	| ({ readonly payer: "app" } & AppFees)

/** The cap `rule` commits. */
export async function feeCapFor(node: MinFeeNode, rule: FeeCapRule): Promise<GasFees> {
	if (rule.appCap) return new GasFees(BigInt(rule.appCap.feePerDaGas), BigInt(rule.appCap.feePerL2Gas))
	const basis = basisOf(await predictedWorstMinFees(node), rule)
	if (!rule.appPriority) return basis
	return new GasFees(basis.feePerDaGas + BigInt(rule.appPriority.feePerDaGas), basis.feePerL2Gas + BigInt(rule.appPriority.feePerL2Gas))
}

function basisOf(predicted: GasFees, rule: FeeCapRule): GasFees {
	switch (rule.payer) {
		case "account":
		case "sponsor":
			return predicted.mul(rule.multiplier)
		case "private-fee-juice":
			return predicted.mul(PRIVATE_FEE_JUICE_CAP_MARGIN)
		case "app":
			return predicted.mul(1)
	}
}

/**
 * Whether a cap committed earlier still covers `fresh`, the cap a build would commit now. Only
 * private fee juice must match exactly, since it charges the cap; on any other payer a higher cap
 * costs nothing, though the payer's balance must still cover it.
 */
export function committedCapCovers(
	committed: { readonly feePerDaGas: bigint; readonly feePerL2Gas: bigint },
	fresh: { readonly feePerDaGas: bigint; readonly feePerL2Gas: bigint },
	rule: FeeCapRule,
): boolean {
	if (rule.payer === "private-fee-juice") {
		return committed.feePerDaGas === fresh.feePerDaGas && committed.feePerL2Gas === fresh.feePerL2Gas
	}
	return committed.feePerDaGas >= fresh.feePerDaGas && committed.feePerL2Gas >= fresh.feePerL2Gas
}
