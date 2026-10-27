import { canonicalizeMnemonic, getEntropy, isMnemonicWord } from "@nulo/wallet-core/utils"
import { zeroize } from "@nulo/wallet-crypto"

/** A phrase Nulo imports has 24 words. */
export const PHRASE_WORD_COUNT = 24

/** What the import says of a typed phrase; `pending` while its checksum is being read. A position
 *  is 1-based, and the word itself is never kept. */
export type PhraseVerdict =
	| { kind: "empty" }
	| { kind: "pending" }
	| { kind: "count"; count: number }
	| { kind: "word"; position: number }
	| { kind: "checksum" }
	| { kind: "valid" }

/**
 * The import's own checks, in its order, on the canonical form it imports (`canonicalizeMnemonic`):
 * the word count, the first word not on the list, then the checksum, with the entropy zeroized.
 * Rejects on a failure that is none of these, so a caller never reads it as a verdict.
 */
export async function readPhraseVerdict(input: string | undefined): Promise<Exclude<PhraseVerdict, { kind: "pending" }>> {
	const words = canonicalizeMnemonic(input ?? "")
	if (words.length === 0) return { kind: "empty" }
	if (words.length !== PHRASE_WORD_COUNT) return { kind: "count", count: words.length }
	const unknown = words.findIndex((word) => !isMnemonicWord(word))
	if (unknown >= 0) return { kind: "word", position: unknown + 1 }
	try {
		zeroize(await getEntropy(words))
	} catch (error) {
		if (error instanceof Error && error.message === "Invalid checksum") return { kind: "checksum" }
		throw error
	}
	return { kind: "valid" }
}

/** The line under the phrase field; empty while there is nothing to say. */
export function phraseHint(verdict: PhraseVerdict): string {
	switch (verdict.kind) {
		case "valid":
			return "Correct"
		case "count":
			return verdict.count < PHRASE_WORD_COUNT
				? `${verdict.count} of ${PHRASE_WORD_COUNT} words`
				: `${verdict.count} words. A phrase has ${PHRASE_WORD_COUNT}.`
		case "word":
			return `Word ${verdict.position} is not in the word list.`
		case "checksum":
			return "A word is wrong or out of order."
		default:
			return ""
	}
}
