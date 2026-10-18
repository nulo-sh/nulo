import { describe, expect, test } from "vitest"
import { dedupeKeyOf, isOriginKey } from "./discovery-flow"

describe("the dedupe key", () => {
	test("an origin that extends another names a different app", () => {
		expect(dedupeKeyOf("https://a.com", "1")).toBe("https://a.com|1")
		expect(isOriginKey(dedupeKeyOf("https://a.com.evil", "1"), "https://a.com")).toBe(false)
		expect(isOriginKey(dedupeKeyOf("https://a.com", "1"), "https://a.com")).toBe(true)
	})
})
