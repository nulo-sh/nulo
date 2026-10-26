import { describe, expect, test } from "vitest"
import { useProfileNameField } from "@/composables/useProfileNameField"
import { availableName, defaultProfileName, normalizeProfileName } from "./profile-name"

describe("defaultProfileName", () => {
	test.each([
		[[], "Main"],
		[["Main"], "Profile 2"],
		[["Main", "Work"], "Profile 3"],
		// Bumped past every taken name, including one that differs only by case or NFKC form.
		[["Main", "profile 3"], "Profile 4"],
		[["Main", "Ｐｒｏｆｉｌｅ 3"], "Profile 4"],
		[["Main", "Profile 4", "profile 5"], "Profile 6"],
	])("%j → %s", (existing, expected) => {
		expect(defaultProfileName(existing)).toBe(expected)
	})

	test("always passes the name field's validation against the same list", () => {
		const lists = [[], ["Main"], ["Main", "profile 2", "Profile 3"], Array.from({ length: 999 }, (_, i) => `Profile ${i + 2}`)]
		for (const existing of lists) {
			const field = useProfileNameField()
			field.profileName.value = defaultProfileName(existing)
			expect(field.validate({ existingNames: existing })).toBe(true)
		}
	})
})

describe("availableName", () => {
	const long = "A".repeat(32)
	test.each([
		["Main", [], "Main"],
		["Main", ["Work"], "Main"],
		["Main", ["Main"], "Main 1"],
		["Main", ["main"], "Main 1"],
		["Main", ["Main", "MAIN 1", "Main 2"], "Main 3"],
		[long, [long], `${"A".repeat(30)} 1`],
		[long, [long, ...Array.from({ length: 9 }, (_, i) => `${"A".repeat(30)} ${i + 1}`)], `${"A".repeat(29)} 10`],
		[`${"A".repeat(29)} 🦊`, [`${"A".repeat(29)} 🦊`], `${"A".repeat(29)} 1`],
	])("%j beside %j → %j", (base, existing, expected) => {
		expect(availableName(base, existing)).toBe(expected)
	})

	test("always passes the name field's validation against the same list", () => {
		const cases: Array<[string, string[]]> = [
			["Main", ["Main"]],
			[long, [long, `${"A".repeat(30)} 1`]],
			["Ｍａｉｎ", ["main", "Main 1"]],
		]
		for (const [base, existing] of cases) {
			const field = useProfileNameField()
			field.profileName.value = availableName(base, existing)
			expect(field.validate({ existingNames: existing })).toBe(true)
		}
	})
})

describe("normalizeProfileName", () => {
	test("folds case and compatibility forms, not scripts", () => {
		expect(normalizeProfileName("ﬂow")).toBe(normalizeProfileName("FLOW"))
		expect(normalizeProfileName("Аlpha")).not.toBe(normalizeProfileName("Alpha"))
	})
})
