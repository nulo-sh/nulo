import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import Glossary from "./glossary.vue"

const Shell = {
	props: ["title", "backTo"],
	template: '<div data-testid="shell" :data-title="title" :data-back="backTo"><slot /></div>',
}

const mountPage = () => mount(Glossary, { global: { stubs: { SettingsPageShell: Shell } } })

const text = (w: ReturnType<typeof mountPage>, testid: string) => w.get(`[data-testid="${testid}"]`).text()

describe("settings/glossary", () => {
	test("is a sub-page titled Glossary that goes back to Settings", () => {
		const shell = mountPage().get('[data-testid="shell"]')
		expect(shell.attributes("data-title")).toBe("Glossary")
		expect(shell.attributes("data-back")).toBe("/popup/settings")
	})

	test("lists the five sections in order, each with its entries in order", () => {
		const w = mountPage()
		const sections = w.findAll('[data-testid^="glossary-section-"]')
		expect(sections.map((s) => s.get("span").text())).toEqual(["Your wallet", "Balances", "Fees", "Apps", "Transactions"])
		expect(sections.map((s) => s.attributes("data-testid"))).toEqual([
			"glossary-section-your-wallet",
			"glossary-section-balances",
			"glossary-section-fees",
			"glossary-section-apps",
			"glossary-section-transactions",
		])
		expect(sections.map((s) => s.findAll('[data-testid^="glossary-entry-"]').map((e) => e.attributes("data-testid")))).toEqual([
			[
				"glossary-entry-profile",
				"glossary-entry-account",
				"glossary-entry-network",
				"glossary-entry-alpha",
				"glossary-entry-recovery-phrase",
				"glossary-entry-full-backup",
				"glossary-entry-passkey",
				"glossary-entry-strict-mode",
			],
			["glossary-entry-private-balance", "glossary-entry-public-balance"],
			[
				"glossary-entry-fee-juice",
				"glossary-entry-public-fee-juice",
				"glossary-entry-private-fee-juice",
				"glossary-entry-sponsored",
				"glossary-entry-priority-fee",
				"glossary-entry-fpc",
			],
			[
				"glossary-entry-authorization",
				"glossary-entry-name-for-this-app",
				"glossary-entry-interface",
				"glossary-entry-discover",
				"glossary-entry-connection-check",
			],
			["glossary-entry-proof", "glossary-entry-proving"],
		])
	})

	test.each([
		[
			"profile",
			"Profile",
			"Your wallet on this device: its accounts and keys, behind one password or passkey.",
			"Lock screen · Settings",
		],
		["account", "Account", "An address inside a profile, with its own balances and history.", "Home · Settings"],
		["network", "Network", "The Aztec chain Nulo talks to; each network keeps its own balances and history.", "Header · Settings"],
		[
			"alpha",
			"Alpha",
			"Aztec's main network, also called Mainnet; Testnet and local networks are for trying things out.",
			"Network menu",
		],
		[
			"recovery-phrase",
			"Recovery phrase",
			"The 24 words that restore your accounts, except the ones you imported.",
			"Get started · Backup",
		],
		[
			"full-backup",
			"Full backup",
			"Your accounts, imported keys, tokens, contacts and history, in one password-protected file.",
			"Backup",
		],
		["passkey", "Passkey", "It unlocks Nulo on this device. Your recovery phrase is what restores it.", "Lock screen · Create profile"],
		[
			"strict-mode",
			"Strict security mode",
			"Locks whenever Nulo restarts in the background, as well as after the timeout.",
			"Lock settings",
		],
		["private-balance", "Private balance", "Only you can see it. Marked with a shield.", "Home · tokens · send"],
		["public-balance", "Public balance", "Anyone can see it, like a balance on Ethereum. Marked with a globe.", "Home · tokens · send"],
		["fee-juice", "Fee Juice", "The token that pays network fees on Aztec. Shown as FJ.", "Home · fee card"],
		["public-fee-juice", "Public Fee Juice", "Paying a fee with it shows your address.", "Home · fee menu"],
		["private-fee-juice", "Private Fee Juice", "Paying a fee with it keeps your address hidden.", "Home · fee menu"],
		["sponsored", "Sponsored", "Someone else pays the network fee for you.", "Fee menu"],
		[
			"priority-fee",
			"Priority fee",
			"An extra the app asks you to pay the network for faster inclusion, up to the cap shown.",
			"Approval window",
		],
		[
			"fpc",
			"FPC",
			"A Fee Payment Contract: it settles the network fee, from a sponsor or from your Private Fee Juice.",
			"Fee Payments",
		],
		["authorization", "Authorization", "Lets a contract do one specific thing for you, once.", "Permission window · Connected apps"],
		["name-for-this-app", "Name for this app", "A private name for this account visible only to this app.", "Permission window"],
		[
			"interface",
			"Interface",
			"A contract's interface names a call's arguments; without it Nulo shows the raw values.",
			"Approval window",
		],
		["discover", "Discover", "A site learning that Nulo is installed, and its version, so it can ask to connect.", "Connect window"],
		[
			"connection-check",
			"Connection check",
			"Emojis you compare with the site's, so no one can sit between Nulo and the site.",
			"Connect window",
		],
		["proof", "Proof", "What your device builds to show a transaction is valid without revealing what's in it.", "Proving"],
		[
			"proving",
			"Proving",
			"Your device builds a proof that the transaction is valid without revealing what's in it. It's the slow step before sending.",
			"History · Settings",
		],
	])("%s reads as the spec writes it", (key, term, definition, where) => {
		const w = mountPage()
		expect(text(w, `glossary-term-${key}`)).toBe(term)
		expect(text(w, `glossary-definition-${key}`)).toBe(definition)
		expect(text(w, `glossary-where-${key}`)).toBe(where)
	})
})
