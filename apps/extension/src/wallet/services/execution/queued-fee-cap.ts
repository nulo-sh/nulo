/**
 * The fee cap of a send queued behind an earlier one. The send goes out without asking only when
 * its build's committed max fee is at most the cap the person saw; above it the send keeps its
 * place and asks again, and the build is neither proved nor broadcast until the person answers.
 */

import { isFeeAmount, type QueuedFeePayer } from "@nulo/wallet-core/jobs"
import type { Fpc } from "@/wallet/services/fpc/fpc"
import { FpcType } from "@/wallet/services/fpc/spec"
import { OriginType, type Tx } from "@/wallet/services/transaction/spec"

export const QUEUED_FEE_MARGIN_PERCENT = 25n

/** The readout shows six of Fee Juice's 18 decimals; the cap is cut to them so the Y on screen is
 *  the Y enforced. */
const READOUT_UNIT = 10n ** 12n

/** The figures a queued answer offers: the last fee of this token's sends, and the cap above it. */
export type QueuedFeeCap = { basis: string; cap: string }

/**
 * The `estimatedFee` of the newest Send-page send of `token` this profile made on `chainId`.
 * Another profile of the same seed shares the address, so the profile stamp keeps its figure out;
 * a row dated in the future (a restored one) would stay the basis for good, so it never is.
 */
export function queuedFeeBasis(rows: readonly Tx[], profileId: string, chainId: number, token: string, now: number): string | undefined {
	let newest: Tx | undefined
	for (const row of rows) {
		const basis =
			row.profileId === profileId &&
			row.ambiguous !== true &&
			row.chainId === chainId &&
			row.origin?.type === OriginType.UI &&
			row.calls[0]?.contract.toLowerCase() === token.toLowerCase() &&
			isFeeAmount(row.estimatedFee) &&
			row.createdAt <= now
		if (basis && (!newest || row.createdAt > newest.createdAt)) newest = row
	}
	return newest?.estimatedFee
}

/** The basis plus the margin, rounded down to what the readout shows; none when that is not a fee. */
export function queuedFeeCap(basis: string): string | undefined {
	const cap = (((BigInt(basis) * (100n + QUEUED_FEE_MARGIN_PERCENT)) / 100n / READOUT_UNIT) * READOUT_UNIT).toString()
	return isFeeAmount(cap) ? cap : undefined
}

/** The payer as the Send page describes it, from the fee contract the send was ordered against. */
export function queuedFeePayer(fpc: Fpc | undefined): QueuedFeePayer {
	if (!fpc) return { type: "fj", isProtocol: false }
	const info = fpc.infoData
	return { type: info.type === FpcType.PrivateFpc ? "private_fpc" : "fpc", fpcId: info.id, isProtocol: info.isProtocol === true }
}

export type QueuedFeeAnswer = "accepted" | "aborted" | "expired"

/**
 * One answer per queued send that asks again. Lives in the worker's memory with the `execute` call
 * that waits on it, so a restart ends both.
 */
export class QueuedFeeAnswers {
	private readonly waiting = new Map<string, { fee: string; deadline: number; settle: (answer: QueuedFeeAnswer) => void }>()

	/**
	 * Registers the waiter before it returns, and resolves once: `accepted` by {@link accept} with
	 * this `fee`, `aborted` by `signal` (at once when it already is), `expired` after `ms` or at an
	 * accept that comes later.
	 */
	public wait(journalId: string, fee: string, signal: AbortSignal, ms: number): Promise<QueuedFeeAnswer> {
		return new Promise((resolve) => {
			const onAbort = () => entry.settle("aborted")
			const entry = {
				fee,
				deadline: Date.now() + Math.max(0, ms),
				settle: (answer: QueuedFeeAnswer) => {
					if (this.waiting.get(journalId) !== entry) return
					this.waiting.delete(journalId)
					clearTimeout(timer)
					signal.removeEventListener("abort", onAbort)
					resolve(answer)
				},
			}
			this.waiting.set(journalId, entry)
			const timer = setTimeout(() => entry.settle("expired"), Math.max(0, ms))
			if (signal.aborted) entry.settle("aborted")
			else signal.addEventListener("abort", onAbort, { once: true })
		})
	}

	/** Resumes the send waiting with exactly `fee`. A stale figure, no waiter or a second accept
	 *  resumes nothing. */
	public accept(journalId: string, fee: string): boolean {
		const entry = this.waiting.get(journalId)
		if (!entry || entry.fee !== fee) return false
		// A timer can fire late: past the deadline the send stays unanswered, whichever arrives first.
		if (Date.now() >= entry.deadline) {
			entry.settle("expired")
			return false
		}
		entry.settle("accepted")
		return true
	}

	/** Removes a waiter whose question never reached the record. */
	public drop(journalId: string): void {
		this.waiting.get(journalId)?.settle("aborted")
	}
}
