import { describe, expect, test, vi } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import type { IncomingNoteRecord, IncomingPublicEventRecord } from "./spec"
import { balanceOutboxKey, noteRecordId, publicCursorKey, publicRecordId } from "./spec"
import { arrivalKey } from "./arrival-state"
import { IncomingTransferRepository, trustKey } from "./repository"
import { rowKeysForEveryProfile, TestRowKeys } from "@/wallet/storage/sealed-entity-storage.testing"

/** One key for every profile, as the profile fakes hold it. */
const { rowKeys: ROW_KEYS } = await rowKeysForEveryProfile()

describe("IncomingTransferRepository — trustKey", () => {
	test("composes profile|network|contract", () => {
		expect(trustKey("p1", "net-1", "0xabc")).toBe("p1|net-1|0xabc")
	})
	test("different contracts on the same (profile, network) get distinct keys", () => {
		expect(trustKey("p1", "net-1", "0xa")).not.toBe(trustKey("p1", "net-1", "0xb"))
	})
	test("same contract on different networks gets distinct keys", () => {
		expect(trustKey("p1", "net-1", "0xa")).not.toBe(trustKey("p1", "net-2", "0xa"))
	})
	test("same contract on different profiles gets distinct keys", () => {
		expect(trustKey("p1", "net-1", "0xa")).not.toBe(trustKey("p2", "net-1", "0xa"))
	})
})

const RECORDS_ROOT = "nulo:core:incoming-transfers"

function pubRec(profileId: string, networkId: string, txHash: string): IncomingPublicEventRecord {
	return {
		kind: "public-event",
		id: publicRecordId(profileId, networkId, txHash, 0),
		profileId,
		networkId,
		accountAddress: "0xacct",
		contract: "0xtok",
		tokenId: 1,
		from: "0xfrom",
		amountRaw: "100",
		txHash,
		l2BlockNumber: 5,
		blockHash: "0xbh",
		txIndexInBlock: 0,
		indexInTx: 0,
		hidden: false,
		discoveredAt: 0,
	}
}

describe("IncomingTransferRepository — clearProfile / clearChain fan-out", () => {
	test("clearProfile deletes ONLY the target profile (p1 ≠ p11 prefix), incl. a codec-INVALID row", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		const repo = new IncomingTransferRepository(api, ROW_KEYS)
		await repo.upsertRecord(pubRec("p1", "n1", "0xa"))
		await repo.upsertRecord(pubRec("p11", "n1", "0xb")) // different profile whose id shares the "p1" prefix
		await repo.setTrust("p1", "n1", "0xtok", "trusted")
		await repo.setTrust("p11", "n1", "0xtok", "trusted")
		// A corrupt record row under p1 that FAILS codec validation — `get()` reads it as `undefined`,
		// so a value-predicate sweep would silently skip it; the key-prefix delete must still remove it.
		await api.storage.local.set({ [`${RECORDS_ROOT}@${publicRecordId("p1", "n1", "0xcorrupt", 0)}`]: "{}" })

		await repo.clearProfile("p1")

		const remaining = await repo.listRecords()
		expect(remaining.map((r) => r.profileId)).toEqual(["p11"]) // p1's valid record gone; p11 untouched
		expect((await repo.listTrust()).map((t) => t.profileId)).toEqual(["p11"])
		// The corrupt row is gone from the underlying store (its key no longer present).
		const rawKeys = Object.keys(await api.storage.local.get())
		expect(rawKeys.some((k) => k.includes("0xcorrupt"))).toBe(false)
	})

	test("clearChain deletes only (p1,n1), leaving (p1,n2) intact", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		const repo = new IncomingTransferRepository(api, ROW_KEYS)
		await repo.upsertRecord(pubRec("p1", "n1", "0xa"))
		await repo.upsertRecord(pubRec("p1", "n2", "0xb"))
		await repo.setTrust("p1", "n1", "0xtok", "trusted")
		await repo.setTrust("p1", "n2", "0xtok", "trusted")

		await repo.clearChain("p1", "n1")

		expect((await repo.listRecords()).map((r) => r.networkId)).toEqual(["n2"])
		expect((await repo.listTrust()).map((t) => t.networkId)).toEqual(["n2"])
	})
})

