// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { Ref } from "vue"
import { useToast } from "@/composables/toast"
import { FileTooLargeError, downloadFile, pickFile } from "@/utils"
import {
	type ImportRow,
	type ReviewedImportRow,
	indexSavedContacts,
	normalizeImportRows,
	planImportWrites,
} from "@/utils/contact-import-rows"
import { MAX_CONTACT_IMPORT_BYTES, parseContactsExport } from "@/utils/contacts-export-format"
import type { AccountStateServiceClient } from "@/wallet/services/account-state/client"
import type { ContactServiceClient } from "@/wallet/services/contact/client"
import { ProfileServiceClient } from "@/wallet/services/profile/client"
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"

interface ContactRecord {
	id: string
	name: string
	address: string
}

export interface UseContactImportExportOptions {
	contacts: Ref<ContactRecord[]>
	contactService: ContactServiceClient
	accountStateService: AccountStateServiceClient
}

/**
 * Encapsulates the contacts page import/export flows: sender-union resolution
 * for export, file pick + parse + per-row upsert + sender restoration for
 * import, and the aggregate user-facing toasts.
 */
export function useContactImportExport(opts: UseContactImportExportOptions) {
	const { contacts, contactService, accountStateService } = opts
	const { openToast } = useToast()
	const deps: ContactIoDeps = {
		contacts,
		contactService,
		accountStateService,
		openToast,
		appStore: useAppStore(),
		cacheStore: useCacheStore(),
		popupStore: usePopupStore(),
	}
	return { exportContacts: () => exportContacts(deps), importContacts: () => importContacts(deps) }
}

interface ContactIoDeps {
	contacts: Ref<ContactRecord[]>
	contactService: ContactServiceClient
	accountStateService: AccountStateServiceClient
	openToast: ReturnType<typeof useToast>["openToast"]
	appStore: ReturnType<typeof useAppStore>
	cacheStore: ReturnType<typeof useCacheStore>
	popupStore: ReturnType<typeof usePopupStore>
}

type SelectedRow = ReviewedImportRow
type UpsertError = { name: string; address: string; operation: string; error: unknown }
interface ImportTally {
	errors: UpsertError[]
	senderTotal: number
	senderOk: number
	senderSkippedNoNetwork: number
}

async function exportContacts(deps: ContactIoDeps): Promise<void> {
	const { contacts, accountStateService, openToast } = deps
	// `downloads` is a required manifest permission (always granted), so no runtime prompt/gesture
	// dance is needed — the download just happens.
	// OR-across-networks sender membership: a contact is exported with
	// `isSender: true` if registered on any active-status network in the
	// active profile. Down networks are silently skipped.
	let senderUnion = new Set<string>()
	try {
		const list = await accountStateService.getSendersAcrossActiveNetworks()
		senderUnion = new Set(list.map((a) => a.toLowerCase()))
	} catch (err) {
		console.warn("Failed to read sender union for export; isSender flags will all be false:", err)
	}

	const exportPayload = {
		version: 2,
		contacts: contacts.value.map((contact) => ({
			name: contact.name,
			address: contact.address,
			// Canonical compare: PXE senders are lowercase; a stored contact
			// may predate canonical-on-save — its registration must still
			// export as isSender:true or a file round-trip drops the flag.
			isSender: senderUnion.has(contact.address.toLowerCase()),
		})),
	}

	let filename = "contacts.json"

	const profileService = new ProfileServiceClient()
	profileService.connect()

	try {
		const profile = await profileService.getActiveProfile()
		if (profile?.name) filename = `${profile.name}_${filename}`

		try {
			await downloadFile({ data: JSON.stringify(exportPayload, null, 2), filename })
			openToast({ kind: "success", label: "Contacts exported successfully" })
		} catch (err) {
			console.error("Export failed:", (err as Error)?.message || err)
			openToast({ kind: "error", label: "Failed to export contacts" })
		}
	} catch (err) {
		console.error(err)
	} finally {
		profileService.disconnect()
	}
}

async function importContacts(deps: ContactIoDeps): Promise<void> {
	const { openToast, cacheStore, popupStore } = deps
	try {
		// The `.json` accept filter is UI guidance, not a boundary — a
		// `.gz`-named pick still auto-decompresses inside pickFile, so the
		// byte cap must ride along there too.
		const file = await pickFile(".json", true, true, MAX_CONTACT_IMPORT_BYTES)
		if (!file) return

		// Byte-level bound BEFORE reading — `raw.length` in the parser counts
		// UTF-16 code units, so a heavily multi-byte file could otherwise
		// exceed the advertised ceiling before the parser sees it.
		if (file.size > MAX_CONTACT_IMPORT_BYTES) {
			openToast({ kind: "error", label: "Contacts file is too large" })
			return
		}

		const data = await file.text()
		const { contacts: rawContacts } = parseContactsExport(data) as { contacts: Array<Record<string, unknown>> }
		const importedContacts = normalizeImportRows(rawContacts)

		if (!importedContacts?.length) {
			openToast({ kind: "error", label: "No contacts found in file" })
			return
		}

		let res: SelectedRow[]
		try {
			res = await openImportSelection(cacheStore, popupStore, importedContacts)
		} catch {
			openToast({ kind: "success", label: "Contact import canceled" })
			return
		}

		if (!res.length) {
			openToast({ kind: "error", label: "No contacts selected for import" })
			return
		}

		const tally = await applyImportRows(deps, res)
		toastImportOutcome(openToast, tally)
	} catch (err) {
		if (err instanceof FileTooLargeError) {
			openToast({ kind: "error", label: "Contacts file is too large" })
			return
		}
		// The message can quote the file (JSON.parse does), and the file holds names and addresses.
		console.error("Error occurred during import", err instanceof Error ? err.name : typeof err)
		openToast({ kind: "error", label: "Error occurred during import" })
	} finally {
		cacheStore.importContacts = []
		cacheStore.importPromise = null
	}
}

