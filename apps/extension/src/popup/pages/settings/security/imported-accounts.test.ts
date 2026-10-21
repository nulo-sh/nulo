import { describe, expect, test, vi } from "vitest"
import { type Account, AccountType } from "@/wallet/services/account/client"
import type { StaleNetworkView } from "@/wallet/services/network-reset/client"
import { type ImportedAccountReads, readImportedAccounts } from "./imported-accounts"

const TESTNET = 11155111
const LOCAL = 31337
const SAVINGS = `0x${"04c0".repeat(16)}`
const COLD = `0x${"1d7a".repeat(16)}`
const DERIVED = `0x${"2e18".repeat(16)}`

const row = (chainId: number, address: string, name: string, type: AccountType, visible = true): Account =>
	({ profileId: "p1", chainId, address, name, type, index: 0, l1ChainId: 1, visible }) as Account

function reads(rows: Account[], over: Partial<ImportedAccountReads> = {}) {
	return {
		getNetworks: vi.fn(async () => [
			{ id: "tn", chainId: TESTNET },
			{ id: "ln", chainId: LOCAL },
		]),
		getAccounts: vi.fn(async (_p: string, chainId: number, all: boolean) =>
			rows.filter((a) => a.chainId === chainId && (all || a.visible)),
		),
		getPendingReset: vi.fn(async () => null),
		getStaleNetwork: vi.fn(async () => null),
		...over,
	} satisfies ImportedAccountReads
}

const pausedOn = (networkId: string, heldImported: Array<{ name: string; address: string }>) => ({
	getPendingReset: vi.fn(async () => ({ networkId, running: false })),
	getStaleNetwork: vi.fn(
		async (): Promise<Pick<StaleNetworkView, "reset">> => ({
			reset: { running: false, purged: true, doneCount: 0, imported: [], heldImported },
		}),
	),
})

describe("the imported accounts Delete Profile names", () => {
	test("each chain's imported accounts, a hidden one included, and no derived account", async () => {
		const r = reads([
			row(TESTNET, DERIVED, "Account 1", AccountType.Nulo_v1),
			row(TESTNET, SAVINGS, "Savings", AccountType.Imported, false),
			row(LOCAL, COLD, "Cold", AccountType.Imported),
		])
		expect(await readImportedAccounts(r, "p1")).toEqual({
			accounts: [
				{ name: "Savings", address: SAVINGS, chainId: TESTNET },
				{ name: "Cold", address: COLD, chainId: LOCAL },
			],
			resetPending: false,
		})
		expect(r.getAccounts).toHaveBeenCalledWith("p1", TESTNET, true)
		expect(r.getStaleNetwork).not.toHaveBeenCalled()
	})

	test("a paused reset's held import is named under its network, once even when recreated", async () => {
		const held = reads([], pausedOn("tn", [{ name: "Savings", address: SAVINGS }]))
		expect((await readImportedAccounts(held, "p1")).accounts).toEqual([{ name: "Savings", address: SAVINGS, chainId: TESTNET }])

		const recreated = reads(
			[row(TESTNET, SAVINGS, "Savings", AccountType.Imported)],
			pausedOn("tn", [{ name: "Savings", address: SAVINGS }]),
		)
		expect(await readImportedAccounts(recreated, "p1")).toEqual({
			accounts: [{ name: "Savings", address: SAVINGS, chainId: TESTNET }],
			resetPending: true,
		})
	})

	test("one address imported on two chains is named twice", async () => {
		const r = reads([row(LOCAL, SAVINGS, "Savings", AccountType.Imported)], pausedOn("tn", [{ name: "Savings", address: SAVINGS }]))
		expect((await readImportedAccounts(r, "p1")).accounts).toEqual([
			{ name: "Savings", address: SAVINGS, chainId: TESTNET },
			{ name: "Savings", address: SAVINGS, chainId: LOCAL },
		])
	})

	test("a running reset's journal is not read, and the reset still counts as pending", async () => {
		const r = reads([], { getPendingReset: vi.fn(async () => ({ networkId: "tn", running: true })) })
		expect(await readImportedAccounts(r, "p1")).toEqual({ accounts: [], resetPending: true })
		expect(r.getStaleNetwork).not.toHaveBeenCalled()
	})

	test.each([
		["networks", { getNetworks: vi.fn(async () => Promise.reject(new Error("locked"))) }],
		["accounts", { getAccounts: vi.fn(async () => Promise.reject(new Error("gone"))) }],
		["pending reset", { getPendingReset: vi.fn(async () => Promise.reject(new Error("gone"))) }],
	])("a failed %s read fails the list, never reads as no imports", async (_read, over) => {
		await expect(readImportedAccounts(reads([], over), "p1")).rejects.toThrow()
	})
})
