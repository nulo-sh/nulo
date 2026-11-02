import { describe, expect, test } from "vitest"
import { pluralize } from "./plural"

describe("pluralize", () => {
	test("one takes the singular", () => {
		expect(pluralize(1, "token", "tokens")).toBe("token")
	})

	test("zero and many take the plural", () => {
		expect(pluralize(0, "token", "tokens")).toBe("tokens")
		expect(pluralize(2, "match", "matches")).toBe("matches")
	})
})
