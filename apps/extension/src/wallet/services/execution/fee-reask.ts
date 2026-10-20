/**
 * The second question a send asks when its build came out above the fee the person agreed to: the
 * Send-page send held to the cap or the estimate it showed, and the dApp send held to the figure its
 * approval window showed. The send is neither proved nor broadcast until the person accepts the new
 * figure.
 */

import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import {
	IllegalTransitionError,
	JobCancelledSentinel,
	type JobProgress,
	type QueuedFeePayer,
	type QueuedFeeReask,
} from "@nulo/wallet-core/jobs"
import { FEE_READOUT_UNIT } from "@/utils/fee-estimation"
import { isPrivateFpc } from "@/wallet/services/fpc/private-fpc-address"
import { FpcType, type FpcIdentitySnapshot } from "@/wallet/services/fpc/spec"
import type { QueuedFeeAnswers } from "./queued-fee-cap"

/** A rise a send held to a figure it showed as an estimate takes without asking: at most `percent`
 *  of that figure, or under one unit of the fee readout, so a question's "Was" and "Now" never print
 *  alike. */
export const FEE_RISE_ASKS = { percent: 10n, atLeast: FEE_READOUT_UNIT } as const

/** Whether a build's `fee` is far enough above the approved `ceiling` to ask again; a fall never asks. */
export function feeRiseAsks(fee: string, ceiling: string): boolean {
	const rise = BigInt(fee) - BigInt(ceiling)
	return rise >= FEE_RISE_ASKS.atLeast && rise * 100n > BigInt(ceiling) * FEE_RISE_ASKS.percent
}

/** The figure a Send-page send was confirmed under: a queued send's cap, which the page calls the
 *  most it charges, or the estimate it showed, which a build may pass by {@link FEE_RISE_ASKS}. */
export type SendFeeFigure = { readonly fee: string; readonly rule: "cap" | "estimate" }

/** Whether a build's `fee` must ask the person again before it is proved. */
export function figureAsks(fee: string, figure: SendFeeFigure): boolean {
	return figure.rule === "cap" ? BigInt(fee) > BigInt(figure.fee) : feeRiseAsks(fee, figure.fee)
}

/**
 * The person's own balance a build pays from, read from the route it took rather than the method
 * asked for: the account's Fee Juice, claimed or not, whoever's request made the claim, and Private
 * Fee Juice, told from a sponsor by the paying row or, for an app's own payment, by the PrivateFPC's
 * address as the kernel names the payer. A sponsor or an app's own fee contract pays from a balance
 * that is not the person's.
 */
export function personalPayerOf(built: {
	feePaymentMethod: AccountFeePaymentMethodOptions
	fpcIdentity?: FpcIdentitySnapshot
	appPayer?: { address: unknown }
}): QueuedFeePayer | undefined {
	switch (built.feePaymentMethod) {
		case AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE:
		case AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM:
			return { type: "fj", isProtocol: false }
		default: {
			const row = built.fpcIdentity
			if (row?.type === FpcType.PrivateFpc) return { type: "private_fpc", fpcId: row.id, isProtocol: row.isProtocol }
			return isPrivateFpc(built.appPayer?.address) ? { type: "private_fpc", isProtocol: true } : undefined
		}
	}
}

export interface FeeReaskDeps {
	answers: QueuedFeeAnswers
	transitionJournal(journalId: string, progress: JobProgress): Promise<unknown>
	/** Heartbeats the row so the reaper does not fail it while the person decides. */
	beginQueuedWait(journalId: string): void
	endQueuedWait(journalId: string): void
	logDebug(msg: string): void
}

export type FeeReask = {
	journalId: string
	controller: AbortController
	reask: QueuedFeeReask
	/** How long the question stays open. */
	ms: number
	/** Runs once the record carries the question, so an answer to it can be taken. */
	onAsked?: () => void
}

/**
 * Asks the person about a fee above the figure they agreed to and returns once they accept exactly
 * it, the row claimed back to `pending`. The waiter exists before the question is published, so an
 * accept never arrives first. A refusal, a session end, or `ms` passing ends it as cancelled.
 */
export async function askFeeAgain(deps: FeeReaskDeps, ask: FeeReask): Promise<void> {
	const { journalId, controller } = ask
	const answer = deps.answers.wait(journalId, ask.reask.fee, controller.signal, ask.ms)
	try {
		await moveOwn(deps, journalId, controller, { stage: "queued", reask: ask.reask })
	} catch (err) {
		deps.answers.drop(journalId)
		throw err
	}
	deps.logDebug("queued send: fee above its cap, asking again")
	ask.onAsked?.()
	deps.beginQueuedWait(journalId)
	const result = await answer.finally(() => deps.endQueuedWait(journalId))
	if (result === "aborted") throw new JobCancelledSentinel(journalId)
	if (result === "expired") {
		deps.logDebug("queued send: unanswered at its deadline, cancelled")
		await moveOwn(deps, journalId, controller, { stage: "cancelled" })
		throw new JobCancelledSentinel(journalId)
	}
	await moveOwn(deps, journalId, controller, { stage: "pending" })
}

/** `cancelJob` writes `cancelled` before it aborts, so a move of the send's own record that fails
 *  while aborted, or on a cancelled record, lost to the cancel. */
async function moveOwn(deps: FeeReaskDeps, journalId: string, controller: AbortController, progress: JobProgress): Promise<void> {
	try {
		await deps.transitionJournal(journalId, progress)
	} catch (err) {
		const lost = controller.signal.aborted || (err instanceof IllegalTransitionError && err.from === "cancelled")
		throw lost ? new JobCancelledSentinel(journalId) : err
	}
}
