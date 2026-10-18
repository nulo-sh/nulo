import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, expect, test, vi } from "vitest"
import AddressDisplay from "./AddressDisplay.vue"

const ADDRESS = `0x${"0d".repeat(32)}`

vi.mock("@/utils/core", () => ({
	managers: { contact: { getContactByAddress: vi.fn(async () => ({ name: "alice" })) } },
}))
vi.mock("@/stores/app.store", () => ({ useAppStore: () => ({ accounts: [] }) }))

afterEach(() => window.getSelection()?.removeAllRanges())

test("a drag that selects part of a contact's name neither flips it to the address nor reports a click; a click does both", async () => {
	const w = mount(AddressDisplay, {
		attachTo: document.body,
		props: { address: ADDRESS },
		global: { stubs: { Text: { template: "<span><slot /></span>" } } },
	})
	await flushPromises()
	const shown = () => w.get('[data-testid="address-display"]')
	const click = async () => {
		shown().element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
		await flushPromises()
	}
	expect(shown().attributes("data-address-shows")).toBe("name")
	const text = [...shown().element.childNodes].find((n) => n.textContent?.includes("@alice")) as Text
	const at = text.data.indexOf("@alice")
	window.getSelection()?.setBaseAndExtent(text, at + 1, text, at + 4)
	await click()
	expect(shown().attributes("data-address-shows")).toBe("name")
	expect(w.emitted("onAddressClick")).toBeUndefined()
	window.getSelection()?.removeAllRanges()
	await click()
	expect(shown().attributes("data-address-shows")).toBe("address")
	expect(w.emitted("onAddressClick")).toHaveLength(1)
	w.unmount()
})
