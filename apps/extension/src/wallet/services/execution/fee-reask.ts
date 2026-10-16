/**
 * The second question a send asks when its build came out above the fee the person agreed to: the
 * queued Send-page send held to its cap, and the dApp send held to the figure its approval window
 * showed. The send is neither proved nor broadcast until the person accepts the new figure.
 */

import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import {
	IllegalTransitionError,
	JobCancelledSentinel,
	type JobProgress,
	type QueuedFeePayer,
	type QueuedFeeReask,
} from "@nulo/wallet-core/jobs"
import { FpcType, type FpcIdentitySnapshot } from "@/wallet/services/fpc/spec"
import type { QueuedFeeAnswers } from "./queued-fee-cap"

/** A rise a dApp send takes without asking: at most `percent` of the approved figure, or under one
 *  unit of the six-decimal readout, so a question's "Was" and "Now" never print alike. */
export const FEE_RISE_ASKS = { percent: 10n, atLeast: 10n ** 12n } as const

/** Whether a build's `fee` is far enough above the approved `ceiling` to ask again; a fall never asks. */
export function feeRiseAsks(fee: string, ceiling: string): boolean {
	const rise = BigInt(fee) - BigInt(ceiling)
	return rise >= FEE_RISE_ASKS.atLeast && rise * 100n > BigInt(ceiling) * FEE_RISE_ASKS.percent
}

/**
 * The person's own balance a build pays from, read from the route it took rather than the method
 * asked for: the account's Fee Juice, claimed or not, whoever's request made the claim, and Private
 * Fee Juice, which is told from a sponsor only by the paying row. A sponsor or an app's own fee
 * contract pays from a balance that is not the person's.
 */
export function personalPayerOf(built: {
	feePaymentMethod: AccountFeePaymentMethodOptions
	fpcIdentity?: FpcIdentitySnapshot
}): QueuedFeePayer | undefined {
	switch (built.feePaymentMethod) {
		case AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE:
		case AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM:
			return { type: "fj", isProtocol: false }
		default: {
			const row = built.fpcIdentity
			return row?.type === FpcType.PrivateFpc ? { type: "private_fpc", fpcId: row.id, isProtocol: row.isProtocol } : undefined
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
