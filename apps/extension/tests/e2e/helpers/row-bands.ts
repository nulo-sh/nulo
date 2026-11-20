/**
 * The hover band's geometry, which only a browser lays out: a row's box against the viewport.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"

/** Each `selector` row's box against the viewport, and every clipping ancestor of the first that
 *  scrolls sideways (or the document). */
export function readBands(page: Page, selector: string) {
	return page.evaluate((rowSel: string) => {
		const rows = [...document.querySelectorAll(rowSel)]
		const overflowing: string[] = []
		let el: Element | null = rows[0] ?? null
		while (el && el !== document.body) {
			const clips = getComputedStyle(el).overflowX !== "visible"
			if (clips && el.scrollWidth > el.clientWidth)
				overflowing.push(`${el.getAttribute("data-testid") ?? el.tagName} ${el.scrollWidth}>${el.clientWidth}`)
			el = el.parentElement
		}
		if (document.documentElement.scrollWidth > window.innerWidth) overflowing.push("html")
		const edges = rows.map((row) => {
			const box = row.getBoundingClientRect()
			return { left: box.left, right: box.right }
		})
		return { overflowing, edges, width: window.innerWidth }
	}, selector)
}

export function expectEdgeToEdge(bands: Awaited<ReturnType<typeof readBands>>, label: string): void {
	expect(bands.overflowing, `${label}: sideways scroll`).toEqual([])
	expect(bands.edges.length, `${label}: rows`).toBeGreaterThan(0)
	for (const { left, right } of bands.edges) {
		expect(left, `${label}: left edge`).toBeCloseTo(0, 0)
		expect(right, `${label}: right edge`).toBeCloseTo(bands.width, 0)
	}
}
