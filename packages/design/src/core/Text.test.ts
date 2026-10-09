import { mount } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import Text from "./Text.vue"

describe("Text", () => {
	test("renders slot content", () => {
		expect(mount(Text, { slots: { default: "hi" } }).text()).toBe("hi")
	})

	test("size → fz-- class", () => {
		expect(mount(Text, { props: { size: "14" } }).classes()).toContain("fz--14")
	})

	test("weight → fw-- class", () => {
		expect(mount(Text, { props: { weight: "600" } }).classes()).toContain("fw--600")
	})

	test("default height → lh--100", () => {
		expect(mount(Text).classes()).toContain("lh--100")
	})

	test("color → color-- class", () => {
		expect(mount(Text, { props: { color: "primary" } }).classes()).toContain("color--primary")
	})

	test("boolean flags → utility classes", () => {
		const w = mount(Text, { props: { mono: true, tabular: true, selectable: true, noWrap: true } })
		for (const c of ["mono", "tabular", "selectable", "no-wrap"]) expect(w.classes()).toContain(c)
	})

	test("variant → its type-- role class, beside the other props' classes", () => {
		expect(mount(Text, { props: { variant: "data", color: "primary" } }).classes()).toEqual(["type--data", "lh--100", "color--primary"])
	})

	test("without variant, a tag renders exactly the classes it rendered before roles", () => {
		const w = mount(Text, { props: { size: "12", weight: "600", color: "tertiary", mono: true } })
		expect(w.classes()).toEqual(["fz--12", "fw--600", "lh--100", "color--tertiary", "mono"])
	})

	test("an unknown variant fails the prop validator", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		// @ts-expect-error a role name outside typeRoleNames is the case under test.
		mount(Text, { props: { variant: "headline" } })
		expect(warn.mock.calls.flat().join(" ")).toMatch(/Invalid prop: custom validator check failed for prop "variant"/)
		warn.mockRestore()
	})

	// (PIN) verbatim behavior preserved from the pre-migration component:
	test("(PIN) off-scale/named size emits the class verbatim (no .fz--large in base.css → inherits at runtime)", () => {
		// `size` is now typed to the FontSize scale; this pins that the RUNTIME still passes an
		// off-scale value straight through to `fz--<value>`. The off-contract value is deliberate.
		// @ts-expect-error off-scale size is intentionally off-contract here.
		expect(mount(Text, { props: { size: "large" } }).classes()).toContain("fz--large")
	})
})
