import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import ScrollMoreButton from "./ScrollMoreButton.vue"

const isNudging = (w: ReturnType<typeof mount>) =>
	w
		.find("button")
		.classes()
		.some((c) => c.includes("nudge"))

describe("ui/ScrollMoreButton", () => {
	test("a shown button is a native button out of the Tab path, named, carrying the host's testid", () => {
		const w = mount(ScrollMoreButton, { props: { shown: true }, attrs: { "data-testid": "scroll-more" } })
		const button = w.find("button")
		expect(button.attributes("type")).toBe("button")
		expect(button.attributes("tabindex")).toBe("-1")
		expect(button.attributes("aria-label")).toBe("Show more below")
		expect(button.attributes("data-testid")).toBe("scroll-more")
	})

	test("a hidden button renders nothing, the host's attributes included", () => {
		const w = mount(ScrollMoreButton, { props: { shown: false }, attrs: { "data-testid": "scroll-more" } })
		expect(w.find("button").exists()).toBe(false)
		expect(w.find("[data-testid='scroll-more']").exists()).toBe(false)
	})

	test("a press emits press", async () => {
		const w = mount(ScrollMoreButton, { props: { shown: true } })
		await w.find("button").trigger("click")
		expect(w.emitted("press")).toHaveLength(1)
	})

	test("a pointer down is refused its default, so focus stays where it was", () => {
		const w = mount(ScrollMoreButton, { props: { shown: true } })
		const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true })
		w.find("button").element.dispatchEvent(down)
		expect(down.defaultPrevented).toBe(true)
	})

	test("a nudge a hide interrupts, as under reduced motion where no animation ends, never replays", async () => {
		const w = mount(ScrollMoreButton, { props: { shown: true } })
		expect(isNudging(w)).toBe(true)
		await w.setProps({ shown: false })
		await w.setProps({ shown: true })
		expect(isNudging(w)).toBe(false)
	})

	test("it nudges on its first show and never again once the nudge ends", async () => {
		const w = mount(ScrollMoreButton, { props: { shown: false } })
		await w.setProps({ shown: true })
		expect(isNudging(w)).toBe(true)
		await w.find("button").trigger("animationend")
		expect(isNudging(w)).toBe(false)
		await w.setProps({ shown: false })
		await w.setProps({ shown: true })
		expect(isNudging(w)).toBe(false)
	})
})
