/**
 * Pre-extraction pins for the contacts import flow, complementing the sibling
 * suite (which already proves the byte cap, minimal rows, dedupe and adds-only senders):
 *   - the selection promise's CONTROLS are registered on the cache store BEFORE the popup opens, with
 *     the staged rows already in place, and settling through those controls settles the import;
 *   - per row the contact upsert settles before that row's sender attempt, which is counted even
 *     when the upsert failed;
 *   - every early exit clears the cache store's staging + controls;
 *   - the toast ladder: contact errors (logged in order with the ORIGINAL error objects) win over
 *     sender failures; partial and total sender failures read differently.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ref } from "vue"

const openToastMock = vi.fn()
const pickFileMock = vi.fn()
const RUN_FENCE = vi.hoisted(() => ({ profileId: "p1", epoch: 0, session: 1, incarnation: "w1" }))
const assertRunFenceMock = vi.hoisted(() => vi.fn())
const popupOpenMock = vi.fn()
const trace: string[] = []

const appStoreState: { network: { id: string; name: string } | null } = { network: { id: "net-1", name: "Testnet" } }
const cacheStoreState: {
	importContacts: unknown[]
	importPromise: { resolve: (rows: unknown[]) => void; reject: (v: unknown) => void } | null
} = { importContacts: [], importPromise: null }

vi.mock("@/composables/toast", () => ({
	useToast: () => ({ openToast: openToastMock }),
}))
vi.mock("@/utils", () => ({
	FilePickCanceledError: class FilePickCanceledError extends Error {},
	FileTooLargeError: class FileTooLargeError extends Error {},
	downloadFile: vi.fn(),
	pickFile: (...args: unknown[]) => pickFileMock(...args),
	sanitizeString: (s: unknown, max: number) =>
		String(s ?? "")
			.trim()
			.slice(0, max),
}))
vi.mock("@/wallet/services/profile/client", () => ({
	ProfileServiceClient: vi.fn(function () {
		return {
			connect: vi.fn(),
			disconnect: vi.fn(),
			getActiveProfile: vi.fn().mockResolvedValue({ name: "p" }),
			captureRunFence: vi.fn().mockResolvedValue(RUN_FENCE),
			assertRunFence: (...args: unknown[]) => assertRunFenceMock(...args),
		}
	}),
}))
vi.mock("@/stores/app.store", () => ({ useAppStore: () => appStoreState }))
vi.mock("@/stores/cache.store", () => ({ useCacheStore: () => cacheStoreState }))
vi.mock("@/stores/popup.store", () => ({ usePopupStore: () => ({ open: (...args: unknown[]) => popupOpenMock(...args) }) }))

import { CLIENT_DISCONNECTED_MESSAGE, RpcTimeoutError, SessionEndedError } from "@nulo/extension-messaging/errors"
import { FilePickCanceledError, FileTooLargeError } from "@/utils"
import { MAX_CONTACT_IMPORT_BYTES } from "@/utils/contacts-export-format"
import { classifyImportRow, indexSavedContacts } from "@/utils/contact-import-rows"
import { useContactImportExport } from "./useContactImportExport"

/** The rows as the selection popup hands them back: each carries the decision it was shown with. */
function reviewed(rows: unknown[], saved: Array<{ id: string; name: string; address: string }> = []) {
	const index = indexSavedContacts(saved)
	return (rows as Array<{ name: string; address: string }>).map((r) => ({ ...r, ...classifyImportRow(r, index) }))
}

// Wire-shaped: 0x + 64 hex, valid Aztec addresses.
const ADDR_A = "0x01904dba18e847d163097ce15dcd8597e763fb11fe19ef1273d266d6e959ec4a"
const ADDR_B = "0x047bb28204a2545c566dff691c298d2023fe7cad44bb6468e3f7f1e633f8f7d2"

function makeServices() {
	const contactService = {
		getContacts: vi.fn(async () => []),
		addContact: vi.fn(async (name: string) => {
			trace.push(`add:${name}`)
		}),
		updateContact: vi.fn(async () => {}),
	}
	const accountStateService = {
		addSender: vi.fn(async (_net: string, address: string) => {
			trace.push(`sender:${address === ADDR_A ? "A" : "B"}`)
		}),
		getSendersAcrossActiveNetworks: vi.fn().mockResolvedValue([]),
	}
	return { contactService, accountStateService }
}

