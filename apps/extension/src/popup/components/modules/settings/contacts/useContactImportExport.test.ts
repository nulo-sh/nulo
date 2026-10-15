/**
 * Unit tests for the contacts import/export composable, pinning the
 * decoupled sender semantics: import is ADDS-ONLY toward sender state
 * (explicit `isSender: true` rows, active network only, counted) and
 * never deletes or migrates a registration — including the merge-by-name
 * address-swap path that used to unregister the old address.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { reactive, ref } from "vue"
import { held as deferred } from "../../../../../../tests/helpers/held-read"

// ── Mocks ────────────────────────────────────────────────────────────

const openToastMock = vi.fn()
const updateToastMock = vi.fn()
const pickFileMock = vi.fn()
const popupOpenMock = vi.fn()

const appStoreState: {
	network: { id: string; name: string } | null
	beginContactImport: () => () => void
	contactImports: ReadonlySet<symbol>
} = {
	network: { id: "net-1", name: "Testnet" },
	beginContactImport: () => () => {},
	contactImports: new Set(),
}
// Reactive, as the Pinia store is: what it holds reads back as a proxy.
const cacheStoreState: {
	importContacts: unknown[]
	importPromise: { resolve: (rows: unknown[]) => void; reject: (v: unknown) => void } | null
} = reactive({
	importContacts: [],
	importPromise: null,
})

// The run fence the profile service hands the import; every contact call of the run must carry it.
const RUN_FENCE = vi.hoisted(() => ({ profileId: "p1", epoch: 0, session: 1, incarnation: "w1" }))
// The clients the import opens for itself; `makeServices` hands it the fakes it builds.
const importClients = vi.hoisted(() => ({ contact: {} as object, accountState: {} as object }))
vi.mock("@/composables/toast", () => ({
	useToast: () => ({ openToast: openToastMock, updateToast: updateToastMock }),
}))
vi.mock("@/utils", () => ({
	FilePickCanceledError: class FilePickCanceledError extends Error {},
	FileTooLargeError: class FileTooLargeError extends Error {},
	downloadFile: vi.fn(),
	pickFile: (...args: unknown[]) => pickFileMock(...args),
}))
vi.mock("@/wallet/services/profile/client", () => ({
	ProfileServiceClient: vi.fn(function () {
		return {
			connect: vi.fn(),
			disconnect: vi.fn(),
			getActiveProfile: vi.fn().mockResolvedValue({ name: "p" }),
			captureRunFence: vi.fn().mockResolvedValue(RUN_FENCE),
			assertRunFence: vi.fn().mockResolvedValue(undefined),
		}
	}),
}))
vi.mock("@/wallet/services/contact/client", () => ({
	ContactServiceClient: vi.fn(function () {
		return importClients.contact
	}),
}))
vi.mock("@/wallet/services/account-state/client", () => ({
	AccountStateServiceClient: vi.fn(function () {
		return importClients.accountState
	}),
}))
vi.mock("@/stores/app.store", () => ({ useAppStore: () => appStoreState }))
vi.mock("@/stores/cache.store", () => ({ useCacheStore: () => cacheStoreState }))
vi.mock("@/stores/popup.store", () => ({ usePopupStore: () => ({ open: popupOpenMock }) }))

import { createContactImportGuard } from "@/stores/contact-import-guard"
import { classifyImportRow, indexSavedContacts } from "@/utils/contact-import-rows"
import { useContactImportExport } from "./useContactImportExport"

/** The rows as the selection popup hands them back: each carries the decision it was shown with. */
function reviewed(rows: unknown[], saved: Array<{ id: string; name: string; address: string }> = []) {
	const index = indexSavedContacts(saved)
	return (rows as Array<{ name: string; address: string }>).map((r) => ({ ...r, ...classifyImportRow(r, index) }))
}

// ── Helpers ──────────────────────────────────────────────────────────

function clientFakes() {
	const contactService = {
		getContacts: vi.fn().mockResolvedValue([]),
		addContact: vi.fn().mockResolvedValue(undefined),
		updateContact: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn(),
	}
	const accountStateService = {
		addSender: vi.fn().mockResolvedValue(undefined),
		deleteSender: vi.fn().mockResolvedValue(undefined),
		getSenders: vi.fn().mockResolvedValue([]),
		getSendersAcrossActiveNetworks: vi.fn().mockResolvedValue([]),
		disconnect: vi.fn(),
	}
	return { contactService, accountStateService }
}

