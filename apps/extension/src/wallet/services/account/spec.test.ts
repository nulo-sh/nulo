import { describe, expect, test } from "vitest"
import { accountScopeMatcher } from "./spec"

describe("accountScopeMatcher", () => {
	const A = "0xaa"
	const B = "0xbb"
	const match = accountScopeMatcher("p", [
		{ chainId: 0, address: A },
		{ chainId: 1, address: B },
	])

	test("matches the profile's row on any of the scopes, chain 0 included", () => {
		expect(match.row({ profileId: "p", chainId: 0, account: A })).toBe(true)
		expect(match.row({ profileId: "p", chainId: 1, account: B })).toBe(true)
	})

	test("refuses the same account on another chain, another account, and another profile", () => {
		expect(match.row({ profileId: "p", chainId: 1, account: A })).toBe(false)
		expect(match.row({ profileId: "p", chainId: 0, account: B })).toBe(false)
		expect(match.row({ profileId: "q", chainId: 0, account: A })).toBe(false)
	})

	test("matches a stored value only by typed scope fields, so an old-shape row is left to its sweep", () => {
		expect(match.raw({ profileId: "p", chainId: 0, account: A, hash: "0x1" })).toBe(true)
		expect(match.raw({ profileId: "p", account: A })).toBe(false)
		expect(match.raw({ profileId: "p", chainId: "0", account: A })).toBe(false)
		expect(match.raw({ profileId: "q", chainId: 0, account: A })).toBe(false)
	})
})
