/**
 * `maxFeesPerGas` for a payment the app's own payload makes (`fee.embeddedFeePayment`): the app's
 * `fee.maxFeesPerGas` verbatim, else the node's current minimum at 1.0×, where the standard build
 * defaults to 1.5×. No canonical payment method of the installed Aztec line checks
 * `gasLimits × maxFeesPerGas` against a budget; the 1.0× default serves an app whose own fee
 * contract budgets against exactly the current minimum, and an app that wants headroom passes
 * `maxFeesPerGas`. On the embedded strategy, the NO_FROM build and the profile path this is the
 * only way the app's explicit cap reaches the gas settings. Other gas-settings fields pass through.
 */
import { GasFees, GasSettings } from "@aztec-labs/stdlib/gas"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import type { TxExecutionRequest } from "@aztec-labs/stdlib/tx"
import type { FeeOptions } from "@/wallet/services/execution/client"

export async function applyEmbeddedFpcGasCap(txRequest: TxExecutionRequest, fee: FeeOptions, node: AztecNode): Promise<void> {
	if (!fee.embeddedFeePayment) return
	const maxFeesPerGas = fee.maxFeesPerGas
		? new GasFees(BigInt(fee.maxFeesPerGas.feePerDaGas), BigInt(fee.maxFeesPerGas.feePerL2Gas))
		: await node.getCurrentMinFees()
	txRequest.txContext.gasSettings = new GasSettings(
		txRequest.txContext.gasSettings.gasLimits,
		txRequest.txContext.gasSettings.teardownGasLimits,
		maxFeesPerGas,
		txRequest.txContext.gasSettings.maxPriorityFeesPerGas,
	)
}
