import { contactNameKey } from "@/utils/contact-name"

type RecipientCandidate = { name?: string; address?: string; abbr?: string }

/**
 * The candidates a typed recipient suggests: a name holding the query, or initials or an address
 * equal to it. Names whose whole key equals the query come first, so names that only hold it never
 * push one past the suggestions' cap; initials stay in place, since distinct contacts share them.
 * Each group keeps the given order. Names and initials compare by `contactNameKey`, so case,
 * spacing, compatibility forms and invisible characters never hide one; a query whose key is empty
 * suggests no one by name. Addresses ignore hex case only: contacts are stored lowercase, but a user
 * may re-paste the mixed-case string they first typed.
 */
export function matchRecipients<T extends RecipientCandidate>(candidates: readonly T[], term: string): T[] {
	if (!term) return []
	const address = term.toLowerCase()
	const key = contactNameKey(term)
	const whole: T[] = []
	const rest: T[] = []
	for (const c of candidates) {
		const name = key && contactNameKey(c.name ?? "")
		if (key && name === key) whole.push(c)
		else if ((key && (name.includes(key) || contactNameKey(c.abbr ?? "") === key)) || c.address?.toLowerCase() === address) rest.push(c)
	}
	return whole.concat(rest)
}
