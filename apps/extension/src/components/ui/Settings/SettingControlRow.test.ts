import { Flex, Text } from "@nulo/design"
import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { type Directive, defineComponent, h, withDirectives } from "vue"
import SettingControlRow from "./SettingControlRow.vue"

const ROW = { title: "Show fiat values", description: "Show balances in USD" }

function mountRow(props: Record<string, unknown> = {}, control = "") {
	return mount(SettingControlRow, {
		props: { ...ROW, ...props },
		slots: control ? { default: control } : {},
		global: { components: { Flex, Text } },
	})
}

describe("ui/Settings — SettingControlRow", () => {
	test("renders the title and the caption under their testids", () => {
		const w = mountRow({ titleTestid: "fiat-title", descriptionTestid: "fiat-description" })
		expect(w.get('[data-testid="fiat-title"]').text()).toBe(ROW.title)
		expect(w.get('[data-testid="fiat-description"]').text()).toBe(ROW.description)
	})

	test("renders no testid attribute when none is passed", () => {
		const w = mountRow()
		expect(w.text()).toContain(ROW.title)
		expect(w.find("[data-testid]").exists()).toBe(false)
	})

	test("renders the control in the default slot, after the text", () => {
		const w = mountRow({}, '<button data-testid="the-toggle" />')
		const root = w.element as HTMLElement
		expect(root.lastElementChild?.getAttribute("data-testid")).toBe("the-toggle")
	})

	test("align, gap and the row's testid reach the root", () => {
		const w = mountRow({ align: "center", gap: "12", "data-testid": "privacy-fiat-values" })
		expect(w.attributes("data-testid")).toBe("privacy-fiat-values")
		expect(w.classes()).toEqual(expect.arrayContaining(["flex", "items-center", "justify-between", "gap--12"]))
	})

	test("a directive on the row reaches its root element", () => {
		let reached: Element | undefined
		const probe: Directive<Element> = {
			mounted(el) {
				reached = el
			},
		}
		const w = mount(defineComponent({ render: () => withDirectives(h(SettingControlRow, ROW), [[probe, "privacy-mode"]]) }), {
			global: { components: { Flex, Text } },
		})
		expect(reached).toBe(w.element)
		expect(reached?.tagName).toBe("DIV")
	})
})
