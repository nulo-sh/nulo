import { describe, expect, test } from "vitest"
import { moveId, placesWhileLifted, tapOrder } from "./endpoint-order"

const IDS = ["3f9a1c2e", "b07d44a1", "c1d2e3f4", "d4e5f6a7"]

describe("moveId", () => {
	test("moves one id up or down and keeps the rest in order", () => {
		expect(moveId(IDS, 3, 0)).toEqual(["d4e5f6a7", "3f9a1c2e", "b07d44a1", "c1d2e3f4"])
		expect(moveId(IDS, 0, 2)).toEqual(["b07d44a1", "c1d2e3f4", "3f9a1c2e", "d4e5f6a7"])
		expect(moveId(IDS, 1, 1)).toEqual(IDS)
	})

	test("clamps a target past either end", () => {
		expect(moveId(IDS, 1, -4)).toEqual(["b07d44a1", "3f9a1c2e", "c1d2e3f4", "d4e5f6a7"])
		expect(moveId(IDS, 1, 9)).toEqual(["3f9a1c2e", "c1d2e3f4", "d4e5f6a7", "b07d44a1"])
	})
})

describe("placesWhileLifted", () => {
	test("each row's number is the place a drop at `to` would give it", () => {
		expect(placesWhileLifted(IDS, 3, 0)).toEqual({ "3f9a1c2e": 2, b07d44a1: 3, c1d2e3f4: 4, d4e5f6a7: 1 })
		expect(placesWhileLifted(IDS, 0, 0)).toEqual({ "3f9a1c2e": 1, b07d44a1: 2, c1d2e3f4: 3, d4e5f6a7: 4 })
	})
})

describe("tapOrder", () => {
	test("puts the tapped row first and keeps the others as shown", () => {
		expect(tapOrder(["c1d2e3f4", "3f9a1c2e", "b07d44a1"], "b07d44a1")).toEqual(["b07d44a1", "c1d2e3f4", "3f9a1c2e"])
		expect(tapOrder(IDS, "3f9a1c2e")).toEqual(IDS)
	})
})
