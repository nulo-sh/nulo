const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

const EMOJI_PRESENTATION_SELECTOR = "\uFE0F"
const PICTOGRAPH = /^\p{Extended_Pictographic}$/u
const EMOJI_BY_DEFAULT = /^\p{Emoji_Presentation}$/u
/** Emoji by default, yet text faces carry them: Inter draws U+2B1C as an outline. */
const TEXT_FACE_SQUARES: ReadonlySet<string> = new Set(["\u2B1B", "\u2B1C"])

/**
 * The cells of `emojis`, one per grapheme. A lone pictograph a text face can claim gets U+FE0F, a
 * request for emoji presentation. The cells are for display only; the caller's string stays canonical.
 */
export function emojiCells(emojis: string): string[] {
	return Array.from(graphemes.segment(emojis), ({ segment }) => {
		const textCapable = PICTOGRAPH.test(segment) && (!EMOJI_BY_DEFAULT.test(segment) || TEXT_FACE_SQUARES.has(segment))
		return textCapable ? segment + EMOJI_PRESENTATION_SELECTOR : segment
	})
}
