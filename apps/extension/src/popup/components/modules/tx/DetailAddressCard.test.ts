import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, test } from "vitest"
import DetailAddressCard from "./DetailAddressCard.vue"

const ADDRESS = `0x${"1a".repeat(32)}`

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	AddressDisplay: { props: ["address", "formatter"], template: "<span>{{ formatter(address) }}</span>" },
	Icon: { template: "<i />" },
}

const mountCard = (props: Record<string, unknown>, slots: Record<string, string> = {}) =>
	mount(DetailAddressCard, { attachTo: document.body, props: { label: "From", ...props }, slots, global: { stubs: STUBS } })

const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
const isStatic = (w: ReturnType<typeof mountCard>) => w.classes().some((name) => name.includes("card_static"))

afterEach(() => {
	window.getSelection()?.removeAllRanges()
	document.body.innerHTML = ""
})

describe("DetailAddressCard", () => {
	test("a click on a card with an address copies it; a drag that selects part of it copies nothing", () => {
		const w = mountCard({ address: ADDRESS, addressTestid: "from-address" })
		const value = w.get('[data-testid="from-address"]').element
		expect(value.textContent).toBe("0x1a1a..1a1a")
		const text = value.firstChild as Text
		window.getSelection()?.setBaseAndExtent(text, 0, text, 6)
		click(w.element)
		expect(w.emitted("copy")).toBeUndefined()
		window.getSelection()?.removeAllRanges()
		click(w.element)
		expect(w.emitted("copy")).toEqual([[ADDRESS]])
		expect(isStatic(w)).toBe(false)
	})

	test("a card with no address shows its slot, stays static and copies nothing", () => {
		const w = mountCard({}, { default: '<b data-testid="from-private">Private</b>' })
		expect(w.find('[data-testid="from-private"]').text()).toBe("Private")
		expect(w.findComponent(STUBS.AddressDisplay).exists()).toBe(false)
		click(w.element)
		expect(w.emitted("copy")).toBeUndefined()
		expect(isStatic(w)).toBe(true)
	})

	test("an address, even an empty one, is what makes the card copyable", () => {
		const w = mountCard({ address: "" }, { default: "<b>slot</b>" })
		expect(w.text()).not.toContain("slot")
		click(w.element)
		expect(w.emitted("copy")).toEqual([[""]])
		expect(isStatic(w)).toBe(false)
	})

	test("the corner link opens the explorer, names it and is described by the card's label", () => {
		const w = mountCard({ address: ADDRESS, explorerUrl: "https://x.test/a", explorerName: "Aztecscan", linkTestid: "from-link" })
		const link = w.get('[data-testid="from-link"]')
		const label = w.get(`#${link.attributes("aria-describedby")}`)
		expect(label.text()).toBe("From")
		expect(link.attributes()).toMatchObject({ href: "https://x.test/a", target: "_blank", "aria-label": "View on Aztecscan" })
		link.element.addEventListener("click", (e) => e.preventDefault())
		click(link.element)
		expect(w.emitted("copy")).toBeUndefined()
	})

	test("no explorer URL, no link; the label still renders", () => {
		const w = mountCard({ address: ADDRESS, label: "To", linkTestid: "to-link" })
		expect(w.find('[data-testid="to-link"]').exists()).toBe(false)
		expect(w.find("a").exists()).toBe(false)
		expect(w.text()).toContain("To")
	})

	test("two cards on one page describe their links by labels of their own", () => {
		const Pair = {
			components: { DetailAddressCard },
			template: `<div>
				<DetailAddressCard label="From" address="0xa" explorerUrl="https://x.test/a" explorerName="Aztecscan" linkTestid="from-link" />
				<DetailAddressCard label="To" address="0xb" explorerUrl="https://x.test/b" explorerName="Aztecscan" linkTestid="to-link" />
			</div>`,
		}
		const w = mount(Pair, { attachTo: document.body, global: { stubs: STUBS } })
		const labelOf = (testid: string) => w.get(`#${w.get(`[data-testid="${testid}"]`).attributes("aria-describedby")}`).text()
		expect([labelOf("from-link"), labelOf("to-link")]).toEqual(["From", "To"])
	})
})