/** The import's own clients, which the tests below also hand the page so one set of fakes sees every call. */
function makeServices() {
	const services = clientFakes()
	importClients.contact = services.contactService
	importClients.accountState = services.accountStateService
	return services
}

function fileWith(payload: unknown) {
	const raw = JSON.stringify(payload)
	pickFileMock.mockResolvedValueOnce({ size: raw.length, text: async () => raw })
}

/** Drives importContacts() to its selection gate, then confirms ALL
 *  staged rows (what the popup's confirm does for a select-all user). */
async function runImport(api: ReturnType<typeof useContactImportExport>, saved: Array<{ id: string; name: string; address: string }> = []) {
	const done = api.importContacts()
	await vi.waitFor(() => {
		if (!cacheStoreState.importPromise) throw new Error("selection gate not reached")
	})
	cacheStoreState.importPromise?.resolve(reviewed(cacheStoreState.importContacts, saved))
	await done
}

// Wire-shaped: 0x + 64 hex, valid Aztec addresses.
const ADDR_A = "0x01904dba18e847d163097ce15dcd8597e763fb11fe19ef1273d266d6e959ec4a"
const ADDR_B = "0x047bb28204a2545c566dff691c298d2023fe7cad44bb6468e3f7f1e633f8f7d2"

beforeEach(() => {
	vi.clearAllMocks()
	appStoreState.network = { id: "net-1", name: "Testnet" }
	appStoreState.beginContactImport = () => () => {}
	appStoreState.contactImports = new Set()
	cacheStoreState.importContacts = []
	cacheStoreState.importPromise = null
})
afterEach(() => {
	vi.restoreAllMocks()
})

