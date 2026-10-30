import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { describe, expect, test } from "vitest"
import { getNameDescriptor } from "@/wallet/services/token/functions/descriptors"
import { dashIfBlank, getInitials, isBlank, stripBidiAndZeroWidth, trimAddress } from "./string"

describe("trimAddress", () => {
	const ADDR = "0x1234567890abcdef1234567890abcdef12345678"

	test("default policy: 8 head chars, 4 tail chars, '..' separator", () => {
		expect(trimAddress(ADDR)).toBe("0x123456..5678")
	})

	test("site policy 6/4 with '...' (the popup sites' dominant style)", () => {
		expect(trimAddress(ADDR, 6, 4, "...")).toBe("0x1234...5678")
	})

	test("site policy 6/4 with unicode ellipsis (journal/verify style)", () => {
		expect(trimAddress(ADDR, 6, 4, "…")).toBe("0x1234…5678")
	})

	test("short input is returned unchanged (no separator injected)", () => {
		expect(trimAddress("0xabc", 6, 4, "...")).toBe("0xabc")
		expect(trimAddress("", 6, 4)).toBe("")
	})

	test("boundary: length exactly start+end stays untouched", () => {
		expect(trimAddress("0123456789", 6, 4)).toBe("0123456789")
	})
})

describe("getInitials", () => {
	test("two words → first letter of each, uppercased", () => {
		expect(getInitials("Alejo Savings")).toBe("AS")
	})

	test("single word → first two chars, uppercased", () => {
		expect(getInitials("vault")).toBe("VA")
	})

	test("single short word → the one char it has", () => {
		expect(getInitials("x")).toBe("X")
	})

	test("three+ words → only the first two", () => {
		expect(getInitials("my cold wallet")).toBe("MC")
	})

	test("collapses extra whitespace between words", () => {
		expect(getInitials("John   Doe")).toBe("JD")
	})

	test("trims leading/trailing whitespace", () => {
		expect(getInitials("  solo  ")).toBe("SO")
	})

	test("empty string → empty (matches the legacy abbr contract for empty names)", () => {
		expect(getInitials("")).toBe("")
	})

	test("whitespace-only → empty", () => {
		expect(getInitials("   ")).toBe("")
	})
})

/** What the wallet's token read returns for a name field holding `text`'s UTF-8 bytes after a zero byte. */
const fromField = (text: string): string => {
	const field = Buffer.alloc(32)
	Buffer.from(text, "utf-8").copy(field, 1)
	return getNameDescriptor.unpackResult!(0, [Fr.fromBuffer(field)]) as string
}
const ZWSP = String.fromCodePoint(0x200b)
const NBSP = String.fromCodePoint(0xa0)
const IDEOGRAPHIC_SPACE = String.fromCodePoint(0x3000)
const blankFields = () => ["", "   ", "\t\n", ZWSP, `${NBSP}${IDEOGRAPHIC_SPACE}`].map(fromField)

describe("isBlank", () => {
	test("holds for a value that is absent, or empty or whitespace once the sanitizer strips it", () => {
		for (const value of blankFields()) expect(isBlank(value), JSON.stringify(value)).toBe(true)
		expect(isBlank(undefined)).toBe(true)
		expect(isBlank(null)).toBe(true)
	})

	test("fails for any other value", () => {
		for (const value of [fromField("USDC"), " A ", `${ZWSP}USDC`, "—"]) expect(isBlank(value), JSON.stringify(value)).toBe(false)
	})
})

describe("dashIfBlank", () => {
	test("reads a value that is empty or whitespace once the sanitizer strips it as the empty-value dash", () => {
		const blanks = blankFields()
		expect(blanks.slice(0, 2)).toEqual(["", "   "])
		for (const value of blanks) expect(dashIfBlank(value), JSON.stringify(value)).toBe("—")
		expect(dashIfBlank(undefined)).toBe("—")
		expect(dashIfBlank(null)).toBe("—")
	})

	test("returns any other value exactly as given, neither trimmed nor stripped", () => {
		expect(dashIfBlank(fromField("USDC"))).toBe("USDC")
		expect(dashIfBlank(" A ")).toBe(" A ")
		expect(dashIfBlank(`${ZWSP}USDC`)).toBe(`${ZWSP}USDC`)
		expect(dashIfBlank("—")).toBe("—")
	})
})

describe("stripBidiAndZeroWidth", () => {
	const chars = (...codes: number[]) => String.fromCodePoint(...codes)

	test.each([
		["bidi embeddings and overrides", chars(0x202a, 0x202b, 0x202c, 0x202d, 0x202e)],
		["bidi isolates", chars(0x2066, 0x2067, 0x2068, 0x2069)],
		["directional marks", chars(0x200e, 0x200f, 0x061c)],
		["zero-width space, word joiner and byte-order mark", chars(0x200b, 0x2060, 0xfeff)],
		["soft hyphen", chars(0xad)],
	])("removes the %s, wherever they sit", (_, removed) => {
		const between = [...removed].join("x")
		expect(stripBidiAndZeroWidth(`${removed}a${between}b${removed}`)).toBe(`a${"x".repeat([...removed].length - 1)}b`)
	})

	test("keeps joiners, variation selectors, tags, controls and every visible character", () => {
		const kept = [
			"Ali\u0301ce d\u00E9j\u00E0 vu",
			"me\u200Cdan",
			"\u{1F468}\u200D\u{1F469}\u200D\u{1F467}",
			"\u2764\uFE0F",
			"\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
			"\u0600\u0661",
			"tab\there",
			"a\u00A0b 0-9 ._!?",
		]
		for (const text of kept) expect(stripBidiAndZeroWidth(text), JSON.stringify(text)).toBe(text)
	})
})
