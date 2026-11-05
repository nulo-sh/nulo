import { Flex, Icon, Input, Text } from "@nulo/design"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, it } from "vitest"
import { defineComponent, h, ref } from "vue"
import { expectMaskToggle, expectNativeAttrs, nativeInput, typeNow } from "../../../tests/helpers/credential-pins"
import { sendEvent } from "../../../tests/helpers/send-event"
import CurrentPasswordField from "./CurrentPasswordField.vue"

const wrappers: VueWrapper[] = []
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
})

const FIELD = "cp-input"
const ALERT = "cp-error"
const TOGGLE = "cp-toggle"

/** Mounted in a 12 px column under a host that owns the password, the error and, with an eye, the
 *  visibility flag, as the pages do. The host's attributes and listeners go on the field. */
function mountOwned(props: Record<string, unknown> = {}, { eye = false, error = false } = {}) {
	const password = ref("")
	const wrong = ref(error)
	const hidden = ref(true)
	const heard = { input: 0, click: 0 }
	const Host = defineComponent(
		() => () =>
			h("div", { "data-testid": "column" }, [
				h(CurrentPasswordField, {
					placeholder: "Enter password",
					autocomplete: "current-password",
					"data-testid": FIELD,
					errorTestid: ALERT,
					...props,
					error: wrong.value,
					modelValue: password.value,
					"onUpdate:modelValue": (v: string) => (password.value = v),
					onInput: () => heard.input++,
					onClick: () => heard.click++,
					...(eye ? { toggleTestid: TOGGLE, hidden: hidden.value, onToggle: () => (hidden.value = !hidden.value) } : {}),
				}),
			]),
	)
	const w = mount(Host, { attachTo: document.body, global: { components: { Flex, Icon, Input, Text }, stubs: { transition: false } } })
	wrappers.push(w)
	return { w, password, wrong, hidden, heard }
}

const column = (w: VueWrapper) => w.get('[data-testid="column"]').element
const alert = (w: VueWrapper) => w.find(`[data-testid="${ALERT}"]`)

describe("CurrentPasswordField", () => {
	it("the host's attributes land on the field: its testid on the Input, its placeholder and autocomplete on the native input", () => {
		const { w } = mountOwned()
		expect(nativeInput(w, FIELD).placeholder).toBe("Enter password")
		expectNativeAttrs(w, FIELD, { autocomplete: "current-password" })
		expect(w.findAll("[data-testid]").map((el) => el.attributes("data-testid"))).toEqual(["column", FIELD])
	})

	it("v-model reaches the Input both ways", async () => {
		const { w, password } = mountOwned()
		typeNow(nativeInput(w, FIELD), "secret")
		await flushPromises()
		expect(password.value).toBe("secret")
		password.value = "other"
		await flushPromises()
		expect(nativeInput(w, FIELD).value).toBe("other")
	})

	it("the host's input and click listeners hear the field", async () => {
		const { w, heard } = mountOwned()
		typeNow(nativeInput(w, FIELD), "a")
		sendEvent(nativeInput(w, FIELD), "click")
		await flushPromises()
		expect(heard).toEqual({ input: 1, click: 1 })
	})

	it("focuses the field on mount only when the host asks", async () => {
		mountOwned()
		await flushPromises()
		expect(document.activeElement).toBe(document.body)
		const { w } = mountOwned({ autofocus: true })
		await flushPromises()
		expect(document.activeElement).toBe(nativeInput(w, FIELD))
	})

	it("no error: no alert, no shake, the field not marked invalid", () => {
		const { w } = mountOwned()
		expect(alert(w).exists()).toBe(false)
		expect(nativeInput(w, FIELD).getAttribute("aria-invalid")).not.toBe("true")
		expect((column(w).firstElementChild as HTMLElement).className).not.toMatch(/shake/)
	})

	it("an error shows the alert by its testid and role, shakes the wrapper and marks the field invalid", () => {
		const { w } = mountOwned({}, { error: true })
		expect(alert(w).attributes("role")).toBe("alert")
		expect(alert(w).text()).toBe("Wrong password")
		expect(nativeInput(w, FIELD).getAttribute("aria-invalid")).toBe("true")
		expect((column(w).firstElementChild as HTMLElement).className).toMatch(/shake/)
	})

	it("the shake and the alert follow the host's error as it changes", async () => {
		const { w, wrong } = mountOwned()
		wrong.value = true
		await flushPromises()
		expect(alert(w).exists()).toBe(true)
		wrong.value = false
		await flushPromises()
		expect((column(w).firstElementChild as HTMLElement).className).not.toMatch(/shake/)
	})

	it("the alert's text can be replaced", () => {
		const { w } = mountOwned({ errorText: "Wrong current password" }, { error: true })
		expect(alert(w).text()).toBe("Wrong current password")
	})

	it("the shake wrapper and the alert are two siblings in the host's column, the field inside the wrapper", () => {
		const { w } = mountOwned({}, { error: true })
		const children = [...column(w).children]
		expect(children).toHaveLength(2)
		expect(children[0].contains(nativeInput(w, FIELD))).toBe(true)
		expect(children[1]).toBe(alert(w).element)
	})

	it("with no eye the field stays masked, whatever the flag says", () => {
		const { w } = mountOwned({ hidden: false })
		expect(w.find("button").exists()).toBe(false)
		expect(nativeInput(w, FIELD).type).toBe("password")
	})

	it("with an eye, the host's flag masks the field and two clicks in one task cancel out", async () => {
		const { w } = mountOwned({}, { eye: true })
		await expectMaskToggle(w, { toggle: TOGGLE, field: FIELD, drives: [FIELD] })
	})
})