describe("useContactImportExport — import sender semantics (adds-only)", () => {
	test("isSender:true rows register on the ACTIVE network, counted in the toast", async () => {
		const { contactService, accountStateService } = makeServices()
		const api = useContactImportExport({ contacts: ref([]), accountStateService } as never)
		fileWith({
			version: 2,
			contacts: [
				{ name: "A", address: ADDR_A, isSender: true },
				{ name: "B", address: ADDR_B, isSender: false },
			],
		})

		await runImport(api)

		expect(contactService.addContact).toHaveBeenCalledTimes(2)
		expect(accountStateService.addSender).toHaveBeenCalledTimes(1)
		expect(accountStateService.addSender).toHaveBeenCalledWith("net-1", ADDR_A, RUN_FENCE)
		expect(accountStateService.deleteSender).not.toHaveBeenCalled()
		expect(openToastMock).toHaveBeenCalledWith({ kind: "success", label: "Contacts imported · 1 sender registered" })
	})

	test("merge-by-name address swap NEVER unregisters the old address (adds-only pin)", async () => {
		const { contactService, accountStateService } = makeServices()
		// The old address IS a registered sender — the removed migration used
		// to delete it here even for isSender:false rows.
		accountStateService.getSenders.mockResolvedValue([ADDR_A])
		const existing = ref([{ id: "c1", name: "Alice", address: ADDR_A }])
		contactService.getContacts.mockResolvedValue(existing.value)
		const api = useContactImportExport({ contacts: existing, accountStateService } as never)
		fileWith({ version: 2, contacts: [{ name: "Alice", address: ADDR_B, isSender: false }] })

		await runImport(api, existing.value)

		expect(contactService.updateContact).toHaveBeenCalledWith("c1", "Alice", ADDR_B, RUN_FENCE)
		expect(accountStateService.deleteSender).not.toHaveBeenCalled()
		expect(accountStateService.addSender).not.toHaveBeenCalled()
	})

	test("no active network: contact rows land, sender registration is skipped and surfaced", async () => {
		const { contactService, accountStateService } = makeServices()
		appStoreState.network = null
		const api = useContactImportExport({ contacts: ref([]), accountStateService } as never)
		fileWith({ version: 2, contacts: [{ name: "A", address: ADDR_A, isSender: true }] })

		await runImport(api)

		expect(contactService.addContact).toHaveBeenCalledTimes(1)
		expect(accountStateService.addSender).not.toHaveBeenCalled()
		// "Skipped", not "failed" — matches the popup banner's promise.
		expect(openToastMock).toHaveBeenCalledWith({
			kind: "error",
			label: "Contacts imported · sender registrations skipped (no active network)",
		})
	})

	test("duplicate addresses in the file are deduped (first row wins) before any service call", async () => {
		const { contactService, accountStateService } = makeServices()
		const api = useContactImportExport({ contacts: ref([]), accountStateService } as never)
		fileWith({
			version: 2,
			contacts: [
				{ name: "First", address: ADDR_A, isSender: true },
				{ name: "Second", address: ADDR_A, isSender: true },
			],
		})

		await runImport(api)

		expect(contactService.addContact).toHaveBeenCalledTimes(1)
		expect(contactService.addContact).toHaveBeenCalledWith("First", ADDR_A, RUN_FENCE)
		expect(accountStateService.addSender).toHaveBeenCalledTimes(1)
	})

	test("mixed-case duplicates canonicalize to one lowercase row (hex is case-insensitive)", async () => {
		const { contactService, accountStateService } = makeServices()
		const api = useContactImportExport({ contacts: ref([]), accountStateService } as never)
		fileWith({
			version: 2,
			contacts: [
				{ name: "Lower", address: ADDR_A, isSender: true },
				{ name: "Upper", address: ADDR_A.toUpperCase().replace("0X", "0x"), isSender: true },
			],
		})

		await runImport(api)

		expect(contactService.addContact).toHaveBeenCalledTimes(1)
		expect(contactService.addContact).toHaveBeenCalledWith("Lower", ADDR_A, RUN_FENCE)
		expect(accountStateService.addSender).toHaveBeenCalledTimes(1)
		expect(accountStateService.addSender).toHaveBeenCalledWith("net-1", ADDR_A, RUN_FENCE)
	})

	test("hostile extra properties are stripped at the boundary (minimal rows only)", async () => {
		const { accountStateService } = makeServices()
		const api = useContactImportExport({ contacts: ref([]), accountStateService } as never)
		fileWith({
			version: 2,
			contacts: [{ name: "A", address: ADDR_A, isSender: false, __proto__pollution: "x", selected: true, idx: 99 }],
		})

		const done = api.importContacts()
		await vi.waitFor(() => {
			if (!cacheStoreState.importPromise) throw new Error("selection gate not reached")
		})
		// Snapshot BEFORE resolving — the composable clears the staging
		// array once the import completes.
		const staged = { ...(cacheStoreState.importContacts[0] as Record<string, unknown>) }
		cacheStoreState.importPromise?.resolve([...(cacheStoreState.importContacts as never[])])
		await done

		expect(Object.keys(staged).sort()).toEqual(["address", "isSender", "name"])
	})

	test("a mixed-case existing contact MERGES with its lowercase import (no duplicate)", async () => {
		const { contactService, accountStateService } = makeServices()
		const existing = ref([{ id: "c1", name: "Alice", address: ADDR_A.toUpperCase().replace("0X", "0x") }])
		contactService.getContacts.mockResolvedValue(existing.value)
		const api = useContactImportExport({ contacts: existing, accountStateService } as never)
		fileWith({ version: 2, contacts: [{ name: "Alice2", address: ADDR_A, isSender: false }] })

		await runImport(api, existing.value)

		expect(contactService.addContact).not.toHaveBeenCalled()
		expect(contactService.updateContact).toHaveBeenCalledWith("c1", "Alice2", ADDR_A, RUN_FENCE)
	})

	test("a malformed row (non-string fields) is dropped without aborting the import", async () => {
		const { contactService, accountStateService } = makeServices()
		const api = useContactImportExport({ contacts: ref([]), accountStateService } as never)
		fileWith({
			version: 2,
			contacts: [null, { name: 42, address: { evil: true } }, { name: "   ", address: ADDR_B }, { name: "Good", address: ADDR_A }],
		})

		await runImport(api)

		expect(contactService.addContact).toHaveBeenCalledTimes(1)
		expect(contactService.addContact).toHaveBeenCalledWith("Good", ADDR_A, RUN_FENCE)
	})

	test("a contact that fails after its sender registered is reported, with the sender counted", async () => {
		const { contactService, accountStateService } = makeServices()
		contactService.addContact.mockRejectedValueOnce(new Error("storage down"))
		const api = useContactImportExport({ contacts: ref([]), accountStateService } as never)
		fileWith({ version: 2, contacts: [{ name: "A", address: ADDR_A, isSender: true }] })

		await runImport(api)

		expect(accountStateService.addSender).toHaveBeenCalledWith("net-1", ADDR_A, RUN_FENCE)
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Import ended with errors" })
	})

	test("an oversized file is rejected by byte size before it is read", async () => {
		const { contactService, accountStateService } = makeServices()
		const api = useContactImportExport({ contacts: ref([]), accountStateService } as never)
		pickFileMock.mockResolvedValueOnce({
			size: 2_000_000,
			text: async () => {
				throw new Error("text() must not be called on an oversized file")
			},
		})

		await api.importContacts()

		expect(contactService.addContact).not.toHaveBeenCalled()
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Contacts file is too large" })
	})

	test("a sender-free import toasts plain success", async () => {
		const { contactService, accountStateService } = makeServices()
		const api = useContactImportExport({ contacts: ref([]), accountStateService } as never)
		fileWith([{ name: "A", address: ADDR_A }])

		await runImport(api)

		expect(contactService.addContact).toHaveBeenCalledTimes(1)
		expect(accountStateService.addSender).not.toHaveBeenCalled()
		expect(openToastMock).toHaveBeenCalledWith({ kind: "success", label: "Import completed successfully" })
	})
})