function fileWith(payload: unknown, size?: number) {
	const raw = JSON.stringify(payload)
	pickFileMock.mockResolvedValueOnce({ size: size ?? raw.length, text: async () => raw })
}

const api = (services = makeServices(), contacts = ref([])) => useContactImportExport({ contacts, ...services } as never)

async function untilSelectionGate() {
	await vi.waitFor(() => {
		if (!cacheStoreState.importPromise) throw new Error("selection gate not reached")
	})
}

const twoSenders = {
	version: 2,
	contacts: [
		{ name: "A", address: ADDR_A, isSender: true },
		{ name: "B", address: ADDR_B, isSender: true },
	],
}

beforeEach(() => {
	vi.clearAllMocks()
	popupOpenMock.mockReset()
	assertRunFenceMock.mockReset().mockResolvedValue(undefined)
	trace.length = 0
	appStoreState.network = { id: "net-1", name: "Testnet" }
	cacheStoreState.importContacts = []
	cacheStoreState.importPromise = null
	vi.spyOn(console, "error").mockImplementation(() => {})
	vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
	vi.restoreAllMocks()
})

describe("importContacts — selection gate", () => {
	test("rows are staged and the promise CONTROLS are registered before the popup opens; settling through them settles the import", async () => {
		popupOpenMock.mockImplementation((name: string) => {
			trace.push(
				`open:${name}:${cacheStoreState.importPromise ? "controls-ready" : "no-controls"}:${cacheStoreState.importContacts.length}`,
			)
		})
		fileWith(twoSenders)
		const done = api().importContacts()
		await untilSelectionGate()
		expect(trace).toEqual(["open:import_contacts:controls-ready:2"])
		cacheStoreState.importPromise?.resolve(reviewed(cacheStoreState.importContacts))
		await done
		expect(openToastMock).toHaveBeenLastCalledWith({ kind: "success", label: "Contacts imported · 2 senders registered" })
	})
})

