// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { BrowserApi } from "@nulo/wallet-core/ports"
import type { Restored, ServiceCollection, ServiceSpec } from "@/wallet/base"
import { Service, defineRpcMethods } from "@nulo/extension-messaging/background"
import { SessionEndedError } from "@nulo/extension-messaging/errors"
import type { ILogger } from "@/wallet/logger"
import { ProfileService } from "@/wallet/services/profile/service"
import { requireActiveProfile } from "@/wallet/services/profile/require-active-profile"
import { purgeMalformedRows, purgeRows } from "@/wallet/services/purge-rows"
import { assertRestoreEpoch, captureRestoreEpochs, restoreRowProfileId } from "@/wallet/services/restore-fence"
import { type ExecutionFence, profileDeletedError } from "@/wallet/services/profile/profile-deletion-state"
import type { RunFence } from "@/wallet/services/profile/spec"
import { restoreRows } from "@/wallet/services/restore-rows"
import { nextRandomId, preferOrReallocId } from "@/wallet/services/id-allocators"
import { requireOwnedRow } from "@/wallet/services/require-owned-row"
import { type RestoreGate, NOOP_RESTORE_GATE } from "@/e2e/restore-gate"
import { EntityStorage } from "@/wallet/storage"
import { Lock } from "@/wallet/utils"
import { getInitials } from "@/utils"
import { isEmptyContactName, sanitizeContactName } from "@/utils/contact-name"
import { EventHandler } from "@nulo/wallet-core/utils"
import { type Contact, CONTACT_SERVICE_NAME, CONTACT_STORAGE_ROOT, ContactSchema, type Events, type Methods } from "./spec"

export * from "./spec"

/** Never quotes the name: a contact name is personal data. */
const NO_VISIBLE_NAME = "contact name has no visible characters"

export class ContactService extends Service<Methods, Events> implements ServiceSpec<Methods, Events> {
	protected readonly rpcMethods = defineRpcMethods<Methods>()(
		"getContacts",
		"getContact",
		"getContactByAddress",
		"addContact",
		"updateContact",
		"deleteContact",
		"exportContacts",
	)
	public static name = CONTACT_SERVICE_NAME

	/** Declared startup deps — ensures ProfileService is fully started before we touch it. */
	public readonly dependencies = [ProfileService.name] as const

	public readonly onContactAdded = new EventHandler<Contact>()
	public readonly onContactUpdated = new EventHandler<Contact>()
	public readonly onContactDeleted = new EventHandler<Contact>()

	private readonly storage: EntityStorage<Contact>
	private readonly lock = new Lock()

	private profileService: ProfileService = null!

	/**
	 * @param browserApi — optional; if omitted, falls back to `chrome.storage`
	 *        directly (legacy behavior). Passed explicitly by the composition
	 *        root and by tests via FakeBrowserApi.
	 */
	public constructor(
		logger: ILogger,
		browserApi?: BrowserApi,
		private readonly restoreGate: RestoreGate = NOOP_RESTORE_GATE,
	) {
		super(CONTACT_SERVICE_NAME, logger)
		this.storage = browserApi
			? new EntityStorage<Contact>(CONTACT_STORAGE_ROOT, browserApi.storage.local, (raw) => ContactSchema.parse(raw))
			: new EntityStorage<Contact>(CONTACT_STORAGE_ROOT, chrome.storage.local, (raw) => ContactSchema.parse(raw))
	}

	protected async init(services: ServiceCollection) {
		this.profileService = services.get(ProfileService.name)
		// Profile-delete cleanup is now the coordinator's awaited `purgeForProfile` (D).
	}

	public async getContacts(fence?: RunFence | null): Promise<Contact[]> {
		await this.ensureInitialized()
		const profileId = await this.actingProfileId(fence)

		return (await this.storage.getValues()).filter((c) => c.profileId === profileId)
	}

	public async getContact(contactId: string): Promise<Contact> {
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)

