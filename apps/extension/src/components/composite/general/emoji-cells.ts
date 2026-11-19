const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

const EMOJI_PRESENTATION_SELECTOR = "️"
const PICTOGRAPH = /^\p{Extended_Pictographic}$/u
const EMOJI_BY_DEFAULT = /^\p{Emoji_Presentation}$/u
/** Emoji by default, yet text faces carry them: Inter draws U+2B1C as an outline. */
const TEXT_FACE_SQUARES: ReadonlySet<string> = new Set(["⬛", "⬜"])

/**
 * One cell per grapheme of `emojis`, so a sequence never splits across cells. A lone pictograph a
 * text face can claim gets U+FE0F, so the browser draws it from a colour-emoji face, as the app it
 * is compared with does. Only what is drawn changes: the caller's string stays as given.
 */
export function emojiCells(emojis: string): string[] {
	return Array.from(graphemes.segment(emojis), ({ segment }) => {
		const textCapable = PICTOGRAPH.test(segment) && (!EMOJI_BY_DEFAULT.test(segment) || TEXT_FACE_SQUARES.has(segment))
		return textCapable ? segment + EMOJI_PRESENTATION_SELECTOR : segment
	})
}
