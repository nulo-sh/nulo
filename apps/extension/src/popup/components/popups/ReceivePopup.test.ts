import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"

const appStoreState = {
	account: { name: "Account 1", address: `0x22ee${"0".repeat(56)}c204` },
	network: { id: "local", name: "Local Network" },
}

vi.mock("lean-qr", () => ({ generate: () => ({ toCanvas: vi.fn() }) }))
vi.mock("@/composables/toast.js", () => ({ useToast: () => ({ openToast: vi.fn() }) }))
vi.mock("@/composables/snackInset", () => ({ vSnackFooter: {} }))
vi.mock("@/composables/usePopupStack", () => ({ usePopupStack: () => ({ order: 1, depth: 0 }) }))
vi.mock("@/stores/app.store.ts", () => ({ useAppStore: () => appStoreState }))
vi.mock("@/stores/popup.store.ts", () => ({ usePopupStore: () => ({ close: vi.fn() }) }))

import ReceivePopup from "./ReceivePopup.vue"

const STUBS = {
	Popup: { template: "<div><slot /></div>" },
	PopupCard: { template: "<div><slot /></div>" },
	Flex: { template: "<div><slot /></div>" },
	Text: { props: ["variant", "color"], template: "<span :data-variant='variant' :data-color='color'><slot /></span>" },
	Icon: { template: "<i />" },
	Button: { template: "<button><slot /></button>" },
}

const mountShown = async () => {
	const wrapper = mount(ReceivePopup, { props: { show: true }, global: { stubs: STUBS } })
	await flushPromises()
	return wrapper
}

afterEach(() => {
	appStoreState.network = { id: "local", name: "Local Network" }
})

describe("ReceivePopup", () => {
	test("names the network the address belongs to, under the address, as a secondary caption", async () => {
		const wrapper = await mountShown()
		const line = wrapper.get('[data-testid="receive-network"]')
		expect(line.text()).toBe("Your address on Local Network")
		expect([line.attributes("data-variant"), line.attributes("data-color")]).toEqual(["caption", "secondary"])
		const order = wrapper.findAll("[data-testid]").map((el) => el.attributes("data-testid"))
		expect(order.indexOf("receive-network")).toBeGreaterThan(order.indexOf("receive-address"))
	})

	test("renders a typed network name whole and as text", async () => {
		appStoreState.network = { id: "mine", name: "My <b>Chain</b> Twenty-Five" }
		const wrapper = await mountShown()
		const line = wrapper.get('[data-testid="receive-network"]')
		expect(line.text()).toBe("Your address on My <b>Chain</b> Twenty-Five")
		expect(line.find("b").exists()).toBe(false)
	})
})
