import { describe, expect, test } from "vitest"
import { GLOSSARY, GLOSSARY_SECTIONS } from "./glossary"

// Every entry the owner signed, word for word, in section order.
const SPEC = [
	[
		"Your wallet",
		"profile",
		"Profile",
		"Your wallet on this device: its accounts and keys, behind one password or passkey.",
		"Lock screen · Settings",
	],
	["Your wallet", "account", "Account", "An address inside a profile, with its own balances and history.", "Home · Settings"],
	[
		"Your wallet",
		"network",
		"Network",
		"The Aztec chain Nulo talks to; each network keeps its own balances and history.",
		"Header · Settings",
	],
	[
		"Your wallet",
		"alpha",
		"Alpha",
		"Aztec's main network, also called Mainnet; Testnet and local networks are for trying things out.",
		"Network menu",
	],
	[
		"Your wallet",
		"recovery-phrase",
		"Recovery phrase",
		"The 24 words that restore your accounts, except the ones you imported.",
		"Get started · Backup",
	],
	[
		"Your wallet",
		"full-backup",
		"Full backup",
		"Your accounts, imported keys, tokens, contacts and history, in one password-protected file.",
		"Backup",
	],
	[
		"Your wallet",
		"passkey",
		"Passkey",
		"It unlocks Nulo on this device. Your recovery phrase is what restores it.",
		"Lock screen · Create profile",
	],
	[
		"Your wallet",
		"strict-mode",
		"Strict security mode",
		"Locks whenever Nulo restarts in the background, as well as after the timeout.",
		"Lock settings",
	],
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
		"Fees",
		"fpc",
		"FPC",
		"A Fee Payment Contract: it settles the network fee, from a sponsor or from your Private Fee Juice.",
		"Fee Payments",
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
		"Apps",
		"discover",
		"Discover",
		"A site learning that Nulo is installed, and its version, so it can ask to connect.",
		"Connect window",
	],
	[
		"Apps",
		"connection-check",
		"Connection check",
		"Emojis you compare with the site's, so no one can sit between Nulo and the site.",
		"Connect window",
	],
	["Transactions", "proof", "Proof", "What your device builds to show a transaction is valid without revealing what's in it.", "Proving"],
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
