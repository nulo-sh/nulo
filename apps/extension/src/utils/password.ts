/** Counts what a person sees as one character: an emoji, or a letter with its accents. */
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })
export const characterCount = (text: string): number => {
	let count = 0
	for (const _ of graphemes.segment(text)) count++
	return count
}

export const MIN_NEW_PASSWORD_LENGTH = 8

/** The longest password a field takes, as its native `maxlength`. */
export const MAX_PASSWORD_LENGTH = 128

export function isNewPasswordValid(password: string, repeated: string): boolean {
	return characterCount(password) >= MIN_NEW_PASSWORD_LENGTH && password === repeated
}
