import { Flex, Icon, Input, Text } from "@nulo/design"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, it } from "vitest"
import { defineComponent, h, ref } from "vue"
import UnlockMethodChoice from "./UnlockMethodChoice.vue"

type Method = "password" | "passkey"

const wrappers: VueWrapper[] = []
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
})

const IDS = { passwordTestid: "m-password", passkeyTestid: "m-passkey" }
const NOTE = "Your passkey replaces a password. Touch ID, Windows Hello, or a hardware key, whichever your device supports."

/** Mounted under a parent that owns the model, as both import forms do; the slot holds a field. */
function mountOwned(initial?: Method) {
	const method = ref<Method | undefined>(initial)
	const Host = defineComponent(
		() => () =>
			h(
				UnlockMethodChoice,
				{
					...IDS,
					...(method.value ? { modelValue: method.value } : {}),
					"onUpdate:modelValue": (v: Method) => (method.value = v),
				},
				{ default: () => h("input", { "data-testid": "slot-field" }) },
			),
	)
	const w = mount(Host, { attachTo: document.body, global: { components: { Flex, Icon, Input, Text } } })
	wrappers.push(w)
	return { w, method }
}

const tab = (w: VueWrapper, m: Method) => w.get(`[data-testid="m-${m}"]`)
const note = (w: VueWrapper) => w.find('[data-testid="unlock-method-passkey-note"]')
const field = (w: VueWrapper) => w.find('[data-testid="slot-field"]')

describe("UnlockMethodChoice", () => {
	it("is labelled for what it decides, as its tablist's name too", () => {
		const { w } = mountOwned("passkey")
		expect(w.text()).toContain("How you'll unlock Nulo")
		expect(w.get('[role="tablist"]').attributes("aria-label")).toBe("How you'll unlock Nulo")
	})

	it("lists Passkey before Password", () => {
		const { w } = mountOwned("passkey")
		expect(w.findAll('[role="tab"]').map((t) => t.text())).toEqual(["Passkey", "Password"])
	})

	it("opens on Passkey when the parent sets nothing", () => {
		const { w } = mountOwned()
		expect(tab(w, "passkey").attributes("aria-selected")).toBe("true")
		expect(note(w).exists()).toBe(true)
	})

	it("on Passkey: the note, word for word, and no password field", () => {
		const { w } = mountOwned("passkey")
		expect(note(w).text()).toBe(NOTE)
		expect(field(w).exists()).toBe(false)
	})

	it("on Password: the slotted fields, and no note", () => {
		const { w } = mountOwned("password")
		expect(field(w).exists()).toBe(true)
		expect(note(w).exists()).toBe(false)
	})

	it("a click on Password writes the model and swaps the note for the fields", async () => {
		const { w, method } = mountOwned("passkey")
		await tab(w, "password").trigger("click")
		expect(method.value).toBe("password")
		expect(field(w).exists()).toBe(true)
		expect(note(w).exists()).toBe(false)
	})

	it("a click on the selected tab changes nothing", async () => {
		const { w, method } = mountOwned("passkey")
		await tab(w, "passkey").trigger("click")
		expect(method.value).toBe("passkey")
		expect(note(w).exists()).toBe(true)
	})

	it("is one Tab stop: only the selected tab is tabbable", () => {
		const { w } = mountOwned("password")
		expect(tab(w, "password").attributes("tabindex")).toBe("0")
		expect(tab(w, "passkey").attributes("tabindex")).toBe("-1")
	})

	it("an arrow key switches the method and moves focus to it", async () => {
		const { w, method } = mountOwned("passkey")
		;(tab(w, "passkey").element as HTMLElement).focus()
		const event = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })
		tab(w, "passkey").element.dispatchEvent(event)
		expect(event.defaultPrevented).toBe(true)
		await flushPromises()
		expect(method.value).toBe("password")
		expect(document.activeElement).toBe(tab(w, "password").element)
	})

	it("a parent's change of method is shown, as a picked backup's method is", async () => {
		const { w, method } = mountOwned("password")
		method.value = "passkey"
		await flushPromises()
		expect(tab(w, "passkey").attributes("aria-selected")).toBe("true")
		expect(note(w).exists()).toBe(true)
	})

	it("the tabs carry the testids the form names", () => {
		const { w } = mountOwned("passkey")
		expect(w.findAll('[role="tab"]').map((t) => t.attributes("data-testid"))).toEqual(["m-passkey", "m-password"])
	})
})
