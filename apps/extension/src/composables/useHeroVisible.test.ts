import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { defineComponent, h, type Ref, ref } from "vue"
import { useHeroVisible } from "./useHeroVisible"

/** An observer that delivers only what a test hands it, and nothing once disconnected, as the platform's. */
class FakeObserver {
	static made: FakeObserver[] = []
	observed: Element[] = []
	disconnected = false

	constructor(
		readonly callback: IntersectionObserverCallback,
		readonly options?: IntersectionObserverInit,
	) {
		FakeObserver.made.push(this)
	}

	observe(target: Element) {
		this.observed.push(target)
	}

	disconnect() {
		this.disconnected = true
	}

	/** One delivery carrying an entry per value, oldest first. */
	deliver(...intersecting: boolean[]) {
		if (this.disconnected) return
		this.callback(
			intersecting.map((isIntersecting) => ({ isIntersecting }) as IntersectionObserverEntry),
			this as unknown as IntersectionObserver,
		)
	}
}

/** A page with a hero element (or none), exposing what the composable reports. */
function mountPage({ withHero = true } = {}) {
	let visible: Readonly<Ref<boolean>> | undefined
	const hero = ref<Element | null>(null)
	const wrapper = mount(
		defineComponent({
			setup() {
				visible = useHeroVisible(hero)
				return () => (withHero ? h("div", { ref: hero, "data-testid": "hero" }) : h("span"))
			},
		}),
	)
	return { wrapper, hero, visible: visible as Readonly<Ref<boolean>> }
}

beforeEach(() => {
	FakeObserver.made = []
	vi.stubGlobal("IntersectionObserver", FakeObserver)
})
afterEach(() => vi.unstubAllGlobals())

describe("useHeroVisible", () => {
	test("reports the hero visible before any delivery", () => {
		expect(mountPage().visible.value).toBe(true)
	})

	test("creates no observer when the page has no hero element", () => {
		const { visible } = mountPage({ withHero: false })
		expect(FakeObserver.made).toHaveLength(0)
		expect(visible.value).toBe(true)
	})

	test("observes the hero element on mount, at threshold 0", () => {
		const { wrapper } = mountPage()
		const [observer] = FakeObserver.made
		expect(observer.observed).toEqual([wrapper.get('[data-testid="hero"]').element])
		expect(observer.options).toEqual({ threshold: 0 })
	})

	test("a hero leaving the screen reports it hidden", () => {
		const { visible } = mountPage()
		FakeObserver.made[0].deliver(false)
		expect(visible.value).toBe(false)
	})

	test("a hero coming back reports it visible again", () => {
		const { visible } = mountPage()
		FakeObserver.made[0].deliver(false)
		FakeObserver.made[0].deliver(true)
		expect(visible.value).toBe(true)
	})

	test("a batched delivery that ends hidden reports hidden", () => {
		const { visible } = mountPage()
		FakeObserver.made[0].deliver(true, false)
		expect(visible.value).toBe(false)
	})

	test("a batched delivery that ends visible reports visible", () => {
		const { visible } = mountPage()
		FakeObserver.made[0].deliver(false)
		FakeObserver.made[0].deliver(false, true)
		expect(visible.value).toBe(true)
	})

	test("disconnects when the page unmounts, and not before", () => {
		const { wrapper } = mountPage()
		const [observer] = FakeObserver.made
		expect(observer.disconnected).toBe(false)
		wrapper.unmount()
		expect(observer.disconnected).toBe(true)
	})

	test("reports nothing after the page unmounts", () => {
		const { wrapper, visible } = mountPage()
		const [observer] = FakeObserver.made
		observer.deliver(false)
		wrapper.unmount()
		observer.deliver(true)
		expect(visible.value).toBe(false)
	})

	test("each mount makes one observer and disconnects only its own", () => {
		const first = mountPage()
		first.wrapper.unmount()
		mountPage()
		expect(FakeObserver.made).toHaveLength(2)
		expect(FakeObserver.made.map((o) => o.disconnected)).toEqual([true, false])
	})
})
