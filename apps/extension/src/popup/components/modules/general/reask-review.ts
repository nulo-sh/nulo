/**
 * What the review sheet over Home draws for a queued send that asked again, from its record alone:
 * the facts as Send drew them for its payer, and the new fee against the one the person accepted.
 */
import type { QueuedFeeReask } from "@nulo/wallet-core/jobs"
import { type PayerKind, payerKindOf, type PublishFacts, publishFacts, type TransferSide } from "@/components/composite/send/publish-facts"
import { feeDisplay, feeText } from "@/utils/fee-estimation"
import { TransferType } from "@/wallet/services/transaction/spec"

const SIDES: Record<TransferType, [TransferSide, TransferSide]> = {
	[TransferType.Private]: ["private", "private"],
	[TransferType.PrivateToPublic]: ["private", "public"],
	[TransferType.Public]: ["public", "public"],
	[TransferType.PublicToPrivate]: ["public", "private"],
}

export type ReaskReview = {
	facts: PublishFacts
	payerKind: PayerKind
	payerType: QueuedFeeReask["payer"]["type"]
	/** The new fee and the cap the person accepted, each in the one fee grammar. */
	reask: { now: string; cap: string }
}

/** None for a record that is not a transfer asking at `queued`, or whose sides are unknown. The
 *  figures are rounded to six decimals; the accept carries the record's exact fee. */
export function reaskReview(
	op: { kind?: string; transferType?: TransferType; progress?: { stage: string; reask?: QueuedFeeReask } },
	usdPerFeeJuice: number | undefined,
): ReaskReview | null {
	const reask = op.kind === "transfer" && op.progress?.stage === "queued" ? op.progress.reask : undefined
	const sides = op.transferType === undefined ? undefined : SIDES[op.transferType]
	if (!reask || !sides) return null
	const { payer } = reask
	const settings = { paymentMethod: payer.type === "fj" ? { kind: "fj" } : { kind: "fpc", fpcId: payer.fpcId } }
	const payerKind = payerKindOf(settings, payer)
	return {
		facts: publishFacts(sides[0], sides[1], payerKind),
		payerKind,
		payerType: payer.type,
		reask: { now: feeText(feeDisplay(reask.fee, usdPerFeeJuice)), cap: feeText(feeDisplay(reask.cap, usdPerFeeJuice)) },
	}
}
