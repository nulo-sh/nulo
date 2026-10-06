import { afterEach, describe, expect, test } from "vitest"
import { defineComponent, h, ref } from "vue"
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import NewProfileMethodTabs from "./NewProfileMethodTabs.vue"

const mountTabs = (type = "password") => mount(NewProfileMethodTabs, { props: { type } })
const tablist = (w: ReturnType<typeof mountTabs>) => w.get('[role="tablist"]')
const pwTab = (w: ReturnType<typeof mountTabs>) => w.get('[data-testid="register-method-password"]')
const pkTab = (w: ReturnType<typeof mountTabs>) => w.get('[data-testid="register-method-passkey"]')

describe("new-profile/NewProfileMethodTabs (roving tablist)", () => {
	test("only the ACTIVE tab is in the Tab order (tabindex 0); the other is -1", () => {
		const w = mountTabs("password")
		expect(pwTab(w).attributes("tabindex")).toBe("0")
		expect(pkTab(w).attributes("tabindex")).toBe("-1")
	})

	test("activating passkey moves the single tab stop to it", () => {
		const w = mountTabs("passkey")
		expect(pkTab(w).attributes("tabindex")).toBe("0")
		expect(pwTab(w).attributes("tabindex")).toBe("-1")
	})

	test("clicking a tab emits update:type", async () => {
		const w = mountTabs("password")
		await pkTab(w).trigger("click")
		expect(w.emitted("update:type")?.at(-1)).toEqual(["passkey"])
	})

	test("ArrowRight switches the method (roving)", async () => {
		const w = mountTabs("password")
		await tablist(w).trigger("keydown", { key: "ArrowRight" })
		expect(w.emitted("update:type")?.at(-1)).toEqual(["passkey"])
	})

	test("ArrowLeft switches the method (roving)", async () => {
		const w = mountTabs("passkey")
		await tablist(w).trigger("keydown", { key: "ArrowLeft" })
		expect(w.emitted("update:type")?.at(-1)).toEqual(["password"])
	})

	test("a non-arrow key does NOT switch the method", async () => {
		const w = mountTabs("password")
		await tablist(w).trigger("keydown", { key: "a" })
		expect(w.emitted("update:type")).toBeUndefined()
	})

	test("exposes role=tablist + role=tab + aria-selected for assistive tech", () => {
		const w = mountTabs("password")
		expect(tablist(w).attributes("aria-label")).toBe("Authentication method")
		expect(pwTab(w).attributes("role")).toBe("tab")
		expect(pwTab(w).attributes("aria-selected")).toBe("true")
		expect(pkTab(w).attributes("aria-selected")).toBe("false")
	})
})

describe("new-profile/NewProfileMethodTabs under a parent that owns the method", () => {
	type Method = "password" | "passkey"
	const wrappers: VueWrapper[] = []
	afterEach(() => {
		for (const w of wrappers.splice(0)) w.unmount()
	})

	function mountOwned() {
		const Host = defineComponent(() => {
			const type = ref<Method>("password")
			return () => h(NewProfileMethodTabs, { type: type.value, "onUpdate:type": (v: Method) => (type.value = v) })
		})
		const w = mount(Host, { attachTo: document.body })
		wrappers.push(w)
		return w
	}
	const tab = (w: VueWrapper, method: Method) => w.get(`[data-testid="register-method-${method}"]`)
	const press = (key: string) => {
		const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
		document.activeElement?.dispatchEvent(event)
		return event
	}
	const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0))

	test("a Method label over two non-submitting tabs, Password then Passkey", () => {
		const w = mountOwned()
		expect(w.text()).toContain("Method")
		expect(w.findAll('[role="tablist"] > *').map((t) => [t.attributes("data-testid"), t.attributes("type"), t.text()])).toEqual([
			["register-method-password", "button", "Password"],
			["register-method-passkey", "button", "Passkey"],
		])
	})

	test("ArrowRight and ArrowLeft move the method, the one tab stop and the focus", async () => {
		const w = mountOwned()
		;(tab(w, "password").element as HTMLElement).focus()

		expect(press("ArrowRight").defaultPrevented).toBe(true)
		await flushPromises()
		expect(tab(w, "passkey").attributes()).toMatchObject({ "aria-selected": "true", tabindex: "0" })
		expect(tab(w, "password").attributes()).toMatchObject({ "aria-selected": "false", tabindex: "-1" })
		expect(document.activeElement).toBe(tab(w, "passkey").element)

		expect(press("ArrowLeft").defaultPrevented).toBe(true)
		await flushPromises()
		expect(tab(w, "password").attributes("aria-selected")).toBe("true")
		expect(document.activeElement).toBe(tab(w, "password").element)
	})

	test("two ArrowRight presses in separate tasks go Password → Passkey → Password", async () => {
		const w = mountOwned()
		;(tab(w, "password").element as HTMLElement).focus()
		press("ArrowRight")
		await macrotask()
		expect(document.activeElement).toBe(tab(w, "passkey").element)
		press("ArrowRight")
		await macrotask()
		expect(tab(w, "password").attributes("aria-selected")).toBe("true")
		expect(document.activeElement).toBe(tab(w, "password").element)
	})

	test("any other key leaves the method alone and is not prevented", async () => {
		const w = mountOwned()
		;(tab(w, "password").element as HTMLElement).focus()
		for (const key of ["a", "ArrowDown", "Home"]) expect(press(key).defaultPrevented).toBe(false)
		await flushPromises()
		expect(tab(w, "password").attributes("aria-selected")).toBe("true")
		expect(document.activeElement).toBe(tab(w, "password").element)
	})

	test("the active tab carries the one class the inactive lacks, and it follows the method", async () => {
		const w = mountOwned()
		const extra = (on: Method, off: Method) => {
			const offClasses = tab(w, off).classes()
			return tab(w, on)
				.classes()
				.filter((c) => !offClasses.includes(c))
		}
		const active = extra("password", "passkey")
		expect(active).toHaveLength(1)
		expect(extra("passkey", "password")).toEqual([])

		await tab(w, "passkey").trigger("click")
		expect(extra("passkey", "password")).toEqual(active)
		expect(extra("password", "passkey")).toEqual([])
	})
})
