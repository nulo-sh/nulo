import { QUEUED_SPONSORED_COPY, UNVOUCHED_FEE_SENTENCE } from "@/components/composite/send/publish-facts"
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