describe("IncomingTransferRepository — arrival floors and rows", () => {
	const freshRepo = () => {
		const api = new FakeBrowserApi()
		api.reset()
		return { api, repo: new IncomingTransferRepository(api, ROW_KEYS) }
	}

	test("a fence that turns false while setTrust reads the stored row writes nothing", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		const repo = new IncomingTransferRepository(api, ROW_KEYS)
		const read = repo.getTrust.bind(repo)
		let owned = true
		vi.spyOn(repo, "getTrust").mockImplementationOnce(async (...args) => {
			const out = await read(...args)
			owned = false
			return out
		})

		expect(await repo.setTrust("p1", "n1", "0xtok", "trusted", () => owned)).toBeUndefined()
		expect(await read("p1", "n1", "0xtok")).toBeUndefined()
	})

	test("an acceptance writes the trust row and every record in one storage call", async () => {
		const { api, repo } = freshRepo()
		const set = vi.spyOn(api.storage.local, "set")
		const accepted = [pubRec("p1", "n1", "0xa"), pubRec("p1", "n1", "0xb")]
		const row = { profileId: "p1", networkId: "n1", contract: "0xtok", state: "trusted" as const, updatedAt: 1, arrivalFloor: 9 }

		const commit = await repo.prepareAcceptance(row, accepted)
		expect(set).not.toHaveBeenCalled()
		await commit()

		expect(set).toHaveBeenCalledTimes(1)
		expect(Object.keys(set.mock.calls[0][0])).toHaveLength(3)
		expect(await repo.getTrust("p1", "n1", "0xtok")).toEqual(row)
		expect(await repo.listRecords()).toEqual(expect.arrayContaining(accepted))
	})

	test("a rejected acceptance commit propagates", async () => {
		const { api, repo } = freshRepo()
		vi.spyOn(api.storage.local, "set").mockRejectedValueOnce(new Error("quota"))
		const row = { profileId: "p1", networkId: "n1", contract: "0xtok", state: "trusted" as const, updatedAt: 1 }

		const commit = await repo.prepareAcceptance(row, [pubRec("p1", "n1", "0xa")])
		await expect(commit()).rejects.toThrow("quota")
	})

	test("a trust state change keeps the stored arrival floor and its pending mark", async () => {
		const { repo } = freshRepo()
		await repo.setArrivalFloor(await repo.setTrust("p1", "n1", "0xtok", "trusted"), { arrivalFloor: 200, pending: true })

		await repo.setTrust("p1", "n1", "0xtok", "unknown")
		expect(await repo.getTrust("p1", "n1", "0xtok")).toMatchObject({ state: "unknown", arrivalFloor: 200, arrivalFloorPending: true })
		await repo.setTrust("p1", "n1", "0xtok", "pending")
		expect(await repo.getTrust("p1", "n1", "0xtok")).toMatchObject({ state: "pending", arrivalFloor: 200, arrivalFloorPending: true })

		const stored = await repo.getTrust("p1", "n1", "0xtok")
		if (!stored) throw new Error("trust row missing")
		await repo.setArrivalFloor(stored, { arrivalFloor: 250, pending: false })
		const cleared = await repo.getTrust("p1", "n1", "0xtok")
		expect(cleared).toMatchObject({ state: "pending", arrivalFloor: 250 })
		expect(cleared?.arrivalFloorPending).toBeUndefined()
	})

	test("an arrival row that fails to parse reads as missing", async () => {
		const { api, repo } = freshRepo()
		await api.storage.local.set({ "nulo:core:incoming-arrivals@p1|n1|0xacct": JSON.stringify({ sinceBlock: -1, played: [] }) })
		expect(await repo.getArrivalRow("p1", "n1", "0xacct")).toBeUndefined()
	})

	test("clearChain and clearProfile delete only their scope's arrival rows", async () => {
		const { repo } = freshRepo()
		const row = { sinceBlock: 1, played: [] }
		await repo.setArrivalRow("p1", "n1", "0xa", row)
		await repo.setArrivalRow("p1", "n2", "0xa", row)
		await repo.setArrivalRow("p11", "n1", "0xa", row)

		await repo.clearChain("p1", "n1")
		expect(await repo.getArrivalRow("p1", "n1", "0xa")).toBeUndefined()
		expect(await repo.getArrivalRow("p1", "n2", "0xa")).toEqual(row)

		await repo.clearProfile("p1")
		expect(await repo.getArrivalRow("p1", "n2", "0xa")).toBeUndefined()
		expect(await repo.getArrivalRow("p11", "n1", "0xa")).toEqual(row)
	})
})

