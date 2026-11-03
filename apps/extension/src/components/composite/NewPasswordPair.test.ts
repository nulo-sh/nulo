import { Flex, Icon, Input, Text } from "@nulo/design"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, it } from "vitest"
import { defineComponent, h, ref } from "vue"
import { expectMaskToggle, expectNativeAttrs, nativeInput, pasteInto, typeNow } from "../../../tests/helpers/credential-pins"
import { sendEvent } from "../../../tests/helpers/send-event"
import { NEW_PASSWORD_HINTS } from "@/utils/password-hint"
import NewPasswordPair from "./NewPasswordPair.vue"

const wrappers: VueWrapper[] = []
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
})

const FIELD = "np-input"
const CONFIRM = "np-confirm-input"
const TOGGLE = "np-toggle"
const TESTIDS = { input: FIELD, confirm: CONFIRM, toggle: TOGGLE, hint: "np-hint" }

/** Mounted under a host that owns both password models, as every page does; `hidden` stays the
 *  pair's own unless `ownHidden` binds it to a host ref. */
function mountOwned(props: Record<string, unknown> = {}, { ownHidden = false, slot = "" } = {}) {
	const password = ref("")
	const repeated = ref("")
	const hidden = ref(true)
	const inputs: Event[] = []
	const Host = defineComponent(
		() => () =>
			h(
				NewPasswordPair,
				{
					testids: TESTIDS,
					...props,
					password: password.value,
					repeatedPassword: repeated.value,
					"onUpdate:password": (v: string) => (password.value = v),
					"onUpdate:repeatedPassword": (v: string) => (repeated.value = v),
					...(ownHidden ? { hidden: hidden.value, "onUpdate:hidden": (v: boolean) => (hidden.value = v) } : {}),
					onInput: (e: Event) => inputs.push(e),
				},
				slot ? { default: () => h("p", { "data-testid": "np-note" }, slot) } : undefined,
			),
	)
	const w = mount(Host, { attachTo: document.body, global: { components: { Flex, Icon, Input, Text } } })
	wrappers.push(w)
	return { w, password, repeated, hidden, inputs }
}

