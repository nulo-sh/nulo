import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"

import BrutalistTitle from "./BrutalistTitle.vue"

describe("BrutalistTitle", () => {
	test("renders main + sub text as two spans inside <h1>", () => {
		const wrapper = mount(BrutalistTitle, { props: { main: "Create", sub: "Wallet" } })
		expect(wrapper.element.tagName).toBe("H1")
		const spans = wrapper.findAll("span")
		expect(spans).toHaveLength(2)
		expect(spans[0].text()).toBe("Create")
		expect(spans[1].text()).toBe("Wallet")
		for (const span of spans) expect(span.classes()).toContain("type--title-hero")
	})

	test("defaults to left align (no center class)", () => {
		const wrapper = mount(BrutalistTitle, { props: { main: "Meet", sub: "Aztec" } })
		// Center class adds align-items: center + gap. Without it, neither class is applied.
		const html = wrapper.html()
		// Look for the CSS module hashed class — match any class that contains "center".
		expect(/\bclass="[^"]*center[^"]*"/i.test(html)).toBe(false)
	})

	test('align="center" applies the center modifier class', () => {
		const wrapper = mount(BrutalistTitle, {
			props: { main: "Welcome", sub: "to Nulo", align: "center" },
		})
		const html = wrapper.html()
		expect(/center/i.test(html)).toBe(true)
	})

	test('size="hero" applies the hero modifier class', () => {
		const wrapper = mount(BrutalistTitle, {
			props: { main: "Welcome", sub: "to Nulo", size: "hero" },
		})
		expect(wrapper.classes().some((c) => /hero/i.test(c))).toBe(true)
	})

	test('size="compact" applies the compact modifier class', () => {
		const wrapper = mount(BrutalistTitle, {
			props: { main: "Use your", sub: "passkey", size: "compact" },
		})
		expect(wrapper.classes().some((c) => /compact/i.test(c))).toBe(true)
		expect(wrapper.classes().some((c) => /hero/i.test(c))).toBe(false)
	})

	test("renders both spans even when props are short", () => {
		const wrapper = mount(BrutalistTitle, { props: { main: "Done", sub: "" } })
		const spans = wrapper.findAll("span")
		expect(spans).toHaveLength(2)
		expect(spans[0].text()).toBe("Done")
		expect(spans[1].text()).toBe("")
	})
})
