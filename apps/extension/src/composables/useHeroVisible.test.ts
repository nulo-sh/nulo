import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { defineComponent, h, type Ref, ref } from "vue"
import { useHeroVisible } from "./useHeroVisible"

/** An observer that delivers only what a test hands it. */
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

	test("two pages mounted at once each report their own hero", () => {
		const first = mountPage()
		const second = mountPage()
		expect(FakeObserver.made).toHaveLength(2)
		FakeObserver.made[0].deliver(false)
		expect(first.visible.value).toBe(false)
		expect(second.visible.value).toBe(true)
	})

	test("unmounting one page disconnects only its observer, and the other keeps reporting", () => {
		const first = mountPage()
		const second = mountPage()
		first.wrapper.unmount()
		expect(FakeObserver.made.map((o) => o.disconnected)).toEqual([true, false])
		FakeObserver.made[1].deliver(false)
		expect(second.visible.value).toBe(false)
	})
})
