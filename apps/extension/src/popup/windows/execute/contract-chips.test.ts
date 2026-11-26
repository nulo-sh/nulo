import { describe, expect, test } from "vitest"
import { nameBookOf } from "./contract-chips"

const ALICE = `0x${"0a".repeat(32)}`
const MAIN = `0x${"0c".repeat(32)}`
const ANA = `0x${"0e".repeat(32)}`

describe("nameBookOf", () => {
	test("a contact name that reads as an address names nothing: the account at that address names it, as with no contact", () => {
		const book = nameBookOf(
			[
				{ name: "0x0c2b7e..4b5c", address: ALICE },
				{ name: "0x0c2b..4b5c", address: MAIN },
				{ name: "Ana", address: ANA },
			],
			[{ name: "Main", address: MAIN }],
		)
		expect([...book]).toEqual([
			[ANA, "@Ana"],
			[MAIN, "Main"],
		])
	})

	test("a contact by @ and its name outranks an account at the same address, in any case; a blank name names nothing", () => {
		const book = nameBookOf(
			[
				{ name: "Alice", address: ALICE.toUpperCase().replace("0X", "0x") },
				{ name: "", address: MAIN },
			],
			[
				{ name: "Savings", address: ALICE },
				{ name: "Main", address: MAIN },
			],
		)
		expect([...book]).toEqual([
			[ALICE, "@Alice"],
			[MAIN, "Main"],
		])
	})
})
