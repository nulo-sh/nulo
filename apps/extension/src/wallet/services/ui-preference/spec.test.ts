import { describe, expect, test } from "vitest"
import { SelectedAccountRowSchema } from "./spec"

describe("SelectedAccountRowSchema", () => {
	test("the address cap counts UTF-16 units: 64 astral characters pass, 65 do not", () => {
		expect(SelectedAccountRowSchema.safeParse({ profileId: "p", address: "😀".repeat(64) }).success).toBe(true)
		expect(SelectedAccountRowSchema.safeParse({ profileId: "p", address: "😀".repeat(65) }).success).toBe(false)
	})
})