describe("useContactImportExport — export", () => {
	test("a mixed-case stored contact still exports isSender:true (canonical union compare)", async () => {
		const { accountStateService } = makeServices()
		accountStateService.getSendersAcrossActiveNetworks.mockResolvedValue([ADDR_A])
		const { downloadFile } = await import("@/utils")
		const mixedCase = ADDR_A.toUpperCase().replace("0X", "0x")
		const api = useContactImportExport({
			contacts: ref([{ id: "c1", name: "Legacy", address: mixedCase }]),
			accountStateService,
		} as never)

		await api.exportContacts()

		const payload = JSON.parse((vi.mocked(downloadFile).mock.calls.at(-1) as [{ data: string }])[0].data)
		expect(payload.contacts[0]).toEqual({ name: "Legacy", address: mixedCase, isSender: true })
	})

	test("names the file after the active profile, and a download that fails says so instead of reporting success", async () => {
		const { accountStateService } = makeServices()
		accountStateService.getSendersAcrossActiveNetworks.mockResolvedValue([])
		const { downloadFile } = await import("@/utils")
		const api = useContactImportExport({
			contacts: ref([{ id: "c1", name: "A", address: ADDR_A }]),
			accountStateService,
		} as never)

		await api.exportContacts()
		expect(vi.mocked(downloadFile).mock.calls.at(-1)?.[0]).toMatchObject({ filename: "p_contacts.json" })
		expect(openToastMock).toHaveBeenLastCalledWith({ kind: "success", label: "Contacts exported successfully" })

		openToastMock.mockClear()
		const canceled = new Error("Download canceled by the user")
		vi.mocked(downloadFile).mockRejectedValueOnce(canceled)
		const logged = vi.spyOn(console, "error").mockImplementation(() => {})
		try {
			await api.exportContacts()
			expect(logged.mock.calls).toEqual([["Export failed:", { error: canceled }]])
		} finally {
			logged.mockRestore()
		}
		expect(openToastMock.mock.calls).toEqual([[{ kind: "error", label: "Failed to export contacts" }]])
	})

	test("isSender flags come from the cross-network sender union", async () => {
		const { accountStateService } = makeServices()
		accountStateService.getSendersAcrossActiveNetworks.mockResolvedValue([ADDR_A])
		const { downloadFile } = await import("@/utils")
		const contacts = ref([
			{ id: "c1", name: "A", address: ADDR_A },
			{ id: "c2", name: "B", address: ADDR_B },
		])
		const api = useContactImportExport({ contacts, accountStateService } as never)

		await api.exportContacts()

		const payload = JSON.parse((vi.mocked(downloadFile).mock.calls[0][0] as { data: string }).data)
		expect(payload.version).toBe(2)
		expect(payload.contacts).toEqual([
			{ name: "A", address: ADDR_A, isSender: true },
			{ name: "B", address: ADDR_B, isSender: false },
		])
	})
})

