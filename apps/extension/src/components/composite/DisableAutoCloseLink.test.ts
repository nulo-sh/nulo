import { mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, it } from "vitest"
import { pressOn } from "../../../tests/helpers/press-key"
import DisableAutoCloseLink from "./DisableAutoCloseLink.vue"

const wrappers: VueWrapper[] = []
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
})

function mountLink(options: Parameters<typeof mount>[1] = {}) {
	const w = mount(DisableAutoCloseLink, { props: { testid: "disable-x" }, attachTo: document.body, ...options })
	wrappers.push(w)
	return w
}

describe("DisableAutoCloseLink", () => {
	it("reads exactly what it does", () => {
		expect(mountLink().text()).toBe("Disable auto-close")
	})

	it("keeps its words whatever a page puts inside it", () => {
		expect(mountLink({ slots: { default: "Keep them open" } }).text()).toBe("Disable auto-close")
	})

	it("is a native button that submits no form", () => {
		const el = mountLink().get("button").element
		expect(el.getAttribute("type")).toBe("button")
	})

	it("carries the testid its page names", () => {
		expect(mountLink().find('[data-testid="disable-x"]').exists()).toBe(true)
	})

	it("emits click once per press", async () => {
		const w = mountLink()
		await w.get("button").trigger("click")
		expect(w.emitted("click")).toHaveLength(1)
		await w.get("button").trigger("click")
		expect(w.emitted("click")).toHaveLength(2)
	})

	it("is reachable by Tab, as a link is", () => {
		const el = mountLink().get("button").element
		expect(el.tabIndex).toBe(0)
		expect(el.hasAttribute("tabindex")).toBe(false)
	})

	it.each([["Enter"], [" "]] as const)("%j presses it, as a focused button", (key) => {
		const w = mountLink()
		const el = w.get("button").element as HTMLButtonElement
		pressOn(el, key)
		expect(document.activeElement).toBe(el)
		expect(w.emitted("click")).toHaveLength(1)
	})

	it("passes a page's class to its root", () => {
		const w = mountLink({ attrs: { class: "page-x" } })
		expect(w.get("button").classes()).toContain("page-x")
	})

	it("draws as a link on a class of its own, with no page class", () => {
		expect(mountLink().get("button").classes()).not.toHaveLength(0)
	})
})
