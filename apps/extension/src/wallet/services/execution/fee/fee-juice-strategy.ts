// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
/**
 * `FeeJuiceStrategy` — plain FeeJuice fee payment (kind `"fj"`).
 *
 * Single-pass: build → simulate (`skipFeeEnforcement`) → finalize.
 * No fee-payload injection, no pre-simulation gas fiddling.
 *
 * Under a probe (dApp estimate fold), the sim runs STUBBED and doubles as
 * authwit discovery: no authorization request ⇒ done in ONE sim (stub gas ==
 * validated gas, as measured); any request, signed or not ⇒ VALIDATED rebuild
 * + re-sim, so the run's witness checks are verified before the estimate leaves.
 */

import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import { JobCancelledSentinel } from "@nulo/wallet-core/jobs"
import type { Action } from "../spec"
import type { FeeEstimate, FeeStrategy, FeeStrategyContext, FeeStrategyDeps } from "./fee-strategy"
import {
	buildFor,
	finalizeGasLimits,
	probeContext,
	isInitWrapped,
	probedFirstSimOpts,
	startEstimateTask,
	suggestGasLimits,
	validatedSimOpts,
} from "./fee-strategy"

export class FeeJuiceStrategy implements FeeStrategy {
	public readonly kind = "fj" as const

	public constructor(private readonly deps: FeeStrategyDeps) {}

	public async buildAndEstimate(ctx: FeeStrategyContext): Promise<FeeEstimate> {
		const task = startEstimateTask(this.deps.tasks, ctx.parentTask)
		try {
			let built = await buildFor(this.deps.txBuilder, ctx, AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE, task)
			suggestGasLimits(built.txRequest, ctx.op.fee)
			let simulatedTx = await this.deps.simulateTxTask(built.pxe, built.txRequest, probedFirstSimOpts(ctx.probe, built), task)
			let discovered: Action[] = []
			if (ctx.probe) {
				const extracted = await ctx.probe.extractEffects(simulatedTx, probeContext(built))
				discovered = extracted.actions
				// The stub answered every check of the signer's witness, so any request, even one
				// dropped unsigned, needs a validated rebuild+re-sim; so does an init-wrapped build,
				// whose stub constructor gas is untrustworthy.
				if (extracted.requested || isInitWrapped(built)) {
					if (discovered.length) ctx.op.actions.push(...discovered)
					if (ctx.signal?.aborted) throw new JobCancelledSentinel("")
					built = await buildFor(this.deps.txBuilder, ctx, AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE, task)
					suggestGasLimits(built.txRequest, ctx.op.fee)
					simulatedTx = await this.deps.simulateTxTask(built.pxe, built.txRequest, validatedSimOpts(built.scopes), task)
				}
			}
			await finalizeGasLimits(built.node, built.txRequest, simulatedTx, {
				gasPadding: ctx.gasPadding,
				customLimits: ctx.op.fee,
				feeMultiplier: ctx.feeMultiplier,
				txsLimits: built.txsLimits,
			})
			task.complete()
			return { ...built, feePaymentMethod: AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE }
		} catch (error) {
			task.fail(error)
			throw error
		}
	}
}
