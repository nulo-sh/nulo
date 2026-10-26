import { mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, describe, expect, it } from "vitest"
import { pressOn } from "../../../tests/helpers/press-key"
import { sendEvent } from "../../../tests/helpers/send-event"
import PasskeyReuseLink from "./PasskeyReuseLink.vue"

const wrappers: VueWrapper[] = []
afterEach(() => {
	for (const w of wrappers.splice(0)) w.unmount()
})

function mountLink(props: Record<string, unknown> = {}) {
	const w = mount(PasskeyReuseLink, { props: { testid: "reuse-x", ...props }, attachTo: document.body })
	wrappers.push(w)
	return w
}

describe("PasskeyReuseLink", () => {
	it("reads exactly what it offers", () => {
		expect(mountLink().text()).toBe("Use a passkey I already have")
	})

	it("is a native button that submits no form", () => {
		const el = mountLink().get("button").element
		expect(el.getAttribute("type")).toBe("button")
	})

	it("carries the testid its page names", () => {
		expect(mountLink().find('[data-testid="reuse-x"]').exists()).toBe(true)
	})

	it("emits click once per press", async () => {
		const w = mountLink()
		await w.get("button").trigger("click")
		expect(w.emitted("click")).toHaveLength(1)
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

	it("disabled: no click reaches the page", () => {
		const w = mountLink({ disabled: true })
		const el = w.get("button").element as HTMLButtonElement
		expect(el.disabled).toBe(true)
		sendEvent(el, "click")
		expect(w.emitted("click")).toBeUndefined()
	})

	it("enabled by default", () => {
		expect((mountLink().get("button").element as HTMLButtonElement).disabled).toBe(false)
	})

	it("re-enables when its page allows it again", async () => {
		const w = mountLink({ disabled: true })
		await w.setProps({ disabled: false })
		await w.get("button").trigger("click")
		expect(w.emitted("click")).toHaveLength(1)
	})

	it("compact takes the popup's style on top of its own", () => {
		const loose = mountLink().get("button").classes()
		const tight = mountLink({ compact: true }).get("button").classes()
		expect(tight).toEqual(expect.arrayContaining(loose))
		expect(tight.length).toBe(loose.length + 1)
	})

	it("passes a page's class to its root", () => {
		const w = mount(PasskeyReuseLink, { props: { testid: "r" }, attrs: { class: "page-x" } })
		expect(w.get("button").classes()).toContain("page-x")
	})
})
