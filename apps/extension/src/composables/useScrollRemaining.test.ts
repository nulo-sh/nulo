import { afterEach, describe, expect, test, vi } from "vitest"
import { effectScope, nextTick, type Ref, ref } from "vue"
import { useScrollRemaining } from "./useScrollRemaining"

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
	deliver() {
		if (this.observed.size) this.callback()
	}
}

/** A scroller holding `scrollHeight` px in a `clientHeight` px view, with one content child. */
function scroller(scrollHeight = 700, clientHeight = 445): HTMLElement {
	const el = document.createElement("div")
	el.appendChild(document.createElement("div"))
	let height = scrollHeight
	let view = clientHeight
	Object.defineProperties(el, {
		scrollHeight: { get: () => height, configurable: true },
		clientHeight: { get: () => view, configurable: true },
		offsetWidth: { value: 360, configurable: true },
		clientWidth: { value: 352, configurable: true },
	})
	Object.assign(el, {
		grow: (px: number) => {
			height = px
		},
		resizeView: (px: number) => {
			view = px
		},
	})
	return el
}
type Scroller = HTMLElement & { grow: (px: number) => void; resizeView: (px: number) => void }

function track(el: Ref<HTMLElement | null>) {
	const scope = effectScope()
	const result = scope.run(() => useScrollRemaining(el))
	if (!result) throw new Error("no result")
	return { ...result, stop: () => scope.stop() }
}

function scrollTo(el: HTMLElement, top: number) {
	el.scrollTop = top
	el.dispatchEvent(new Event("scroll"))
}

afterEach(() => {
	vi.unstubAllGlobals()
	FakeResizeObserver.last = undefined
})

describe("useScrollRemaining", () => {
	test("measures what lies below the visible bottom and the scrollbar's width as it attaches", () => {
		const { remaining, gutter } = track(ref(scroller()))
		expect(remaining.value).toBe(255)
		expect(gutter.value).toBe(8)
	})

	test("a scroll measures again, down to nothing at the end", () => {
		const el = scroller()
		const { remaining } = track(ref(el))
		scrollTo(el, 100)
		expect(remaining.value).toBe(155)
		scrollTo(el, 255)
		expect(remaining.value).toBe(0)
	})

	test("keeps a fractional scroll's fraction", () => {
		const el = scroller()
		const { remaining } = track(ref(el))
		scrollTo(el, 206.6)
		expect(remaining.value).toBeCloseTo(48.4)
	})

	test("observes the scroller and each of its element children", () => {
		vi.stubGlobal("ResizeObserver", FakeResizeObserver)
		const el = scroller()
		track(ref(el))
		expect([...(FakeResizeObserver.last?.observed ?? [])]).toEqual([el, el.firstElementChild])
	})

	test("a resize of the view measures again", () => {
		vi.stubGlobal("ResizeObserver", FakeResizeObserver)
		const el = scroller() as Scroller
		const { remaining } = track(ref(el))
		el.resizeView(600)
		FakeResizeObserver.last?.deliver()
		expect(remaining.value).toBe(100)
	})

	test("content that grows past the fold, then shrinks back, is followed both ways", () => {
		vi.stubGlobal("ResizeObserver", FakeResizeObserver)
		const el = scroller(445) as Scroller
		const { remaining } = track(ref(el))
		expect(remaining.value).toBe(0)
		el.grow(560)
		FakeResizeObserver.last?.deliver()
		expect(remaining.value).toBe(115)
		el.grow(445)
		FakeResizeObserver.last?.deliver()
		expect(remaining.value).toBe(0)
	})

	test("with no element there is nothing to measure", () => {
		const { remaining, gutter } = track(ref(null))
		expect([remaining.value, gutter.value]).toEqual([0, 0])
	})

	test("a new element is measured and the old one is no longer heard", async () => {
		const old = scroller()
		const el = ref<HTMLElement | null>(old)
		const { remaining } = track(el)
		const next = scroller(900)
		el.value = next
		await nextTick()
		expect(remaining.value).toBe(455)
		scrollTo(old, 255)
		expect(remaining.value).toBe(455)
		scrollTo(next, 55)
		expect(remaining.value).toBe(400)
	})

	test("the scope's end detaches every listener", () => {
		vi.stubGlobal("ResizeObserver", FakeResizeObserver)
		const el = scroller()
		const { remaining, stop } = track(ref(el))
		stop()
		scrollTo(el, 100)
		expect(remaining.value).toBe(255)
		expect(FakeResizeObserver.last?.observed.size).toBe(0)
	})

	test("without ResizeObserver, as in jsdom, scrolls still measure", () => {
		expect(typeof ResizeObserver).toBe("undefined")
		const el = scroller()
		const { remaining } = track(ref(el))
		scrollTo(el, 55)
		expect(remaining.value).toBe(200)
	})
})