describe("importContacts — per-row order and early exits", () => {
	test("a row's contact upsert settles BEFORE its sender attempt; the attempt is counted even when the upsert failed", async () => {
		const services = makeServices()
		let releaseA: () => void = () => {}
		services.contactService.addContact.mockImplementationOnce(
			() =>
				new Promise<void>((_, reject) => {
					releaseA = () => {
						trace.push("add:A:rejected")
						reject(new Error("row A failed"))
					}
				}),
		)
		fileWith(twoSenders)
		const done = api(services).importContacts()
		await untilSelectionGate()
		cacheStoreState.importPromise?.resolve(reviewed(cacheStoreState.importContacts))
		await vi.waitFor(() => expect(services.contactService.addContact).toHaveBeenCalledTimes(1))
		expect(trace).toEqual([]) // row A's sender attempt waits for its upsert to settle
		releaseA()
		await done
		expect(trace).toEqual(["add:A:rejected", "sender:A", "add:B", "sender:B"])
		expect(services.accountStateService.addSender).toHaveBeenCalledTimes(2)
		// Contact errors win the toast and are logged with the ORIGINAL error object.
		expect(openToastMock).toHaveBeenLastCalledWith({ kind: "error", label: "Import ended with errors" })
		expect(console.error).toHaveBeenCalledWith("Failed to create a contact", expect.objectContaining({ message: "row A failed" }))
	})

	test.each<[string, () => void, string | null]>([
		["no file picked", () => pickFileMock.mockResolvedValueOnce(null), null],
		["chooser closed", () => pickFileMock.mockRejectedValueOnce(new FilePickCanceledError()), null],
		["file over the byte cap", () => fileWith(twoSenders, MAX_CONTACT_IMPORT_BYTES + 1), "Contacts file is too large"],
		[
			"picker threw FileTooLargeError",
			() => pickFileMock.mockRejectedValueOnce(new FileTooLargeError(1)),
			"Contacts file is too large",
		],
		["no rows in the file", () => fileWith({ version: 2, contacts: [] }), "No contacts found in file"],
		[
			"a format this wallet does not know",
			() => fileWith({ version: 3, contacts: twoSenders.contacts }),
			"Error occurred during import",
		],
		[
			"no row with a usable name and address",
			() => fileWith([1, "x", null, [], { name: ["A"], address: { x: 1 } }, { address: ADDR_A }]),
			"No contacts found in file",
		],
		[
			"read threw",
			() =>
				pickFileMock.mockResolvedValueOnce({
					size: 10,
					text: async () => {
						throw new Error("boom")
					},
				}),
			"Error occurred during import",
		],
	])("early exit (%s) clears the staging + controls", async (_label, arrange, toast) => {
		// Leftover staging from an interrupted earlier run must be wiped by this run's `finally` too.
		cacheStoreState.importContacts = ["stale-staging"]
		arrange()
		const services = makeServices()
		await api(services).importContacts()
		expect(popupOpenMock).not.toHaveBeenCalled()
		expect(services.contactService.getContacts).not.toHaveBeenCalled()
		expect(cacheStoreState.importContacts).toEqual([])
		expect(cacheStoreState.importPromise).toBeNull()
		if (toast) expect(openToastMock.mock.calls.map((c) => (c[0] as { label: string }).label)).toContain(toast)
		else expect(openToastMock).not.toHaveBeenCalled()
	})

	test("a file that is not JSON logs the failure's kind, never the parser's message quoting the file", async () => {
		const raw = `Alice,${ADDR_A}\nBob,${ADDR_B}`
		expect(() => JSON.parse(raw)).toThrow(/Alice/)
		pickFileMock.mockResolvedValueOnce({ size: raw.length, text: async () => raw })
		const logged = vi.mocked(console.error)

		await api().importContacts()

		expect(openToastMock).toHaveBeenCalledWith({ kind: "error", label: "Error occurred during import" })
		expect(logged).toHaveBeenCalledWith("Error occurred during import", "SyntaxError")
		expect(JSON.stringify(logged.mock.calls)).not.toMatch(/Alice|0x01904d/)
	})

	test.each<[string, (c: typeof cacheStoreState.importPromise) => void, string]>([
		["cancel", (c) => c?.reject(new Error("closed")), "Contact import canceled"],
		["nothing selected", (c) => c?.resolve([]), "No contacts selected for import"],
	])("selection gate exit (%s) toasts and clears", async (_label, settle, toast) => {
		fileWith(twoSenders)
		const done = api().importContacts()
		await untilSelectionGate()
		settle(cacheStoreState.importPromise)
		await done
		expect(openToastMock).toHaveBeenCalledWith(expect.objectContaining({ label: toast }))
		expect(cacheStoreState.importContacts).toEqual([])
		expect(cacheStoreState.importPromise).toBeNull()
	})
})

describe("importContacts — sender-failure toasts", () => {
	test("partial sender failure: `1 of 2 senders registered` (warning)", async () => {
		const services = makeServices()
		services.accountStateService.addSender.mockRejectedValueOnce(new Error("pxe down"))
		fileWith(twoSenders)
		const done = api(services).importContacts()
		await untilSelectionGate()
		cacheStoreState.importPromise?.resolve(reviewed(cacheStoreState.importContacts))
		await done
		expect(openToastMock).toHaveBeenLastCalledWith({ kind: "error", label: "Contacts imported · 1 of 2 senders registered" })
	})

	test("total sender failure: `sender registration failed` (warning)", async () => {
		const services = makeServices()
		services.accountStateService.addSender.mockRejectedValue(new Error("pxe down"))
		fileWith(twoSenders)
		const done = api(services).importContacts()
		await untilSelectionGate()
		cacheStoreState.importPromise?.resolve(reviewed(cacheStoreState.importContacts))
		await done
		expect(openToastMock).toHaveBeenLastCalledWith({ kind: "error", label: "Contacts imported · sender registration failed" })
	})
})

