import { describe, expect, test } from "vitest"
import {
	CONTACT_NAME_MAX,
	contactNameKey,
	isEmptyContactName,
	sameContactName,
	sanitizeContactName,
	typedContactName,
} from "./contact-name"

describe("sanitizeContactName", () => {
	test("keeps 25 characters, the form's limit, and drops the 26th", () => {
		expect(CONTACT_NAME_MAX).toBe(25)
		expect(sanitizeContactName("A".repeat(25))).toBe("A".repeat(25))
		expect(sanitizeContactName("A".repeat(26))).toBe("A".repeat(25))
	})

	test("trims before the cut, so outer spaces never cost a character, and after it", () => {
		expect(sanitizeContactName(`   ${"B".repeat(25)}   `)).toBe("B".repeat(25))
		expect(sanitizeContactName(`${"C".repeat(24)} D`)).toBe("C".repeat(24))
	})

	test("strips what is not a letter, digit, space, hyphen, dot or underscore", () => {
		expect(sanitizeContactName("‮Alice​!")).toBe("Alice")
	})

	test("keeps letters of any script; a letter outside the BMP that the cut would split is dropped whole, so the name reads back as saved", () => {
		expect(sanitizeContactName("Zoë 李雷 Ольга")).toBe("Zoë 李雷 Ольга")
		// MATHEMATICAL SCRIPT CAPITAL A: one letter, two UTF-16 units.
		const astral = "\u{1D49C}"
		expect(sanitizeContactName(`${"A".repeat(23)}${astral}`)).toBe(`${"A".repeat(23)}${astral}`)
		const cut = sanitizeContactName(`${"A".repeat(24)}${astral}`)
		expect(cut).toBe("A".repeat(24))
		expect(sanitizeContactName(cut)).toBe(cut)
	})

	test("removes invisible characters before the cut, so none is stored and none costs a character", () => {
		// HANGUL FILLER is a letter the character filter keeps; ZERO WIDTH SPACE is not.
		expect(sanitizeContactName(`\u3164${"A".repeat(24)}\u200B\uFFA0B\u3164`)).toBe(`${"A".repeat(24)}B`)
	})

	test("keeps a word break as one space, and never changes a visible letter or its case", () => {
		expect(sanitizeContactName("Alice\u00A0Smith")).toBe("Alice Smith")
		expect(sanitizeContactName("山田\u3000太郎\t\tX")).toBe("山田 太郎 X")
		expect(sanitizeContactName("ＡＬＩＣＥ ﬁ\u0958")).toBe("ＡＬＩＣＥ ﬁ\u0958")
		// A run of spaces costs one character, also one the filter leaves, so a saved name still fits.
		expect(sanitizeContactName(`${"A".repeat(23)}  B`)).toBe(`${"A".repeat(23)} B`)
		expect(sanitizeContactName(`${"A".repeat(23)} \u0000 B`)).toBe(`${"A".repeat(23)} B`)
		expect(sanitizeContactName("A ! B")).toBe("A B")
		for (const name of ["Alice\u00A0Smith", "\u3164Al\u200Dice ", "\u1100!\u1161", "\u0958", "A ! B"]) {
			expect(sanitizeContactName(sanitizeContactName(name))).toBe(sanitizeContactName(name))
		}
	})
})

describe("typedContactName", () => {
	test("is the stored name with its outer spaces kept, so a word break can be typed", () => {
		expect(typedContactName(" Ali\u00A0ce\u200B ")).toBe(" Ali ce ")
		for (const name of [" Ali\u00A0ce\u200B ", `\u3164${"a".repeat(30)}`, "Bob!  Stone", `${"a".repeat(24)}\u{20000}`])
			expect(sanitizeContactName(typedContactName(name))).toBe(sanitizeContactName(name))
	})
})

