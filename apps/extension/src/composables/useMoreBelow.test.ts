import { afterEach, describe, expect, test, vi } from "vitest"
import { type EffectScope, effectScope, type Ref, ref } from "vue"
import { MORE_FOOTPRINT_PX, type MoreBelowEdges, useMoreBelow } from "./useMoreBelow"

/** A ResizeObserver whose deliveries the test sends; each instance lists what it observes. */
class FakeResizeObserver {
	static last: FakeResizeObserver | undefined
	observed = new Set<Element>()
	constructor(readonly callback: () => void) {
		FakeResizeObserver.last = this
	}
	observe(el: Element) {
		this.observed.add(el)
	}
	disconnect() {
		this.observed.clear()
	}
}

const root = document.documentElement
const ROOT_KEYS = ["scrollHeight", "clientHeight", "clientWidth", "scrollTo"] as const
const added: Element[] = []
const scopes: EffectScope[] = []

/** `el` reports `rect` as its box, as a laid-out element would; jsdom lays nothing out. */
function placeAt<T extends Element>(el: T, rect: { top: number; bottom: number }): T {
	el.getBoundingClientRect = () => ({
		...rect,
		left: 0,
		right: 0,
		width: 0,
		height: rect.bottom - rect.top,
		x: 0,
		y: rect.top,
		toJSON: () => ({}),
	})
	return el
}

/** A marked section at `top`..`bottom` in viewport px, appended to `parent`. */
function section(parent: Element, top: number, bottom: number): Element {
	const el = placeAt(document.createElement("div"), { top, bottom })
	el.setAttribute("data-scroll-section", "")
	parent.appendChild(el)
	added.push(el)
	return el
}

/** A scroller holding `scrollHeight` px in a 445 px view whose top sits at viewport y 100. */
function scroller(scrollHeight = 700): HTMLElement {
	const el = placeAt(document.createElement("div"), { top: 100, bottom: 545 })
	Object.defineProperties(el, {
		scrollHeight: { value: scrollHeight, configurable: true },
		clientHeight: { value: 445, configurable: true },
		offsetWidth: { value: 360, configurable: true },
		clientWidth: { value: 352, configurable: true },
	})
	el.scrollTo = vi.fn() as unknown as HTMLElement["scrollTo"]
	return el
}

/** The window as a page the document scrolls: `scrollHeight` px under a 720 px fold, a 15 px scrollbar. */
function documentOf(scrollHeight: number): void {
	Object.defineProperties(root, {
		scrollHeight: { value: scrollHeight, configurable: true },
		clientHeight: { value: 720, configurable: true },
		clientWidth: { value: 1265, configurable: true },
	})
	vi.stubGlobal("innerWidth", 1280)
	root.scrollTo = vi.fn() as unknown as HTMLElement["scrollTo"]
}

function track(el: Ref<HTMLElement | null> | "document", edges?: MoreBelowEdges) {
	const scope = effectScope()
	scopes.push(scope)
	const result = scope.run(() => useMoreBelow(el, edges))
	if (!result) throw new Error("no result")
	return { ...result, stop: () => scope.stop() }
}

function scrollTo(el: HTMLElement, top: number) {
	el.scrollTop = top
	el.dispatchEvent(new Event("scroll"))
}

afterEach(() => {
	for (const scope of scopes.splice(0)) scope.stop()
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
	FakeResizeObserver.last = undefined
	for (const key of ROOT_KEYS) delete (root as unknown as Record<string, unknown>)[key]
	root.scrollTop = 0
	root.classList.remove("noanimations")
	for (const el of added.splice(0)) el.remove()
})

