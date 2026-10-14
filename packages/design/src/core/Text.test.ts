import { mount } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import Text from "./Text.vue"

describe("Text", () => {
	test("renders slot content", () => {
		expect(mount(Text, { slots: { default: "hi" } }).text()).toBe("hi")
	})

	test("default height → lh--100", () => {
		expect(mount(Text).classes()).toContain("lh--100")
	})

	test("color → color-- class", () => {
		expect(mount(Text, { props: { color: "primary" } }).classes()).toContain("color--primary")
	})

	test("boolean flags → utility classes", () => {
		const w = mount(Text, { props: { selectable: true, noWrap: true } })
		for (const c of ["selectable", "no-wrap"]) expect(w.classes()).toContain(c)
	})

	test("variant → its type-- role class, beside the other props' classes", () => {
		expect(mount(Text, { props: { variant: "data", color: "primary" } }).classes()).toEqual(["type--data", "lh--100", "color--primary"])
	})

	test("without variant, a tag sets no type and inherits its parent's", () => {
		expect(mount(Text, { props: { color: "tertiary" } }).classes()).toEqual(["lh--100", "color--tertiary"])
	})

	test("an unknown variant fails the prop validator", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		// @ts-expect-error a role name outside typeRoleNames is the case under test.
		mount(Text, { props: { variant: "headline" } })
		expect(warn.mock.calls.flat().join(" ")).toMatch(/Invalid prop: custom validator check failed for prop "variant"/)
		warn.mockRestore()
	})
})
