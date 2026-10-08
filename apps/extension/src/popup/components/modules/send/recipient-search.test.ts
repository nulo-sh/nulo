import { describe, expect, test } from "vitest"
import { matchRecipients } from "./recipient-search"

const ALICE_ADDRESS = `0x${"0a1ce".repeat(12)}0a1c`
const alice = { id: "1", name: "Alice", address: ALICE_ADDRESS, abbr: "AL" }
const aliceSmith = { id: "2", name: "Alice Smith", address: `0x${"2".repeat(64)}`, abbr: "AS" }
const bob = { id: "3", name: "Bob Marley", address: `0x${"b".repeat(64)}`, abbr: "BM" }
const account = { name: "Account 1", address: `0x${"c".repeat(64)}` }
const candidates = [aliceSmith, alice, bob, account]

const names = (term: string) => matchRecipients(candidates, term).map((c) => c.name)

describe("matchRecipients", () => {
	test("finds a name by any substring of it, in the candidates' order", () => {
		expect(names("lic")).toEqual(["Alice Smith", "Alice"])
		expect(names("smith")).toEqual(["Alice Smith"])
	})

	test("ignores case, spacing and invisible characters, on a partial query as on a whole one", () => {
		for (const term of ["alice", "ALICE", "alice  ", "  Alice", "al\u200Bice", "\u2060ali\u00AD", "ali "]) {
			expect(names(term), JSON.stringify(term)).toEqual(["Alice Smith", "Alice"])
		}
		expect(names("alice   SMITH")).toEqual(["Alice Smith"])
	})

	test("reads compatibility forms and composed letters as the plain name, on both sides", () => {
		expect(names("\uFF21\uFF4C\uFF49\uFF43\uFF45")).toEqual(["Alice Smith", "Alice"])
		const zoe = { name: "Zoe\u0308", address: `0x${"d".repeat(64)}` }
		expect(matchRecipients([zoe], "ZO\u00CB")).toEqual([zoe])
	})

	test("keeps letters that only look alike apart: a Cyrillic a finds no Alice", () => {
		expect(names("\u0430lice")).toEqual([])
		expect(names("\u0410LICE")).toEqual([])
	})

	test("a query that keys to nothing suggests no one", () => {
		for (const term of ["", " ", "   ", "\u200B", "\u200B\u200D\uFEFF", " \u2060 "]) {
			expect(names(term), JSON.stringify(term)).toEqual([])
		}
	})

	test("matches initials whole by the same key, never a part of them", () => {
		expect(names("bm")).toEqual(["Bob Marley"])
		expect(names(" B\u200BM ")).toEqual(["Bob Marley"])
		expect(matchRecipients([{ name: "Robert", address: bob.address, abbr: "BM" }], "m")).toEqual([])
	})

	test("matches an address whole, ignoring hex case only", () => {
		expect(names(ALICE_ADDRESS.toUpperCase().replace("0X", "0x"))).toEqual(["Alice"])
		expect(names(ALICE_ADDRESS.slice(0, 20))).toEqual([])
	})
})
