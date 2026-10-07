import { describe, expect, test } from "vitest"
import {
	addressChangeText,
	classifyImportRow,
	contactNameKey,
	indexSavedContacts,
	matchSavedContacts,
	normalizeImportRows,
	planImportWrites,
	sanitizeImportName,
} from "./contact-import-rows"
import { parseContactsExport } from "./contacts-export-format"

// Wire-shaped: 0x + 64 hex, each the x coordinate of a Grumpkin point.
const ADDR = {
	alice: "0x01904dba18e847d163097ce15dcd8597e763fb11fe19ef1273d266d6e959ec4a",
	marco: "0x09c1c9d2ce72c53c2451f8e9add86ccb8cb284dd4dc4f0eaf301b40b38a9459b",
	tom: "0x048b29517cddb7566a05a2a292624eb2c5350dbe44350763cefe4c9207344c10",
	fresh: "0x0402f387a230066a23abced99a2348c1ba902c95518bdc2f9447a0ca51e5cbe2",
	priya: "0x02056523b85ea4e550facca78516f7270f18bddb0f5474177d406f6bf0e58617",
}
// 0x + 64 hex that is not on the curve.
const OFF_CURVE = "0x0895f3902a26c15e2f159778cd7848cf9048fce777ee8f41dc90a9fe6b50fc09"
const upper = (address: string) => `0x${address.slice(2).toUpperCase()}`

const SAVED = [
	{ id: "c1", name: "Alice", address: ADDR.alice },
	{ id: "c2", name: "Marco Rossi", address: ADDR.marco.toUpperCase().replace("0X", "0x") },
	{ id: "c3", name: " Tom Becker ", address: ADDR.tom },
]

const classify = (name: string, address: string, saved = SAVED) => classifyImportRow({ name, address }, indexSavedContacts(saved))

