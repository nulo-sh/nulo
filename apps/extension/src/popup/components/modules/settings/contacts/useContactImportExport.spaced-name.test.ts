/**
 * The import path with the REAL `sanitizeString`, which keeps outer spaces: the sibling suites mock it
 * with a trimming stand-in, so they cannot see how a spaced file name stages and commits.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ref } from "vue"

const pickFileMock = vi.fn()
const cacheStoreState: {
	importContacts: Array<{ name: string; address: string }>
	importPromise: { resolve: (rows: unknown[]) => void; reject: (v: unknown) => void } | null
} = { importContacts: [], importPromise: null }

vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: vi.fn() }) }))
vi.mock("@/utils", async (importOriginal) => {
	const real = await importOriginal<typeof import("@/utils")>()
	return {
		FileTooLargeError: class FileTooLargeError extends Error {},
		downloadFile: vi.fn(),
		pickFile: (...args: unknown[]) => pickFileMock(...args),
		sanitizeString: real.sanitizeString,
	}
})
vi.mock("@/wallet/services/profile/client", () => ({
	ProfileServiceClient: vi.fn(function () {
		return { connect: vi.fn(), disconnect: vi.fn(), getActiveProfile: vi.fn().mockResolvedValue({ name: "p" }) }
	}),
}))
vi.mock("@/stores/app.store", () => ({ useAppStore: () => ({ network: { id: "net-1", name: "Testnet" } }) }))
vi.mock("@/stores/cache.store", () => ({ useCacheStore: () => cacheStoreState }))
vi.mock("@/stores/popup.store", () => ({ usePopupStore: () => ({ open: vi.fn() }) }))

import { useContactImportExport } from "./useContactImportExport"

const ADDR_A = `0x${"a".repeat(64)}`
const ADDR_B = `0x${"b".repeat(64)}`

beforeEach(() => {
	cacheStoreState.importContacts = []
	cacheStoreState.importPromise = null
})
afterEach(() => {
	vi.restoreAllMocks()
})

describe("importContacts — a file name differing from a saved one by outer spaces", () => {
	test("stages untrimmed and commits as a new contact beside the saved one", async () => {
		const raw = JSON.stringify({ version: 2, contacts: [{ name: "Alice ", address: ADDR_B }] })
		pickFileMock.mockResolvedValueOnce({ size: raw.length, text: async () => raw })
		const contactService = { addContact: vi.fn(async () => {}), updateContact: vi.fn(async () => {}) }
		const accountStateService = { addSender: vi.fn(), getSendersAcrossActiveNetworks: vi.fn().mockResolvedValue([]) }
		const contacts = ref([{ id: "c1", name: "Alice", address: ADDR_A }])

		const done = useContactImportExport({ contacts, contactService, accountStateService } as never).importContacts()
		await vi.waitFor(() => {
			if (!cacheStoreState.importPromise) throw new Error("selection gate not reached")
		})
		expect(cacheStoreState.importContacts.map((c) => c.name)).toEqual(["Alice "])
		cacheStoreState.importPromise?.resolve([...cacheStoreState.importContacts])
		await done

		expect(contactService.addContact).toHaveBeenCalledWith("Alice ", ADDR_B)
		expect(contactService.updateContact).not.toHaveBeenCalled()
	})
})
