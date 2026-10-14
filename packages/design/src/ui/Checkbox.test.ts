import { describe, expect, test } from "vitest"
import { mount } from "@vue/test-utils"
import Checkbox from "./Checkbox.vue"

const STUBS = {
	Flex: { template: '<div :class="$attrs.class" v-bind="$attrs"><slot /></div>', inheritAttrs: false },
	Icon: { template: '<span data-testid="stub-icon" :data-name="name" />', props: ["name", "size", "color"] },
}

const mountCheckbox = (props: Record<string, unknown> = {}, slot = "Label") =>
	mount(Checkbox, { props, slots: { default: slot }, global: { stubs: STUBS } })

describe("ui/Checkbox", () => {
	test("renders default slot content (the label)", () => {
		const w = mountCheckbox({}, "I agree")
		expect(w.text()).toContain("I agree")
	})

	test("modelValue=true renders the check icon", () => {
		const w = mountCheckbox({ modelValue: true })
		const icon = w.find('[data-name="check"]')
		expect(icon.exists()).toBe(true)
	})

	test("modelValue=false hides the check icon", () => {
		const w = mountCheckbox({ modelValue: false })
		const icon = w.find('[data-name="check"]')
		expect(icon.exists()).toBe(false)
	})

	test("checked prop also renders the check icon (ignores modelValue)", () => {
		const w = mountCheckbox({ checked: true, modelValue: false })
		const icon = w.find('[data-name="check"]')
		expect(icon.exists()).toBe(true)
	})

	test("click emits update:modelValue with the inverse boolean", async () => {
		const w = mountCheckbox({ modelValue: false })
		await w.trigger("click")
		expect(w.emitted("update:modelValue")?.[0]).toEqual([true])
		const w2 = mountCheckbox({ modelValue: true })
		await w2.trigger("click")
		expect(w2.emitted("update:modelValue")?.[0]).toEqual([false])
	})

	test("Enter keydown also toggles the value", async () => {
		const w = mountCheckbox({ modelValue: false })
		await w.trigger("keydown.enter")
		expect(w.emitted("update:modelValue")?.[0]).toEqual([true])
	})

	test("disabled prop applies the disabled CSS class", () => {
		const w = mountCheckbox({ disabled: true })
		expect(w.html()).toMatch(/disabled/)
	})

	test("disabled blocks click, Enter and Space from emitting", async () => {
		const w = mountCheckbox({ disabled: true, modelValue: false })
		await w.trigger("click")
		await w.trigger("keydown.enter")
		await w.trigger("keydown.space")
		expect(w.emitted("update:modelValue")).toBeUndefined()
	})

	test("Space toggles once and is marked handled, so the page does not scroll", async () => {
		const w = mountCheckbox({ modelValue: false })
		const e = new KeyboardEvent("keydown", { key: " ", cancelable: true })
		w.element.dispatchEvent(e)
		expect(w.emitted("update:modelValue")).toEqual([[true]])
		expect(e.defaultPrevented).toBe(true)
	})

	test.each([
		["a repeated", { repeat: true }],
		["a composing", { isComposing: true }],
		["an IME boundary", { keyCode: 229 }],
	])("%s Enter or Space does nothing", async (_case, init) => {
		const w = mountCheckbox({ modelValue: false })
		for (const key of ["Enter", " "]) w.element.dispatchEvent(new KeyboardEvent("keydown", { key, cancelable: true, ...init }))
		expect(w.emitted("update:modelValue")).toBeUndefined()
	})

	test("a screen reader hears a checkbox, its state and whether it is disabled", () => {
		expect(mountCheckbox({ modelValue: false }).attributes()).toMatchObject({ role: "checkbox", "aria-checked": "false" })
		expect(mountCheckbox({ checked: true }).attributes("aria-checked")).toBe("true")
		expect(mountCheckbox({ modelValue: true }).attributes("aria-disabled")).toBeUndefined()
		expect(mountCheckbox({ disabled: true }).attributes("aria-disabled")).toBe("true")
	})
})
