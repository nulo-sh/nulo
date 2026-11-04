import { describe, expect, test } from "vitest"
import { type NextSectionGeometry, nextScrollTop, type RevealGeometry, revealMove } from "./collapsing-hero"

// The popup import's errors screen at 360x600, as measured on Chrome and Firefox: a 56 px sticky
// bar, the hero's title box ending at 157.6 and the warning starting at 319.6 at scroll 0.
const opened = (over: Partial<RevealGeometry>): RevealGeometry => ({
	scrollTop: 0,
	maxScroll: 102,
	barBottom: 56,
	viewBottom: 297,
	titleBottom: 157.6,
	blockTop: 319.6,
	blockBottom: 378.8,
	...over,
})

describe("revealMove", () => {
	test.each([
		["four buttons, a three-line warning: the end (102) carries the title past the bar (101.6)", opened({}), "end"],
		["four buttons, a four-line warning", opened({ maxScroll: 116, blockBottom: 393.2 }), "end"],
		["an end exactly at the title's clearance", opened({ maxScroll: 101.6 }), "end"],
		[
			"three buttons: the end (34) leaves the title cut, so only the warning is brought in",
			opened({ maxScroll: 34, viewBottom: 365 }),
			"nearest",
		],
		["a warning already whole below the bar", opened({ blockTop: 230, blockBottom: 290 }), "none"],
	] as const)("%s", (_case, geometry, move) => {
		expect(revealMove(geometry)).toBe(move)
	})

	test("measures the title's clearance from where the scroller already stands", () => {
		const scrolled = { scrollTop: 30, titleBottom: 127.6, blockTop: 289.6, blockBottom: 348.8 }
		expect(revealMove(opened(scrolled))).toBe("end")
		expect(revealMove(opened({ ...scrolled, maxScroll: 101 }))).toBe("nearest")
	})
})

// The 360x600 popup as measured on Chrome: a 56 px sticky bar over a scroll area ending at 501.
const view = (over: Partial<NextSectionGeometry>): NextSectionGeometry => ({
	scrollTop: 0,
	maxScroll: 178,
	barBottom: 56,
	viewBottom: 501,
	sections: [],
	...over,
})

describe("nextScrollTop", () => {
	test.each([
		["a half-seen section comes up under the bar", view({ sections: [{ top: 300, bottom: 560 }] }), 178],
		[
			"sections in view are passed over for the first one that is not",
			view({
				maxScroll: 900,
				sections: [
					{ top: 150, bottom: 300 },
					{ top: 300, bottom: 480 },
					{ top: 480, bottom: 700 },
				],
			}),
			424,
		],
		[
			"a section far below is approached one visible height at a time",
			view({ maxScroll: 2000, sections: [{ top: 1200, bottom: 1400 }] }),
			445,
		],
		["no section left below: the end", view({ sections: [{ top: 150, bottom: 480 }] }), 178],
		["a screen that marks none: the end", view({}), 178],
		[
			"Change password as measured: the New password section, 369 px below the bar, clamps the press to the end",
			view({
				maxScroll: 149,
				sections: [
					{ top: 190, bottom: 308 },
					{ top: 308, bottom: 425 },
					{ top: 425, bottom: 622 },
				],
			}),
			149,
		],
		["a section ending within a pixel of the fold counts as in view", view({ sections: [{ top: 300, bottom: 501.9 }] }), 178],
		["one ending past that pixel does not", view({ maxScroll: 900, sections: [{ top: 300, bottom: 502.1 }] }), 244],
	] as const)("%s", (_case, geometry, top) => {
		expect(nextScrollTop(geometry)).toBe(top)
	})

	test("two presses through a section taller than the view leave nothing between them unseen", () => {
		// Visible box [56, 500]; the tall section starts at 100, the next one at 1140; the end is 848.
		const sections = (scrollTop: number) => [
			{ top: 100 - scrollTop, bottom: 1100 - scrollTop },
			{ top: 1140 - scrollTop, bottom: 1300 - scrollTop },
		]
		const press = (scrollTop: number) =>
			nextScrollTop({ scrollTop, maxScroll: 848, barBottom: 56, viewBottom: 500, sections: sections(scrollTop) })
		const first = press(0)
		const second = press(first)
		expect([first, second, press(second)]).toEqual([44, 488, 848])
		expect(second - first).toBeLessThanOrEqual(500 - 56)
	})
})
