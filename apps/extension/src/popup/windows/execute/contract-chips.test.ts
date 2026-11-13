import { describe, expect, test } from "vitest"
import { nameBookOf } from "./contract-chips"

const ALICE = `0x${"0a".repeat(32)}`
const MAIN = `0x${"0c".repeat(32)}`

describe("nameBookOf", () => {
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