describe("importContacts — a session that ends mid-import", () => {
	const ADDR_C = "0x048b29517cddb7566a05a2a292624eb2c5350dbe44350763cefe4c9207344c10"
	const ADDR_OLD = "0x02056523b85ea4e550facca78516f7270f18bddb0f5474177d406f6bf0e58617"
	const saved = [{ id: "c1", name: "B", address: ADDR_OLD }]
	// A is added (sender), B moves saved contact c1 to a new address, C is added (sender).
	const threeRows = {
		version: 2,
		contacts: [
			{ name: "A", address: ADDR_A, isSender: true },
			{ name: "B", address: ADDR_B },
			{ name: "C", address: ADDR_C, isSender: true },
		],
	}
	const ended = () => new SessionEndedError()

	function stopServices() {
		const contactService = {
			getContacts: vi.fn(async (..._fence: unknown[]) => saved),
			addContact: vi.fn(async (name: string, ..._rest: unknown[]) => {
				trace.push(`add:${name}`)
			}),
			updateContact: vi.fn(async (id: string, ..._rest: unknown[]) => {
				trace.push(`update:${id}`)
			}),
		}
		const accountStateService = {
			addSender: vi.fn(async (_net: string, address: string) => {
				trace.push(`sender:${address === ADDR_A ? "A" : "C"}`)
			}),
			getSendersAcrossActiveNetworks: vi.fn().mockResolvedValue([]),
		}
		return { contactService, accountStateService }
	}

	async function run(services: ReturnType<typeof stopServices>) {
		fileWith(threeRows)
		const done = useContactImportExport({ contacts: ref([]), ...services } as never).importContacts()
		await untilSelectionGate()
		cacheStoreState.importPromise?.resolve(reviewed(cacheStoreState.importContacts, saved))
		await done
		return openToastMock.mock.calls.at(-1)?.[0]
	}

	test.each<[string, (s: ReturnType<typeof stopServices>) => void, string[], number]>([
		["the plan read", (s) => s.contactService.getContacts.mockRejectedValueOnce(ended()), [], 0],
		[
			"a row's re-read",
			(s) => s.contactService.getContacts.mockResolvedValueOnce(saved).mockResolvedValueOnce(saved).mockRejectedValueOnce(ended()),
			["add:A", "sender:A"],
			1,
		],
		["an add", (s) => s.contactService.addContact.mockRejectedValueOnce(ended()), [], 0],
		["an update", (s) => s.contactService.updateContact.mockRejectedValueOnce(ended()), ["add:A", "sender:A"], 1],
		[
			"a write cut off by the page closing",
			(s) =>
				s.contactService.addContact
					.mockImplementationOnce(async () => {
						trace.push("add:A")
					})
					.mockRejectedValueOnce(new Error(CLIENT_DISCONNECTED_MESSAGE)),
			["add:A", "sender:A", "update:c1"],
			2,
		],
		[
			"a write that fails, then a check that cannot reach the wallet",
			(s) => {
				s.contactService.addContact
					.mockImplementationOnce(async () => {
						trace.push("add:A")
					})
					.mockRejectedValueOnce(new Error("write failed"))
				assertRunFenceMock.mockRejectedValue(new RpcTimeoutError("RPC 'assertRunFence' timed out after 60000ms"))
			},
			["add:A", "sender:A", "update:c1"],
			2,
		],
	])("a stop at %s writes and registers nothing after it, and reports what was written", async (_at, fail, expected, written) => {
		assertRunFenceMock.mockRejectedValue(ended())
		const services = stopServices()
		fail(services)
		const toast = await run(services)
		expect(trace).toEqual(expected)
		expect(toast).toEqual({ kind: "error", label: `Import incomplete · ${written} ${written === 1 ? "contact" : "contacts"} written` })
		expect(assertRunFenceMock).toHaveBeenCalledWith(RUN_FENCE)
		const { getContacts, addContact, updateContact } = services.contactService
		const contactCalls = [...getContacts.mock.calls, ...addContact.mock.calls, ...updateContact.mock.calls]
		expect(contactCalls.every((args) => args.at(-1) === RUN_FENCE)).toBe(true)
	})

	test("control: a write that fails while the session holds is counted, and the import goes on", async () => {
		const services = stopServices()
		services.contactService.addContact
			.mockImplementationOnce(async () => {
				trace.push("add:A")
			})
			.mockRejectedValueOnce(new Error("write failed"))
		const toast = await run(services)
		expect(trace).toEqual(["add:A", "sender:A", "update:c1", "sender:C"])
		expect(toast).toEqual({ kind: "error", label: "Import ended with errors" })
		expect(assertRunFenceMock).toHaveBeenCalledTimes(1)
	})
})
