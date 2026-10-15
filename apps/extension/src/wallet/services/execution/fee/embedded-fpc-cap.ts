/**
 * `maxFeesPerGas` for a payment the app's own payload makes (`fee.embeddedFeePayment`), by
 * `feeCapFor`'s `app` rule. On the embedded strategy, the NO_FROM build and the profile path this is
 * the only way the app's explicit cap reaches the gas settings. Other gas-settings fields, the
 * build's priority fee included, pass through.
 */
import { GasSettings } from "@aztec-labs/stdlib/gas"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import type { TxExecutionRequest } from "@aztec-labs/stdlib/tx"
import type { FeeOptions } from "@/wallet/services/execution/client"
import { feeCapFor } from "./fee-cap"

export async function applyEmbeddedFpcGasCap(txRequest: TxExecutionRequest, fee: FeeOptions, node: AztecNode): Promise<void> {
	if (!fee.embeddedFeePayment) return
	const maxFeesPerGas = await feeCapFor(node, { payer: "app", appCap: fee.maxFeesPerGas, appPriority: fee.maxPriorityFeesPerGas })
	txRequest.txContext.gasSettings = new GasSettings(
		txRequest.txContext.gasSettings.gasLimits,
		txRequest.txContext.gasSettings.teardownGasLimits,
		maxFeesPerGas,
		txRequest.txContext.gasSettings.maxPriorityFeesPerGas,
	)
}