describe("useContactImportExport — apply refuses what no row on screen promised", () => {
	const ADDR_C = "0x02056523b85ea4e550facca78516f7270f18bddb0f5474177d406f6bf0e58617"

	/** Stages a file, then confirms the given rows, as the popup would after the user's choices. */
	async function confirmRows(
		api: ReturnType<typeof useContactImportExport>,
		pick: (staged: Array<Record<string, unknown>>) => unknown[],
	) {
		const done = api.importContacts()
		await vi.waitFor(() => {
			if (!cacheStoreState.importPromise) throw new Error("selection gate not reached")
		})
		cacheStoreState.importPromise?.resolve(reviewed(pick(cacheStoreState.importContacts as Array<Record<string, unknown>>)))
		await done
	}

	test("a row matching one saved contact's name and another's address writes nothing", async () => {
		const { contactService, accountStateService } = makeServices()
		const contacts = ref([
			{ id: "c1", name: "Alice", address: ADDR_A },
			{ id: "c2", name: "Bob", address: ADDR_B },
		])
		contactService.getContacts.mockResolvedValue(contacts.value)
		const api = useContactImportExport({ contacts, accountStateService } as never)
		fileWith({ version: 2, contacts: [{ name: "Alice", address: ADDR_B, isSender: true }] })

		await runImport(api, contacts.value)

		expect(contactService.updateContact).not.toHaveBeenCalled()
		expect(contactService.addContact).not.toHaveBeenCalled()
		expect(accountStateService.addSender).not.toHaveBeenCalled()
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Import ended with errors" })
	})

	test("two rows reaching one saved contact from two sides: only the first is written", async () => {
		const { contactService, accountStateService } = makeServices()
		const contacts = ref([{ id: "c1", name: "Alice", address: ADDR_A }])
		contactService.getContacts.mockResolvedValue(contacts.value)
		const api = useContactImportExport({ contacts, accountStateService } as never)
		fileWith({
			version: 2,
			contacts: [
				{ name: "Alice", address: ADDR_B },
				{ name: "Carol", address: ADDR_A },
			],
		})

		await runImport(api, contacts.value)

		expect(contactService.updateContact).toHaveBeenCalledTimes(1)
		expect(contactService.updateContact).toHaveBeenCalledWith("c1", "Alice", ADDR_B, RUN_FENCE)
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Import ended with errors" })
	})

	test("a row whose saved contact changes while earlier rows are written is refused, sender included", async () => {
		const { contactService, accountStateService } = makeServices()
		// The page's list stays as it was: the import must read the book from the service.
		const contacts = ref([{ id: "c2", name: "Bob", address: ADDR_B }])
		let book = contacts.value
		contactService.getContacts.mockImplementation(async () => book)
		let release = () => {}
		contactService.addContact.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
		const api = useContactImportExport({ contacts, accountStateService } as never)
		fileWith({
			version: 2,
			contacts: [
				{ name: "Dana", address: ADDR_A },
				{ name: "Carol", address: ADDR_B, isSender: true },
			],
		})

		const done = api.importContacts()
		await vi.waitFor(() => {
			if (!cacheStoreState.importPromise) throw new Error("selection gate not reached")
		})
		cacheStoreState.importPromise?.resolve(reviewed(cacheStoreState.importContacts, contacts.value))
		await vi.waitFor(() => expect(contactService.addContact).toHaveBeenCalled())
		book = [{ id: "c2", name: "Bob", address: ADDR_C }]
		release()
		await done

		expect(contactService.updateContact).not.toHaveBeenCalled()
		expect(accountStateService.addSender).not.toHaveBeenCalled()
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Import ended with errors" })
	})

	test("senders register on the network active at confirmation, even if it changes while the book is read", async () => {
		const { contactService, accountStateService } = makeServices()
		let release = (_: unknown[]) => {}
		contactService.getContacts.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
		const api = useContactImportExport({ contacts: ref([]), accountStateService } as never)
		fileWith({ version: 2, contacts: [{ name: "Dana", address: ADDR_A, isSender: true }] })

		const done = api.importContacts()
		await vi.waitFor(() => {
			if (!cacheStoreState.importPromise) throw new Error("selection gate not reached")
		})
		cacheStoreState.importPromise?.resolve(reviewed(cacheStoreState.importContacts))
		await vi.waitFor(() => expect(contactService.getContacts).toHaveBeenCalledWith(RUN_FENCE))
		appStoreState.network = { id: "net-2", name: "Mainnet" }
		release([])
		await done

		expect(accountStateService.addSender).toHaveBeenCalledWith("net-1", ADDR_A, RUN_FENCE)
	})

	test("a book that cannot be read writes nothing", async () => {
		const { contactService, accountStateService } = makeServices()
		contactService.getContacts.mockRejectedValue(new Error("port closed"))
		const api = useContactImportExport({ contacts: ref([]), accountStateService } as never)
		fileWith({ version: 2, contacts: [{ name: "Dana", address: ADDR_A, isSender: true }] })

		await runImport(api)

		expect(contactService.addContact).not.toHaveBeenCalled()
		expect(accountStateService.addSender).not.toHaveBeenCalled()
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Error occurred during import" })
	})

	test("an edit that makes two new rows share a name or an address adds only the first", async () => {
		const { contactService, accountStateService } = makeServices()
		const api = useContactImportExport({ contacts: ref([]), accountStateService } as never)
		fileWith({
			version: 2,
			contacts: [
				{ name: "Dana", address: ADDR_A },
				{ name: "Eli", address: ADDR_B },
				{ name: "Finn", address: ADDR_C },
			],
		})

		await confirmRows(api, ([dana, eli, finn]) => [dana, { ...eli, name: "Dana" }, { ...finn, address: ADDR_A }])

		expect(contactService.addContact).toHaveBeenCalledTimes(1)
		expect(contactService.addContact).toHaveBeenCalledWith("Dana", ADDR_A, RUN_FENCE)
		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Import ended with errors" })
	})
})

