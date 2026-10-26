import { EventHandler } from "@nulo/wallet-core/utils"
import { describe, expect, test } from "vitest"
import { type Account, AccountType } from "@/wallet/services/account/client"
import { type AccountRowTarget, applyAccountRow, followAccountRows, listOwnAccountRow } from "./account-rows"

const row = (address: string, fields: Partial<Account> = {}): Account => ({
	profileId: "p1",
	chainId: 7,
	address,
	index: 0,
	type: AccountType.Nulo_v1,
	l1ChainId: 11155111,
	name: "Account 1",
	visible: true,
	...fields,
})
const FIRST = row(`0x${"01".repeat(32)}`)
const SECOND = row(`0x${"02".repeat(32)}`, { index: 1, name: "FromMain" })
const IMPORTED = row(`0x${"03".repeat(32)}`, { type: AccountType.Imported, name: "RaceA" })

function window(): AccountRowTarget {
	return { profile: { id: "p1" }, network: { chainId: 7 }, accounts: [FIRST, SECOND], account: SECOND }
}

describe("an account row reported to a window", () => {
	test("a row of the open profile and chain is listed once, however often it arrives, and does not become active", () => {
		const w = window()
		applyAccountRow(w, IMPORTED)
		applyAccountRow(w, { ...IMPORTED })
		expect(w.accounts.map((a) => a.address)).toEqual([FIRST.address, SECOND.address, IMPORTED.address])
		expect(w.account).toBe(SECOND)
	})

	test.each([
		["another profile", { profileId: "p2" }],
		["another chain", { chainId: 8 }],
	])("a row of %s changes nothing", (_, scope) => {
		const w = window()
		applyAccountRow(w, { ...IMPORTED, ...scope })
		applyAccountRow(w, { ...FIRST, ...scope, name: "Renamed" })
		expect(w).toEqual(window())
	})

	test("an edited row replaces its entry, and refreshes the active account only when it is that account", () => {
		const w = window()
		applyAccountRow(w, { ...FIRST, visible: false })
		expect(w.accounts).toEqual([{ ...FIRST, visible: false }, SECOND])
		expect(w.account).toBe(SECOND)
		applyAccountRow(w, { ...SECOND, name: "Savings" })
		expect(w.accounts[1]).toEqual({ ...SECOND, name: "Savings" })
		expect(w.account).toEqual({ ...SECOND, name: "Savings" })
	})
})

describe("the answer of a window's own create or import", () => {
	test("is listed when no event listed it, and never overwrites the row an event already holds", () => {
		const w = window()
		listOwnAccountRow(w, IMPORTED)
		expect(w.accounts).toEqual([FIRST, SECOND, IMPORTED])
		applyAccountRow(w, { ...IMPORTED, visible: false })
		listOwnAccountRow(w, IMPORTED)
		expect(w.accounts).toEqual([FIRST, SECOND, { ...IMPORTED, visible: false }])
		listOwnAccountRow(w, { ...IMPORTED, address: `0x${"04".repeat(32)}`, chainId: 8 })
		expect(w.accounts).toHaveLength(3)
	})
})

test("a window follows the rows its client reports added or edited, until it stops", () => {
	const client = { onAccountAdded: new EventHandler<Account>(), onAccountUpdated: new EventHandler<Account>() }
	const w = window()
	const stop = followAccountRows(client, w)
	client.onAccountAdded.invoke(IMPORTED)
	client.onAccountUpdated.invoke({ ...FIRST, name: "Renamed" })
	expect(w.accounts).toEqual([{ ...FIRST, name: "Renamed" }, SECOND, IMPORTED])
	stop()
	client.onAccountUpdated.invoke({ ...FIRST, name: "Later" })
	expect(w.accounts[0].name).toBe("Renamed")
})
