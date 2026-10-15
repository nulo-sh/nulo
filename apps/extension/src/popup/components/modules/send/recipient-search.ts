import { contactNameKey } from "@/utils/contact-name"

type RecipientCandidate = { name?: string; address?: string; abbr?: string }

/**
 * The candidates a typed recipient suggests, in their given order: a name holding the query, or
 * initials or an address equal to it. Names and initials compare by `contactNameKey`, so case,
 * spacing, compatibility forms and invisible characters never hide one; a query whose key is empty
 * suggests no one by name. Addresses ignore hex case only: contacts are stored lowercase, but a user
 * may re-paste the mixed-case string they first typed.
 */
export function matchRecipients<T extends RecipientCandidate>(candidates: readonly T[], term: string): T[] {
	if (!term) return []
	const address = term.toLowerCase()
	const key = contactNameKey(term)
	const named = (c: T) => key !== "" && (contactNameKey(c.name ?? "").includes(key) || contactNameKey(c.abbr ?? "") === key)
	return candidates.filter((c) => named(c) || c.address?.toLowerCase() === address)
}
