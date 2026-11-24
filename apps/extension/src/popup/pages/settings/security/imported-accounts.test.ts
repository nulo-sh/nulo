import { describe, expect, test, vi } from "vitest"
import { type Account, AccountType } from "@/wallet/services/account/client"
import type { StaleNetworkView } from "@/wallet/services/network-reset/client"
import { type ImportedAccountReads, readImportedAccounts, ResetRunningError } from "./imported-accounts"

const TESTNET = 11155111
const LOCAL = 31337
/** A chain the profile holds an account on but has no network row for, as a restore leaves one. */
const UNCONFIGURED = 677692
const SAVINGS = `0x${"04c0".repeat(16)}`
const COLD = `0x${"1d7a".repeat(16)}`
const DERIVED = `0x${"2e18".repeat(16)}`

const row = (chainId: number, address: string, name: string, type: AccountType, visible = true): Account =>
	({ profileId: "p1", chainId, address, name, type, index: 0, l1ChainId: 1, visible }) as Account

/** The account service's answer: the profile's imported rows on every chain, by chain. */
function reads(rows: Account[], over: Partial<ImportedAccountReads> = {}) {
	return {
		getNetworks: vi.fn(async () => [
			{ id: "tn", chainId: TESTNET },
			{ id: "ln", chainId: LOCAL },
		]),
		getImportedAccounts: vi.fn(async (_p: string) =>
			rows.filter((a) => a.type === AccountType.Imported).sort((a, b) => a.chainId - b.chainId),
		),
		getPendingReset: vi.fn(async () => null),
		getStaleNetwork: vi.fn(async () => null),
		...over,
	} satisfies ImportedAccountReads
}

const pausedOn = (networkId: string, heldImported: Array<{ name: string; address: string }>, purged = true) => ({
	getPendingReset: vi.fn(async () => ({ networkId, running: false })),
	getStaleNetwork: vi.fn(
		async (): Promise<Pick<StaleNetworkView, "reset">> => ({
			reset: { running: false, purged, doneCount: 0, imported: [], heldImported },
		}),
	),
})

describe("the imported accounts Delete Profile names", () => {
	test("each chain's imported accounts in network order, a hidden one included", async () => {
		const r = reads([
			row(TESTNET, DERIVED, "Account 1", AccountType.Nulo_v1),
			row(LOCAL, COLD, "Cold", AccountType.Imported),
			row(TESTNET, SAVINGS, "Savings", AccountType.Imported, false),
		])
		expect(await readImportedAccounts(r, "p1")).toEqual({
			accounts: [
				{ name: "Savings", address: SAVINGS, chainId: TESTNET, networked: true },
				{ name: "Cold", address: COLD, chainId: LOCAL, networked: true },
			],
			resetPending: false,
		})
		expect(r.getImportedAccounts).toHaveBeenCalledWith("p1")
		expect(r.getStaleNetwork).not.toHaveBeenCalled()
	})

	test("an imported account on a chain with no network row is named, after the networks' own", async () => {
		const r = reads([row(UNCONFIGURED, COLD, "Cold", AccountType.Imported), row(LOCAL, SAVINGS, "Savings", AccountType.Imported)])
		expect((await readImportedAccounts(r, "p1")).accounts).toEqual([
			{ name: "Savings", address: SAVINGS, chainId: LOCAL, networked: true },
			{ name: "Cold", address: COLD, chainId: UNCONFIGURED, networked: false },
		])
	})

	test("a paused reset's held import is named under its network, once even when recreated", async () => {
		const held = reads([], pausedOn("tn", [{ name: "Savings", address: SAVINGS }]))
		expect((await readImportedAccounts(held, "p1")).accounts).toEqual([
			{ name: "Savings", address: SAVINGS, chainId: TESTNET, networked: true },
		])

		const recreated = reads(
			[row(TESTNET, SAVINGS, "Savings", AccountType.Imported)],
			pausedOn("tn", [{ name: "Savings", address: SAVINGS }]),
		)
		expect(await readImportedAccounts(recreated, "p1")).toEqual({
			accounts: [{ name: "Savings", address: SAVINGS, chainId: TESTNET, networked: true }],
			resetPending: true,
		})
	})

	test("a reset paused before its purge names the live row at its address, not the journal's moved one", async () => {
		const moved = `0x${"3f9b".repeat(16)}`
		const r = reads(
			[row(TESTNET, SAVINGS, "Savings", AccountType.Imported)],
			pausedOn("tn", [{ name: "Savings", address: moved }], false),
		)
		expect((await readImportedAccounts(r, "p1")).accounts).toEqual([
			{ name: "Savings", address: SAVINGS, chainId: TESTNET, networked: true },
		])
	})

	test("one address imported on two chains is named twice", async () => {
		const r = reads([row(LOCAL, SAVINGS, "Savings", AccountType.Imported)], pausedOn("tn", [{ name: "Savings", address: SAVINGS }]))
		expect((await readImportedAccounts(r, "p1")).accounts).toEqual([
			{ name: "Savings", address: SAVINGS, chainId: TESTNET, networked: true },
			{ name: "Savings", address: SAVINGS, chainId: LOCAL, networked: true },
		])
	})

	test("a running reset fails the list with its own error, and its journal is not read", async () => {
		const r = reads([], { getPendingReset: vi.fn(async () => ({ networkId: "tn", running: true })) })
		await expect(readImportedAccounts(r, "p1")).rejects.toBeInstanceOf(ResetRunningError)
		expect(r.getStaleNetwork).not.toHaveBeenCalled()
	})

	test("the pending reset is read once the accounts have answered, so a reset begun later purged nothing they missed", async () => {
		let answer: (rows: Account[]) => void = () => {}
		const r = reads([], { getImportedAccounts: vi.fn(() => new Promise<Account[]>((resolve) => (answer = resolve))) })
		const read = readImportedAccounts(r, "p1")
		await Promise.resolve()
		expect(r.getPendingReset).not.toHaveBeenCalled()
		answer([])
		expect(await read).toEqual({ accounts: [], resetPending: false })
		expect(r.getPendingReset).toHaveBeenCalledOnce()
	})

	test.each([
		["networks", { getNetworks: vi.fn(async () => Promise.reject(new Error("locked"))) }],
		["accounts", { getImportedAccounts: vi.fn(async () => Promise.reject(new Error("gone"))) }],
		["pending reset", { getPendingReset: vi.fn(async () => Promise.reject(new Error("gone"))) }],
	])("a failed %s read fails the list, never reads as no imports", async (_read, over) => {
		await expect(readImportedAccounts(reads([], over), "p1")).rejects.toThrow()
	})
})
