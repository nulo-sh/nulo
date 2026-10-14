import { createTestingPinia } from "@pinia/testing"
import { Flex } from "@nulo/design"
import { EventHandler } from "@nulo/wallet-core/utils"
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { nextTick, ref } from "vue"

const fakes = vi.hoisted(() => ({ importContacts: vi.fn() }))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: vi.fn() }) }))
vi.mock("@/composables/useEntityCrud", () => ({ useEntityCrud: () => ({ entities: ref([]) }) }))
vi.mock("@/popup/components/modules/settings/contacts/useContactImportExport", () => ({
	useContactImportExport: () => ({ importContacts: fakes.importContacts, exportContacts: vi.fn() }),
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
	const c = (globalThis as { chrome?: { storage: Record<string, unknown> } }).chrome
	if (c) {
		c.storage.local = { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) }
		c.storage.onChanged = { addListener: vi.fn(), removeListener: vi.fn() }
	}
})

async function mountContacts() {
	const wrapper = mount(ContactsPage, {
		global: {
			plugins: [createTestingPinia({ createSpy: vi.fn })],
			components: { Flex, DropdownItem },
			stubs: {
				SettingsPageShell: { template: '<div><slot name="trailing" /><slot /></div>' },
				DropdownRoot: { template: '<div><slot /><slot name="popup" /></div>' },
				MaterialIcon: true,
				Icon: true,
				SectionLabel: true,
				ListStatusMessage: true,
				Button: true,
				ItemsContainer: true,
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
})
