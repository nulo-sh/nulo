import { describe, expect, test } from "vitest"
import {
	CONTACT_NAME_MAX,
	contactNameKey,
	isAddressShapedName,
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
	test("is the stored name with a trailing space kept, so a word break can be typed, and no leading one", () => {
		expect(typedContactName(" Ali\u00A0ce\u200B ")).toBe("Ali ce ")
		const names = [" Ali\u00A0ce\u200B ", `\u3164${"a".repeat(30)}`, "Bob!  Stone", `${"a".repeat(24)}\u{20000}`, ` ${"a".repeat(24)}b`]
		for (const name of names) expect(sanitizeContactName(typedContactName(name))).toBe(sanitizeContactName(name))
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

describe("isAddressShapedName, on the name as it is stored", () => {
	const reads = (name: string) => isAddressShapedName(sanitizeContactName(name))

	test("`0x` and four hex digits, in any case and anywhere in the name", () => {
		for (const name of ["0xabcd", "0x0c2b", "Wallet 0xdeadbeef", "0X0C2B"]) expect(reads(name), name).toBe(true)
		for (const name of ["0xabc", "0x", "Oxford"]) expect(reads(name), name).toBe(false)
	})

	test("two dots in a row, anywhere, also once spaces, hyphens and underscores are taken out", () => {
		for (const name of ["0x..4b5c", "Abe...Dad", "Mom...", "0x 0c2b7e. .4b5c", "A.-.B", "A._.B"]) expect(reads(name), name).toBe(true)
		for (const name of ["J.R. Smith", "A. B. C.", "Dr. No", "tom.eth", "v1.2.3"]) expect(reads(name), name).toBe(false)
	})

	test("the digit 0, an x and four or more letters or digits with a digit among them, also once spaces, hyphens and underscores are taken out", () => {
		const refused = ["0xSif1", "0x0c2l7e4b5c6d7e8f9a0b1c2", "Team 10 x 4 all", "0x-sam1", "0xford.0xzz1z", "1000 x 2000"]
		for (const name of refused) expect(reads(name), name).toBe(true)
		// Four is the shortest run.
		for (const name of ["0xa1c", "Vault 0x12", "0xmaki", "Box 0xford", "Roxanne1985", "Xbox360", "0x"])
			expect(reads(name), name).toBe(false)
	})

	test.each([
		["Cyrillic х", "0хSifu1"],
		["Greek χ", "0χSifu1"],
		["capital X", "0XSIFU1"],
		["fullwidth x", "0ｘSifu1"],
		["a mathematical x", "0\u{1D431}Sifu1"],
	])("the x of a `0x` run is any letter case and compatibility forms fold to x: %s", (_x, name) => {
		expect(reads(name)).toBe(true)
	})

	// No digit follows the x, so only the hex fold refuses these.
	test.each([
		["Latin o", "Oxabcd"],
		["Cyrillic а", "0xаbcd"],
		["Cyrillic в", "0xabcв"],
		["Cyrillic с", "0xaсbd"],
		["Cyrillic ԁ", "0xabԁe"],
		["Cyrillic е", "0xabеc"],
		["Cyrillic О", "Оxabcd"],
		["Cyrillic х", "0хabcd"],
		["Greek α", "0xαbcd"],
		["Greek β", "0xabcβ"],
		["Greek ϲ", "0xaϲbd"],
		["Greek Ϲ", "0xaϹbd"],
		["Greek ε", "0xabεc"],
		["Greek ο", "οxabcd"],
		["Greek χ", "0χabcd"],
	])("a look-alike letter reads as the hex it is drawn like: %s", (_letter, name) => {
		expect(reads(name)).toBe(true)
	})

	test("compatibility forms and marks fold first: fullwidth letters, a mathematical capital, a marked x or Cyrillic е", () => {
		for (const name of ["0ｘａｂｃｄ", "0xab\u{1D402}d", "0ẋabcd", "0xabёc"]) expect(reads(name), name).toBe(true)
	})

	test("an address cut to the name's 25 characters", () => {
		expect(reads(`0x${"0c2b7e41".repeat(8)}`)).toBe(true)
	})

	test("a short address is refused whatever letters fill it", () => {
		const names = [
			"0x0c2b7e..4b5c",
			"0x0c2l7e..4b5c",
			"0x0c2I7e..4b5c",
			"0x0c2S7e..4b5c",
			"0x0c2ø7e..4b5c",
			"0xøc2b7ø..4b5c",
			"0x0c2ɑ7e..4b5c",
			"Ox0c2l7e..4b5c",
			"0x0c..4b",
			"0x0c2l7e4b5c",
		]
		for (const name of names) expect(reads(name), name).toBe(true)
	})

	// The owner's pick of 2026-11-24 named these two lists: the names that pass, and the seven it refuses.
	test.each(["Ana", "Oxford", "J.R. Smith", "Box 0xford", "Roxanne1985", "Xbox360", "0xmaki", "tom.eth", "R2-D2"])(
		"%j passes",
		(name) => {
			expect(reads(name)).toBe(false)
		},
	)

	test.each(["J.R.. Smith", "A..B", "Mom...", "Wait.. what", "v1..2", "0xSifu1", "Team 10 x 4 all"])("%j is refused", (name) => {
		expect(reads(name)).toBe(true)
	})

	test("ordinary names of any script, with initials and numbers, pass", () => {
		const names = [
			"Zoë Ångström",
			"Søren",
			"Deadbeef",
			"Account 1",
			"Наташа",
			"李雷 2",
			"María José",
			"Agent 007",
			"Uncle Bob 1.5",
			"Fox Face",
		]
		for (const name of names) expect(reads(name), name).toBe(false)
	})

	test("matches in time linear in the name, however long", () => {
		const long = [
			`0x${"g".repeat(100_000)}`,
			`0x${"g".repeat(100_000)}.1`,
			"0xgg.".repeat(20_000),
			`0${"\u0445".repeat(100_000)}`,
			"abc.".repeat(25_000),
			`abc${".".repeat(100_000)}g`,
		]
		const started = performance.now()
		const results = long.map(isAddressShapedName)
		expect(performance.now() - started).toBeLessThan(1_000)
		expect(results).toEqual([false, false, false, false, false, true])
	})
})
