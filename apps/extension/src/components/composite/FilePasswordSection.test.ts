import { Flex, Icon, Input, Text } from "@nulo/design"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, it } from "vitest"
import { defineComponent, h, ref } from "vue"
import { expectMaskToggle, expectNativeAttrs, nativeInput, pasteInto, typeNow } from "../../../tests/helpers/credential-pins"
import FilePasswordSection from "./FilePasswordSection.vue"

const wrappers: VueWrapper[] = []
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
})

const FIELD = "fp-input"
const CONFIRM = "fp-confirm-input"

/** Mounted under a parent that owns both models, as the export pages do. */
function mountOwned(props: Record<string, unknown> = {}) {
	const password = ref("")
	const repeated = ref("")
	const Host = defineComponent(
		() => () =>
			h(FilePasswordSection, {
				testid: "fp",
				...props,
				password: password.value,
				repeatedPassword: repeated.value,
				"onUpdate:password": (v: string) => (password.value = v),
				"onUpdate:repeatedPassword": (v: string) => (repeated.value = v),
			}),
	)
	const w = mount(Host, { attachTo: document.body, global: { components: { Flex, Icon, Input, Text } } })
	wrappers.push(w)
	return { w, password, repeated }
}

const hint = (w: VueWrapper) => w.get('[data-testid="fp-hint"]').text()

describe("FilePasswordSection", () => {
	it("is headed File password, with both fields under it", () => {
		const { w } = mountOwned()
		expect(w.text()).toContain("File password")
		expect(nativeInput(w, FIELD).placeholder).toBe("Enter password")
		expect(nativeInput(w, CONFIRM).placeholder).toBe("Repeat password")
	})

	it("typing writes each model on its own", async () => {
		const { w, password, repeated } = mountOwned()
		typeNow(nativeInput(w, FIELD), "abc")
		typeNow(nativeInput(w, CONFIRM), "xyz")
		await flushPromises()
		expect([password.value, repeated.value]).toEqual(["abc", "xyz"])
	})

	it.each([
		["", "", "At least 8 characters"],
		["1234567", "1234567", "At least 8 characters"],
		["12345678", "12345679", "Passwords don't match"],
		["12345678", "12345678", "Strong password"],
	])("the hint for %j / %j reads %j", async (a, b, text) => {
		const { w } = mountOwned()
		typeNow(nativeInput(w, FIELD), a)
		typeNow(nativeInput(w, CONFIRM), b)
		await flushPromises()
		expect(hint(w)).toBe(text)
	})

	it("one eye masks both fields", async () => {
		const { w } = mountOwned()
		await expectMaskToggle(w, { toggle: "fp-input-visibility-toggle", field: FIELD, drives: [FIELD, CONFIRM] })
	})

	it("both fields ask the browser for a new password", () => {
		const { w } = mountOwned()
		for (const id of [FIELD, CONFIRM]) expectNativeAttrs(w, id, { autocomplete: "new-password" })
	})

	it("the first field takes focus when the section appears", async () => {
		const { w } = mountOwned()
		await flushPromises()
		expect(document.activeElement).toBe(nativeInput(w, FIELD))
	})

	it("a paste is capped at the page's limit", async () => {
		const { w, password } = mountOwned({ maxLength: 16 })
		expect(pasteInto(nativeInput(w, FIELD), "y".repeat(40))).toBe(true)
		await flushPromises()
		expect(password.value).toBe("y".repeat(16))
	})

	it("the limit defaults to 128", async () => {
		const { w, password } = mountOwned()
		pasteInto(nativeInput(w, FIELD), "z".repeat(200))
		await flushPromises()
		expect(password.value).toHaveLength(128)
	})

	it("every control is named after the page's testid", () => {
		const { w } = mountOwned({ testid: "other" })
		for (const id of ["other-input", "other-input-visibility-toggle", "other-hint", "other-confirm-input"]) {
			expect(w.find(`[data-testid="${id}"]`).exists()).toBe(true)
		}
	})
})
