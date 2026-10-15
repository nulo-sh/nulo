// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { z } from "zod"
import type { RunFence } from "@/wallet/services/profile/spec"

export const CONTACT_SERVICE_NAME = "contact"

/** EntityStorage root for contact rows (keyed by `contact.id`). Frozen:
 *  renaming detaches every existing row; the backup-migration registry pins it. */
export const CONTACT_STORAGE_ROOT = "nulo:core:contacts"

export type Contact = {
	/** Randomly generated contact id. */
	id: string
	/** Profile id. */
	profileId: string
	/** Contact name. */
	name: string
	/** Contact address. */
	address: string
	/** Contact name abbreviation (1–2 letters). */
	abbr: string
	// TODO: add chainId
}

/** Storage codec row schema — mirrors `Contact` exactly (see wallet-core
 *  `decodeRow`: validation-fail keeps the row + reads as undefined). */
export const ContactSchema: z.ZodType<Contact> = z.object({
	id: z.string(),
	profileId: z.string(),
	name: z.string(),
	address: z.string(),
	abbr: z.string(),
})

export type Methods = {
	/**
	 * Returns a list of contacts.
	 * @param fence When given, the contacts of the fence's profile, refused unless its session is the
	 * live one (`assertRunFence`). Omitted or `null`: the active profile's.
	 */
	getContacts(fence?: RunFence | null): Contact[]

	/**
	 * Returns a contact with the specified id.
	 * @param id Contact id.
	 */
	getContact(id: string): Contact

	/**
	 * Returns a contact with the specified address.
	 * @param address Contact address.
	 */
	getContactByAddress(address: string): Contact | undefined

	/**
	 * Creates and returns a new contact.
	 * @param name Display name, stored as `sanitizeContactName` returns it; refused when nothing of it
	 * would be stored.
	 * @param address contact address.
	 * @param fence When given, the contact is written to the fence's profile, refused unless its
	 * session is live when the call starts and again right before the write starts.
	 */
	addContact(name: string, address: string, fence?: RunFence | null): Contact

	/**
	 * Changes contact name and address and returns the updated contact.
	 * @param id Contact id.
	 * @param name New contact name, stored and refused as in `addContact`; omitted or empty keeps it.
	 * @param address New contact address.
	 * @param fence When given, the contact must belong to the fence's profile; refused as in
	 * `addContact`.
	 */
	updateContact(id: string, name?: string, address?: string, fence?: RunFence | null): Contact

	/**
	 * Deletes contact with the specified id.
	 * @param id Contact id.
	 */
	deleteContact(id: string): Contact

	/**
	 * Export all existing contacts to json.
	 */
	exportContacts(): string
}

export type Events = {
	/** Emitted when a new contact is added */
	onContactAdded: Contact
	/** Emitted when an existing contact is updated */
	onContactUpdated: Contact
	/** Emitted when an existing contact is deleted */
	onContactDeleted: Contact
}
