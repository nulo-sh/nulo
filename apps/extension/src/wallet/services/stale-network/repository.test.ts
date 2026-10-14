import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { quarantinedBy, StaleNetworkRepository } from "./repository"
import {
	NETWORK_RESET_DONE_ROOT,
	NETWORK_RESET_ROOT,
	type ResetJournal,
	STALE_NETWORKS_ROOT,
	type StaleEntry,
	type StaleNetworksRecord,
} from "./types"

const entry = (chainId: number, networkId = `n${chainId}`): StaleEntry => ({
	networkId,
	chainId,
	networkReset: true,
	addressesMoved: false,
})
const record = (entries: StaleEntry[], accountSetDigest = "d1"): StaleNetworksRecord => ({ profileId: "p1", accountSetDigest, entries })
const journal = (over: Partial<ResetJournal> = {}): ResetJournal => ({
	profileId: "p1",
	networkId: "n10",
	fromChainId: 10,
	toChainId: 20,
	l1ChainId: 11155111,
	cause: { networkReset: true, addressesMoved: false },
	purged: false,
	switchToSeedNode: false,
	probedEndpoint: null,
	accounts: [{ type: 0, index: 0, name: "Account 1", visible: true, oldAddress: "0xa", done: false }],
	...over,
})

describe("StaleNetworkRepository", () => {
	let api: FakeBrowserApi
	let repo: StaleNetworkRepository

	beforeEach(() => {
		api = new FakeBrowserApi()
		api.reset()
		repo = new StaleNetworkRepository(api.storage.local)
	})

	test("an undecodable record, journal or notice reads as absent", async () => {
		await api.storage.local.set({
			[`${STALE_NETWORKS_ROOT}@p1`]: "{broken",
			[`${NETWORK_RESET_ROOT}@p1`]: JSON.stringify({ profileId: "p1" }),
			[`${NETWORK_RESET_DONE_ROOT}@p1`]: 7,
		})
		expect(await repo.readQuarantineState("p1")).toEqual({ record: undefined, journal: undefined })
		expect(await repo.getRecord("p1")).toBeUndefined()
		expect(await repo.getJournal("p1")).toBeUndefined()
		expect(await repo.takeNotice("p1")).toBeNull()
		expect((await api.storage.local.get(`${NETWORK_RESET_DONE_ROOT}@p1`))[`${NETWORK_RESET_DONE_ROOT}@p1`]).toBeUndefined()
	})

	test("the quarantine state is one storage read", async () => {
		const get = vi.spyOn(api.storage.local, "get")
		await repo.readQuarantineState("p1")
		expect(get).toHaveBeenCalledTimes(1)
	})

	test("compare-and-set writes while the digest holds and writes nothing when it changed", async () => {
		expect(await repo.compareAndSetRecord(record([entry(10)]), async () => "d1")).toBe(true)
		expect(await repo.getRecord("p1")).toEqual(record([entry(10)]))
		const set = vi.spyOn(api.storage.local, "set")
		const remove = vi.spyOn(api.storage.local, "remove")
		expect(await repo.compareAndSetRecord(record([entry(30)], "d2"), async () => "d3")).toBe(false)
		expect(set).not.toHaveBeenCalled()
		expect(remove).not.toHaveBeenCalled()
		expect(await repo.getRecord("p1")).toEqual(record([entry(10)]))
	})

	test("a full classification replaces the record; an empty one removes the key", async () => {
		await repo.compareAndSetRecord(record([entry(10), entry(11)]), async () => "d1")
		await repo.compareAndSetRecord(record([entry(12)], "d2"), async () => "d2")
		expect((await repo.getRecord("p1"))?.entries).toEqual([entry(12)])
		await repo.compareAndSetRecord(record([], "d3"), async () => "d3")
		expect(await api.storage.local.get(`${STALE_NETWORKS_ROOT}@p1`)).toEqual({})
	})

	test("a runtime merge replaces its chain's entry and keeps the other chains'", async () => {
		await repo.compareAndSetRecord(record([entry(10), entry(11)]), async () => "d1")
		const moved: StaleEntry = { networkId: "n11", chainId: 11, networkReset: false, addressesMoved: true }
		await repo.mergeEntry("p1", moved, "ignored", async () => "ignored")
		expect(await repo.getRecord("p1")).toEqual(record([entry(10), moved]))
		await repo.mergeEntry("p2", entry(5), "d9", async () => "d9")
		expect(await repo.getRecord("p2")).toEqual({ profileId: "p2", accountSetDigest: "d9", entries: [entry(5)] })
	})

	test("a runtime merge writes nothing once the account set left the classified digest", async () => {
		await repo.compareAndSetRecord(record([entry(10)]), async () => "d1")
		await expect(repo.mergeEntry("p1", entry(11), "d1", async () => "d2")).resolves.toBe(false)
		expect((await repo.getRecord("p1"))?.entries).toEqual([entry(10)])
	})

	test("the lock serializes a merge behind a compare-and-set holding it", async () => {
		let release!: () => void
		const gate = new Promise<void>((r) => {
			release = r
		})
		const cas = repo.compareAndSetRecord(record([entry(10)]), async () => {
			await gate
			return "d1"
		})
		const merge = repo.mergeEntry("p1", entry(11), "d1", async () => "d1")
		await new Promise((r) => setTimeout(r, 0))
		expect(await repo.getRecord("p1")).toBeUndefined()
		release()
		await Promise.all([cas, merge])
		expect((await repo.getRecord("p1"))?.entries).toEqual([entry(10), entry(11)])
	})

	test("the predicate covers record entries and both ends of a journal", () => {
		const state = { record: record([entry(5)]), journal: journal() }
		expect(quarantinedBy(state, 5)).toBe(true)
		expect(quarantinedBy(state, 10)).toBe(true)
		expect(quarantinedBy(state, 20)).toBe(true)
		expect(quarantinedBy(state, 0)).toBe(false)
		expect(quarantinedBy({ record: undefined, journal: undefined }, 5)).toBe(false)
	})

	test("removeEntryLocked drops one network's entry", async () => {
		await repo.compareAndSetRecord(record([entry(10), entry(11)]), async () => "d1")
		await repo.withLock("p1", () => repo.removeEntryLocked("p1", "n10"))
		expect((await repo.getRecord("p1"))?.entries).toEqual([entry(11)])
	})

	test("takeNotice returns the notice once, and nothing while that network's journal exists", async () => {
		await repo.withLock("p1", async () => {
			await repo.setJournalLocked(journal())
			await repo.setNoticeLocked("p1", { networkId: "n10", addressesMoved: true })
		})
		expect(await repo.takeNotice("p1")).toBeNull()
		expect(await repo.takeNotice("p1")).toBeNull()
		await repo.withLock("p1", () => repo.deleteJournalLocked("p1"))
		const [first, second] = await Promise.all([repo.takeNotice("p1"), repo.takeNotice("p1")])
		expect([first, second]).toEqual([{ networkId: "n10", addressesMoved: true }, null])
	})

	test("another network's journal does not hold a notice back", async () => {
		await repo.withLock("p1", async () => {
			await repo.setJournalLocked(journal({ networkId: "other" }))
			await repo.setNoticeLocked("p1", { networkId: "n10", addressesMoved: false })
		})
		expect(await repo.takeNotice("p1")).toEqual({ networkId: "n10", addressesMoved: false })
	})

	test("clearProfile removes all three keys and only that profile's", async () => {
		await repo.compareAndSetRecord(record([entry(10)]), async () => "d1")
		await repo.mergeEntry("p2", entry(5), "d9", async () => "d9")
		await repo.withLock("p1", async () => {
			await repo.setJournalLocked(journal())
			await repo.setNoticeLocked("p1", { networkId: "n10", addressesMoved: false })
		})
		await repo.clearProfile("p1")
		expect(await repo.readQuarantineState("p1")).toEqual({ record: undefined, journal: undefined })
		expect(await repo.takeNotice("p1")).toBeNull()
		expect(await repo.getRecord("p2")).toBeDefined()
	})
})
