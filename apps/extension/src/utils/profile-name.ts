export const FIRST_PROFILE_NAME = "Main"

/**
 * The form under which two profile names collide. Outer spaces drop, and NFKC + locale lower-case
 * folds stylistic variants ("ﬂ"/"fl", "K"/"K"); it does not fold cross-script homoglyphs
 * (Cyrillic "А").
 */
export function normalizeProfileName(name: string): string {
	return name.normalize("NFKC").trim().toLocaleLowerCase()
}

/**
 * The automatic name for a new profile: "Main" when there is none yet, otherwise `Profile ${n}`
 * with n = profiles + 1, bumped past any name it collides with. Always 1–32 characters and
 * unique under `normalizeProfileName`, so it passes the name field's own validation.
 */
export function defaultProfileName(existing: readonly string[]): string {
	if (existing.length === 0) return FIRST_PROFILE_NAME
	const taken = new Set(existing.map(normalizeProfileName))
	let n = existing.length + 1
	while (taken.has(normalizeProfileName(`Profile ${n}`))) n++
	return `Profile ${n}`
}

/** The name field's own limit, which an automatic name must meet too. */
const NAME_MAX_LENGTH = 32

/**
 * The name a profile restored as `base` takes beside `existing`, as the restore names it: `base`
 * when free, else `${base} ${n}` for the first n from 1 that is. Free under `normalizeProfileName`,
 * as the name field checks, and the base shortened to keep the result within 32 characters, so the
 * page can show it and submit it unchanged.
 */
export function availableName(base: string, existing: readonly string[]): string {
	const taken = new Set(existing.map(normalizeProfileName))
	if (!taken.has(normalizeProfileName(base))) return base
	for (let n = 1; ; n++) {
		const suffix = ` ${n}`
		const head = Array.from(base)
		while (head.join("").length + suffix.length > NAME_MAX_LENGTH) head.pop()
		const candidate = `${head.join("").trimEnd()}${suffix}`
		if (!taken.has(normalizeProfileName(candidate))) return candidate
	}
}
