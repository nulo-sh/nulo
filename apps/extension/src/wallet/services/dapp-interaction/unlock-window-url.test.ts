import { describe, expect, test } from "vitest"
import { siteOfUnlockWindowHash, unlockWindowHash } from "./unlock-window-url"

describe("unlock window URL", () => {
	test.each(["https://app.example", "https://xn--pple-43d.com", "http://localhost:5173"])("round-trips %s", (origin) => {
		expect(siteOfUnlockWindowHash(unlockWindowHash(origin))).toBe(origin)
	})

	test("the origin is encoded, so a hostile one cannot add a query field", () => {
		expect(unlockWindowHash("https://a.example&origin=https://b.example")).not.toContain("&origin=")
	})

	test.each([
		["another route", "#/windows/discover?origin=https%3A%2F%2Fapp.example"],
		["a deeper path", "#/windows/unlock/more?origin=https%3A%2F%2Fapp.example"],
		["no query", "#/windows/unlock"],
		["no origin", "#/windows/unlock?site=https%3A%2F%2Fapp.example"],
		["not a URL", "#/windows/unlock?origin=app.example"],
		["a URL that is not an origin", "#/windows/unlock?origin=https%3A%2F%2Fapp.example%2Fpath"],
	])("undefined for %s", (_name, hash) => {
		expect(siteOfUnlockWindowHash(hash)).toBeUndefined()
	})
})
