import { describe, expect, test } from "vitest"
import { type NextSectionGeometry, nextScrollTop } from "./next-scroll-top"

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
