import { describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"

const routerPush = vi.fn()
const routerBack = vi.fn()
const closeOwnWindow = vi.hoisted(() => vi.fn(async () => false))

vi.mock("@/utils/own-window", () => ({ closeOwnWindow }))

vi.mock("vue-router", async () => {
	const actual = await vi.importActual<typeof import("vue-router")>("vue-router")
	return {
		...actual,
		useRouter: () => ({ back: routerBack, push: routerPush }),
	}
})

import SubPageHeader from "./SubPageHeader.vue"

const STUBS = {
	Flex: { template: '<div :class="$attrs.class"><slot /></div>', inheritAttrs: false },
	MaterialIcon: { template: '<span data-testid="stub-mat-icon" :data-name="name" />', props: ["name", "size", "color"] },
}

const mountHeader = (props: Record<string, unknown> = {}, slots: Record<string, string> = {}) =>
	mount(SubPageHeader, { props, slots, global: { stubs: STUBS } })

describe("ui/SubPageHeader", () => {
	test("renders the title prop", () => {
		const w = mountHeader({ title: "Settings" })
		expect(w.text()).toContain("Settings")
	})

	test("title slot overrides the title prop", () => {
		const w = mountHeader({ title: "Default" }, { title: "<span>Custom title</span>" })
		expect(w.text()).toContain("Custom title")
		expect(w.text()).not.toContain("Default")
	})

	test("renders the back button by default", () => {
		const w = mountHeader({ title: "X" })
		const btn = w.find("button[aria-label='Back']")
		expect(btn.exists()).toBe(true)
	})

	test("showBack=false hides the back button", () => {
		const w = mountHeader({ title: "X", showBack: false })
		const btn = w.find("button[aria-label='Back']")
		expect(btn.exists()).toBe(false)
	})

	test("leadingIcon prop renders a MaterialIcon stub before the title", () => {
		const w = mountHeader({ title: "Settings", leadingIcon: "settings" })
		const icon = w.find('[data-name="settings"]')
		expect(icon.exists()).toBe(true)
	})

	test("trailing slot renders inside the trailing region", () => {
		const w = mountHeader({ title: "X" }, { trailing: '<button id="cta">Edit</button>' })
		expect(w.find("#cta").exists()).toBe(true)
	})

	test("clicking back uses router.back when window.history.length > 1", async () => {
		routerPush.mockClear()
		routerBack.mockClear()
		Object.defineProperty(window.history, "length", { configurable: true, value: 5 })
		const w = mountHeader({ title: "X" })
		await w.find("button[aria-label='Back']").trigger("click")
		await flushPromises()
		expect(routerBack).toHaveBeenCalledTimes(1)
	})

	test("clicking back falls back to backTo prop when history is empty", async () => {
		routerPush.mockClear()
		routerBack.mockClear()
		Object.defineProperty(window.history, "length", { configurable: true, value: 1 })
		const w = mountHeader({ title: "X", backTo: "/popup/profile" })
		await w.find("button[aria-label='Back']").trigger("click")
		await flushPromises()
		expect(routerPush).toHaveBeenCalledWith("/popup/profile")
	})

	test("in an own window, back closes the window and leaves the router alone", async () => {
		routerPush.mockClear()
		routerBack.mockClear()
		closeOwnWindow.mockResolvedValueOnce(true)
		Object.defineProperty(window.history, "length", { configurable: true, value: 5 })
		const w = mountHeader({ title: "X", backTo: "/popup/profile" })
		await w.find("button[aria-label='Back']").trigger("click")
		await flushPromises()
		expect(closeOwnWindow).toHaveBeenCalled()
		expect(routerBack).not.toHaveBeenCalled()
		expect(routerPush).not.toHaveBeenCalled()
	})
})