describe("useContactImportExport — the progress snack", () => {
	const SNACK_ID = 41
	const labels = () => openToastMock.mock.calls.map((c) => (c[0] as { label: string }).label)
	const updates = () => updateToastMock.mock.calls.map((c) => c as [number, string])

	test("opens at 0 of the selected rows before the first row, counts each confirmed write, and the result opens after it", async () => {
		const { contactService, accountStateService } = makeServices()
		const order: string[] = []
		let nextId = SNACK_ID - 1
		contactService.addContact.mockImplementation(async (name: string) => {
			order.push(`write ${name}`)
			// The second row's write fails: a row the wallet did not confirm moves nothing.
			if (name === "Eve") throw new Error("disk full")
		})
		openToastMock.mockImplementation((toast: { label: string }) => {
			order.push(toast.label)
			return ++nextId
		})
		updateToastMock.mockImplementation((_id: number, label: string) => order.push(label))
		fileWith({
			version: 2,
			contacts: [
				{ name: "Dana", address: ADDR_A },
				{ name: "Eve", address: ADDR_B },
			],
		})

		await runImport(useContactImportExport({ contacts: ref([]), accountStateService } as never))

		expect(order).toEqual([
			"Importing contacts · 0 of 2",
			"write Dana",
			"Importing contacts · 1 of 2",
			"write Eve",
			"Import ended with errors",
		])
		expect(updates().map(([id]) => id)).toEqual([SNACK_ID])
	})

	test("a stop's incomplete toast reads the count the line last showed", async () => {
		const { contactService, accountStateService } = makeServices()
		const sessionEnds = vi.fn().mockResolvedValue(undefined)
		contactService.addContact.mockResolvedValueOnce(undefined).mockImplementationOnce(async () => {
			sessionEnds.mockRejectedValue(new Error("session ended"))
			throw new Error("port closed")
		})
		const { ProfileServiceClient } = await import("@/wallet/services/profile/client")
		vi.mocked(ProfileServiceClient).mockImplementationOnce(function () {
			return {
				connect: vi.fn(),
				disconnect: vi.fn(),
				captureRunFence: vi.fn().mockResolvedValue(RUN_FENCE),
				assertRunFence: sessionEnds,
			} as never
		})
		fileWith({
			version: 2,
			contacts: [
				{ name: "Dana", address: ADDR_A },
				{ name: "Eve", address: ADDR_B },
			],
		})

		await runImport(useContactImportExport({ contacts: ref([]), accountStateService } as never))

		expect(updates().map(([, label]) => label)).toEqual(["Importing contacts · 1 of 2"])
		expect(labels().at(-1)).toBe("Import incomplete · 1 of 2 contacts written")
	})
})

