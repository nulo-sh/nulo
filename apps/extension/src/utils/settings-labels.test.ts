import { describe, expect, test } from "vitest"
import { hubValues, profileTypeLabel } from "./settings-labels"

const MINUTE = 60_000

describe("hubValues — auto-lock", () => {
	test.each([
		{ ms: 30 * MINUTE, label: "30 min" },
		{ ms: 59 * MINUTE, label: "59 min" },
		{ ms: 60 * MINUTE, label: "1 h" },
		{ ms: 90 * MINUTE, label: "1 h 30 min" },
		{ ms: 1440 * MINUTE, label: "24 h" },
		{ ms: 0, label: "Never" },
	])("$ms ms → $label", ({ ms, label }) => {
		expect(hubValues({ sessionTtl: ms }).lock).toBe(label)
	})

	test("a fractional minute shows the Lock page's minutes field text, unrounded", () => {
		const ms = 90_000
		expect(hubValues({ sessionTtl: ms }).lock).toBe(`${String(ms / 1_000 / 60)} min`)
		expect(hubValues({ sessionTtl: ms }).lock).toBe("1.5 min")
		expect(hubValues({ sessionTtl: 61.5 * MINUTE }).lock).toBe("61.5 min")
	})

	test.each([
		["negative", -MINUTE],
		["not read", undefined],
		["not finite", Number.POSITIVE_INFINITY],
		["NaN", Number.NaN],
		["a string", "1800000"],
	])("%s → no value", (_name, sessionTtl) => {
		expect(hubValues({ sessionTtl }).lock).toBeUndefined()
	})
})

describe("hubValues — prices, theme, developer mode", () => {
	test("each on/off and theme value maps to its label", () => {
		expect(hubValues({ showFiatValues: true }).privacy).toBe("Prices on")
		expect(hubValues({ showFiatValues: false }).privacy).toBe("Prices off")
		expect(hubValues({ theme: "system" }).display).toBe("System")
		expect(hubValues({ theme: "dark" }).display).toBe("Dark")
		expect(hubValues({ theme: "light" }).display).toBe("Light")
		expect(hubValues({ developerMode: true }).developer).toBe("On")
		expect(hubValues({ developerMode: false }).developer).toBe("Off")
	})

	test("nothing read yet → no value on any row", () => {
		expect(hubValues({})).toEqual({})
	})

	test("an out-of-shape value → no value", () => {
		expect(hubValues({ showFiatValues: "true", theme: "constructor", developerMode: 1 })).toEqual({})
	})
})

describe("profileTypeLabel", () => {
	test("password and passkey map to their labels; anything else has none", () => {
		expect(profileTypeLabel("password")).toBe("Password")
		expect(profileTypeLabel("passkey")).toBe("Passkey")
		expect(profileTypeLabel(undefined)).toBeUndefined()
	})
})
