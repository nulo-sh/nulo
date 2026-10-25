import { describe, expect, test } from "vitest"
import { GLOSSARY, GLOSSARY_SECTIONS } from "./glossary"

// Every entry the owner signed, word for word, in section order.
const SPEC = [
	["Balances", "private-balance", "Private balance", "Only you can see it. Marked with a shield.", "Home · tokens · send"],
	[
		"Balances",
		"public-balance",
		"Public balance",
		"Anyone can see it, like a balance on Ethereum. Marked with a globe.",
		"Home · tokens · send",
	],
	["Fees", "fee-juice", "Fee Juice", "The token that pays network fees on Aztec. Shown as FJ.", "Home · fee card"],
	["Fees", "public-fee-juice", "Public Fee Juice", "Paying a fee with it shows your address.", "Home · fee menu"],
	["Fees", "private-fee-juice", "Private Fee Juice", "Paying a fee with it keeps your address hidden.", "Home · fee menu"],
	["Fees", "sponsored", "Sponsored", "Someone else pays the network fee for you.", "Fee menu"],
	[
		"Fees",
		"priority-fee",
		"Priority fee",
		"An extra the app asks you to pay the network for faster inclusion, up to the cap shown.",
		"Approval window",
	],
	[
		"Apps",
		"authorization",
		"Authorization",
		"Lets a contract do one specific thing for you, once.",
		"Permission window · Connected apps",
	],
	["Apps", "name-for-this-app", "Name for this app", "A private name for this account visible only to this app.", "Permission window"],
	[
		"Apps",
		"interface",
		"Interface",
		"A contract's interface names a call's arguments; without it Nulo shows the raw values.",
		"Approval window",
	],
	[
		"Transactions",
		"proving",
		"Proving",
		"Your device builds a proof that the transaction is valid without revealing what's in it. It's the slow step before sending.",
		"History · Settings",
	],
] as const

describe("glossary", () => {
	test("the entries are the signed strings", () => {
		const entries = Object.fromEntries(SPEC.map(([, key, term, definition, where]) => [key, { term, definition, where }]))
		expect(GLOSSARY).toEqual(entries)
	})

	test("the sections are the signed ones, in order", () => {
		const flat = GLOSSARY_SECTIONS.flatMap((s) => s.keys.map((key) => [s.title, key]))
		expect(flat).toEqual(SPEC.map(([title, key]) => [title, key]))
	})

	test("every key sits in exactly one section, and the sections cover every key", () => {
		const listed = GLOSSARY_SECTIONS.flatMap((s) => s.keys)
		expect(new Set(listed).size).toBe(listed.length)
		expect([...listed].sort()).toEqual(Object.keys(GLOSSARY).sort())
	})
})
