import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { defineComponent, h, ref } from "vue"
import AuthMethodTabs from "./AuthMethodTabs.vue"

type Method = "password" | "passkey"

const wrappers: VueWrapper[] = []
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
	vi.restoreAllMocks()
})

const PROPS = {
	ariaLabel: "Pick one",
	tabClass: "tab-x",
	activeClass: "on-x",
	passwordTestid: "pw-x",
	passkeyTestid: "pk-x",
}

/** Mounts under a parent that owns the model, as both hosts do. */
function mountOwned(initial: Method = "password") {
	const method = ref<Method>(initial)
	const Host = defineComponent(
		() => () =>
			h(AuthMethodTabs, {
				...PROPS,
				class: "root-x",
				modelValue: method.value,
				"onUpdate:modelValue": (v: Method) => (method.value = v),
			}),
	)
	const w = mount(Host, { attachTo: document.body })
	wrappers.push(w)
	return { w, method }
}

const tab = (w: VueWrapper, method: Method) => w.get(`[data-testid="${method === "password" ? "pw-x" : "pk-x"}"]`)
const press = (key: string) => {
	const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
	document.activeElement?.dispatchEvent(event)
	return event
}
const focus = (w: VueWrapper, method: Method) => (tab(w, method).element as HTMLElement).focus()

describe("AuthMethodTabs", () => {
	test("renders a labelled tablist carrying the host's class", () => {
		const { w } = mountOwned()
		const root = w.get('[role="tablist"]')
		expect(root.attributes("aria-label")).toBe("Pick one")
		expect(root.classes()).toEqual(["root-x"])
	})

	test("renders Password then Passkey with the host's test ids", () => {
		const { w } = mountOwned()
		expect(w.findAll('[role="tab"]').map((t) => [t.attributes("data-testid"), t.text()])).toEqual([
			["pw-x", "Password"],
			["pk-x", "Passkey"],
		])
	})

	test("both tabs are non-submitting buttons", () => {
		const { w } = mountOwned()
		for (const t of w.findAll('[role="tab"]')) expect(t.attributes("type")).toBe("button")
	})

	test("the active tab takes the tab and active classes; the other only the tab class", () => {
		const { w } = mountOwned("passkey")
		expect(tab(w, "passkey").classes()).toEqual(["tab-x", "on-x"])
		expect(tab(w, "password").classes()).toEqual(["tab-x"])
	})

	test("only the active tab is in the Tab order, and it is the selected one", () => {
		const { w } = mountOwned("password")
		expect(tab(w, "password").attributes()).toMatchObject({ tabindex: "0", "aria-selected": "true" })
		expect(tab(w, "passkey").attributes()).toMatchObject({ tabindex: "-1", "aria-selected": "false" })
	})

	test("a click selects its tab", async () => {
		const { w, method } = mountOwned("password")
		await tab(w, "passkey").trigger("click")
		expect(method.value).toBe("passkey")
		expect(tab(w, "passkey").attributes("aria-selected")).toBe("true")
	})

	test("ArrowRight switches the method, is prevented, and moves focus to the new tab", async () => {
		const { w, method } = mountOwned("password")
		focus(w, "password")
		expect(press("ArrowRight").defaultPrevented).toBe(true)
		await flushPromises()
		expect(method.value).toBe("passkey")
		expect(document.activeElement).toBe(tab(w, "passkey").element)
	})

	test("ArrowLeft switches back the same way", async () => {
		const { w, method } = mountOwned("passkey")
		focus(w, "passkey")
		expect(press("ArrowLeft").defaultPrevented).toBe(true)
		await flushPromises()
		expect(method.value).toBe("password")
		expect(document.activeElement).toBe(tab(w, "password").element)
	})

	test("another key changes nothing and is not prevented", async () => {
		const { w, method } = mountOwned("password")
		focus(w, "password")
		for (const key of ["Enter", "ArrowUp", "End", "a"]) expect(press(key).defaultPrevented).toBe(false)
		await flushPromises()
		expect(method.value).toBe("password")
		expect(document.activeElement).toBe(tab(w, "password").element)
	})

	test("the model is required", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		const w = mount(AuthMethodTabs, { props: PROPS as never })
		wrappers.push(w)
		expect(warn.mock.calls.some((c) => String(c[0]).includes('Missing required prop: "modelValue"'))).toBe(true)
	})
})
