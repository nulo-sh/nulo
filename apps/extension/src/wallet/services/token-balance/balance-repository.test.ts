import { describe, test, expect, beforeEach } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { BalanceRepository } from "./balance-repository"
import type { TokenBalanceRaw } from "./spec"
import { rowKeysForEveryProfile } from "@/wallet/storage/sealed-entity-storage.testing"
import { sealedEntityStorage } from "@/wallet/storage/stores"

/** One key for every profile, as the profile fakes hold it. */
const { rowKeys: ROW_KEYS } = await rowKeysForEveryProfile()

/** The repo uses EntityStorage<TokenBalanceRaw> backed by the injected
 *  `browserApi.storage.local`; tests pass an in-memory `FakeBrowserApi`. */

const balance = (id: number, overrides: Partial<TokenBalanceRaw> = {}): TokenBalanceRaw => ({
	id,
	token: 1,
	account: "0xaccount",
	profileId: "p1",
	chainId: 1,
	contract: "0xc1",
	privateBalance: "0",
	publicBalance: "0",
	updatedAt: 0,
	...overrides,
})

describe("BalanceRepository", () => {
	let api: FakeBrowserApi
	let repo: BalanceRepository

	beforeEach(() => {
		api = new FakeBrowserApi()
		api.reset()
		repo = new BalanceRepository(api, ROW_KEYS)
	})

	test("set then get round-trips a balance", async () => {
		await repo.set(balance(1, { privateBalance: "100", publicBalance: "50" }))
		const got = await repo.get(1)
		expect(got).toEqual(balance(1, { privateBalance: "100", publicBalance: "50" }))
	})

	test("get returns undefined for an unknown id", async () => {
		expect(await repo.get(42)).toBeUndefined()
	})

	test("getAll returns every stored balance", async () => {
		await repo.set(balance(1))
		await repo.set(balance(2, { token: 2 }))
		const all = await repo.getAll()
		expect(all).toHaveLength(2)
		expect(all.map((b) => b.id).sort()).toEqual([1, 2])
	})

	test("delete removes a balance", async () => {
		await repo.set(balance(1))
		await repo.delete(1)
		expect(await repo.get(1)).toBeUndefined()
	})

	test("allocateId returns max+1", async () => {
		expect(await repo.allocateId()).toBe(1) // empty map → 0 + 1
		await repo.set(balance(1))
		await repo.set(balance(7))
		await repo.set(balance(3))
		expect(await repo.allocateId()).toBe(8)
	})

	test("a row is stored sealed: no balance, account or contract in its stored value", async () => {
		await repo.set(balance(1, { account: "0xfeedface", contract: "0xc0ffee", privateBalance: "987654321" }))
		const raw = (await api.storage.local.get("nulo:core:token-balances@1"))["nulo:core:token-balances@1"] as string
		expect(Object.keys(JSON.parse(raw))).toEqual(["profileId", "sealed"])
		for (const marker of ["feedface", "c0ffee", "987654321"]) expect(raw).not.toContain(marker)
	})

	test("numeric key identity is checked inside the seal: a sealed row embedding another id is hidden and kept", async () => {
		const store = sealedEntityStorage("tokenBalances", api.storage.local, ROW_KEYS)
		await store.set("1", balance(2))
		expect(await repo.get(1)).toBeUndefined()
		expect(await repo.getAll()).toEqual([])
		expect(await api.storage.local.get("nulo:core:token-balances@1")).toHaveProperty(["nulo:core:token-balances@1"])
	})

	test("the raw purge pass never matches a sealed row, whatever its predicate", async () => {
		await repo.set(balance(1))
		await api.storage.local.set({ "nulo:core:token-balances@2": JSON.stringify({ junk: true }) })
		expect(await repo.purgeMalformed(() => true)).toBe(1)
		expect(Object.keys(await api.storage.local.get())).toEqual(["nulo:core:token-balances@1"])
	})

	test("sealLegacy leaves a row whose id the caller fences at commit, and seals the rest", async () => {
		await api.storage.local.set({
			"nulo:core:token-balances@1": JSON.stringify(balance(1)),
			"nulo:core:token-balances@2": JSON.stringify(balance(2)),
		})
		expect(
			await repo.sealLegacy(
				"p1",
				(fn) => fn(() => true),
				(id) => id === 1,
			),
		).toBe(1)
		const stored = await api.storage.local.get()
		expect(stored["nulo:core:token-balances@1"]).toBe(JSON.stringify(balance(1)))
		expect(Object.keys(JSON.parse(stored["nulo:core:token-balances@2"] as string))).toEqual(["profileId", "sealed"])
		expect(await repo.getAll()).toEqual([balance(1), balance(2)])
	})

	test("storage key is nulo:core:token-balances (frozen invariant)", async () => {
		await repo.set(balance(1))
		const all = await api.storage.local.get()
		expect(Object.keys(all).some((k) => k.startsWith("nulo:core:token-balances"))).toBe(true)
	})

	test("allocateIdAvoiding resolves fence + occupancy together — never steps onto an occupied boundary key", async () => {
		// The old caller incremented blindly past fenced ids: with a physical
		// hostile key at MAX_SAFE_INTEGER the allocator gap-fills to MAX_SAFE-1,
		// and fencing THAT id made the blind `id++` land exactly on the occupied
		// boundary key. Feeding the fence in as pseudo-keys lets the allocator
		// resolve all three constraints at once.
		const max = Number.MAX_SAFE_INTEGER
		await api.storage.local.set({
			"nulo:core:token-balances@1": JSON.stringify({ junk: true }),
			[`nulo:core:token-balances@${max}`]: JSON.stringify({ junk: true }),
		})
		const fenced = new Set([max - 1])
		const id = await repo.allocateIdAvoiding(fenced)
		expect(Number.isSafeInteger(id)).toBe(true)
		expect(id).not.toBe(max)
		expect(fenced.has(id)).toBe(false)
		const raw = await api.storage.local.get(null)
		expect(Object.keys(raw)).not.toContain(`nulo:core:token-balances@${id}`)
	})
})