describe("contactNameKey", () => {
	const same = (...names: string[]) => expect(new Set(names.map(contactNameKey)).size).toBe(1)
	const apart = (a: string, b: string) => expect(contactNameKey(a)).not.toBe(contactNameKey(b))

	test("folds case, including letters one case writes two ways, and keeps dotless ı a letter of its own", () => {
		same("Alice", "ALICE", "aLiCe")
		same("Straße", "STRASSE", "STRAẞE")
		same("ΣΟΦΟΣ", "σοφος", "σοφοσ")
		apart("Aydın", "Aydin")
		apart("İpek", "Ipek")
	})

	test("reads compatibility forms as the letters they stand for", () => {
		same("Alice", "Ａｌｉｃｅ")
		same("Fiona", "ﬁona")
		same("ハナ", "ﾊﾅ")
	})

	test.each([
		["HANGUL CHOSEONG FILLER", "\u115F"],
		["HANGUL JUNGSEONG FILLER", "\u1160"],
		["HANGUL FILLER", "\u3164"],
		["HALFWIDTH HANGUL FILLER", "\uFFA0"],
		["ZERO WIDTH SPACE", "\u200B"],
		["ZERO WIDTH NON-JOINER", "\u200C"],
		["ZERO WIDTH JOINER", "\u200D"],
		["WORD JOINER", "\u2060"],
		["LEFT-TO-RIGHT MARK", "\u200E"],
		["RIGHT-TO-LEFT OVERRIDE", "\u202E"],
		["LEFT-TO-RIGHT ISOLATE", "\u2066"],
		["ZERO WIDTH NO-BREAK SPACE", "\uFEFF"],
		["SOFT HYPHEN", "\u00AD"],
		["COMBINING GRAPHEME JOINER", "\u034F"],
		["MONGOLIAN VOWEL SEPARATOR", "\u180E"],
		["VARIATION SELECTOR-16", "\uFE0F"],
		["TAG LATIN CAPITAL LETTER A", "\u{E0041}"],
	])("drops %s wherever it sits", (_, invisible) => {
		same("Alice", `${invisible}Al${invisible}ice${invisible}`)
	})

	test("an invisible character between a letter and its accent does not keep them apart", () => {
		same("José", "Jose\u200D\u0301", "JOSE\u0301")
	})

	test("reads every whitespace run as one space, trimmed, and keeps a word break a word break", () => {
		same("Alice Smith", "  alice \t\u00A0 SMITH\u3000", "Alice\u2003Smith")
		apart("Alice Smith", "AliceSmith")
	})

	test("is idempotent", () => {
		for (const name of ["Alice", " ALI\u3164CE\t", "STRAẞE", "Ａｌｉｃｅ", "İpek", "ΐ", "ǰ", "ﾊﾅ", "Jose\u200D\u0301"]) {
			expect(contactNameKey(contactNameKey(name))).toBe(contactNameKey(name))
		}
	})

	test("letters that only look alike across scripts keep different keys (not matched by design)", () => {
		apart("Alice", "\u0410lice")
		apart("Alice", "\u0391lice")
	})
})

describe("isEmptyContactName", () => {
	test("a name is empty when nothing of it would be stored", () => {
		for (const name of ["", "   ", "\u3164\u200B\uFFA0", "\t\u00A0", "!?"]) expect(isEmptyContactName(name)).toBe(true)
		for (const name of ["A", " \u3164Bo\u200B ", "李"]) expect(isEmptyContactName(name)).toBe(false)
	})
})

describe("sameContactName", () => {
	test.each([
		["Alice", "Alice", true],
		["Alice", " alice ", true],
		["Alice", "ALI\u3164CE\u200B", true],
		["Alice Smith", "alice  smith", true],
		["Alice", "Al ice", false],
		["Alice", "Alicia", false],
		["Alice", "\u0410lice", false],
	])("%j and %j: %s", (a, b, expected) => {
		expect(sameContactName(a, b)).toBe(expected)
		expect(sameContactName(b, a)).toBe(expected)
	})
})
