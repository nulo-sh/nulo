// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
/**
 * `EmbeddedStrategy` — dApp's own FPC pre-embedded in `ExecutionPayload`
 * (kind `"embedded"`). The dApp has already set `feePayer` in the
 * payload; no Nulo-side fee-payload injection required.
 *
 * The cap is the app's, else the predicted worst minimum at 1.0x (`applyEmbeddedFpcGasCap`), and
 * finalize commits it unchanged.
 */

import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import type { TxSimulationResult } from "@aztec-labs/stdlib/tx"
import { callsFeeJuice } from "../sponsor-funding"
import { applyEmbeddedFpcGasCap } from "./embedded-fpc-cap"
import type { FeeEstimate, FeeStrategy, FeeStrategyContext, FeeStrategyDeps } from "./fee-strategy"
import { appPriorityOf, finalizeGasLimits, startEstimateTask, suggestGasLimits, validatedSimOpts } from "./fee-strategy"

/** The app's own fee contract, as the final simulation's kernel names it. A claim to the sender
 *  (`fjwc`) is the sender paying itself: no contract of the app's pays. */
function appPayerOf(route: "fjwc" | "fpc", simulatedTx: TxSimulationResult): Pick<FeeEstimate, "appPayer"> {
	const payer = simulatedTx.publicInputs?.feePayer
	if (route !== "fpc" || !payer || payer.isZero()) return {}
	return { appPayer: { address: payer, callsFeeJuice: callsFeeJuice(simulatedTx.privateExecutionResult) } }
}

export class EmbeddedStrategy implements FeeStrategy {
	public readonly kind = "embedded" as const

	public constructor(private readonly deps: FeeStrategyDeps) {}

	public async buildAndEstimate(ctx: FeeStrategyContext): Promise<FeeEstimate> {
		if (!ctx.op.fee?.embeddedFeePayment) {
			throw new Error("Embedded fee payment not specified")
		}
		const embeddedMethod =
			ctx.op.fee.embeddedFeePayment === "fjwc"
				? AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM
				: AccountFeePaymentMethodOptions.EXTERNAL
		const task = startEstimateTask(this.deps.tasks, ctx.parentTask)

		try {
			const built = await this.deps.txBuilder.buildStandard(ctx.op, ctx.fence, embeddedMethod, task, appPriorityOf(ctx.op.fee))
			const { txRequest, node, pxe, account } = built
			suggestGasLimits(txRequest, ctx.op.fee)
			await applyEmbeddedFpcGasCap(txRequest, ctx.op.fee, node)
			const simulatedTx = await this.deps.simulateTxTask(pxe, txRequest, validatedSimOpts(account.address), task)
			// `feeMultiplier` is inert: an embedded payment commits the cap set above.
			await finalizeGasLimits(node, txRequest, simulatedTx, {
				gasPadding: ctx.gasPadding,
				customLimits: ctx.op.fee,
				feeMultiplier: 1,
				txsLimits: built.txsLimits,
			})
			task.complete()
			return { ...built, feePaymentMethod: embeddedMethod, ...appPayerOf(ctx.op.fee.embeddedFeePayment, simulatedTx) }
		} catch (error) {
			task.fail(error)
			throw error
		}
	}
}
