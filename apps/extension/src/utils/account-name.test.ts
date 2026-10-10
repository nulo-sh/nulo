import { describe, expect, test } from "vitest"
import { DEFAULT_ACCOUNT_NAME } from "@/wallet/services/account/spec"
import { nextAccountName, sameStoredName, storedNameKey } from "./account-name"

describe("nextAccountName", () => {
	test("with no accounts it is the name every network's first account gets", () => {
		expect(nextAccountName([])).toBe(DEFAULT_ACCOUNT_NAME)
		expect(DEFAULT_ACCOUNT_NAME).toBe("Account 1")
	})

	test.each([
		[["Account 1"], "Account 2"],
		[["Account 1", "Account 3"], "Account 2"],
		[["Savings", "Account 2"], "Account 1"],
		[["account 1", "Account 1 "], "Account 1"],
	])("%j → %s", (names, expected) => {
		expect(nextAccountName(names)).toBe(expected)
	})
})

describe("sameStoredName", () => {
	test("outer spaces do not tell two names apart; inner spaces and case do", () => {
		expect(sameStoredName("Alice", "Alice ")).toBe(true)
		expect(sameStoredName(" Alice", "Alice")).toBe(true)
		expect(sameStoredName("Alice", "alice")).toBe(false)
		expect(sameStoredName("Al ice", "Alice")).toBe(false)
	})

	test("an unnamed FPC keys as empty, and two empty keys are not the same name", () => {
		expect(storedNameKey(undefined)).toBe("")
		expect(sameStoredName(undefined, "Bob")).toBe(false)
		expect(sameStoredName(undefined, " ")).toBe(false)
		expect(sameStoredName("", "")).toBe(false)
	})
})