		return requireOwnedRow(await this.storage.get(contactId), profile.id, "invalid id")
	}

	public async getContactByAddress(contactAddress: string): Promise<Contact | undefined> {
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)

		// Case-insensitive: hex casing doesn't make a different address, and
		// stored rows may predate canonical-lowercase-on-save.
		const contact = (await this.storage.getValues()).filter(
			(c) => c.profileId === profile.id && c.address.toLowerCase() === contactAddress.toLowerCase(),
		)

		if (!contact.length) return undefined

		return contact[0]
	}

	public async addContact(name: string, address: string, runFence?: RunFence | null): Promise<Contact> {
		await this.ensureInitialized()
		if (isEmptyContactName(name)) throw new Error(NO_VISIBLE_NAME)
		const stored = sanitizeContactName(name)
		// Atomic read+capture: the lock wait and id allocation below can span the
		// profile's deletion — without a fence the row lands stamped with the
		// deleted profile, surviving the cascade's earlier snapshot as an orphan.
		const fence = await this.writeFence(runFence)
		const deletion = this.profileService.getDeletionState()

		return await this.lock.withLock(async () => {
			const id = await nextRandomId(this.storage)

			const contact: Contact = {
				id,
				profileId: fence.profileId,
				name: stored,
				address,
				abbr: this._getAbbreviation(stored),
			}

			deletion.assertCurrent(fence.profileId, fence.epoch)
			this.assertStillLive(runFence)
			await this.storage.set(contact.id, contact)
			// The set awaits — compensate the just-written row if the deletion
			// landed during it, before the row becomes observable via the emit.
			if (!deletion.isCurrent(fence.profileId, fence.epoch)) {
				await this.storage.delete(contact.id)
				throw profileDeletedError(fence.profileId)
			}

			this.emit("onContactAdded", contact)

			return contact
		})
	}

	public async updateContact(contactId: string, name?: string, address?: string, fence?: RunFence | null): Promise<Contact> {
		await this.ensureInitialized()
		if (name && isEmptyContactName(name)) throw new Error(NO_VISIBLE_NAME)
		const stored = name ? sanitizeContactName(name) : undefined
		const profileId = await this.actingProfileId(fence)

		return await this.lock.withLock(async () => {
			const contact = requireOwnedRow(await this.storage.get(contactId), profileId, "invalid id")

			const newContact = {
				...contact,
				name: stored ?? contact.name,
				abbr: stored ? this._getAbbreviation(stored) : contact.abbr,
				address: address || contact.address,
			}

			this.assertStillLive(fence)
			await this.storage.set(contactId, newContact)

			this.emit("onContactUpdated", newContact)

			return newContact
		})
	}

	public async deleteContact(contactId: string): Promise<Contact> {
		await this.ensureInitialized()
		const profile = await requireActiveProfile(this.profileService)

		return await this.lock.withLock(async () => {
			const contact = requireOwnedRow(await this.storage.get(contactId), profile.id, "invalid id")

			this.logDebug(`Remove contact #${contact.id}`)
			await this.storage.delete(contactId)

			this.emit("onContactDeleted", contact)

			return contact
		})
	}

	public async exportContacts(): Promise<string> {
		const contacts = await this.getContacts()
		const data = contacts.map((contact) => ({
			name: contact.name,
			address: contact.address,
		}))

		return JSON.stringify(data, null, 2)
	}

	/**
	 * Cascade a profile delete to its contacts.
	 *
	 * Sender registrations are NOT touched here: `NetworkService.onProfileDeleted`
	 * (network/service.ts:617) already iterates the deleted profile's networks
	 * and calls `purgeChain → pxeServiceClient.clearChainState(profileId, chainId)`
	 * which deletes `indexedDB pxe/${profileId}/${chainId}` — wiping the entire
	 * PXE database for that profile + chain, senders included. So senders for
	 * deleted profiles are cleaned up as a side-effect of the chain purge,
	 * not by this listener.
	 */
	/** Awaited profile-scoped purge, called by the deletion coordinator (relocated
	 *  from the removed fire-and-forget `onProfileDeleted` sub). */
	public async purgeForProfile(profileId: string): Promise<void> {
		await this.ensureInitialized()
		this.logDebug(`purgeForProfile ${profileId}: remove related contacts`)
		await this.lock.withLock(async () => {
			const contacts = (await this.storage.getValues()).filter((c) => c.profileId === profileId)
			await purgeRows(
				contacts,
				(contact) => {
					this.logDebug(`Remove contact #${contact.id}`)
					return this.storage.delete(contact.id)
				},
				(contact) => this.emit("onContactDeleted", contact),
			)
			// Raw second pass — a validation-failed row this profile owns is
			// invisible to getValues() and would otherwise survive the purge forever.
			await purgeMalformedRows(
				this.storage,
				(raw) => raw.profileId === profileId,
				(id) => this.logDebug(`purged malformed contact row ${id}`),
			)
		})
	}

	/** The profile a read or update acts for: a run fence's own once proven live, else the active
	 *  one. Asserted before the contact lock, never inside it: the assert takes the profile lock. */
	private async actingProfileId(fence: RunFence | null | undefined): Promise<string> {
		if (fence === undefined || fence === null) return (await requireActiveProfile(this.profileService)).id
		await this.profileService.assertRunFence(fence)
		return fence.profileId
	}

	private async writeFence(fence: RunFence | null | undefined): Promise<ExecutionFence> {
		if (fence === undefined || fence === null) return await this.profileService.captureExecutionFence()
		await this.profileService.assertRunFence(fence)
		return fence
	}

	/** Runs synchronously right before a write starts, so a session that ended while the write
	 *  waited for the lock or its reads stops it; a write already started finishes in its profile. */
	private assertStillLive(fence: RunFence | null | undefined): void {
		if (fence === undefined || fence === null) return
		if (!this.profileService.isFenceLive(fence)) throw new SessionEndedError()
	}

	private _getAbbreviation(name: string): string {
		return getInitials(name)
	}

	public async backup(): Promise<Contact[]> {
		return await this.getContacts()
	}

	public async restore(contacts: Contact[]): Promise<Restored<Contact>[]> {
		await this.ensureInitialized()
		// Deletion fence captured at entry — before the e2e hold gate, the lock,
		// and the collision reads — so a deleteProfile completing during ANY later
		// park (including an injected gate) rejects every subsequent row write
		// instead of landing orphans post-purge.
		const deletion = this.profileService.getDeletionState()
		const epochs = captureRestoreEpochs(deletion, contacts.map(restoreRowProfileId))
		// E2e hold point: "service-restore" parks a PRE-finalize import RPC here
		// (this service restores inside the per-service loop, before
		// finalizeRestore), so a crash test can kill the worker at a known
		// pre-finalize phase. Production resolves immediately.
		await this.restoreGate.waitAt("service-restore")

		return await this.lock.withLock(async () => {
			return await restoreRows(contacts, async (contact) => {
				const id = await preferOrReallocId(this.storage, contact.id)
				// A backup name is untrusted display text, stored as any other name is.
				if (isEmptyContactName(contact.name)) throw new Error(NO_VISIBLE_NAME)
				const name = sanitizeContactName(contact.name)
				const abbr = name === contact.name ? contact.abbr : this._getAbbreviation(name)
				const written = { ...contact, id, name, abbr }
				// Parse the persisted shape so a malformed backup contact is recorded as
				// restoreError, not silently written + codec-hidden on read.
				ContactSchema.parse(written)
				assertRestoreEpoch(deletion, epochs, written.profileId)
				await this.storage.set(id, written)
				return written
			})
		})
	}
}
