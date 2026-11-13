import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { describe, expect, test } from "vitest"
import { getNameDescriptor } from "@/wallet/services/token/functions/descriptors"
import {
	addressEnds,
	addressHalves,
	dashIfBlank,
	getInitials,
	isBlank,
	stripBidiAndZeroWidth,
	stripPictographs,
	tokenInitials,
	trimAddress,
} from "./string"

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

describe("tokenInitials", () => {
	test("one letter under 24 px, two from 24 px, upper case", () => {
		expect(tokenInitials("usdc", 16)).toBe("U")
		expect(tokenInitials("usdc", 20)).toBe("U")
		expect(tokenInitials("usdc", 24)).toBe("US")
		expect(tokenInitials("usdc", 36)).toBe("US")
	})

	test("only letters and digits count, by code point", () => {
		expect(tokenInitials("$1INCH", 32)).toBe("1I")
		expect(tokenInitials("\u202Ee\u{1F600}th", 32)).toBe("ET")
		expect(tokenInitials("\u{1D400}\u{1D401}", 32)).toBe("\u{1D400}\u{1D401}")
	})

	test("a symbol with no letter or digit draws the empty value", () => {
		expect(tokenInitials("", 32)).toBe("—")
		expect(tokenInitials("$_-\u{1F600}", 16)).toBe("—")
	})
})

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

describe("addressEnds", () => {
	test("cuts a whole address where the header's short form does, losing nothing", () => {
		const address = `0x22ee${"0".repeat(56)}c204`
		const { head, middle, tail } = addressEnds(address)
		expect([head, tail, `${head}${middle}${tail}`]).toEqual(["0x22ee", "c204", address])
		expect(trimAddress(address, 6, 4, "...")).toBe(`${head}...${tail}`)
	})

	test("an address too short to cut is all head", () => {
		expect(addressEnds("0x12")).toEqual({ head: "0x12", middle: "", tail: "" })
	})
})

describe("addressHalves", () => {
	const ADDRESS = "0x13c29548b3340707017c5d1a457c23d8b6c29548b3340706e39bf608a5aab172"

	test("splits a whole address into two lines of 33 that rejoin to it", () => {
		const halves = addressHalves(ADDRESS)
		expect(halves?.map((h) => h.length)).toEqual([33, 33])
		expect(halves?.join("")).toBe(ADDRESS)
		expect(halves?.[0].startsWith("0x13c29548")).toBe(true)
		expect(halves?.[1].endsWith("a5aab172")).toBe(true)
	})

	test("refuses one character short or long", () => {
		expect(addressHalves(ADDRESS.slice(0, 65))).toBeNull()
		expect(addressHalves(`${ADDRESS}0`)).toBeNull()
	})
})

describe("stripPictographs", () => {
	test("an emoji after, before or inside a name goes, and the spaces it leaves close", () => {
		expect(stripPictographs("Playground \u2705")).toBe("Playground")
		expect(stripPictographs("\u2714\uFE0F Swap")).toBe("Swap")
		expect(stripPictographs("Play\u{1F3AE}ground")).toBe("Playground")
		expect(stripPictographs("Cool \u{1F680} App")).toBe("Cool App")
	})

	test("a check mark that is no emoji still goes: it reads as a seal", () => {
		expect(["Playground \u2713", "Playground \u{1F5F8}", "\u{1F5F9} Playground"].map(stripPictographs)).toEqual([
			"Playground",
			"Playground",
			"Playground",
		])
	})

	test("sequences go whole: a flag, a joined family, a skin tone, a subdivision flag, a keycap", () => {
		expect(stripPictographs("\u{1F1E6}\u{1F1F7} Tango")).toBe("Tango")
		expect(stripPictographs("\u{1F468}\u200D\u{1F469}\u200D\u{1F467} Family")).toBe("Family")
		expect(stripPictographs("\u{1F44D}\u{1F3FD} ok")).toBe("ok")
		expect(stripPictographs("\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F} Club")).toBe("Club")
		expect(stripPictographs("Room 1\uFE0F\u20E3")).toBe("Room")
	})

	test("a name of emoji or keycaps only leaves nothing", () => {
		expect(stripPictographs("\u{1F680}\u{1F680}")).toBe("")
		expect(stripPictographs("1\uFE0F\u20E3 #\uFE0F\u20E3")).toBe("")
	})

	test("letters, digits and punctuation in every script stay, a pictographic punctuation mark included", () => {
		expect(stripPictographs("\u00DCn\u00EFc\u00F6d\u00E9 \u4E2D\u6587 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 123")).toBe(
			"\u00DCn\u00EFc\u00F6d\u00E9 \u4E2D\u6587 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 123",
		)
		expect(stripPictographs("Wow\u203C Room 42 #1, (beta).")).toBe("Wow\u203C Room 42 #1, (beta).")
	})
})
