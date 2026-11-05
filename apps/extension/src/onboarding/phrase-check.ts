/**
 * The recovery phrase check: three of the phrase's words, each asked by its position and picked
 * from choices that are all words of the same phrase, so only the order written down passes.
 */

/** The word at `position` (1-based, as the phrase grid numbers it) and the choices it is picked from. */
export interface PhraseQuestion {
	readonly position: number
	readonly phraseWord: string
	readonly phraseChoices: readonly string[]
}

export const PHRASE_CHECK_SIZE = 3
const DECOYS_PER_QUESTION = 3
const UINT32_RANGE = 2 ** 32

/** A uniform integer in `[0, bound)` from the platform CSPRNG; rejection sampling removes the modulo bias. */
export function cryptoRandomIndex(bound: number): number {
	if (!Number.isInteger(bound) || bound < 1 || bound > UINT32_RANGE) throw new RangeError("bound out of range")
	const limit = UINT32_RANGE - (UINT32_RANGE % bound)
	const draw = new Uint32Array(1)
	do crypto.getRandomValues(draw)
	while (draw[0] >= limit)
	return draw[0] % bound
}

function shuffled<T>(items: readonly T[], randomIndex: (bound: number) => number): T[] {
	const out = [...items]
	for (let i = out.length - 1; i > 0; i--) {
		const j = randomIndex(i + 1)
		;[out[i], out[j]] = [out[j], out[i]]
	}
	return out
}

/**
 * Three distinct positions in ascending order, each with its word and up to three other distinct
 * words of the phrase, shuffled. Bounded on a phrase of few distinct words: the decoys are drawn
 * from what exists, never searched for.
 */
export function buildPhraseCheck(words: readonly string[], randomIndex = cryptoRandomIndex): PhraseQuestion[] {
	const positions = shuffled(
		words.map((_, i) => i),
		randomIndex,
	)
		.slice(0, PHRASE_CHECK_SIZE)
		.sort((a, b) => a - b)
	const distinct = [...new Set(words)]
	return positions.map((i) => {
		const phraseWord = words[i]
		const decoys = shuffled(
			distinct.filter((word) => word !== phraseWord),
			randomIndex,
		).slice(0, DECOYS_PER_QUESTION)
		return { position: i + 1, phraseWord, phraseChoices: shuffled([phraseWord, ...decoys], randomIndex) }
	})
}

/** True only when every question has its own word picked, in question order. */
export function isPhraseCheckPassed(questions: readonly PhraseQuestion[], phrasePicks: readonly (string | undefined)[]): boolean {
	return (
		questions.length > 0 &&
		phrasePicks.length === questions.length &&
		questions.every((question, i) => phrasePicks[i] === question.phraseWord)
	)
}
