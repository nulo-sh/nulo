/**
 * The smallest free `Account ${n}` among `names`. The number cannot come from `account.index`:
 * indexes count per account type, names are global.
 */
export function nextAccountName(names: readonly string[]): string {
	let n = 1
	while (names.includes(`Account ${n}`)) n++
	return `Account ${n}`
}

/** The name an account or FPC name field would be told apart by: the input without its outer
 *  spaces. Case and inner spaces stay significant, and an unnamed FPC keys as `""`. */
export function storedNameKey(name: string | undefined): string {
	return (name ?? "").trim()
}

/** Whether two names collide for a duplicate check. A blank key never collides, so a blank input
 *  is never "Already exist" beside an unnamed FPC. */
export function sameStoredName(a: string | undefined, b: string | undefined): boolean {
	const key = storedNameKey(a)
	return key !== "" && key === storedNameKey(b)
}
