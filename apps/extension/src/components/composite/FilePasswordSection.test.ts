import { Flex, Icon, Input, Text } from "@nulo/design"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, it } from "vitest"
import { defineComponent, h, ref } from "vue"
import { nativeInput, pasteInto, typeNow } from "../../../tests/helpers/credential-pins"
import { NEW_PASSWORD_HINTS } from "@/utils/password-hint"
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

describe("FilePasswordSection", () => {
	it("is headed File password, with both fields under it", () => {
		const { w } = mountOwned()
		expect(w.text()).toContain("File password")
		expect(nativeInput(w, FIELD).placeholder).toBe("Enter password")
		expect(nativeInput(w, CONFIRM).placeholder).toBe("Repeat password")
	})

	it("labels the second field Repeat password on every page that seals a file", () => {
		const labels = (w: VueWrapper) => w.findAll(".export_section_label").map((label) => label.text())
		const { w } = mountOwned()
		expect(labels(w)).toEqual(["File password", "Repeat password"])
		const repeat = w.findAll(".export_section_label")[1].element
		const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
		expect(follows(nativeInput(w, FIELD), repeat) && follows(repeat, nativeInput(w, CONFIRM))).toBe(true)
		expect(nativeInput(w, CONFIRM).getAttribute("aria-labelledby")).toBe(repeat.id)
		expect(repeat.id).not.toBe("")
	})

	it("the first field takes focus when the section appears", async () => {
		const { w } = mountOwned()
		await flushPromises()
		expect(document.activeElement).toBe(nativeInput(w, FIELD))
	})

	it("the limit defaults to 128", async () => {
		const { w, password } = mountOwned()
		pasteInto(nativeInput(w, FIELD), "z".repeat(200))
		await flushPromises()
		expect(password.value).toHaveLength(128)
	})

	it("each field writes its own model in the page", async () => {
		const { w, password, repeated } = mountOwned()
		typeNow(nativeInput(w, FIELD), "first-secret")
		typeNow(nativeInput(w, CONFIRM), "second-secret")
		await flushPromises()
		expect([password.value, repeated.value]).toEqual(["first-secret", "second-secret"])
	})

	it("a model the page clears empties its field", async () => {
		const { w, password, repeated } = mountOwned()
		typeNow(nativeInput(w, FIELD), "first-secret")
		typeNow(nativeInput(w, CONFIRM), "first-secret")
		await flushPromises()
		password.value = ""
		repeated.value = ""
		await flushPromises()
		expect([nativeInput(w, FIELD).value, nativeInput(w, CONFIRM).value]).toEqual(["", ""])
	})

	it("one toggle reveals and hides both fields together", async () => {
		const { w } = mountOwned()
		const types = () => [nativeInput(w, FIELD).type, nativeInput(w, CONFIRM).type]
		expect(types()).toEqual(["password", "password"])
		await w.get('[data-testid="fp-input-visibility-toggle"]').trigger("click")
		expect(types()).toEqual(["text", "text"])
		await w.get('[data-testid="fp-input-visibility-toggle"]').trigger("click")
		expect(types()).toEqual(["password", "password"])
	})

	it("the hint says when the repeat differs, and stops once it matches", async () => {
		const { w } = mountOwned()
		const hint = () => w.get('[data-testid="fp-hint"]').text()
		typeNow(nativeInput(w, FIELD), "correct horse battery staple")
		typeNow(nativeInput(w, CONFIRM), "correct horse battery")
		await flushPromises()
		expect(hint()).toBe(NEW_PASSWORD_HINTS.mismatch)
		typeNow(nativeInput(w, CONFIRM), "correct horse battery staple")
		await flushPromises()
		expect(hint()).not.toBe(NEW_PASSWORD_HINTS.mismatch)
	})

	it("both fields ask for a new password, so a manager never fills the profile password", () => {
		const { w } = mountOwned()
		expect([nativeInput(w, FIELD).autocomplete, nativeInput(w, CONFIRM).autocomplete]).toEqual(["new-password", "new-password"])
	})

	it("every control is named after the page's testid", () => {
		const { w } = mountOwned({ testid: "other" })
		for (const id of ["other-input", "other-input-visibility-toggle", "other-hint", "other-confirm-input"]) {
			expect(w.find(`[data-testid="${id}"]`).exists()).toBe(true)
		}
	})
})
