import { Icon } from "@nulo/design"
import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import PasswordVisibilityToggle from "./PasswordVisibilityToggle.vue"

const mountToggle = (props: Record<string, unknown>, attrs: Record<string, unknown> = {}) =>
	mount(PasswordVisibilityToggle, { props, attrs, global: { components: { Icon } } })

describe("composite/PasswordVisibilityToggle", () => {
	test.each([
		[true, undefined, "Show password", "eye"],
		[false, undefined, "Hide password", "eye-off"],
		[true, "recovery phrase", "Show recovery phrase", "eye"],
		[false, "recovery phrase", "Hide recovery phrase", "eye-off"],
	])("hidden=%s subject=%s labels %s with the %s icon", (hidden, subject, label, icon) => {
		const w = mountToggle(subject ? { hidden, subject } : { hidden })
		expect(w.attributes("aria-label")).toBe(label)
		expect(w.getComponent(Icon).props("name")).toBe(icon)
	})

	test.each([
		["type", "button"],
		["tabindex", "-1"],
	])("the button's %s is %s", (name, value) => {
		expect(mountToggle({ hidden: true }).attributes(name)).toBe(value)
	})

	test("the icon is 18px, secondary", () => {
		const icon = mountToggle({ hidden: true }).get("svg")
		expect(icon.classes()).toContain("color--secondary")
		expect(icon.attributes("width")).toBe("18")
	})

	test("a click emits one payload-free toggle and changes nothing by itself", async () => {
		const w = mountToggle({ hidden: true })
		await w.trigger("click")
		expect(w.emitted("toggle")).toEqual([[]])
		expect(w.attributes("aria-label")).toBe("Show password")
	})

	test("two clicks in one task emit two toggles", () => {
		const w = mountToggle({ hidden: true })
		;(w.element as HTMLButtonElement).click()
		;(w.element as HTMLButtonElement).click()
		expect(w.emitted("toggle")).toHaveLength(2)
	})

	test("a host's data-testid lands on the button", () => {
		expect(mountToggle({ hidden: true }, { "data-testid": "x-visibility-toggle" }).attributes("data-testid")).toBe(
			"x-visibility-toggle",
		)
	})

	test("the label follows the hidden prop", async () => {
		const w = mountToggle({ hidden: true })
		await w.setProps({ hidden: false })
		expect(w.attributes("aria-label")).toBe("Hide password")
	})
})
