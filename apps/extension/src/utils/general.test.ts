import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { applyThemeChoice, THEME_HINT_KEY } from "./general"

let osDark = false

beforeEach(() => {
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({ matches: osDark })),
	)
	localStorage.clear()
})

afterEach(() => {
	vi.unstubAllGlobals()
	document.documentElement.removeAttribute("theme")
})

describe("applyThemeChoice", () => {
	test.each(["dark", "light"] as const)("paints an explicit %s whatever the OS prefers", (choice) => {
		osDark = choice === "light"
		applyThemeChoice(document.documentElement, choice)
		expect(document.documentElement.getAttribute("theme")).toBe(choice)
	})

	test.each([
		[true, "dark"],
		[false, "light"],
	])("system under an OS that prefers dark=%s paints %s", (prefersDark, painted) => {
		osDark = prefersDark
		applyThemeChoice(document.documentElement, "system")
		expect(document.documentElement.getAttribute("theme")).toBe(painted)
	})

	test("the hint keeps the raw choice, so system re-resolves on the next paint", () => {
		osDark = true
		applyThemeChoice(document.documentElement, "system")
		expect(localStorage.getItem(THEME_HINT_KEY)).toBe("system")
		applyThemeChoice(document.documentElement, "light")
		expect(localStorage.getItem(THEME_HINT_KEY)).toBe("light")
	})
})
