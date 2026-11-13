import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { sendEvent } from "../../../../tests/helpers/send-event"
import SendAgainRow from "./SendAgainRow.vue"

const STUBS = { Icon: { template: '<i data-testid="stub-icon" :data-name="name" />', props: ["name", "size", "color"] } }
const mountRow = (words = "10 USDC, privately") => mount(SendAgainRow, { props: { words }, global: { stubs: STUBS } })
const row = (w: ReturnType<typeof mountRow>) => w.get('[data-testid="send-again"]')

describe("composite/send/SendAgainRow", () => {
	test("is one button", () => {
		const w = mountRow()
		expect(w.findAll("button")).toHaveLength(1)
		expect(row(w).attributes("type")).toBe("button")
	})

	test("reads Same as last time and the send", () => {
		expect(row(mountRow()).text()).toBe("Same as last time: 10 USDC, privately")
	})

	test("the send it would repeat is set apart from the lead", () => {
		expect(row(mountRow("45 EURC, publicly")).find("span span").text()).toBe("45 EURC, publicly")
	})

	test("a press emits apply once", async () => {
		const w = mountRow()
		await row(w).trigger("click")
		expect(w.emitted("apply")).toHaveLength(1)
	})

	test("its glyphs are decoration", () => {
		for (const icon of mountRow().findAll('[data-testid="stub-icon"]')) expect(icon.attributes("aria-hidden")).toBe("true")
	})

	test("leads with the undo glyph and ends with the forward one", () => {
		expect(
			mountRow()
				.findAll('[data-testid="stub-icon"]')
				.map((i) => i.attributes("data-name")),
		).toEqual(["undo", "forward"])
	})

	test.each([
		["a held Enter's repeat is refused", { key: "Enter", repeat: true }, true],
		["a composing Enter is refused", { key: "Enter", isComposing: true }, true],
		["a first Enter is left to the button", { key: "Enter" }, false],
	])("%s", (_, init, refused) => {
		expect(sendEvent(row(mountRow()).element, "keydown", init)?.defaultPrevented).toBe(refused)
	})

	test("new words replace the old", async () => {
		const w = mountRow()
		await w.setProps({ words: "1 TST" })
		expect(row(w).text()).toBe("Same as last time: 1 TST")
	})

	test("a press through the event helper reaches the listener", async () => {
		const w = mountRow()
		await sendEvent(row(w).element, "click")
		expect(w.emitted("apply")).toHaveLength(1)
	})
})
