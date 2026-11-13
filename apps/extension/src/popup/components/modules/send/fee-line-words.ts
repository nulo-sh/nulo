import { QUEUED_FEE_COPY, QUEUED_SPONSORED_COPY, UNVOUCHED_FEE_SENTENCE } from "@/components/composite/send/publish-facts"
import type { FeeDisplay } from "@/utils/fee-estimation"

/** Who pays, as Send's fee line names it; `unvouched` is a sponsor added by hand. */
export type FeeLinePayer = "fj" | "private_fpc" | "sponsor" | "unvouched"

/** Each paying method in the glossary's words, as the line ends. */
export const FEE_LINE_METHOD = {
	fj: "public Fee Juice",
	private_fpc: "private Fee Juice",
	sponsor: "Sponsored",
} as const

/** The figure, dollars first: `≈ $0.027 (0.00214 FJ)`; a fee under a tenth of a cent carries no `≈`,
 *  and with no usable quote it is the Fee Juice alone. */
export function feeLineFigure({ amount, usd }: FeeDisplay): string {
	if (!usd) return `~${amount} FJ`
	if (usd.startsWith("<")) return `${usd} (${amount} FJ)`
	return `≈ ${usd} (${amount} FJ)`
}

/** The fee line's value and its second line, or none. */
export interface FeeLineWords {
	value: string
	note: string | null
}

/**
 * What the line reads once a payer is known. A sponsored fee is "Nothing · Sponsored" with the
 * sponsor's cost as the note, and with no figure while queued; a hand-added sponsor's cost is never
 * named, since Nulo cannot vouch for it.
 */
export function feeLineWords(
	payer: FeeLinePayer,
	display: FeeDisplay | null,
	opts: { name?: string; queued?: boolean } = {},
): FeeLineWords {
	if (payer === "unvouched") return { value: opts.name ? `—, ${opts.name}` : "—", note: UNVOUCHED_FEE_SENTENCE }
	if (payer === "sponsor") {
		const value = `Nothing · ${FEE_LINE_METHOD.sponsor}`
		if (opts.queued) return { value, note: QUEUED_SPONSORED_COPY }
		return { value, note: display ? `The sponsor covers ${feeLineFigure(display)}` : null }
	}
	return { value: display ? `${feeLineFigure(display)}, ${FEE_LINE_METHOD[payer]}` : FEE_LINE_METHOD[payer], note: null }
}

/** What Send knows of its fee: the inputs of the form's line and of the review's fee row alike. */
export interface FeeLineState {
	/** Null until the card names who pays. */
	payer: FeeLinePayer | null
	/** A hand-added sponsor's name, already safe to show. */
	payerName?: string | null
	display: FeeDisplay | null
	estimating?: boolean
	slow?: boolean
	failed?: boolean
	queued?: boolean
	queuedCap?: { about: FeeDisplay; cap: FeeDisplay } | null
	queuedSponsored?: boolean
}

/** `queue` names which queued reading the words are, for a screen that marks it. */
export type FeeLine =
	| { kind: "words"; value: string; note: string | null; queue?: "cap" | "sponsored" | "behind" }
	| { kind: "bar" }
	| { kind: "slow" }
	| { kind: "failed" }

const capSentence = (cap: FeeDisplay) =>
	`Goes out after your earlier send, for at most ${cap.usd ? `${cap.usd} (${cap.amount} FJ)` : `${cap.amount} FJ`}.`

function queuedLine(state: FeeLineState): FeeLine | null {
	if (!state.queued) return null
	const cap = state.queuedCap
	if (cap) {
		const method = state.payer === "fj" || state.payer === "private_fpc" ? `, ${FEE_LINE_METHOD[state.payer]}` : ""
		return { kind: "words", value: `${feeLineFigure(cap.about)}${method}`, note: capSentence(cap.cap), queue: "cap" }
	}
	if (state.queuedSponsored) return { kind: "words", ...feeLineWords("sponsor", null, { queued: true }), queue: "sponsored" }
	return { kind: "words", value: QUEUED_FEE_COPY, note: null, queue: "behind" }
}

/**
 * Send's fee as one reading, the estimate's own states first, as the card's cost row orders them.
 * The form's line and the review's fee row both draw this, so the two screens cannot word one fee
 * two ways.
 */
export function feeLine(state: FeeLineState): FeeLine {
	if (state.estimating && !state.display) return queuedLine(state) ?? { kind: state.slow ? "slow" : "bar" }
	if (state.failed && !state.display) return { kind: "failed" }
	if (!state.payer) return { kind: "words", value: "—", note: null }
	return { kind: "words", ...feeLineWords(state.payer, state.display, { name: state.payerName ?? undefined }) }
}

/** What goes under the line: its own note, then what the fee card would say. */
export function feeLineNotes(line: FeeLine, notices: readonly string[]): string[] {
	const own = line.kind === "words" && line.note ? [line.note] : []
	return [...own, ...notices]
}
