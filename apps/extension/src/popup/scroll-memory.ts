/**
 * The popup's window never scrolls: each page scrolls its own box, so the router's own scroll
 * handling has nothing to move. This keeps that box's offset per history entry instead: back and
 * forward land where the person left the page, and a push that reuses the page opens it at its top.
 */
import type { RouteLocationNormalized } from "vue-router"

type Scroller = { scrollTop: number }

export interface ScrollMemory {
	/** Stores the leaving page's offset under the entry it was shown on. */
	leave(el: Scroller | null): void
	/** `restore`: the entry is one the person comes back to (a back or forward), so its stored offset
	 *  applies. `reused`: the same page instance stays mounted, keeping the offset it had. */
	arrive(el: Scroller | null, how: { restore: boolean; reused: boolean }): void
}

/** `position` reads the history entry's index, which a push advances and a replace keeps. */
export function createScrollMemory(position: () => number | undefined): ScrollMemory {
	const offsets = new Map<number, number>()
	let shown: number | undefined
	return {
		leave(el) {
			if (el && shown !== undefined) offsets.set(shown, el.scrollTop)
		},
		arrive(el, { restore, reused }) {
			const at = position()
			const saved = at === undefined ? undefined : offsets.get(at)
			if (el && restore && saved !== undefined) el.scrollTop = saved
			else if (el && !restore && reused && at !== shown) el.scrollTop = 0
			shown = at
		},
	}
}

const scrolls = (el: Element) => /^(auto|scroll)$/.test(getComputedStyle(el).overflowY)

/** The mounted page's scrolling box: its root, or the first descendant in document order that
 *  scrolls. Null when the page renders no single element root or nothing in it scrolls. */
export function pageScroller(route: RouteLocationNormalized): Element | null {
	const root: unknown = route.matched.at(-1)?.instances.default?.$el
	if (!(root instanceof Element)) return null
	if (scrolls(root)) return root
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (scrolls(node as Element)) return node as Element
	}
	return null
}
