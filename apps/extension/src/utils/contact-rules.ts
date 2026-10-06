/** The validators' verdict when a name or address is already saved. */
export const CONTACT_EXISTS = "Already exist"

// `c` and `v` keep the validators' own names, so a native error on a malformed row reads the same.

/** Names compare as saved: trimmed on both sides (imports and restores can store outer spaces),
 *  case-sensitive. */
export function sameContactName(c: { name: string }, v: string): boolean {
	return c.name.trim() === v.trim()
}

/** Addresses compare ignoring hex case, so a mixed-case rendering of a saved address matches it. */
export function sameContactAddress(c: { address: string }, v: string): boolean {
	return c.address.toLowerCase() === v.toLowerCase()
}

/** The stored form of a contact address: lowercase hex, as the wallet emits everywhere else. */
export function canonicalContactAddress(address: string): string {
	return address.toLowerCase()
}
