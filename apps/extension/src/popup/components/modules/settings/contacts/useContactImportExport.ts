// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { Ref } from "vue"
import { useToast } from "@/composables/toast"
import { FilePickCanceledError, FileTooLargeError, downloadFile, pickFile } from "@/utils"
import {
	type ImportRow,
	type ImportWrite,
	type ReviewedImportRow,
	type SavedContactIndex,
	indexSavedContacts,
	normalizeImportRows,
	planImportWrites,
	stillAsShown,
} from "@/utils/contact-import-rows"
import { MAX_CONTACT_IMPORT_BYTES, parseContactsExport } from "@/utils/contacts-export-format"
import type { AccountStateServiceClient } from "@/wallet/services/account-state/client"
import type { ContactServiceClient } from "@/wallet/services/contact/client"
import { ProfileServiceClient } from "@/wallet/services/profile/client"
import type { RunFence } from "@/wallet/services/profile/spec"
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
	const deps: ContactIoServices = {
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

interface ContactIoServices {
	contacts: Ref<ContactRecord[]>
	contactService: ContactServiceClient
	accountStateService: AccountStateServiceClient
	openToast: ReturnType<typeof useToast>["openToast"]
	appStore: ReturnType<typeof useAppStore>
	cacheStore: ReturnType<typeof useCacheStore>
	popupStore: ReturnType<typeof usePopupStore>
}

/** The session an import's rows were shown in, and the client that asks whether it still holds. */
interface ImportRun {
	fence: RunFence
	profileService: ProfileServiceClient
}

/** One import's dependencies: every contact call it makes carries the run's fence. */
type ContactIoDeps = ContactIoServices & { run: ImportRun }

type SelectedRow = ReviewedImportRow
type UpsertError = { name: string; address: string; operation: string; error: unknown }
interface ImportTally {
	errors: UpsertError[]
	/** Writes the wallet confirmed. */
	written: number
	/** The run's session ended, or could not be confirmed, before its last row was written. */
	stopped: boolean
	senderTotal: number
	senderOk: number
	senderSkippedNoNetwork: number
}

const STOPPED = Symbol("import stopped")

async function exportContacts(deps: ContactIoServices): Promise<void> {
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

async function importContacts(deps: ContactIoServices): Promise<void> {
	const { openToast, cacheStore, popupStore } = deps
	const profileService = new ProfileServiceClient()
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

		// Captured before the rows are shown, so the import writes to the session they were reviewed in.
		profileService.connect()
		const run: ImportRun = { fence: await profileService.captureRunFence(), profileService }

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

		const tally = await applyImportRows({ ...deps, run }, res)
		if (tally.stopped) toastStoppedImport(openToast, tally, res.length)
		else toastImportOutcome(openToast, tally)
	} catch (err) {
		if (err instanceof FilePickCanceledError) return
		if (err instanceof FileTooLargeError) {
			openToast({ kind: "error", label: "Contacts file is too large" })
			return
		}
		// The message can quote the file (JSON.parse does), and the file holds names and addresses.
		console.error("Error occurred during import", err instanceof Error ? err.name : typeof err)
		openToast({ kind: "error", label: "Error occurred during import" })
	} finally {
		profileService.disconnect()
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
 *  Settings → Developer → Account State → Senders. */
async function applyImportRows(deps: ContactIoDeps, res: SelectedRow[]): Promise<ImportTally> {
	// Snapshot active network ONCE, before the first await, so it is the network the confirmed banner
	// named and a swap mid-loop can't split sender registrations across chains. Null-safe: if no
	// network is selected, isSender:true rows produce a per-row sender failure.
	const activeNetworkId = deps.appStore.network?.id ?? null

	// The book is read from the service each time, never from the page's list: that copy refreshes
	// asynchronously and keeps its last state when a refresh fails. A failed read aborts the import.
	const book = () => fenced(deps.run, async () => indexSavedContacts(await deps.contactService.getContacts(deps.run.fence)))
	const tally: ImportTally = { errors: [], written: 0, stopped: false, senderTotal: 0, senderOk: 0, senderSkippedNoNetwork: 0 }
	const saved = await book()
	if (saved === STOPPED) return { ...tally, stopped: true }
	const { admitted, refused } = planImportWrites(res, saved)

	// A refused row writes nothing and registers no sender.
	tally.errors = refused.map(refusal)
	const pass: ImportPass = { deps, tally, book, activeNetworkId }
	for (const write of admitted) {
		tally.stopped = (await importRow(pass, write)) === STOPPED
		if (tally.stopped) break
	}
	return tally
}

interface ImportPass {
	deps: ContactIoDeps
	tally: ImportTally
	book: () => Promise<SavedContactIndex | typeof STOPPED>
	activeNetworkId: string | null
}

async function importRow(pass: ImportPass, { row, targetId }: ImportWrite<SelectedRow>): Promise<typeof STOPPED | undefined> {
	const { deps, tally } = pass
	// The book can change while earlier rows are written (another window), so each row is checked
	// again just before its own write.
	const saved = await pass.book()
	if (saved === STOPPED) return STOPPED
	if (!stillAsShown(row, saved)) {
		tally.errors.push(refusal(row))
		return
	}
	const error = await upsertOneContact(deps, row, targetId)
	if (error === STOPPED) return STOPPED
	if (error) tally.errors.push(error)
	else tally.written++

	// Sender intent is independent of the upsert: it is attempted and counted even when the write failed.
	if (row.isSender) await registerSender(deps, tally, pass.activeNetworkId, row.address)
}

/** A fenced call that rejects asks the fence: a session the wallet no longer confirms, ended or
 *  unreachable, stops the run; a live one hands the rejection back. */
async function fenced<T>(run: ImportRun, call: () => Promise<T>): Promise<T | typeof STOPPED> {
	try {
		return await call()
	} catch (err) {
		const ended = await run.profileService.assertRunFence(run.fence).then(
			() => false,
			() => true,
		)
		if (ended) return STOPPED
		throw err
	}
}

function refusal(row: SelectedRow): UpsertError {
	return { name: row.name, address: row.address, operation: "import", error: new Error("row refused") }
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
	{ contactService, run }: ContactIoDeps,
	row: SelectedRow,
	targetId: string | null,
): Promise<UpsertError | typeof STOPPED | null> {
	const name = row.name.trim()
	const write = targetId
		? () => contactService.updateContact(targetId, name, row.address, run.fence)
		: () => contactService.addContact(name, row.address, run.fence)
	try {
		return (await fenced(run, write)) === STOPPED ? STOPPED : null
	} catch (err) {
		return { name, address: row.address, operation: targetId ? "update" : "create", error: err }
	}
}

function logImportErrors(errors: UpsertError[]): void {
	for (const e of errors) {
		// The contact's name and address are PII; the operation and the error are the
		// diagnosis, and the toast already tells the user the import had failures.
		console.error(`Failed to ${e.operation} a contact`, e.error)
	}
}

/** `written` counts confirmed writes, so a write whose reply the stop cut off may be saved uncounted.
 *  `selected` counts every row the person chose, refused ones included. */
function toastStoppedImport(openToast: ContactIoDeps["openToast"], tally: ImportTally, selected: number): void {
	logImportErrors(tally.errors)
	const noun = selected === 1 ? "contact" : "contacts"
	openToast({ kind: "error", label: `Import incomplete · ${tally.written} of ${selected} ${noun} written` })
}

function toastImportOutcome(openToast: ContactIoDeps["openToast"], tally: ImportTally): void {
	const { errors, senderTotal, senderOk, senderSkippedNoNetwork } = tally
	if (errors.length) {
		logImportErrors(errors)
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
