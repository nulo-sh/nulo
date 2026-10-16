import { describe, expect, test } from "vitest"
import {
	CONTACT_EXISTS,
	canSubmitContact,
	canonicalContactAddress,
	contactAddressError,
	contactNameError,
	sameContactAddress,
} from "./contact-rules"

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

describe("the contact form's admission", () => {
	const VALID = `0x2${"a".repeat(63)}`
	const saved = { value: [{ id: "c1", name: "Alice Smith", address: VALID }] }
	const isC1 = (c: { id: string }) => c.id === "c1"
	const form = (over: Partial<Record<"loading" | "name" | "validAddress" | "nameError" | "addressError", unknown>> = {}) => {
		const values = { loading: false, name: "Bob", validAddress: true, nameError: null, addressError: null, ...over }
		return Object.fromEntries(Object.entries(values).map(([k, value]) => [k, { value }])) as Parameters<typeof canSubmitContact>[0]
	}

	test("a saved name in another case and spacing is a duplicate", () => {
		expect(contactNameError("  alice   SMITH ", saved)).toBe(CONTACT_EXISTS)
	})

	test("an address that is not an Aztec address is invalid", () => {
		expect(contactAddressError("0x1234", saved)).toBe("Invalid address")
	})

	test("a saved address in another hex case is a duplicate", () => {
		expect(contactAddressError(VALID.toUpperCase().replace("0X", "0x"), saved)).toBe(CONTACT_EXISTS)
	})

	test("the edited row's own name and address are not duplicates", () => {
		expect(contactNameError("Alice Smith", saved, isC1)).toBeNull()
		expect(contactAddressError(VALID, saved, isC1)).toBeNull()
	})

	test("an empty field is not yet an error", () => {
		expect(contactNameError("   ", saved)).toBeNull()
		expect(contactAddressError("", saved)).toBeNull()
	})

	test.each([
		["a save is running", { loading: true }],
		["the name stores as nothing", { name: "\u200b " }],
		["the address is invalid", { validAddress: false }],
		["the name is a duplicate", { nameError: CONTACT_EXISTS }],
		["the address is a duplicate", { addressError: CONTACT_EXISTS }],
	])("no save while %s", (_case, over) => {
		expect(canSubmitContact(form(over))).toBe(false)
	})

	test("a check that returns early never reads the handles after it", () => {
		const unread = {
			get value(): never {
				throw new Error("read past an early return")
			},
		}
		expect(contactNameError("", unread)).toBeNull()
		expect(contactAddressError("0x1234", unread)).toBe("Invalid address")
		expect(
			canSubmitContact({ ...form({ loading: true }), name: unread, validAddress: unread, nameError: unread, addressError: unread }),
		).toBe(false)
	})

	test("a clean form with a new name and address saves", () => {
		expect(contactNameError("Bob", saved)).toBeNull()
		expect(contactAddressError(`0x2${"b".repeat(63)}`, saved)).toBeNull()
		expect(canSubmitContact(form())).toBe(true)
	})
})
