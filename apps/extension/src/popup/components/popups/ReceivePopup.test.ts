import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"

const appStoreState = {
	account: { name: "Account 1", address: `0x22ee${"0".repeat(56)}c204` },
	network: { id: "local", name: "Local Network" },
}

const copyWithToast = vi.hoisted(() => vi.fn(async () => true))
vi.mock("@/utils/clipboard", () => ({ copyWithToast }))
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
	copyWithToast.mockClear()
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

	test("shows the whole address as one button, its first six and last four characters emphasised, and the glyph copies all of it", async () => {
		const address = appStoreState.account.address
		const wrapper = await mountShown()
		const button = wrapper.get('[data-testid="receive-address"]')
		expect(button.element.tagName).toBe("BUTTON")
		expect(wrapper.get('[data-testid="receive-address-text"]').text()).toBe(address)
		const emphasised = button.findAll("span").filter((el) => el.classes().some((name) => name.includes("address_end")))
		expect(emphasised.map((el) => el.text())).toEqual([address.slice(0, 6), address.slice(-4)])
		await button.get("i").trigger("click")
		expect(copyWithToast).toHaveBeenCalledExactlyOnceWith(address, expect.any(Function), "Address is copied")
		expect(button.attributes("aria-label")).toBe(`Copy address ${address}`)
		expect(button.get("i").attributes("aria-hidden")).toBe("true")
	})

	test("a pointer click that ends a selection in the address copies nothing; Enter's click over it still copies", async () => {
		const wrapper = await mountShown()
		const button = wrapper.get('[data-testid="receive-address"]')
		document.body.appendChild(wrapper.element)
		window.getSelection()?.selectAllChildren(wrapper.get('[data-testid="receive-address-text"]').element)
		button.element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
		expect(copyWithToast).not.toHaveBeenCalled()
		button.element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }))
		expect(copyWithToast).toHaveBeenCalledExactlyOnceWith(appStoreState.account.address, expect.any(Function), "Address is copied")
		window.getSelection()?.removeAllRanges()
		wrapper.element.remove()
	})

	test("renders a typed network name whole and as text", async () => {
		appStoreState.network = { id: "mine", name: "My <b>Chain</b> Twenty-Five" }
		const wrapper = await mountShown()
		const line = wrapper.get('[data-testid="receive-network"]')
		expect(line.text()).toBe("Your address on My <b>Chain</b> Twenty-Five")
		expect(line.find("b").exists()).toBe(false)
	})
})
