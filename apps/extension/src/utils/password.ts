/** Counts what a person sees as one character: an emoji, or a letter with its accents. */
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })
const characterCount = (text: string): number => {
	let count = 0
	for (const _ of graphemes.segment(text)) count++
	return count
}

export function isNewPasswordValid(password: string, repeated: string): boolean {
	return characterCount(password) >= 8 && password === repeated
}

/** Inline hint under a new-password pair, in the order the user resolves it. */
export function newPasswordHint(password: string, repeated: string): string {
	const length = characterCount(password)
	if (length < 8) return "At least 8 characters"
	if (password !== repeated) return "Passwords don't match"
	if (length > 24) return "Long enough. Don't forget it."
	return "Strong password"
}
