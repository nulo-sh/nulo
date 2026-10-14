/**
 * Projections from a finalized `TxExecutionRequest`'s gas settings to the
 * wire shapes the activity record and fee-estimate responses carry.
 * Extracted from the execution facade so the executor modules share one
 * copy — and so the projection math is unit-pinned (it reads the same
 * same-typed gasSettings slots the structural fee fixtures guard).
 */

import type { TxExecutionRequest } from "@aztec-labs/stdlib/tx"
import type { TxGasDetails } from "@/wallet/services/transaction/spec"

/** The most the transaction can cost, gas limits × cap: the fee limit the node checks the payer's
 *  balance against (`GasSettings.getFeeLimit`). The gas limits already include teardown. */
export function feeLimitOf(txRequest: TxExecutionRequest): bigint {
	const { gasLimits, maxFeesPerGas } = txRequest.txContext.gasSettings
	return BigInt(gasLimits.daGas) * maxFeesPerGas.feePerDaGas + BigInt(gasLimits.l2Gas) * maxFeesPerGas.feePerL2Gas
}

/** The part of the fee limit an app's priority fee may take: gas limits × the priority, each per-gas
 *  priority bounded by the cap, as the protocol pays it. Never above `feeLimitOf`. */
export function priorityFeeOf(txRequest: TxExecutionRequest): bigint {
	const { gasLimits, maxFeesPerGas, maxPriorityFeesPerGas } = txRequest.txContext.gasSettings
	const min = (a: bigint, b: bigint) => (a < b ? a : b)
	return (
		BigInt(gasLimits.daGas) * min(maxPriorityFeesPerGas.feePerDaGas, maxFeesPerGas.feePerDaGas) +
		BigInt(gasLimits.l2Gas) * min(maxPriorityFeesPerGas.feePerL2Gas, maxFeesPerGas.feePerL2Gas)
	)
}

export function getEstimatedFee(txRequest: TxExecutionRequest): string {
	return feeLimitOf(txRequest).toString()
}

/** Extract gas breakdown from finalized gas settings. */
export function getGasDetails(txRequest: TxExecutionRequest): TxGasDetails {
	const gs = txRequest.txContext.gasSettings
	return {
		l2GasLimit: gs.gasLimits.l2Gas,
		daGasLimit: gs.gasLimits.daGas,
		teardownL2GasLimit: gs.teardownGasLimits.l2Gas,
		teardownDaGasLimit: gs.teardownGasLimits.daGas,
		feePerL2Gas: gs.maxFeesPerGas.feePerL2Gas.toString(),
		feePerDaGas: gs.maxFeesPerGas.feePerDaGas.toString(),
	}
}
