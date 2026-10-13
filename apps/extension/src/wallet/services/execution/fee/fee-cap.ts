/**
 * The `maxFeesPerGas` a build commits, by who pays. Every basis is the node's predicted worst
 * minimum: a transaction is proven seconds to minutes after its estimate, and a cap priced off the
 * current minimum is refused when the base fee rises in that window. The node charges a Fee Juice
 * payer the base fee, never the cap (no priority fee is set), so a margin costs nothing unless the
 * price rises; private fee juice charges the whole cap, so its margin is fixed.
 */

import { GasFees } from "@aztec-labs/stdlib/gas"
import { type MinFeeNode, predictedWorstMinFees } from "@nulo/aztec-runtime/fee-juice"

/** Private fee juice's margin over the predicted worst minimum, at every speed level. */
export const PRIVATE_FEE_JUICE_CAP_MARGIN = 1.2

/** An app's own `maxFeesPerGas`, as the wire carries it. */
export type AppFeeCap = { readonly feePerDaGas: bigint | number | string; readonly feePerL2Gas: bigint | number | string }

export type FeeCapRule =
	/** The account's own Fee Juice, with or without a claim: the app's cap verbatim, else the speed
	 *  level's multiple. */
	| { readonly payer: "account"; readonly multiplier: number; readonly appCap?: AppFeeCap }
	/** A sponsor row: the speed level's multiple; an app's cap does not reach it. */
	| { readonly payer: "sponsor"; readonly multiplier: number }
	/** Private fee juice: a fixed margin; neither the speed level nor an app's cap moves it. */
	| { readonly payer: "private-fee-juice" }
	/** The app's own fee payment: its cap verbatim, else the predicted worst minimum with no margin,
	 *  for a fee contract that may budget against the cap. */
	| { readonly payer: "app"; readonly appCap?: AppFeeCap }

/** The cap `rule` commits. An app's cap is taken as given, below the network's minimum too. */
export async function feeCapFor(node: MinFeeNode, rule: FeeCapRule): Promise<GasFees> {
	if ((rule.payer === "account" || rule.payer === "app") && rule.appCap) {
		return new GasFees(BigInt(rule.appCap.feePerDaGas), BigInt(rule.appCap.feePerL2Gas))
	}
	const predicted = await predictedWorstMinFees(node)
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
