import { describe, expect, test } from "vitest"

import { donePath, doneRoute, stepCells } from "./steps"

describe("onboarding steps", () => {
	test("only a password wallet's path carries the phrase step", () => {
		expect(stepCells("password").map((cell) => cell.step)).toEqual(["terms", "wallet", "phrase", "ready"])
		expect(stepCells("passkey").map((cell) => cell.step)).toEqual(["terms", "wallet", "ready"])
		expect(stepCells("import").map((cell) => cell.step)).toEqual(["terms", "wallet", "ready"])
	})

	test("Ready's path round-trips through the history entry", () => {
		for (const path of ["password", "passkey", "import"] as const) {
			const route = doneRoute(path) as { path: string; state: unknown }
			expect(route.path).toBe("/onboarding/done")
			expect(donePath(route.state)).toBe(path)
		}
	})

	test.each([
		["an entry with no state", null],
		["an entry from the router alone", { back: "/onboarding/create", position: 3 }],
		["a value outside the paths", { onboardingPath: "admin" }],
		["a value of another type", { onboardingPath: 1 }],
	])("%s gives no path", (_, state) => {
		expect(donePath(state)).toBeUndefined()
	})
})