describe("useMoreBelow over a scroller", () => {
	test("shows while more than the 48 px footprint is left below, and hides at it", () => {
		const el = scroller()
		const { shown } = track(ref(el))
		expect(MORE_FOOTPRINT_PX).toBe(48)
		scrollTo(el, 206.5)
		expect(shown.value).toBe(true)
		scrollTo(el, 207)
		expect(shown.value).toBe(false)
	})

	test("with no scroller nothing shows and a press does nothing", () => {
		const { shown, gutter, press } = track(ref(null))
		expect([shown.value, gutter.value]).toEqual([false, 0])
		expect(() => press()).not.toThrow()
	})

	test("hands the host the scroller's scrollbar width, which a right-placed button clears", () => {
		expect(track(ref(scroller())).gutter.value).toBe(8)
	})

	test("a press with no section marked scrolls smoothly to the end", () => {
		const el = scroller()
		track(ref(el)).press()
		expect(el.scrollTo).toHaveBeenCalledWith({ top: 255, behavior: "smooth" })
	})

	test("a press brings the first section not yet in view up to the scroller's top", () => {
		const el = scroller(1200)
		section(el, 120, 400)
		section(el, 400, 700)
		track(ref(el)).press()
		expect(el.scrollTo).toHaveBeenCalledWith({ top: 300, behavior: "smooth" })
	})

	test("under a sticky bar a press lands the section at the bar's bottom, and without the bar at the scroller's top", () => {
		const el = scroller(1200)
		section(el, 400, 700)
		track(ref(el), { barBottom: () => 156 }).press()
		expect(el.scrollTo).toHaveBeenLastCalledWith({ top: 244, behavior: "smooth" })
		track(ref(el), { barBottom: () => undefined }).press()
		expect(el.scrollTo).toHaveBeenLastCalledWith({ top: 300, behavior: "smooth" })
	})

	test("sections are read at the press, so one a step adds after setup is a stop", () => {
		const el = scroller(1200)
		const { press } = track(ref(el))
		section(el, 300, 600)
		press()
		expect(el.scrollTo).toHaveBeenCalledWith({ top: 200, behavior: "smooth" })
	})

	test("under Disable animations a press jumps", () => {
		root.classList.add("noanimations")
		const el = scroller()
		track(ref(el)).press()
		expect(el.scrollTo).toHaveBeenCalledWith({ top: 255, behavior: "auto" })
	})
})

describe('useMoreBelow over the document ("document")', () => {
	test("measures what the root holds below the window's fold, and follows the window's scrolls", () => {
		documentOf(1000)
		const { shown, remaining, gutter } = track("document")
		expect([shown.value, remaining.value, gutter.value]).toEqual([true, 280, 15])
		root.scrollTop = 240
		window.dispatchEvent(new Event("scroll"))
		expect(shown.value).toBe(false)
	})

	test("hears content change as resizes of each of body's children", () => {
		vi.stubGlobal("ResizeObserver", FakeResizeObserver)
		const child = document.createElement("div")
		document.body.appendChild(child)
		added.push(child)
		documentOf(720)
		track("document")
		expect([...(FakeResizeObserver.last?.observed ?? [])]).toEqual([...document.body.children])
		expect(FakeResizeObserver.last?.observed.has(child)).toBe(true)
	})

	test("a press scrolls the root, from the window's top: one view height toward a section far below", () => {
		documentOf(3000)
		section(document.body, 2000, 2100)
		track("document").press()
		expect(root.scrollTo).toHaveBeenCalledWith({ top: 720, behavior: "smooth" })
	})

	test("the scope's end removes both window listeners and disconnects the observer", () => {
		vi.stubGlobal("ResizeObserver", FakeResizeObserver)
		documentOf(1000)
		const off = vi.spyOn(window, "removeEventListener")
		const { shown, stop } = track("document")
		stop()
		expect(off).toHaveBeenCalledWith("scroll", expect.any(Function))
		expect(off).toHaveBeenCalledWith("resize", expect.any(Function))
		expect(FakeResizeObserver.last?.observed.size).toBe(0)
		root.scrollTop = 240
		window.dispatchEvent(new Event("scroll"))
		expect(shown.value).toBe(true)
	})
})