/** Stage the rows, create the selection promise, REGISTER its controls on the cache store and open
 *  the popup — one synchronous unit; the caller awaits the returned promise (reject = canceled). */
function openImportSelection(
	cacheStore: ContactIoDeps["cacheStore"],
	popupStore: ContactIoDeps["popupStore"],
	rows: ImportRow[],
): Promise<SelectedRow[]> {
	for (const _c of rows) (cacheStore.importContacts as unknown[]).push(_c)

	const importPromise = new Promise<SelectedRow[]>((resolve, reject) => {
		;(cacheStore as unknown as { importPromise: unknown }).importPromise = { resolve, reject }
	})
	popupStore.open("import_contacts")
	return importPromise
}

/** Upsert every selected row, then register its sender intent. Import is adds-only toward sender
 *  state: rows explicitly carrying `isSender: true` (from a previous deliberate export) get registered
 *  on the active network. It never deletes or migrates registrations — those live in
 *  Settings → Advanced → Senders. */
async function applyImportRows(deps: ContactIoDeps, res: SelectedRow[]): Promise<ImportTally> {
	const { admitted, refused } = planImportWrites(res, indexSavedContacts(deps.contacts.value))

	// Snapshot active network ONCE so a network swap mid-loop can't split
	// sender registrations across chains. Null-safe: if no network is
	// selected, isSender:true rows produce a per-row sender failure.
	const activeNetworkId = deps.appStore.network?.id ?? null

	// A refused row writes nothing and registers no sender.
	const errors = refused.map((row) => ({ name: row.name, address: row.address, operation: "import", error: new Error("row refused") }))
	const tally: ImportTally = { errors, senderTotal: 0, senderOk: 0, senderSkippedNoNetwork: 0 }
	for (const { row, targetId } of admitted) {
		const error = await upsertOneContact(deps.contactService, row, targetId)
		if (error) tally.errors.push(error)

		// Sender registration is INDEPENDENT of the contact upsert's
		// outcome (decoupled state): an explicit isSender intent is
		// attempted — and counted — even when the address-book row
		// failed, so the toast accounting never silently drops it.
		if (row.isSender) await registerSender(deps, tally, activeNetworkId, row.address)
	}
	return tally
}

async function registerSender(deps: ContactIoDeps, tally: ImportTally, activeNetworkId: string | null, address: string): Promise<void> {
	tally.senderTotal++
	if (!activeNetworkId) {
		tally.senderSkippedNoNetwork++
		console.warn("Skipping sender registration: no active network")
		return
	}
	try {
		await deps.accountStateService.addSender(activeNetworkId, address)
		tally.senderOk++
	} catch (err) {
		// The counterparty address is PII and this fires per failed row; the counts below carry
		// the diagnosis.
		console.warn("Failed to register a sender", err)
	}
}

async function upsertOneContact(
	contactService: ContactServiceClient,
	row: SelectedRow,
	targetId: string | null,
): Promise<UpsertError | null> {
	const name = row.name.trim()
	try {
		if (targetId) await contactService.updateContact(targetId, name, row.address)
		else await contactService.addContact(name, row.address)
		return null
	} catch (err) {
		return { name, address: row.address, operation: targetId ? "update" : "create", error: err }
	}
}

function toastImportOutcome(openToast: ContactIoDeps["openToast"], tally: ImportTally): void {
	const { errors, senderTotal, senderOk, senderSkippedNoNetwork } = tally
	if (errors.length) {
		for (const e of errors) {
			// The contact's name and address are PII; the operation and the error are the
			// diagnosis, and the toast below already tells the user the import had failures.
			console.error(`Failed to ${e.operation} a contact`, e.error)
		}
		openToast({ kind: "error", label: "Import ended with errors" })
	} else if (senderTotal > 0 && senderOk < senderTotal) {
		// "Skipped" ≠ "failed": the no-network case was announced as a
		// skip by the import banner — the toast must say the same thing.
		const allSkipped = senderSkippedNoNetwork === senderTotal - senderOk && senderOk === 0
		const detail = allSkipped
			? "sender registrations skipped (no active network)"
			: senderOk === 0
				? "sender registration failed"
				: `${senderOk} of ${senderTotal} senders registered`
		openToast({ kind: "error", label: `Contacts imported · ${detail}` })
	} else if (senderTotal > 0) {
		openToast({ kind: "success", label: `Contacts imported · ${senderOk} ${senderOk === 1 ? "sender" : "senders"} registered` })
	} else {
		openToast({ kind: "success", label: "Import completed successfully" })
	}
}
