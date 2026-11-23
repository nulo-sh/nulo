import { QUEUED_FEE_COPY, QUEUED_SPONSORED_COPY, UNVOUCHED_FEE_SENTENCE } from "@/utils/fee/publish-facts"
import { type FeeDisplay, feeText } from "@/utils/fee-estimation"

/** Who pays, as Send's fee line names it; `unvouched` is a sponsor added by hand. */
export type FeeLinePayer = "fj" | "private_fpc" | "sponsor" | "unvouched"

/** Each paying method as the Fee sheet titles its row: the line's second row. */
export const FEE_LINE_METHOD = {
	fj: "Public Fee Juice",
	private_fpc: "Private Fee Juice",
	sponsor: "Sponsored",
} as const

/** Words that may hold one fee; `figure` is that fee as `text` prints it, so a screen can draw it whole. */
export interface FeeWords {
	text: string
	figure: string | null
}

const plain = (text: string): FeeWords => ({ text, figure: null })

/** The fee in the wallet's one grammar, `~X FJ ($Y)`, between `before` and `after`. */
function withFee(before: string, display: FeeDisplay, after = ""): FeeWords {
	const figure = feeText(display)
	return { text: `${before}${figure}${after}`, figure }
}

/** The fee line's first row, the figure, and the note under the rows, or none. */
export interface FeeLineWords {
	value: FeeWords
	note: FeeWords | null
}

/**
 * What the figure row reads once a payer is known. A sponsored fee is "Nothing" with the sponsor's
 * cost as the note, and with no figure while queued; a hand-added sponsor's cost is never named, since
 * Nulo cannot vouch for it.
 */
export function feeLineWords(payer: FeeLinePayer, display: FeeDisplay | null, opts: { queued?: boolean } = {}): FeeLineWords {
	if (payer === "unvouched") return { value: plain("—"), note: plain(UNVOUCHED_FEE_SENTENCE) }
	if (payer === "sponsor") {
		const value = plain("Nothing")
		if (opts.queued) return { value, note: plain(QUEUED_SPONSORED_COPY) }
		return { value, note: display ? withFee("The sponsor covers ", display) : null }
	}
	return { value: display ? withFee("", display) : plain("—"), note: null }
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
type FeeReading =
	| { kind: "words"; value: FeeWords; note: FeeWords | null; queue?: "cap" | "sponsored" | "behind" }
	| { kind: "bar" }
	| { kind: "slow" }
	| { kind: "failed" }

/** The figure row's reading, then `method`, who pays: null until the card names one, and kept through
 *  the bar and a failed estimate so the line holds its height when the fee lands. */
export type FeeLine = FeeReading & { method: string | null }

const capSentence = (cap: FeeDisplay) => withFee("Goes out after your earlier send, for at most ", cap, ".")

function queuedLine(state: FeeLineState): FeeReading | null {
	if (!state.queued) return null
	const cap = state.queuedCap
	if (cap) return { kind: "words", value: withFee("", cap.about), note: capSentence(cap.cap), queue: "cap" }
	if (state.queuedSponsored) return { kind: "words", ...feeLineWords("sponsor", null, { queued: true }), queue: "sponsored" }
	return { kind: "words", value: plain(QUEUED_FEE_COPY), note: null, queue: "behind" }
}

function feeReading(state: FeeLineState): FeeReading {
	if (state.estimating && !state.display) return queuedLine(state) ?? { kind: state.slow ? "slow" : "bar" }
	if (state.failed && !state.display) return { kind: "failed" }
	if (!state.payer) return { kind: "words", value: plain("—"), note: null }
	return { kind: "words", ...feeLineWords(state.payer, state.display) }
}

function feeMethod({ payer, payerName }: FeeLineState): string | null {
	if (payer === "unvouched") return payerName ?? null
	return payer ? FEE_LINE_METHOD[payer] : null
}

/**
 * Send's fee as one reading in two rows, the estimate's own states first, as the card's cost row
 * orders them. The form's line and the review's fee row both draw this, so the two screens cannot
 * word one fee two ways.
 */
export function feeLine(state: FeeLineState): FeeLine {
	return { ...feeReading(state), method: feeMethod(state) }
}

/** What goes under the line: its own note, then what the fee card would say. */
export function feeLineNotes(line: FeeLine, notices: readonly FeeWords[]): FeeWords[] {
	const own = line.kind === "words" && line.note ? [line.note] : []
	return [...own, ...notices]
}
