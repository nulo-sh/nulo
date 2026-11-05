import type { InjectionKey } from "vue"

export interface CollapsingHero {
	/** Brings `el` whole into view below the sticky bar. The landing can be the scroller's end, so
	 *  `el` must be a trailing block that fits between the bar and the scroller's bottom. */
	reveal: (el: Element) => void
}

export const COLLAPSING_HERO: InjectionKey<CollapsingHero> = Symbol("collapsing-hero")

/** Edges in viewport px, read at the scroller's current `scrollTop`. */
export interface RevealGeometry {
	scrollTop: number
	maxScroll: number
	barBottom: number
	viewBottom: number
	titleBottom: number
	blockTop: number
	blockBottom: number
}

/**
 * How to bring a block whole into view: the scroller's end where that end carries the hero's title
 * past the sticky bar, so the title never rests cut by it; otherwise the nearest scroll that shows
 * the block.
 */
export function revealMove(g: RevealGeometry): "none" | "end" | "nearest" {
	if (g.blockTop >= g.barBottom && g.blockBottom <= g.viewBottom) return "none"
	return g.scrollTop + g.titleBottom - g.barBottom <= g.maxScroll ? "end" : "nearest"
}

/** Edges in viewport px, read at the scroller's current `scrollTop`; `sections` in document order. */
export interface NextSectionGeometry {
	scrollTop: number
	maxScroll: number
	barBottom: number
	viewBottom: number
	sections: ReadonlyArray<{ top: number; bottom: number }>
}

/** Below a pixel is layout rounding: Firefox lays out in 1/60 px. */
const EDGE_PX = 1

/**
 * Where a "more below" press scrolls: the first section not yet in view comes up under the sticky
 * bar, but a press never moves more than one visible height while a section remains, so a section
 * taller than the view, or far below it, is paged through rather than skipped. With every section
 * in view, the end.
 */
export function nextScrollTop(g: NextSectionGeometry): number {
	const view = g.viewBottom - g.barBottom
	const next = g.sections.find((s) => s.bottom > g.viewBottom + EDGE_PX)
	let target = g.maxScroll
	if (next) target = g.scrollTop + (next.top > g.barBottom + EDGE_PX ? Math.min(next.top - g.barBottom, view) : view)
	return Math.min(g.maxScroll, Math.max(0, target))
}