describe("IncomingTransferRepository — the five-table scope inventory", () => {
	const ROOTS = [
		"nulo:core:incoming-transfers",
		"nulo:core:incoming-trust",
		"nulo:core:incoming-public-cursors",
		"nulo:core:incoming-balance-outbox",
		"nulo:core:incoming-arrivals",
	]
	const RECORD_IDS = ["note:p1|n1|0x1", "pub:p1|n1|0x2|0", "note:p1|n11|0x3", "pub:p11|n1|0x4|0", "other:p1|n1|0x5", "note:p1|n2|0x6"]
	const SCOPED_IDS = ["p1|n1|x", "p1|n11|x", "p11|n1|x", "p1|n2|x"]

	/** Every row is codec-invalid (`"{}"`), so only key-prefix deletion can remove it. */
	async function seededRepo() {
		const api = new FakeBrowserApi()
		api.reset()
		const rows: Record<string, string> = {}
		for (const id of RECORD_IDS) rows[`${ROOTS[0]}@${id}`] = "{}"
		for (const root of ROOTS.slice(1)) for (const id of SCOPED_IDS) rows[`${root}@${id}`] = "{}"
		await api.storage.local.set(rows)
		const area = api.storage.local
		const realRemove = area.remove.bind(area)
		const removed: string[] = []
		area.remove = (keys: string | string[]) => {
			removed.push(...(Array.isArray(keys) ? keys : [keys]))
			return realRemove(keys)
		}
		return { api, repo: new IncomingTransferRepository(api, ROW_KEYS), removed }
	}

	const rowsOf = (scoped: string[], records: string[]) => [
		...records.map((id) => `${ROOTS[0]}@${id}`),
		...ROOTS.slice(1).flatMap((root) => scoped.map((id) => `${root}@${id}`)),
	]

	test("clearChain removes (p1, n1) from every table in table order and keeps every neighbour", async () => {
		const { api, repo, removed } = await seededRepo()
		await repo.clearChain("p1", "n1")
		expect(removed).toEqual(rowsOf(["p1|n1|x"], ["note:p1|n1|0x1", "pub:p1|n1|0x2|0"]))
		expect(Object.keys(await api.storage.local.get()).sort()).toEqual(
			rowsOf(
				["p1|n11|x", "p11|n1|x", "p1|n2|x"],
				["note:p1|n11|0x3", "pub:p11|n1|0x4|0", "other:p1|n1|0x5", "note:p1|n2|0x6"],
			).sort(),
		)
	})

	test("clearProfile removes p1 from every table in table order and keeps p11 and unknown kinds", async () => {
		const { api, repo, removed } = await seededRepo()
		await repo.clearProfile("p1")
		expect(removed).toEqual(
			rowsOf(["p1|n1|x", "p1|n11|x", "p1|n2|x"], ["note:p1|n1|0x1", "pub:p1|n1|0x2|0", "note:p1|n11|0x3", "note:p1|n2|0x6"]),
		)
		expect(Object.keys(await api.storage.local.get()).sort()).toEqual(
			rowsOf(["p11|n1|x"], ["pub:p11|n1|0x4|0", "other:p1|n1|0x5"]).sort(),
		)
	})
})