describe("sanitizeImportName", () => {
	test("keeps 25 characters, the form's limit, and drops the 26th", () => {
		expect(sanitizeImportName("A".repeat(25))).toBe("A".repeat(25))
		expect(sanitizeImportName("A".repeat(26))).toBe("A".repeat(25))
	})

	test("trims before the cut, so outer spaces never cost a character, and after it", () => {
		expect(sanitizeImportName(`   ${"B".repeat(25)}   `)).toBe("B".repeat(25))
		expect(sanitizeImportName(`${"C".repeat(24)} D`)).toBe("C".repeat(24))
	})

	test("strips what is not a letter, digit, space, hyphen, dot or underscore", () => {
		expect(sanitizeImportName("‮Alice​!")).toBe("Alice")
	})

	test("keeps letters of any script; a letter outside the BMP that the cut would split is dropped whole, so the name reads back as saved", () => {
		expect(sanitizeImportName("Zoë 李雷 Ольга")).toBe("Zoë 李雷 Ольга")
		// MATHEMATICAL SCRIPT CAPITAL A: one letter, two UTF-16 units.
		const astral = "\u{1D49C}"
		expect(sanitizeImportName(`${"A".repeat(23)}${astral}`)).toBe(`${"A".repeat(23)}${astral}`)
		const cut = sanitizeImportName(`${"A".repeat(24)}${astral}`)
		expect(cut).toBe("A".repeat(24))
		expect(sanitizeImportName(cut)).toBe(cut)
	})

	test("removes invisible characters before the cut, so none is stored and none costs a character", () => {
		// HANGUL FILLER is a letter the character filter keeps; ZERO WIDTH SPACE is not.
		expect(sanitizeImportName(`\u3164${"A".repeat(24)}\u200B\uFFA0B\u3164`)).toBe(`${"A".repeat(24)}B`)
	})

	test("keeps a word break as one space, and never changes a visible letter or its case", () => {
		expect(sanitizeImportName("Alice\u00A0Smith")).toBe("Alice Smith")
		expect(sanitizeImportName("山田\u3000太郎\t\tX")).toBe("山田 太郎 X")
		expect(sanitizeImportName("ＡＬＩＣＥ ﬁ\u0958")).toBe("ＡＬＩＣＥ ﬁ\u0958")
		// A run of spaces costs one character, also one the filter leaves, so a saved name still fits.
		expect(sanitizeImportName(`${"A".repeat(23)}  B`)).toBe(`${"A".repeat(23)} B`)
		expect(sanitizeImportName(`${"A".repeat(23)} \u0000 B`)).toBe(`${"A".repeat(23)} B`)
		expect(sanitizeImportName("A ! B")).toBe("A B")
		for (const name of ["Alice\u00A0Smith", "\u3164Al\u200Dice ", "\u1100!\u1161", "\u0958", "A ! B"]) {
			expect(sanitizeImportName(sanitizeImportName(name))).toBe(sanitizeImportName(name))
		}
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

describe("normalizeImportRows", () => {
	test("builds minimal rows: trimmed name, lowercase address, strict isSender", () => {
		const rows = normalizeImportRows([
			{ name: " Alice ", address: ADDR.alice.toUpperCase().replace("0X", "0x"), isSender: "true", extra: 1 },
		])
		expect(rows).toEqual([{ name: "Alice", address: ADDR.alice, isSender: false }])
	})

	test("drops empty, whitespace-only and non-string fields", () => {
		const rows = normalizeImportRows([
			null,
			{ name: 42, address: ADDR.alice },
			{ name: "   ", address: ADDR.tom },
			{ name: "Ok", address: "  " },
		])
		expect(rows).toEqual([])
	})

	test("the first row wins per name, whatever its case, spacing or invisible characters, and per address", () => {
		const rows = normalizeImportRows([
			{ name: "Alice", address: ADDR.alice },
			{ name: "Alice ", address: ADDR.fresh },
			{ name: "ALICE", address: ADDR.tom },
			{ name: "Al\u3164ice", address: ADDR.priya },
			{ name: "Other", address: ADDR.alice },
			{ name: "\u0410lice", address: ADDR.marco },
		])
		expect(rows.map((r) => [r.name, r.address])).toEqual([
			["Alice", ADDR.alice],
			["\u0410lice", ADDR.marco],
		])
	})

	test("a file of malformed, padded and colliding rows, as the parser reads it, becomes exactly these rows", () => {
		const raw = `[
			{ "name": "", "address": "${ADDR.priya}" },
			{ "name": "   ", "address": "${ADDR.priya}" },
			{ "name": "  Bartholomew Featherstones  ", "address": "${upper(ADDR.alice)}", "isSender": "true", "extra": { "deep": 1 } },
			{ "name": "Bartholomew Featherstonesyz", "address": "${ADDR.tom}" },
			{ "name": "Zoë 李雷 Ольга", "address": "${ADDR.tom}" },
			{ "name": "\\u202eEve\\u200b", "address": "${ADDR.marco}", "isSender": true },
			{ "name": "Fay", "address": "${ADDR.alice}" },
			{ "name": "Gus", "address": "${ADDR.fresh}", "name": "Gil" },
			{ "name": "Gil", "address": "${ADDR.priya}" }
		]`
		expect(normalizeImportRows(parseContactsExport(raw).contacts)).toEqual([
			{ name: "Bartholomew Featherstones", address: ADDR.alice, isSender: false },
			{ name: "Zoë 李雷 Ольга", address: ADDR.tom, isSender: false },
			{ name: "Eve", address: ADDR.marco, isSender: true },
			{ name: "Gil", address: ADDR.fresh, isSender: false },
		])
	})

	test("a row dropped for one key does not reserve its other key", () => {
		const rows = normalizeImportRows([
			{ name: "Alice", address: ADDR.alice },
			{ name: "Bob", address: ADDR.alice },
			{ name: "Bob", address: ADDR.tom },
		])
		expect(rows).toEqual([
			{ name: "Alice", address: ADDR.alice, isSender: false },
			{ name: "Bob", address: ADDR.tom, isSender: false },
		])
	})
})

describe("matchSavedContacts / classifyImportRow", () => {
	test.each([
		["a name and address the book does not have", "Priya Shah", ADDR.fresh, "new", true],
		["the saved name with another address", "Alice", ADDR.fresh, "address-change", false],
		["the saved address (any case) with another name", "Marco", ADDR.marco, "name-change", false],
		["the saved name and address, the name saved with outer spaces", "Tom Becker", ADDR.tom, "unchanged", false],
		["one saved contact's name and another's address", "Alice", ADDR.tom, "conflict", false],
		["an address off the curve, whatever else matches", "Alice", OFF_CURVE, "invalid", false],
	])("%s", (_, name, address, kind, selected) => {
		const row = classify(name, address)
		expect(row.kind).toBe(kind)
		expect(row.selected).toBe(selected)
		expect(row.importable).toBe(kind !== "conflict" && kind !== "invalid")
	})

	test.each([
		["case", "ALICE", "aLiCe", "c1", ADDR.alice],
		["spacing", "Tom   Becker", "  Tom Becker\t", "c3", ADDR.tom],
		["invisible characters", "Al\u3164ice\u200B", "\uFFA0Alice", "c1", ADDR.alice],
	])(
		"a name that differs from a saved one only by %s is that contact: Already saved at its address, an address change at another",
		(_, atAddress, elsewhere, targetId, address) => {
			expect(classify(atAddress, address)).toMatchObject({ kind: "unchanged", targetId, selected: false })
			expect(classify(elsewhere, ADDR.fresh)).toMatchObject({ kind: "address-change", targetId, selected: false })
		},
	)

	test("a saved name holding invisible characters is matched by its visible spelling; a new spelling at a saved address is still a name change", () => {
		const older = [{ id: "c9", name: "Bob\u3164", address: ADDR.priya }]
		expect(classify("bob", ADDR.priya, older)).toMatchObject({ kind: "unchanged", targetId: "c9" })
		expect(classify("Bobby", ADDR.priya, older)).toMatchObject({ kind: "name-change", targetId: "c9" })
	})

	test("two saved contacts whose names differ only by case or spacing are one name: a row matching them is a conflict", () => {
		const twins = [...SAVED, { id: "c4", name: "ALICE ", address: ADDR.fresh }]
		expect(classify("alice", ADDR.priya, twins)).toMatchObject({ kind: "conflict", importable: false, targetId: null })
	})

	test("a look-alike letter from another script is a different name: new elsewhere, a name change at the saved address", () => {
		expect(classify("\u0410lice", ADDR.fresh)).toMatchObject({ kind: "new", targetId: null })
		expect(classify("\u0410lice", ADDR.alice)).toMatchObject({ kind: "name-change", targetId: "c1" })
	})

	test("an accent written as a separate mark is deleted by the character filter before the key sees it, so that spelling is a new name", () => {
		const [row] = normalizeImportRows([{ name: "JOSE\u0301", address: ADDR.fresh }])
		expect(row.name).toBe("JOSE")
		expect(classify(row.name, row.address, [{ id: "c9", name: "José", address: ADDR.priya }])).toMatchObject({ kind: "new" })
	})

	test("a change carries the saved values it replaces", () => {
		expect(classify("Alice", ADDR.fresh)).toMatchObject({ savedName: "Alice", savedAddress: ADDR.alice })
		expect(classify("Marco", ADDR.marco)).toMatchObject({ savedName: "Marco Rossi" })
		expect(classify("Priya Shah", ADDR.fresh)).toMatchObject({ savedName: null, savedAddress: null })
		expect(classify("Alice", ADDR.tom)).toMatchObject({ savedName: null, savedAddress: null })
	})

	test("two saved contacts under one trimmed name, or one address, make any row matching them a conflict", () => {
		const twins = [...SAVED, { id: "c4", name: "Alice ", address: ADDR.fresh }]
		expect(classify("Alice", ADDR.priya, twins)).toMatchObject({ kind: "conflict", importable: false })
		const shared = [...SAVED, { id: "c5", name: "Alicia", address: ADDR.alice }]
		expect(matchSavedContacts({ name: "Someone", address: ADDR.alice }, indexSavedContacts(shared))).toEqual({
			kind: "conflict",
			target: null,
		})
	})

	test("the match targets the one saved contact a write would update", () => {
		const index = indexSavedContacts(SAVED)
		expect(matchSavedContacts({ name: "Alice", address: ADDR.fresh }, index).target?.id).toBe("c1")
		expect(matchSavedContacts({ name: "Marco", address: ADDR.marco }, index).target?.id).toBe("c2")
		expect(matchSavedContacts({ name: "Priya Shah", address: ADDR.fresh }, index).target).toBeNull()
	})
})

describe("addressChangeText", () => {
	const saved = ADDR.marco
	const at = (i: number, c: string) => `${saved.slice(0, i)}${c}${saved.slice(i + 1)}`

	test("identical short forms show both full addresses", () => {
		const sameShort = at(30, saved[30] === "f" ? "e" : "f")
		expect(addressChangeText(saved, sameShort)).toEqual({ saved, incoming: sameShort, full: true })
	})

	test("a one-character difference inside the short form keeps the short forms", () => {
		const head = at(5, saved[5] === "f" ? "e" : "f")
		const tail = at(65, saved[65] === "f" ? "e" : "f")
		expect(addressChangeText(saved, head)).toEqual({ saved: "0x09c1c9..459b", incoming: `${head.slice(0, 8)}..459b`, full: false })
		expect(addressChangeText(saved, tail).full).toBe(false)
	})

	test("a difference only in the hidden middle is a collision, whatever the letter case", () => {
		const middle = at(40, saved[40] === "f" ? "e" : "f")
		expect(addressChangeText(saved.toUpperCase().replace("0X", "0x"), middle).full).toBe(true)
	})
})

describe("planImportWrites", () => {
	const index = indexSavedContacts(SAVED)
	const shown = (name: string, address: string, isSender = false) => ({ name, address, isSender, ...classify(name, address) })

	test("admits rows that still do what the screen showed, with the saved contact each one writes", () => {
		const rows = [shown("Alice", ADDR.fresh), shown("Marco", ADDR.marco), shown("Priya Shah", ADDR.priya)]
		const { admitted, refused } = planImportWrites(rows, index)
		expect(admitted.map((w) => w.targetId)).toEqual(["c1", "c2", null])
		expect(refused).toEqual([])
	})

	test("refuses a row whose decision moved since it was shown, or that carries none", () => {
		const shownForAlice = shown("Alice", ADDR.fresh, true)
		const later = indexSavedContacts([...SAVED.filter((c) => c.id !== "c1"), { id: "c9", name: "Alice", address: ADDR.alice }])
		expect(planImportWrites([shownForAlice], later).refused).toHaveLength(1)

		const asNewThen = { ...shown("Alice", ADDR.fresh), kind: "new" as const, targetId: null }
		expect(planImportWrites([asNewThen], index).refused).toHaveLength(1)
		expect(planImportWrites([{ name: "Priya Shah", address: ADDR.priya }], index).refused).toHaveLength(1)
	})

	test("refuses a row whose saved contact no longer holds the old value it showed, though kind and contact are unchanged", () => {
		const addressChange = shown("Alice", ADDR.fresh)
		const movedAgain = indexSavedContacts([{ ...SAVED[0], address: ADDR.priya }, ...SAVED.slice(1)])
		expect(planImportWrites([addressChange], movedAgain).refused).toEqual([addressChange])

		const nameChange = shown("Marco", ADDR.marco)
		const renamedAgain = indexSavedContacts([SAVED[0], { ...SAVED[1], name: "Marco R" }, SAVED[2]])
		expect(planImportWrites([nameChange], renamedAgain).refused).toEqual([nameChange])

		// The screen showed the old spelling, so a rename elsewhere that changes only its case still refuses.
		const recased = indexSavedContacts([{ ...SAVED[0], name: "ALICE" }, ...SAVED.slice(1)])
		expect(planImportWrites([addressChange], recased).refused).toEqual([addressChange])
	})

	test("refuses a conflict and an invalid row even when the shown decision says so", () => {
		expect(planImportWrites([shown("Alice", ADDR.tom), shown("Lena", OFF_CURVE)], index).admitted).toEqual([])
	})

	test("a name or an address taken by an earlier admitted row refuses the later one, update or new, in either order", () => {
		const update = shown("Alice", ADDR.fresh)
		const newSameAddress = { ...shown("Carol", ADDR.priya), address: ADDR.fresh }
		expect(planImportWrites([update, newSameAddress], index).admitted.map((w) => w.row.name)).toEqual(["Alice"])
		expect(planImportWrites([newSameAddress, update], index).admitted.map((w) => w.row.name)).toEqual(["Carol"])

		const rename = shown("Zed", ADDR.marco)
		const newSameName = shown("Zed", ADDR.priya)
		expect(planImportWrites([rename, newSameName], index).admitted.map((w) => w.row.address)).toEqual([ADDR.marco])

		const sameNameOtherSpelling = shown("ZED\u3164 ", ADDR.priya)
		expect(planImportWrites([rename, sameNameOtherSpelling], index).admitted.map((w) => w.row.address)).toEqual([ADDR.marco])
	})

	test("two rows reaching one saved contact from its name and from its address: only the first is admitted", () => {
		const byName = shown("Alice", ADDR.fresh)
		const byAddress = shown("Carol", ADDR.alice)
		const { admitted, refused } = planImportWrites([byName, byAddress], index)
		expect(admitted.map((w) => w.targetId)).toEqual(["c1"])
		expect(refused).toEqual([byAddress])
	})
})
