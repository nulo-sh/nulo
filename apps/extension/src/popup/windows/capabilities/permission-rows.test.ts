import { describe, expect, test } from "vitest"
import type { ContractsCapability, SimulationCapability, TransactionCapability } from "@nulo/wallet-bridge"
import {
	accountAddressRow,
	addressBookRow,
	authorizationsDefault,
	authorizationsRow,
	consentLostOnWidening,
	contractClassesRow,
	contractsRow,
	holdsCallScope,
	isBroadRequest,
	type PermissionRowEntry,
	plainText,
	privateEventsDefault,
	privateEventsRow,
	ROW_ORDER,
	reachOf,
	simulationRow,
	transactionRow,
	unknownRow,
} from "./permission-rows"

const A = `0x${"0a".repeat(32)}`
const B = `0x${"0b".repeat(32)}`
const A_UPPER = `0x${A.slice(2).toUpperCase()}`
const NAMES = [{ address: A, name: "Test USDC" }]
const GROUP_WORDS = { "without-asking": "Without asking", "if-you-allow": "If you allow", "always-asks": "Always asks you first" }

/** A row as the design's row list prints it: group, title (with its chip), and the line under it. */
function cells(row: PermissionRowEntry): [string, string, string] {
	const title = row.chip ? `${row.title} · ${row.chip}` : row.title
	const on = plainText(row.subOn)
	const off = plainText(row.subOff ?? row.subOn)
	const line = on === off ? on || "—" : `On: ${on} · Off: ${off}`
	return [GROUP_WORDS[row.group], title, line]
}

const sim = (transactions?: unknown, utilities?: unknown) =>
	({
		type: "simulation",
		...(transactions ? { transactions: { scope: transactions } } : {}),
		...(utilities ? { utilities: { scope: utilities } } : {}),
	}) as SimulationCapability
const tx = (scope: unknown) => ({ type: "transaction", scope }) as TransactionCapability
const accounts = (canCreateAuthWit: boolean) => ({ type: "accounts", canGet: true, canCreateAuthWit })
const listed = [{ contract: A, function: "transfer" }]

