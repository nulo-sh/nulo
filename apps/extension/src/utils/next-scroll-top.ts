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
