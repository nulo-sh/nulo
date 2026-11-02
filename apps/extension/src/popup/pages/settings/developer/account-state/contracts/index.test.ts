import { Flex, Input } from "@nulo/design"
import { createTestingPinia } from "@pinia/testing"
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../../../../tests/helpers/chrome-storage-mock"
import { useAppStore } from "@/stores/app.store"
import ContractsIndex from "./index.vue"

// Wire-shaped: 0x + 64 hex, below the field modulus.
const [A, B] = [`0x${"0a".repeat(32)}`, `0x${"1b".repeat(32)}`]

vi.mock("@/composables/toast.js", () => ({ useToast: () => ({ openToast: vi.fn() }) }))
vi.mock("@/wallet/services/account-state/client", () => ({
	AccountStateServiceClient: function AccountStateServiceClient() {
		return { getContracts: vi.fn(async () => [A, B]), disconnect: vi.fn() }
	},
}))

enableAutoUnmount(afterEach)

// The app store reads and watches `chrome.storage.local` when it is created.
beforeEach(() => {
	vi.stubGlobal("chrome", { storage: {} })
	installChromeStorage({}, { persist: false })
})
afterEach(() => {
	vi.unstubAllGlobals()
})

async function mountPage() {
	const pinia = createTestingPinia({ createSpy: vi.fn })
	const appStore = useAppStore(pinia)
	appStore.isLogined = true
	appStore.network = { id: "n", chainId: 1 } as never
	const w = mount(ContractsIndex, {
		attachTo: document.body,
		global: {
			plugins: [pinia],
			components: { Flex, Input },
			stubs: {
				SettingsPageShell: { template: "<div><slot /></div>" },
				AsyncListStatus: true,
				ListStatusMessage: { props: ["variant"], template: '<p data-testid="status" :data-variant="variant" />' },
				AddressDisplay: { props: ["address"], template: '<span data-testid="contract" :data-address="address" />' },
				Icon: true,
				Text: { template: "<span><slot /></span>" },
			},
		},
	})
	await flushPromises()
	return w
}

test.each([
	{ pasted: `${A.slice(0, 20)}​${A.slice(20)}`, shown: [A], status: undefined },
	{ pasted: `${A.slice(0, -1)}g`, shown: [], status: "no-results" },
])("a search for $pasted shows $shown", async ({ pasted, shown, status }) => {
	const w = await mountPage()
	await w.get("input").setValue(pasted)
	expect(w.findAll('[data-testid="contract"]').map((c) => c.attributes("data-address"))).toEqual(shown)
	const line = w.find('[data-testid="status"]')
	expect(line.exists() ? line.attributes("data-variant") : undefined).toBe(status)
})