describe("IncomingTransferRepository — sealed at rest", () => {
	const ACCOUNT = `0x${"a7".repeat(32)}`
	const CONTRACT = `0x${"c9".repeat(32)}`
	const NOTE_HASH = `0x${"4e".repeat(32)}`
	const UNIQUE_NOTE_HASH = `0x${"5d".repeat(32)}`
	const TX_HASH = `0x${"7b".repeat(32)}`
	const SENDER = `0x${"3f".repeat(32)}`

	/** One row in each table for `(profileId, networkId)`, as the service writes them. */
	function scopeRows(profileId: string, networkId: string) {
		const note: IncomingNoteRecord = {
			kind: "note",
			id: noteRecordId(profileId, networkId, UNIQUE_NOTE_HASH),
			profileId,
			networkId,
			accountAddress: ACCOUNT,
			contract: CONTRACT,
			tokenId: 4,
			owner: ACCOUNT,
			amountRaw: "100",
			noteHash: NOTE_HASH,
			txHash: TX_HASH,
			l2BlockNumber: 5,
			txIndexInBlock: 0,
			indexInTx: 0,
			hidden: false,
			discoveredAt: 0,
		}
		const pub: IncomingPublicEventRecord = {
			...pubRec(profileId, networkId, TX_HASH),
			accountAddress: ACCOUNT,
			contract: CONTRACT,
			from: SENDER,
			tokenId: 4,
		}
		return {
			records: [note, pub],
			trust: { profileId, networkId, contract: CONTRACT, state: "trusted" as const, updatedAt: 1 },
			cursor: { cursor: null, lastSyncedBlockHash: null, lastScanFinalized: 1, startBlock: 0 },
			outbox: { dirtyAt: 1 },
			arrival: { sinceBlock: 3, played: [[note.id, 5]] as [string, number][] },
		}
	}

	async function writeScope(repo: IncomingTransferRepository, profileId: string, networkId: string) {
		const rows = scopeRows(profileId, networkId)
		for (const record of rows.records) await repo.upsertRecord(record)
		await repo.setArrivalFloor(rows.trust, { arrivalFloor: undefined, pending: false })
		await repo.setCursor(profileId, networkId, CONTRACT, rows.cursor)
		await repo.setOutbox(profileId, networkId, ACCOUNT, 4, rows.outbox)
		await repo.setArrivalRow(profileId, networkId, ACCOUNT, rows.arrival)
	}

	const scopeOf = (storageKey: string) =>
		storageKey
			.slice(storageKey.indexOf("@") + 1)
			.replace(/^(note|pub):/, "")
			.split("|")
			.slice(0, 2)
			.join("|")

	test("clearChain and clearProfile remove sealed rows by prefix with no row key held", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		const keys = await new TestRowKeys().unlock("p1", "p11")
		const repo = new IncomingTransferRepository(api, keys.source)
		for (const [profileId, networkId] of [
			["p1", "n1"],
			["p1", "n2"],
			["p11", "n1"],
		])
			await writeScope(repo, profileId, networkId)
		keys.drop("p1")
		keys.drop("p11")
		const scopes = async () =>
			Object.keys(await api.storage.local.get())
				.map(scopeOf)
				.sort()

		await repo.clearChain("p1", "n1")
		expect(await scopes()).toEqual([...Array(6).fill("p1|n2"), ...Array(6).fill("p11|n1")].sort())

		await repo.clearProfile("p1")
		expect(await scopes()).toEqual(Array(6).fill("p11|n1"))
	})

	test("after conversion no note hash, tx hash, account or contract appears in any key or value, and every row reads back", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		const rows = scopeRows("p1", "n1")
		const legacy: Record<string, unknown> = {
			[`nulo:core:incoming-trust@${trustKey("p1", "n1", CONTRACT)}`]: rows.trust,
			[`nulo:core:incoming-public-cursors@${publicCursorKey("p1", "n1", CONTRACT)}`]: rows.cursor,
			[`nulo:core:incoming-balance-outbox@${balanceOutboxKey("p1", "n1", ACCOUNT, 4)}`]: rows.outbox,
			[`nulo:core:incoming-arrivals@${arrivalKey("p1", "n1", ACCOUNT)}`]: rows.arrival,
			...Object.fromEntries(rows.records.map((r) => [`nulo:core:incoming-transfers@${r.id}`, r])),
		}
		await api.storage.local.set(Object.fromEntries(Object.entries(legacy).map(([k, v]) => [k, JSON.stringify(v)])))
		const repo = new IncomingTransferRepository(api, (await new TestRowKeys().unlock("p1")).source)
		const dump = async () => JSON.stringify(await api.storage.local.get()).toLowerCase()
		expect(await dump()).toContain(NOTE_HASH.slice(2))

		await repo.sealLegacy(
			"p1",
			(fn) => fn(),
			() => true,
		)

		const atRest = await dump()
		for (const named of [NOTE_HASH, UNIQUE_NOTE_HASH, TX_HASH, ACCOUNT, CONTRACT, SENDER]) expect(atRest).not.toContain(named.slice(2))
		expect(Object.keys(await api.storage.local.get())).toHaveLength(6)
		expect(await repo.listRecords()).toEqual(expect.arrayContaining(rows.records))
		expect(await repo.getTrust("p1", "n1", CONTRACT)).toEqual(rows.trust)
		expect(await repo.getCursor("p1", "n1", CONTRACT)).toEqual(rows.cursor)
		expect(await repo.listOutbox()).toEqual([[balanceOutboxKey("p1", "n1", ACCOUNT, 4), rows.outbox]])
		expect(await repo.getArrivalRow("p1", "n1", ACCOUNT)).toEqual(rows.arrival)
	})

	test("a write whose fence fails after its seal stores nothing", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		const repo = new IncomingTransferRepository(api, ROW_KEYS)
		const [note] = scopeRows("p1", "n1").records

		expect(await repo.upsertRecord(note, () => false)).toBe(false)
		expect(await repo.setArrivalRow("p1", "n1", ACCOUNT, { sinceBlock: 1, played: [] }, () => false)).toBe(false)
		expect(await api.storage.local.get()).toEqual({})
	})

	test("a delete whose fence fails while its keys are resolved removes nothing", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		const repo = new IncomingTransferRepository(api, ROW_KEYS)
		await writeScope(repo, "p1", "n1")
		const stored = await api.storage.local.get()
		let current = true
		const deletions = [
			repo.deleteOutbox("p1", "n1", ACCOUNT, 4, () => current),
			repo.deleteRecord(scopeRows("p1", "n1").records[0].id, () => current),
		]
		// A watchdog handoff flips the ticket while the keyed ids are hashed.
		current = false

		expect(await Promise.all(deletions)).toEqual([false, false])
		expect(await api.storage.local.get()).toEqual(stored)
	})

	test("a record or trust row whose body names another scope than its key is no profile's", async () => {
		const api = new FakeBrowserApi()
		api.reset()
		const rows = scopeRows("p2", "n1")
		const noteId = noteRecordId("p1", "n1", UNIQUE_NOTE_HASH)
		const planted = {
			[`nulo:core:incoming-trust@${trustKey("p1", "n1", CONTRACT)}`]: JSON.stringify(rows.trust),
			[`${RECORDS_ROOT}@${noteId}`]: JSON.stringify({ ...rows.records[0], id: noteId }),
		}
		await api.storage.local.set(planted)
		const repo = new IncomingTransferRepository(api, (await new TestRowKeys().unlock("p1", "p2")).source)

		await repo.sealLegacy(
			"p1",
			(fn) => fn(),
			() => true,
		)

		expect(await api.storage.local.get()).toEqual(planted)
		expect(await repo.getTrust("p1", "n1", CONTRACT)).toBeUndefined()
		expect(await repo.getRecord(noteId)).toBeUndefined()
		expect(await repo.listTrust()).toEqual([])
		expect(await repo.listRecords()).toEqual([])
	})
})
