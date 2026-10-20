import { createTestingPinia } from "@pinia/testing"
import { Flex } from "@nulo/design"
import { EventHandler } from "@nulo/wallet-core/utils"
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../../tests/helpers/chrome-storage-mock"
import { nextTick, ref } from "vue"

const fakes = vi.hoisted(() => ({ importContacts: vi.fn(), inPanel: vi.fn(() => false), moveToOwnWindow: vi.fn(async () => true) }))
vi.mock("@/utils/browser-surface", () => ({ closesOnFocusLoss: fakes.inPanel }))
vi.mock("@/utils/own-window", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils/own-window")>()),
	moveToOwnWindow: fakes.moveToOwnWindow,
}))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: vi.fn() }) }))
const page = { contacts: ref<Array<{ id: string; name: string; address: string }>>([]), exporting: ref(false) }
vi.mock("@/composables/useEntityCrud", () => ({ useEntityCrud: () => ({ entities: page.contacts }) }))
vi.mock("@/popup/components/modules/settings/contacts/useContactImportExport", () => ({
	useContactImportExport: () => ({ importContacts: fakes.importContacts, exportContacts: vi.fn(), exporting: page.exporting }),
}))
vi.mock("@/wallet/services/contact/client", () => ({
	ContactServiceClient: vi.fn(function () {
		return { disconnect: vi.fn() }
	}),
}))
vi.mock("@/wallet/services/account-state/client", () => ({
	AccountStateServiceClient: vi.fn(function () {
		return {
			getSenders: vi.fn(async () => []),
			onSenderAdded: new EventHandler<string>(),
			onSenderDeleted: new EventHandler<string>(),
			disconnect: vi.fn(),
		}
	}),
}))

import DropdownItem from "@/components/ui/Dropdown/DropdownItem.vue"
import { useAppStore } from "@/stores/app.store"
import ContactsPage from "./index.vue"

beforeEach(() => {
	installChromeStorage({}, { persist: false })
	fakes.importContacts.mockReset()
	fakes.inPanel.mockReset().mockReturnValue(false)
	fakes.moveToOwnWindow.mockReset().mockResolvedValue(true)
	page.contacts.value = []
	page.exporting.value = false
})

async function mountContacts() {
	const wrapper = mount(ContactsPage, {
		global: {
			plugins: [createTestingPinia({ createSpy: vi.fn })],
			components: { Flex, DropdownItem },
			stubs: {
				SettingsPageShell: { template: '<div><slot name="trailing" /><slot /></div>' },
				DropdownRoot: { template: '<div><slot /><slot name="popup" /></div>' },
				Icon: true,
				SectionLabel: true,
				ListStatusMessage: true,
				Button: true,
				ItemsContainer: true,
				Spinner: true,
			},
		},
	})
	await flushPromises()
	return wrapper
}

describe("settings/contacts", () => {
	test("Import contacts is disabled, with its label, while an import runs, and enabled when none does", async () => {
		const w = await mountContacts()
		const item = () => w.get('[data-testid="contacts-menu-import"]')
		expect(item().attributes("aria-disabled")).toBeUndefined()
		expect(item().text()).toBe("Import contacts")

		const app = useAppStore() as unknown as { contactImports: ReadonlySet<symbol> }
		app.contactImports = new Set([Symbol("running import")])
		await nextTick()
		expect(item().attributes("aria-disabled")).toBe("true")
		expect(item().attributes("data-dropdown-item")).toBeUndefined()
		expect(item().text()).toBe("Import contacts")

		app.contactImports = new Set()
		await nextTick()
		expect(item().attributes("aria-disabled")).toBeUndefined()
	})

	test("in Firefox's toolbar panel, Import contacts moves to the Contacts window and starts no pick", async () => {
		fakes.inPanel.mockReturnValue(true)
		const w = await mountContacts()
		await w.get('[data-testid="contacts-menu-import"]').trigger("click")
		await flushPromises()

		expect(fakes.moveToOwnWindow).toHaveBeenCalledWith("/popup/settings/contacts")
		expect(fakes.importContacts).not.toHaveBeenCalled()
	})

	test("outside the panel, Import contacts picks the file here and opens no window", async () => {
		const w = await mountContacts()
		await w.get('[data-testid="contacts-menu-import"]').trigger("click")
		await flushPromises()

		expect(fakes.importContacts).toHaveBeenCalledTimes(1)
		expect(fakes.moveToOwnWindow).not.toHaveBeenCalled()
	})

	test("a window the browser refuses leaves the pick in the panel", async () => {
		fakes.inPanel.mockReturnValue(true)
		fakes.moveToOwnWindow.mockResolvedValue(false)
		const w = await mountContacts()
		await w.get('[data-testid="contacts-menu-import"]').trigger("click")
		await flushPromises()

		expect(fakes.importContacts).toHaveBeenCalledTimes(1)
	})

	test("while an export runs, its card shows above the list and Export contacts is disabled", async () => {
		page.contacts.value = [{ id: "c1", name: "Ana", address: `0x${"01".repeat(32)}` }]
		const w = await mountContacts()
		const item = () => w.get('[data-testid="contacts-menu-export"]')
		const card = () => w.find('[data-testid="contacts-export-status-card"]')
		expect(item().attributes("aria-disabled")).toBeUndefined()
		expect(card().exists()).toBe(false)

		page.exporting.value = true
		await nextTick()
		expect(item().attributes("aria-disabled")).toBe("true")
		expect(card().text()).toBe("Exporting your contactsGathering your contacts into a file.")
		const label = w.get("section-label-stub").element
		expect(card().element.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

		page.exporting.value = false
		await nextTick()
		expect(card().exists()).toBe(false)
		expect(item().attributes("aria-disabled")).toBeUndefined()
	})
})
