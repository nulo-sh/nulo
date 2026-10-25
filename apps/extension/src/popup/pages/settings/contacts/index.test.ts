import { createTestingPinia } from "@pinia/testing"
import { Flex } from "@nulo/design"
import { EventHandler } from "@nulo/wallet-core/utils"
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../../tests/helpers/chrome-storage-mock"
import { nextTick, ref } from "vue"

const fakes = vi.hoisted(() => ({
	importContacts: vi.fn(),
	leavePanelFor: vi.fn(async (_route: string) => false),
	cardWindow: false,
	returnToPanel: vi.fn(async (..._args: unknown[]) => true),
	closeOwnWindow: vi.fn(async () => true),
}))
vi.mock("@/utils/own-window", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils/own-window")>()),
	leavePanelFor: fakes.leavePanelFor,
	isCardWindow: () => fakes.cardWindow,
	returnToPanel: fakes.returnToPanel,
	closeOwnWindow: fakes.closeOwnWindow,
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

import HandoffCard from "@/components/composite/HandoffCard.vue"
import DropdownItem from "@/components/ui/Dropdown/DropdownItem.vue"
import { useAppStore } from "@/stores/app.store"
import ContactsPage from "./index.vue"

beforeEach(() => {
	installChromeStorage({}, { persist: false })
	fakes.importContacts.mockReset()
	fakes.leavePanelFor.mockReset().mockResolvedValue(false)
	fakes.cardWindow = false
	fakes.returnToPanel.mockClear()
	fakes.closeOwnWindow.mockClear()
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

	test("Import contacts the panel hands to the Contacts window starts no pick", async () => {
		fakes.leavePanelFor.mockResolvedValue(true)
		const w = await mountContacts()
		await w.get('[data-testid="contacts-menu-import"]').trigger("click")
		await flushPromises()

		expect(fakes.leavePanelFor).toHaveBeenCalledWith("/popup/settings/contacts")
		expect(fakes.importContacts).not.toHaveBeenCalled()
	})

	test("Import contacts that stays on the page picks the file here", async () => {
		const w = await mountContacts()
		await w.get('[data-testid="contacts-menu-import"]').trigger("click")
		await flushPromises()

		expect(fakes.leavePanelFor).toHaveBeenCalledWith("/popup/settings/contacts")
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

describe("settings/contacts in the hand-off window", () => {
	const SNACK = { kind: "success", label: "Import completed successfully" }

	beforeEach(() => {
		fakes.cardWindow = true
	})

	test("shows only the card, which a running import keeps busy", async () => {
		const w = await mountContacts()
		expect(w.find('[data-testid="handoff-card"]').text()).toContain("Pick the contacts file")
		expect(w.find('[data-testid="contacts-menu-trigger"]').exists()).toBe(false)
		expect(w.find("section-label-stub").exists()).toBe(false)
		expect(w.getComponent(HandoffCard).props("busy")).toBe(false)

		const app = useAppStore() as unknown as { contactImports: ReadonlySet<symbol> }
		app.contactImports = new Set([Symbol("running import")])
		await nextTick()
		expect(w.getComponent(HandoffCard).props("busy")).toBe(true)
	})

	test("Choose file picks here, and the import's end hands its snack and profile back to Contacts", async () => {
		fakes.importContacts.mockResolvedValue({ snack: SNACK, profileId: "a1b2c3d4" })
		const w = await mountContacts()
		await w.get('[data-testid="handoff-card-choose"]').trigger("click")
		await flushPromises()

		expect(fakes.leavePanelFor).not.toHaveBeenCalled()
		expect(fakes.returnToPanel).toHaveBeenCalledWith("/popup/settings/contacts", { snack: SNACK, profileId: "a1b2c3d4" })
	})

	test("a pick that ends before the selection keeps the card for another try", async () => {
		fakes.importContacts.mockResolvedValue(undefined)
		const w = await mountContacts()
		await w.get('[data-testid="handoff-card-choose"]').trigger("click")
		await flushPromises()

		expect(fakes.importContacts).toHaveBeenCalledTimes(1)
		expect(fakes.returnToPanel).not.toHaveBeenCalled()
		expect(w.find('[data-testid="handoff-card"]').exists()).toBe(true)
	})

	test("Cancel closes the window through the own window's way back", async () => {
		const w = await mountContacts()
		await w.get('[data-testid="handoff-card-cancel"]').trigger("click")
		await flushPromises()

		expect(fakes.closeOwnWindow).toHaveBeenCalledTimes(1)
		expect(fakes.importContacts).not.toHaveBeenCalled()
	})
})