describe("useContactImportExport — the running import holds Lock and owns its connections", () => {
	let guard: ReturnType<typeof createContactImportGuard>
	beforeEach(() => {
		guard = createContactImportGuard()
		appStoreState.beginContactImport = guard.beginContactImport
		appStoreState.contactImports = guard.contactImports.value
	})
	const held = () => ({ running: guard.contactImports.value.size, holds: guard.lockHeldByImport.value })

	test("Lock is held from the progress snack through the rows to the result toast, and released after it", async () => {
		const { contactService, accountStateService } = makeServices()
		const seen: Array<{ at: string; running: number; holds: boolean }> = []
		contactService.addContact.mockImplementation(async () => {
			seen.push({ at: "row", ...held() })
		})
		openToastMock.mockImplementation((toast: { label: string }) => seen.push({ at: toast.label, ...held() }))
		fileWith({ version: 2, contacts: [{ name: "Dana", address: ADDR_A }] })

		await runImport(useContactImportExport({ contacts: ref([]), accountStateService } as never))

		expect(seen).toEqual([
			{ at: "Importing contacts · 0 of 1", running: 1, holds: true },
			{ at: "row", running: 1, holds: true },
			{ at: "Import completed successfully", running: 1, holds: true },
		])
		expect(held()).toEqual({ running: 0, holds: false })
	})

	const gate = () =>
		vi.waitFor(() => {
			if (!cacheStoreState.importPromise) throw new Error("selection gate not reached")
		})
	const staged = () => (cacheStoreState.importContacts as Array<{ name: string }>).map((row) => row.name)
	const written = (contactService: { addContact: { mock: { calls: unknown[][] } } }) =>
		contactService.addContact.mock.calls.map((call) => call[1])
	/** The next import's profile client, with its fence calls replaced. */
	async function nextProfileClient(fence: { captureRunFence?: () => Promise<unknown>; assertRunFence?: () => Promise<unknown> }) {
		const { ProfileServiceClient } = await import("@/wallet/services/profile/client")
		const client = {
			connect: vi.fn(),
			disconnect: vi.fn(),
			captureRunFence: vi.fn(fence.captureRunFence ?? (async () => RUN_FENCE)),
			assertRunFence: vi.fn(fence.assertRunFence ?? (async () => undefined)),
		}
		vi.mocked(ProfileServiceClient).mockImplementationOnce(function () {
			return client as never
		})
		return client
	}

	test("while an import writes, a second import opens no picker and stages nothing; once it ends, the next one opens the picker", async () => {
		const { contactService, accountStateService } = makeServices()
		const write = deferred<void>()
		contactService.addContact.mockImplementationOnce(() => write.promise)
		fileWith({ version: 2, contacts: [{ name: "Dana", address: ADDR_A }] })
		const api = useContactImportExport({ contacts: ref([]), accountStateService } as never)

		const first = api.importContacts()
		await gate()
		cacheStoreState.importPromise?.resolve(reviewed(cacheStoreState.importContacts))
		await vi.waitFor(() => expect(contactService.addContact).toHaveBeenCalled())
		await api.importContacts()
		expect(pickFileMock).toHaveBeenCalledTimes(1)
		expect(popupOpenMock).toHaveBeenCalledTimes(1)
		expect(cacheStoreState.importPromise).toBeNull()

		write.resolve()
		await first
		expect(openToastMock).toHaveBeenLastCalledWith({ kind: "success", label: "Import completed successfully" })
		fileWith({ version: 2, contacts: [{ name: "Eve", address: ADDR_B }] })
		const next = api.importContacts()
		await gate()
		expect(pickFileMock).toHaveBeenCalledTimes(2)
		cacheStoreState.importPromise?.reject(false)
		await next
	})

	test("two imports past the entry check: the later finds the selection taken and stages nothing; the first writes its own rows", async () => {
		const { contactService, accountStateService } = makeServices()
		await nextProfileClient({})
		const fenceB = deferred<unknown>()
		const clientB = await nextProfileClient({ captureRunFence: () => fenceB.promise })
		fileWith({ version: 2, contacts: [{ name: "Dana", address: ADDR_A }] })
		fileWith({ version: 2, contacts: [{ name: "Eve", address: ADDR_B }] })
		const api = useContactImportExport({ contacts: ref([]), accountStateService } as never)

		const a = api.importContacts()
		const b = api.importContacts()
		await gate()
		fenceB.resolve(RUN_FENCE)
		await b
		expect(popupOpenMock).toHaveBeenCalledTimes(1)
		expect(staged()).toEqual(["Dana"])
		expect(clientB.disconnect).toHaveBeenCalled()

		cacheStoreState.importPromise?.resolve(reviewed(cacheStoreState.importContacts))
		await a
		expect(written(contactService)).toEqual([ADDR_A])
	})

	test("a run a lock released cannot cancel the next run's selection: its late stop leaves the slot, and the next run writes its rows", async () => {
		const { contactService, accountStateService } = makeServices()
		const registration = deferred<void>()
		accountStateService.addSender.mockImplementationOnce(() => registration.promise)
		const sessionA = vi.fn(async (): Promise<unknown> => undefined)
		await nextProfileClient({ assertRunFence: () => sessionA() })
		fileWith({ version: 2, contacts: [{ name: "Dana", address: ADDR_A, isSender: true }] })
		const api = useContactImportExport({ contacts: ref([]), accountStateService } as never)

		const a = api.importContacts()
		await gate()
		cacheStoreState.importPromise?.resolve(reviewed(cacheStoreState.importContacts))
		await vi.waitFor(() => expect(accountStateService.addSender).toHaveBeenCalled())
		// The lock: the seal resets the guard, and A's session is gone while its registration waits.
		guard.resetContactImports()
		sessionA.mockRejectedValue(new Error("session ended"))

		fileWith({ version: 2, contacts: [{ name: "Eve", address: ADDR_B }] })
		const b = api.importContacts()
		await gate()
		const slotB = cacheStoreState.importPromise
		registration.reject(new Error("port closed"))
		await a
		expect(openToastMock).toHaveBeenLastCalledWith({ kind: "error", label: "Import incomplete · 0 of 1 contact written" })
		expect(cacheStoreState.importPromise).toBe(slotB)
		expect(staged()).toEqual(["Eve"])

		cacheStoreState.importPromise?.resolve(reviewed(cacheStoreState.importContacts))
		await b
		expect(written(contactService)).toEqual([ADDR_B])
		expect(cacheStoreState.importPromise).toBeNull()
	})

	test("nothing is held while the selection popup is open, and a throw while rows are written still releases", async () => {
		const { contactService, accountStateService } = makeServices()
		contactService.getContacts.mockRejectedValue(new Error("port closed"))
		fileWith({ version: 2, contacts: [{ name: "Dana", address: ADDR_A }] })

		const done = useContactImportExport({ contacts: ref([]), accountStateService } as never).importContacts()
		await vi.waitFor(() => {
			if (!cacheStoreState.importPromise) throw new Error("selection gate not reached")
		})
		expect(held()).toEqual({ running: 0, holds: false })
		cacheStoreState.importPromise?.resolve(reviewed(cacheStoreState.importContacts))
		await done

		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Error occurred during import" })
		expect(held()).toEqual({ running: 0, holds: false })
	})

	test("the import's own clients carry every row and close only at its end; the page's clients see no call", async () => {
		const page = clientFakes()
		const own = makeServices()
		const openAtWrite: boolean[] = []
		own.contactService.addContact.mockImplementation(async () => {
			openAtWrite.push(
				own.contactService.disconnect.mock.calls.length === 0 && own.accountStateService.disconnect.mock.calls.length === 0,
			)
		})
		fileWith({
			version: 2,
			contacts: [
				{ name: "Dana", address: ADDR_A, isSender: true },
				{ name: "Eli", address: ADDR_B },
			],
		})

		await runImport(useContactImportExport({ contacts: ref([]), accountStateService: page.accountStateService } as never))

		expect(openAtWrite).toEqual([true, true])
		expect(own.accountStateService.addSender).toHaveBeenCalledWith("net-1", ADDR_A, RUN_FENCE)
		expect(own.contactService.disconnect).toHaveBeenCalledTimes(1)
		expect(own.accountStateService.disconnect).toHaveBeenCalledTimes(1)
		const pageCalls = [...Object.values(page.contactService), ...Object.values(page.accountStateService)].flatMap((fn) => fn.mock.calls)
		expect(pageCalls).toEqual([])
	})
})
