import { describe, expect, test } from "vitest"
import { CONTACT_EXISTS, canonicalContactAddress, sameContactAddress } from "./contact-rules"

const A = `0x${"ab".repeat(32)}`

describe("contact rules", () => {
	test.each([
		[A, A, true],
		[A, A.toUpperCase().replace("0X", "0x"), true],
		[A.toUpperCase().replace("0X", "0x"), A, true],
		[A, `0x${"ab".repeat(31)}ac`, false],
	])("address %s against typed %s → %s", (address, typed, expected) => {
		expect(sameContactAddress({ address }, typed)).toBe(expected)
	})

	test("the stored address is lowercase hex", () => {
		expect(canonicalContactAddress(`0x${"AB".repeat(32)}`)).toBe(A)
	})

	test("the verdict is the validators' sentinel", () => {
		expect(CONTACT_EXISTS).toBe("Already exist")
	})
})