const hint = (w: VueWrapper) => w.get('[data-testid="np-hint"]').text()
const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe("NewPasswordPair", () => {
	it("typing writes each model on its own", async () => {
		const { w, password, repeated } = mountOwned()
		typeNow(nativeInput(w, FIELD), "abc")
		typeNow(nativeInput(w, CONFIRM), "xyz")
		await flushPromises()
		expect([password.value, repeated.value]).toEqual(["abc", "xyz"])
	})

	it.each([
		["", "", NEW_PASSWORD_HINTS.short],
		["1234567", "1234567", NEW_PASSWORD_HINTS.short],
		["12345678", "12345679", NEW_PASSWORD_HINTS.mismatch],
		["12345678", "12345678", NEW_PASSWORD_HINTS.common],
		["kettle-violet", "kettle-violet", NEW_PASSWORD_HINTS.good],
		["silver-otter-lamp", "silver-otter-lamp", NEW_PASSWORD_HINTS.strong],
	])("the hint for %j / %j reads %j", async (a, b, text) => {
		const { w } = mountOwned()
		typeNow(nativeInput(w, FIELD), a)
		typeNow(nativeInput(w, CONFIRM), b)
		await flushPromises()
		expect(hint(w)).toBe(text)
	})

	it("one eye masks both fields", async () => {
		const { w } = mountOwned()
		await expectMaskToggle(w, { toggle: TOGGLE, field: FIELD, drives: [FIELD, CONFIRM] })
	})

	it("a host-owned flag: the eye writes it, two clicks in one task cancel out, and a host write reaches both fields", async () => {
		const { w, hidden } = mountOwned({}, { ownHidden: true })
		await expectMaskToggle(w, { toggle: TOGGLE, field: FIELD, drives: [FIELD, CONFIRM] })
		expect(hidden.value).toBe(true)
		hidden.value = false
		await flushPromises()
		expect([nativeInput(w, FIELD).type, nativeInput(w, CONFIRM).type]).toEqual(["text", "text"])
		sendEvent(w.get(`[data-testid="${TOGGLE}"]`).element, "click")
		await flushPromises()
		expect(hidden.value).toBe(true)
	})

	it("both fields ask the browser for a new password", () => {
		const { w } = mountOwned()
		for (const id of [FIELD, CONFIRM]) expectNativeAttrs(w, id, { autocomplete: "new-password" })
	})

	it("placeholders default to Enter new password and Repeat password, and each can be replaced", () => {
		const { w } = mountOwned()
		expect([nativeInput(w, FIELD).placeholder, nativeInput(w, CONFIRM).placeholder]).toEqual(["Enter new password", "Repeat password"])
		const other = mountOwned({ placeholder: "Strong password", repeatPlaceholder: "Repeat new password" }).w
		expect([nativeInput(other, FIELD).placeholder, nativeInput(other, CONFIRM).placeholder]).toEqual([
			"Strong password",
			"Repeat new password",
		])
	})

	it("nothing takes focus unless the host asks, and then the first field does", async () => {
		mountOwned()
		await flushPromises()
		expect(document.activeElement).toBe(document.body)
		const { w } = mountOwned({ autofocus: true })
		await flushPromises()
		expect(document.activeElement).toBe(nativeInput(w, FIELD))
	})

	it("a paste is capped at the given limit", async () => {
		const { w, password } = mountOwned({ maxLength: 16 })
		expect(pasteInto(nativeInput(w, FIELD), "y".repeat(40))).toBe(true)
		await flushPromises()
		expect(password.value).toBe("y".repeat(16))
	})

	it("the limit defaults to 128 on both fields", async () => {
		const { w, password, repeated } = mountOwned()
		for (const id of [FIELD, CONFIRM]) pasteInto(nativeInput(w, id), "z".repeat(200))
		await flushPromises()
		expect([password.value.length, repeated.value.length]).toEqual([128, 128])
	})

	it("labels the repeat field Repeat password only when asked", () => {
		expect(mountOwned().w.find(".export_section_label").exists()).toBe(false)
		const { w } = mountOwned({ labelRepeat: true })
		const label = w.get(".export_section_label").element
		expect(label.textContent).toBe("Repeat password")
		expect(follows(nativeInput(w, FIELD), label) && follows(label, nativeInput(w, CONFIRM))).toBe(true)
		expect(nativeInput(w, CONFIRM).getAttribute("aria-labelledby")).toBe(label.id)
		expect(label.id).not.toBe("")
	})

	it("names each control with the exact testid given, and the hint only when a hint id is given", () => {
		const { w } = mountOwned()
		for (const id of [FIELD, CONFIRM, TOGGLE, "np-hint"]) expect(w.findAll(`[data-testid="${id}"]`)).toHaveLength(1)
		const bare = mountOwned({ testids: { input: FIELD, confirm: CONFIRM, toggle: TOGGLE } }).w
		expect(bare.findAll("[data-testid]").map((el) => el.attributes("data-testid"))).toEqual([FIELD, TOGGLE, CONFIRM])
		expect(bare.text()).toContain(NEW_PASSWORD_HINTS.short)
	})

	it("the slot follows the repeat field, inside the pair", () => {
		const { w } = mountOwned({}, { slot: "A note" })
		const note = w.get('[data-testid="np-note"]').element
		expect(w.element.contains(note)).toBe(true)
		expect(follows(nativeInput(w, CONFIRM), note)).toBe(true)
	})

	it("a host's input listener hears each keystroke in either field once", async () => {
		const { w, inputs } = mountOwned()
		typeNow(nativeInput(w, FIELD), "a")
		typeNow(nativeInput(w, CONFIRM), "b")
		await flushPromises()
		expect(inputs.map((e) => e.target)).toEqual([nativeInput(w, FIELD), nativeInput(w, CONFIRM)])
	})
})