describe("the row list, row by row", () => {
	test("listing your accounts, and the account the app always knows", () => {
		expect(cells(accountAddressRow())).toEqual([
			"Without asking",
			"Let this app list all your accounts",
			"It always knows the account you connect with.",
		])
	})

	test("simulations on listed contracts", () => {
		expect(cells(simulationRow(sim(listed, listed)))).toEqual([
			"Without asking",
			"Run simulations and read the results",
			"Results can include your private balances.",
		])
	})

	test("simulations on any contract, from either sub-scope, carry the chip and the flag", () => {
		const expected = ["Without asking", "Run simulations on any contract · Any contract", "Results can include your private balances."]
		expect(cells(simulationRow(sim("*", listed)))).toEqual(expected)
		expect(cells(simulationRow(sim(listed, "*")))).toEqual(expected)
		expect(cells(simulationRow(sim([{ contract: "*", function: "f" }])))).toEqual(expected)
		expect(simulationRow(sim(undefined, "*")).flagged).toBe(true)
		expect(simulationRow(sim(listed)).flagged).toBe(false)
	})

	test("adding listed contracts, and any contract", () => {
		expect(cells(contractsRow({ type: "contracts", contracts: [A], canRegister: true }, NAMES)!)).toEqual([
			"Without asking",
			"Add contracts to your wallet",
			"—",
		])
		const any = contractsRow({ type: "contracts", contracts: "*", canRegister: true }, [])!
		expect(cells(any)).toEqual(["Without asking", "Add any contract to your wallet · Any contract", "—"])
		expect(any.flagged).toBe(true)
	})

	test("contract details only, and a request with both flags shows only the add row", () => {
		const details = (contracts: "*" | string[], names = NAMES) =>
			contractsRow({ type: "contracts", contracts, canGetMetadata: true }, names)!
		expect(details([A]).key).toBe("contract-details")
		expect(cells(details([A], []))).toEqual(["Without asking", "See details of 1 contract in your wallet", "—"])
		expect(details([A, B]).title).toBe("See details of 2 contracts in your wallet")
		expect(details([A]).title).toBe("See details of Test USDC in your wallet")
		expect(details([A]).flagged).toBe(false)
		const both: ContractsCapability = { type: "contracts", contracts: [A], canRegister: true, canGetMetadata: true }
		expect(contractsRow(both, NAMES)?.key).toBe("contracts")
		expect(contractsRow({ type: "contracts", contracts: [A] }, NAMES)).toBeUndefined()
	})

	test("contract details of any contract are flagged like adding any contract", () => {
		const any = contractsRow({ type: "contracts", contracts: "*", canGetMetadata: true }, NAMES)!
		expect(cells(any)).toEqual(["Without asking", "See details of any contract in your wallet · Any contract", "—"])
		expect(any.flagged).toBe(true)
	})

	test("contract classes name the network, count a list, and name both answers a lookup gives", () => {
		expect(cells(contractClassesRow("Testnet", [A]))).toEqual([
			"Without asking",
			"Look up the code of 1 contract class on Testnet",
			"Whether it is on chain, and if this wallet has its code.",
		])
		expect(contractClassesRow("Testnet", [A, A_UPPER, B]).title).toBe("Look up the code of 2 contract classes on Testnet")
		expect(contractClassesRow("Testnet", [A]).flagged).toBe(false)
	})

	test("every class is flagged like adding any contract", () => {
		const any = contractClassesRow("Testnet", "*")
		expect(cells(any)).toEqual([
			"Without asking",
			"Look up contract code on Testnet · Any class",
			"Whether it is on chain, and if this wallet has its code.",
		])
		expect(any.flagged).toBe(true)
	})

	test("authorizations, with the B lines and their switch", () => {
		const row = authorizationsRow({ broad: false, noScope: false })
		expect(cells(row)).toEqual([
			"If you allow",
			"Act for you in transactions you approve",
			"On: Nulo signs its authorizations without asking. · Off: You confirm each authorization first.",
		])
		expect(row.switchLabel).toBe("Authorizations without asking")
		expect(row.icon).toBe("signature")
		expect(row.flagged).toBe(false)
	})

	test("the dotted word is the only term segment of the authorizations lines", () => {
		const row = authorizationsRow({ broad: false, noScope: false })
		expect(row.subOn).toEqual([{ text: "Nulo signs its " }, { term: "authorizations" }, { text: " without asking." }])
		expect(row.subOff).toEqual([{ text: "You confirm each " }, { term: "authorization" }, { text: " first." }])
	})

	test("authorizations on a broad request: flagged, no chip, the broad lines", () => {
		const row = authorizationsRow({ broad: true, noScope: false })
		expect(plainText(row.subOn)).toBe("For any call, on any contract.")
		expect(plainText(row.subOff)).toBe("You confirm each authorization first. Off because it listed any contract.")
		expect(row.flagged).toBe(true)
		expect(row.chip).toBeUndefined()
	})

	test("authorizations with no transaction or simulation scope always ask: no switch, the off line", () => {
		const row = authorizationsRow({ broad: false, noScope: true })
		expect(cells(row)).toEqual([
			"Always asks you first",
			"Act for you in transactions you approve",
			"You confirm each authorization first.",
		])
		expect(row.switchLabel).toBeUndefined()
	})

	test("the address book", () => {
		const row = addressBookRow({ broadRequest: false })
		expect(cells(row)).toEqual([
			"If you allow",
			"See your address book",
			"On: Every name and address you saved. · Off: Not shared. The app may ask again later.",
		])
		expect(row.switchLabel).toBe("Share address book")
		expect(row.icon).toBe("contacts")
	})

	test("private events from listed contracts", () => {
		const row = privateEventsRow([A], [])
		expect(cells(row)).toEqual([
			"If you allow",
			"See private events from 1 contract",
			"On: Private messages its contracts sent to your accounts, like a transfer you received. · Off: Not shared. The app may ask again later.",
		])
		expect(row.switchLabel).toBe("Share private events")
		expect(row.icon).toBe("mail-lock")
		expect(row.flagged).toBe(false)
		expect(privateEventsRow([A, B], NAMES).title).toBe("See private events from 2 contracts")
		expect(privateEventsRow([A], NAMES).title).toBe("See private events from Test USDC")
	})

	test("private events from any contract: the chip, the flag and the listed row's lines", () => {
		const row = privateEventsRow("*", NAMES)
		expect(cells(row).slice(0, 2)).toEqual(["If you allow", "See private events from any contract · Any contract"])
		expect(cells(row)[2]).toBe(cells(privateEventsRow([A], []))[2])
		expect(row.flagged).toBe(true)
	})

	test("unknown permissions, singular and plural", () => {
		expect(cells(unknownRow(1, { broadRequest: false }))).toEqual([
			"If you allow",
			"Use 1 permission Nulo doesn't recognize",
			"Nulo can't tell you what it allows.",
		])
		expect(unknownRow(2, { broadRequest: false }).title).toBe("Use 2 permissions Nulo doesn't recognize")
		expect(unknownRow(1, { broadRequest: false }).switchLabel).toBe("Unknown permission")
	})

	test("transactions on listed contracts, and on any contract", () => {
		expect(cells(transactionRow(tx(listed), []))).toEqual(["Always asks you first", "Every transaction, on 1 contract", "—"])
		expect(transactionRow(tx(listed), NAMES).title).toBe("Every transaction, on Test USDC")
		expect(transactionRow(tx([...listed, { contract: B, function: "*" }]), NAMES).title).toBe("Every transaction, on 2 contracts")
		expect(cells(transactionRow(tx("*"), NAMES))).toEqual(["Always asks you first", "Every transaction, on any contract", "—"])
		expect(transactionRow(tx([...listed, { contract: "*", function: "f" }]), NAMES).title).toBe("Every transaction, on any contract")
	})

	test("reach names one contract the wallet names, and counts anything else once per address", () => {
		expect(reachOf([A, A_UPPER], NAMES)).toBe("Test USDC")
		expect(reachOf([A, A_UPPER], [])).toBe("1 contract")
		expect(reachOf([A, B], [...NAMES, { address: B, name: "Fee Juice" }])).toBe("2 contracts")
		expect(reachOf(["not-an-address", A], NAMES)).toBe("2 contracts")
	})

	test("each row's icon: the drawn ones, and add_circle, info and mail_lock for the three new rows", () => {
		const icons = [
			accountAddressRow(),
			simulationRow(sim("*")),
			contractsRow({ type: "contracts", contracts: "*", canRegister: true }, [])!,
			contractsRow({ type: "contracts", contracts: [A], canGetMetadata: true }, [])!,
			contractClassesRow("Testnet", "*"),
			authorizationsRow({ broad: false, noScope: false }),
			addressBookRow({ broadRequest: false }),
			privateEventsRow("*", []),
			unknownRow(1, { broadRequest: false }),
			transactionRow(tx("*"), []),
		].map((row) => [row.key, row.icon])
		expect(icons).toEqual([
			["account-address", "eye"],
			["simulation", "play"],
			["contracts", "add"],
			["contract-details", "info"],
			["contract-classes", "code"],
			["authorizations", "signature"],
			["address-book", "contacts"],
			["private-events", "mail-lock"],
			["unknown", "help"],
			["transaction", "check"],
		])
		expect(icons.map(([key]) => key)).toEqual([...ROW_ORDER])
	})

	test("the address book and unknown rows are flagged only in a broad request", () => {
		expect(addressBookRow({ broadRequest: true }).flagged).toBe(true)
		expect(unknownRow(1, { broadRequest: true }).flagged).toBe(true)
		expect(isBroadRequest([tx("*")])).toBe(true)
		expect(isBroadRequest([sim(listed, "*")])).toBe(true)
		expect(isBroadRequest([tx(listed), sim(listed, listed)])).toBe(false)
	})
})

