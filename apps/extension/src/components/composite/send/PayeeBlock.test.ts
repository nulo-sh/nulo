import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import PayeeBlock from "./PayeeBlock.vue"

const ANA = "0x13c29548b3340707017c5d1a457c23d8b6c29548b3340706e39bf608a5aab172"
const STUBS = { Icon: { template: '<i data-testid="stub-icon" :data-name="name" />', props: ["name", "size"] } }

const mountBlock = (props: Record<string, unknown>, slot?: string) =>
	mount(PayeeBlock, { props: { address: ANA, ...props }, slots: slot ? { default: slot } : {}, global: { stubs: STUBS } })
const halves = (w: ReturnType<typeof mountBlock>) => w.get('[data-testid="send-payee-address"]').element.children

describe("composite/send/PayeeBlock", () => {
	test("is a labelled region headed To", () => {
		const w = mountBlock({ name: "Ana" })
		const region = w.get('[data-testid="send-payee"]')
		expect(region.element.tagName).toBe("SECTION")
		expect(region.attributes("aria-label")).toBe("Who you are paying")
		expect(region.text().startsWith("To")).toBe(true)
	})

	test("the name in its own line", () => {
		expect(mountBlock({ name: "Ana" }).get('[data-testid="send-payee-name"]').text()).toBe("Ana")
	})

	test("the whole address in two lines of 33 that rejoin to it", () => {
		const lines = Array.from(halves(mountBlock({ name: "Ana" }))).map((el) => el.textContent)
		expect(lines.map((l) => l?.length)).toEqual([33, 33])
		expect(lines.join("")).toBe(ANA)
	})

	test("its first ten and last eight characters are set apart, at the line edges", () => {
		const [first, second] = Array.from(halves(mountBlock({})))
		expect(first.firstElementChild?.textContent).toBe(ANA.slice(0, 10))
		expect(first.firstChild).toBe(first.firstElementChild)
		expect(second.lastElementChild?.textContent).toBe(ANA.slice(-8))
		expect(second.lastChild).toBe(second.lastElementChild)
	})

	test("a pasted address shows no name line", () => {
		expect(mountBlock({ name: null }).find('[data-testid="send-payee-name"]').exists()).toBe(false)
	})

	test("a known address carries no check line", () => {
		expect(mountBlock({ name: "Ana", known: true }).find('[data-testid="send-payee-check"]').exists()).toBe(false)
	})

	test("an address with no record carries the check line, with its glyph", () => {
		const check = mountBlock({ known: false }).get('[data-testid="send-payee-check"]')
		expect(check.text()).toBe("You have not paid this address before. Check its start and end.")
		expect(check.get('[data-testid="stub-icon"]').attributes("data-name")).toBe("warning")
	})

	test("known by default, so a caller that cannot tell never warns", () => {
		expect(mountBlock({}).find('[data-testid="send-payee-check"]').exists()).toBe(false)
	})

	test("an address of any other length is shown as it is, never cut", () => {
		const short = "0x1234"
		const w = mountBlock({ address: short })
		expect(w.get('[data-testid="send-payee-address"]').text()).toBe(short)
		expect(halves(w)[0].textContent).toBe(short)
	})

	test("what follows the block goes in its slot, after the address", () => {
		const w = mountBlock({ known: false }, '<button data-testid="slotted">again</button>')
		const html = w.html()
		expect(html.indexOf("send-payee-check")).toBeLessThan(html.indexOf("slotted"))
	})

	test("a new address re-splits", async () => {
		const w = mountBlock({})
		const other = `0x0${"1".repeat(63)}`
		await w.setProps({ address: other })
		expect(
			Array.from(halves(w))
				.map((el) => el.textContent)
				.join(""),
		).toBe(other)
	})
})
