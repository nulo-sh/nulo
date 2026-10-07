import { describe, expect, test } from "vitest"
import {
	addressChangeText,
	classifyImportRow,
	indexSavedContacts,
	matchSavedContacts,
	normalizeImportRows,
	planImportWrites,
	sanitizeImportName,
} from "./contact-import-rows"

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

	test("the first row wins per trimmed name (case-sensitive) and per address", () => {
		const rows = normalizeImportRows([
			{ name: "Alice", address: ADDR.alice },
			{ name: "Alice ", address: ADDR.fresh },
			{ name: "alice", address: ADDR.tom },
			{ name: "Other", address: ADDR.alice },
		])
		expect(rows.map((r) => r.name)).toEqual(["Alice", "alice"])
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
		const crafted = at(30, saved[30] === "f" ? "e" : "f")
		expect(addressChangeText(saved, crafted)).toEqual({ saved, incoming: crafted, full: true })
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
	})

	test("two rows reaching one saved contact from its name and from its address: only the first is admitted", () => {
		const byName = shown("Alice", ADDR.fresh)
		const byAddress = shown("Carol", ADDR.alice)
		const { admitted, refused } = planImportWrites([byName, byAddress], index)
		expect(admitted.map((w) => w.targetId)).toEqual(["c1"])
		expect(refused).toEqual([byAddress])
	})
})