describe("defaults", () => {
	test("any contract defaults Off: authorizations on a first grant, and private events", () => {
		expect(authorizationsDefault({ firstGrant: true, consent: undefined, resulting: [accounts(true), tx("*")] })).toBe(false)
		expect(authorizationsDefault({ firstGrant: true, consent: undefined, resulting: [accounts(true), sim("*")] })).toBe(false)
	})

	test("a first grant over listed scopes starts On, and utilities alone never make it broad", () => {
		expect(authorizationsDefault({ firstGrant: true, consent: undefined, resulting: [accounts(true), tx(listed)] })).toBe(true)
		expect(authorizationsDefault({ firstGrant: true, consent: undefined, resulting: [tx(listed), sim(undefined, "*")] })).toBe(true)
	})

	test.each([
		["a contract outside every call scope", [A, B], [tx(listed)], false],
		["no call scope at all", [A], [accounts(true)], false],
		["a utilities-only scope on the contract", [A], [sim(undefined, listed)], false],
		["an entry that is not an address", ["0xA"], [tx("*")], false],
		["a malformed scope naming the contract", [A], [tx([...listed, { contract: B }])], false],
		["a scope that is neither any nor a list", [A], [tx({ contract: A })], false],
		["events from any contract", "*", [tx("*")], false],
		["inside a transaction scope, in another case", [A_UPPER], [tx(listed)], true],
		["inside a simulated-transactions scope", [A], [sim(listed)], true],
		["inside an any-contract call scope", [A, B], [tx([{ contract: "*", function: "transfer" }])], true],
		["inside two scopes together", [A, B], [tx(listed), sim([{ contract: B, function: "f" }])], true],
	] as const)("private events start %s: %j", (_label, contracts, resulting, on) => {
		expect(privateEventsDefault(contracts as "*" | string[], resulting)).toBe(on)
	})

	test("a re-request starts from the snapshot's effective consent over the resulting grants", () => {
		const narrow = { broad: false }
		expect(authorizationsDefault({ firstGrant: false, consent: narrow, resulting: [tx(listed)] })).toBe(true)
		expect(authorizationsDefault({ firstGrant: false, consent: narrow, resulting: [tx("*")] })).toBe(false)
		expect(authorizationsDefault({ firstGrant: false, consent: { broad: true }, resulting: [tx("*")] })).toBe(true)
		expect(authorizationsDefault({ firstGrant: false, consent: undefined, resulting: [tx(listed)] })).toBe(false)
		expect(authorizationsDefault({ firstGrant: false, consent: "yes", resulting: [tx(listed)] })).toBe(false)
	})

	test("a narrow consent is asked about again only when the request widens to any contract", () => {
		const held = [accounts(true), tx(listed)]
		expect(consentLostOnWidening({ broad: false }, held, [accounts(true), tx("*")])).toBe(true)
		expect(consentLostOnWidening({ broad: false }, held, [accounts(true), tx([...listed, { contract: B, function: "*" }])])).toBe(false)
		expect(consentLostOnWidening({ broad: true }, held, [accounts(true), tx("*")])).toBe(false)
		expect(consentLostOnWidening(undefined, held, [accounts(true), tx("*")])).toBe(false)
		expect(consentLostOnWidening({ broad: false }, [accounts(false), tx(listed)], [accounts(false), tx("*")])).toBe(false)
	})

	test("a call scope is a transaction grant or simulated transactions, never utilities alone", () => {
		expect(holdsCallScope([tx(listed)])).toBe(true)
		expect(holdsCallScope([sim(listed)])).toBe(true)
		expect(holdsCallScope([sim(undefined, "*"), accounts(true)])).toBe(false)
		expect(holdsCallScope([])).toBe(false)
	})
})

describe("the capability object check accepts arrays", () => {
	test("an array carrying a capability's fields is read like an object", () => {
		const disguised = Object.assign([], { type: "transaction", scope: "*" })
		expect(holdsCallScope([disguised])).toBe(true)
	})
})
