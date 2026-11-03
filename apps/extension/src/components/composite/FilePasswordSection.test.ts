import { Flex, Icon, Input, Text } from "@nulo/design"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, it } from "vitest"
import { defineComponent, h, ref } from "vue"
import { nativeInput, pasteInto } from "../../../tests/helpers/credential-pins"
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

	it("labels the second field Repeat password only when the page asks", () => {
		const labels = (w: VueWrapper) => w.findAll(".export_section_label").map((label) => label.text())
		expect(labels(mountOwned().w)).toEqual(["File password"])

		const { w } = mountOwned({ labelRepeat: true })
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

	it("every control is named after the page's testid", () => {
		const { w } = mountOwned({ testid: "other" })
		for (const id of ["other-input", "other-input-visibility-toggle", "other-hint", "other-confirm-input"]) {
			expect(w.find(`[data-testid="${id}"]`).exists()).toBe(true)
		}
	})
})
