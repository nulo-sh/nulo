import { isValidAztecAddress } from "@/utils/aztec-address"
import { isAddressShapedName, isEmptyContactName, sameContactName, sanitizeContactName } from "@/utils/contact-name"
import { ALREADY_EXISTS, INVALID_ADDRESS } from "@/utils/entity-rules"

export const ADDRESS_LIKE_NAME = "A name can't look like an address. Use a word, like Ana."

// `c` and `v` keep the validators' own names, so a native error on a malformed row reads the same.

/** Addresses compare ignoring hex case, so a mixed-case rendering of a saved address matches it. */
export function sameContactAddress(c: { address: string }, v: string): boolean {
	return c.address.toLowerCase() === v.toLowerCase()
}

/** The stored form of a contact address: lowercase hex, as the wallet emits everywhere else. */
export function canonicalContactAddress(address: string): string {
	return address.toLowerCase()
}

// The contact form's rules take the reactive refs as `{ value }` handles, read only where the check
// reaches them, so a computed over them tracks only the refs its check reaches.
type Handle<T> = { readonly value: T }

/** The name field's verdict: `null` while empty or free, `ADDRESS_LIKE_NAME` when the name it would
 *  be stored as reads as an address, `ALREADY_EXISTS` when a saved contact other than `isExcluded`
 *  (the row being edited) holds it. */
export function contactNameError<C extends { name: string }>(
	v: string,
	contacts: Handle<readonly C[]>,
	isExcluded?: (c: C) => boolean,
): string | null {
	if (isEmptyContactName(v)) return null // empty is "not yet valid", not an error to display
	// The name as it would be stored: the cut can make a longer draft another contact's name.
	const stored = sanitizeContactName(v)
	if (isAddressShapedName(stored)) return ADDRESS_LIKE_NAME
	if (contacts.value.some((c) => sameContactName(c.name, stored) && !isExcluded?.(c))) return ALREADY_EXISTS
	return null
}

/** The address field's verdict: `null` while empty or free, `INVALID_ADDRESS`, or `ALREADY_EXISTS`
 *  when a saved contact other than `isExcluded` holds it in any hex case. */
export function contactAddressError<C extends { address: string }>(
	v: string,
	contacts: Handle<readonly C[]>,
	isExcluded?: (c: C) => boolean,
): string | null {
	if (!v) return null // empty: pre-input, not an error to display
	if (!isValidAztecAddress(v)) return INVALID_ADDRESS
	if (contacts.value.some((c) => sameContactAddress(c, v) && !isExcluded?.(c))) return ALREADY_EXISTS
	return null
}

/** Whether the contact form may save. A running save closes it on every route (button, Enter,
 *  future callers), not just the pointer path. */
export function canSubmitContact(form: {
	readonly loading: Handle<boolean>
	readonly name: Handle<string | null>
	readonly validAddress: Handle<boolean>
	readonly nameError: Handle<string | null>
	readonly addressError: Handle<string | null>
}): boolean {
	if (form.loading.value) return false
	if (isEmptyContactName(form.name.value ?? "")) return false
	if (!form.validAddress.value) return false
	if (form.nameError.value) return false
	if (form.addressError.value) return false
	return true
}
