import { describe, expect, test } from "vitest"
import { placeCard } from "./popover-place"

const CARD = { width: 280, height: 160 }
const POPUP = { width: 400, height: 600 }

describe("placeCard", () => {
	test("a trigger near the left edge of a 400 px view keeps the card inside it", () => {
		const place = placeCard({ x: 20, y: 100, width: 60, height: 20 }, CARD, POPUP)
		expect(place).toEqual({ top: 128, left: 8, width: 280 })
	})

	test("a 240 px view narrows the card to 224 px between its margins", () => {
		const place = placeCard({ x: 30, y: 100, width: 60, height: 20 }, CARD, { width: 240, height: 600 })
		expect(place).toMatchObject({ left: 8, width: 224 })
	})

	test("a trigger near the bottom opens above when above has the room", () => {
		const place = placeCard({ x: 200, y: 520, width: 80, height: 20 }, CARD, POPUP)
		expect(place).toEqual({ top: 520 - 8 - 160, left: 8, width: 280 })
	})

	test("when neither side fits, the card opens on the larger side and scrolls at its room", () => {
		const short = { width: 400, height: 240 }
		expect(placeCard({ x: 200, y: 140, width: 80, height: 20 }, CARD, short)).toEqual({ top: 8, left: 8, width: 280, maxHeight: 124 })
		expect(placeCard({ x: 200, y: 60, width: 80, height: 20 }, CARD, short)).toEqual({ top: 88, left: 8, width: 280, maxHeight: 144 })
	})

	test("a trigger at the view's right edge ends the card at its right edge, as a left-side popover does", () => {
		expect(placeCard({ x: 312, y: 10, width: 80, height: 20 }, { width: 200, height: 100 }, POPUP)).toEqual({
			top: 38,
			left: 192,
			width: 200,
		})
	})
})
