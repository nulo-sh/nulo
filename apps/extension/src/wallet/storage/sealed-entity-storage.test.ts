import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { EntityStorage, type MinimalStorageArea } from "@nulo/wallet-core/storage"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { asMasterSecretBytes, deriveRowKeys, sealRow } from "@nulo/wallet-crypto"
import { type Contact, ContactSchema } from "@/wallet/services/contact/spec"
import { WalletLockedError } from "@/wallet/services/profile/wallet-locked-error"
import { TRANSACTION_STORAGE_ROOT, TxStatus, type Tx } from "@/wallet/services/transaction/service"
import { type KeyedIds, type RowKeysSource, SealedEntityStorage } from "./sealed-entity-storage"
import { TestRowKeys, readsKey } from "./sealed-entity-storage.testing"
import { sealedEntityStorage } from "./stores"

const ROOT = "nulo:core:contacts"
const MARKER = "MARKER-7f3c"

const contact = (id: string, profileId: string, name = `${MARKER} ${id}`): Contact => ({
	id,
	profileId,
	name,
	address: `0x${"ab".repeat(32)}`,
	abbr: "MK",
})

/** Every stored value under the root, as an at-rest reader sees it. */
async function raw(area: MinimalStorageArea): Promise<Record<string, unknown>> {
	return Object.fromEntries(Object.entries(await area.get()).filter(([key]) => key.startsWith(`${ROOT}@`)))
}

const legacy = (area: MinimalStorageArea, row: Contact, id = row.id) => area.set({ [`${ROOT}@${id}`]: JSON.stringify(row) })

/** Natural ids `scope:secret`, stored as `scope:<keyed hash of secret>`. */
const KEYED: KeyedIds = {
	async physicalId(naturalId, hash) {
		const [scope, secret] = naturalId.split(":")
		return `${scope}:${await hash(secret ?? "")}`
	},
}

let area: MinimalStorageArea
let keys: TestRowKeys
let warn: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
	const api = new FakeBrowserApi()
	api.reset()
	area = api.storage.local
	keys = await new TestRowKeys().unlock("p", "q")
	warn = vi.spyOn(console, "warn").mockImplementation(() => {})
	vi.spyOn(console, "error").mockImplementation(() => {})
	vi.spyOn(console, "debug").mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

const store = (source: RowKeysSource = keys.source) => sealedEntityStorage("contacts", area, source)
const keyedStore = () =>
	new SealedEntityStorage(new EntityStorage<Contact>(ROOT, area, (row) => ContactSchema.parse(row)), area, ROOT, keys.source, {
		keyed: KEYED,
	})

/** Asserts a refusal logged its category and nothing of the row, its id or its ciphertext. */
function expectRefusal(category: string, ...secrets: string[]) {
	const logged = warn.mock.calls.map((call: unknown[]) => call.join(" ")).join("\n")
	expect(logged).toContain(category)
	for (const secret of [MARKER, ...secrets]) expect(logged).not.toContain(secret)
}

describe("SealedEntityStorage", () => {
	test("a written row round-trips and no stored byte carries its fields", async () => {
		const row = contact("c-1", "p")
		await store().set(row.id, row)

		expect(await store().get(row.id)).toEqual(row)
		const stored = JSON.stringify(await raw(area))
		for (const field of [row.name, row.address]) expect(stored).not.toContain(field)
		expect(Object.keys(JSON.parse((await raw(area))[`${ROOT}@c-1`] as string))).toEqual(["profileId", "sealed"])
	})

	test("a row read without its profile's keys is absent, and kept", async () => {
		await store().set("c-1", contact("c-1", "p"))
		keys.drop("p")

		expect(await store().get("c-1")).toBeUndefined()
		expect(await store().getValues()).toEqual([])
		expect(Object.keys(await raw(area))).toEqual([`${ROOT}@c-1`])
	})

	test("a sealed row moved to another key, profile, root or incarnation never opens, and is kept", async () => {
		await store().set("c-1", contact("c-1", "p"))
		const envelope = (await raw(area))[`${ROOT}@c-1`] as string
		const sealed = JSON.parse(envelope).sealed as string

		await area.set({ [`${ROOT}@c-2`]: envelope })
		await area.set({ [`${ROOT}@c-3`]: JSON.stringify({ profileId: "q", sealed }) })
		await area.set({ "nulo:core:dappSessions@c-1": envelope })
		expect(await store().get("c-2")).toBeUndefined()
		expect(await store().get("c-3")).toBeUndefined()
		const otherRoot = new SealedEntityStorage(
			new EntityStorage<Contact>("nulo:core:dappSessions", area, (row) => ContactSchema.parse(row)),
			area,
			"nulo:core:dappSessions",
			keys.source,
		)
		expect(await otherRoot.get("c-1")).toBeUndefined()

		const reborn = await deriveRowKeys(
			asMasterSecretBytes(new Uint8Array(32).fill(0x2a) as Uint8Array<ArrayBuffer>),
			"p",
			"next-generation",
		)
		expect(await store((id) => (id === "p" ? reborn : undefined)).get("c-1")).toBeUndefined()

		expectRefusal("sealed-authentication", "c-1", sealed)
		expect(Object.keys(await raw(area)).sort()).toEqual([`${ROOT}@c-1`, `${ROOT}@c-2`, `${ROOT}@c-3`])
		expect(await store().get("c-1")).toEqual(contact("c-1", "p"))
	})

	test("an envelope whose sealed row names another profile is refused as identity", async () => {
		const pKeys = keys.source("p")
		if (!pKeys) throw new Error("p is unlocked")
		const storageKey = `${ROOT}@c-1`
		const sealed = await sealRow(pKeys, JSON.stringify(contact("c-1", "q")), { root: ROOT, storageKey, profileId: "p" })
		await area.set({ [storageKey]: JSON.stringify({ profileId: "p", sealed }) })

		expect(await store().get("c-1")).toBeUndefined()
		expectRefusal("sealed-identity", sealed)
	})

	test("a plaintext row still reads (the dual read)", async () => {
		await legacy(area, contact("c-1", "p"))
		expect(await store().get("c-1")).toEqual(contact("c-1", "p"))
		expect(await store().getValues()).toEqual([contact("c-1", "p")])
	})

	test("nothing writes a row for a profile with no keys", async () => {
		keys.drop("p")
		await expect(store().set("c-1", contact("c-1", "p"))).rejects.toBeInstanceOf(WalletLockedError)
		expect(await raw(area)).toEqual({})
	})

	test("a prepared write lands only at commit, which dispatches before yielding", async () => {
		const set = vi.spyOn(area, "set")
		const write = await store().prepare("c-1", contact("c-1", "p"))
		expect(set).not.toHaveBeenCalled()

		const committed = write.commit()
		expect(set).toHaveBeenCalledWith(write.items)
		await committed
		expect(await store().get("c-1")).toEqual(contact("c-1", "p"))
	})

	test("a prepared write whose profile's keys went before its commit lands nothing", async () => {
		const write = await store().prepare("c-1", contact("c-1", "p"))
		keys.drop("p")

		await expect(write.commit()).rejects.toBeInstanceOf(WalletLockedError)
		expect(await raw(area)).toEqual({})
	})

	test("a stored value that is not a string is never served, as no delete path could remove it", async () => {
		await area.set({ [`${ROOT}@c-1`]: [JSON.stringify(contact("c-1", "p"))] })

		expect(await store().get("c-1")).toBeUndefined()
		expect(await store().getValues()).toEqual([])
		expectRefusal("not-a-string", "c-1")
	})

	describe("sealLegacy", () => {
		const unlocked = <R>(fn: (isCurrent: () => boolean) => Promise<R>) => fn(() => true)

		test("seals one profile's plaintext rows to equal values, once", async () => {
			await legacy(area, contact("c-1", "p"))
			await legacy(area, contact("c-2", "p", "{not a valid row"))
			await area.set({ [`${ROOT}@c-3`]: JSON.stringify({ id: "c-3", profileId: "p" }) })
			await legacy(area, contact("c-4", "q"))
			const before = await store().getValues()

			expect(await store().sealLegacy("p", unlocked)).toBe(3)
			const stored = await raw(area)
			for (const id of ["c-1", "c-2", "c-3"]) expect(JSON.stringify(stored[`${ROOT}@${id}`])).not.toContain(`"id`)
			expect(stored[`${ROOT}@c-4`]).toBe(JSON.stringify(contact("c-4", "q")))
			expect(await store().getValues()).toEqual(before)
			expect((await store().rawRowsOf("p")).rows.map(({ row }) => row)).toContainEqual({ id: "c-3", profileId: "p" })

			expect(await store().sealLegacy("p", unlocked)).toBe(0)
			expect(await raw(area)).toEqual(stored)
		})

		test("a row changed after the scan is left for the next pass", async () => {
			await legacy(area, contact("c-1", "p"))
			const newer = contact("c-1", "p", "renamed")
			const writerFirst = async <R>(fn: (isCurrent: () => boolean) => Promise<R>) => {
				await legacy(area, newer)
				return fn(() => true)
			}

			expect(await store().sealLegacy("p", writerFirst)).toBe(0)
			expect((await raw(area))[`${ROOT}@c-1`]).toBe(JSON.stringify(newer))
			expect(await store().sealLegacy("p", unlocked)).toBe(1)
			expect(await store().get("c-1")).toEqual(newer)
		})

		test("a row deleted or sealed by a writer during the pass is never brought back or overwritten", async () => {
			await legacy(area, contact("c-1", "p"))
			await legacy(area, contact("c-2", "p"))
			const newer = contact("c-2", "p", "renamed")
			const writers = async <R>(fn: (isCurrent: () => boolean) => Promise<R>) => {
				await store().delete("c-1")
				await store().set("c-2", newer)
				return fn(() => true)
			}

			expect(await store().sealLegacy("p", writers)).toBe(0)
			expect(Object.keys(await raw(area))).toEqual([`${ROOT}@c-2`])
			expect(await store().get("c-2")).toEqual(newer)
		})

		test("a section the watchdog displaced during its last read brings back no row a purge deleted", async () => {
			await legacy(area, contact("c-1", "p"))
			const key = `${ROOT}@c-1`
			let current = true
			const racing: MinimalStorageArea = {
				get: async (keys) => {
					const got = await area.get(keys)
					if (readsKey(keys, key) && current) {
						// The lock passes to a purge, which deletes the row while this read is out.
						current = false
						await area.remove(key)
					}
					return got
				},
				set: area.set.bind(area),
				remove: area.remove.bind(area),
			}
			const displaced = <R>(fn: (isCurrent: () => boolean) => Promise<R>) => fn(() => current)

			expect(await sealedEntityStorage("contacts", racing, keys.source).sealLegacy("p", displaced)).toBe(0)
			expect(await raw(area)).toEqual({})
		})

		test("a pass whose profile's keys go mid-pass writes nothing more", async () => {
			await legacy(area, contact("c-1", "p"))
			const deletedFirst = async <R>(fn: (isCurrent: () => boolean) => Promise<R>) => {
				keys.drop("p")
				return fn(() => true)
			}

			expect(await store().sealLegacy("p", deletedFirst)).toBe(0)
			expect((await raw(area))[`${ROOT}@c-1`]).toBe(JSON.stringify(contact("c-1", "p")))
		})

		test("a pass cut short by a failing write resumes on the next", async () => {
			await legacy(area, contact("c-1", "p"))
			await legacy(area, contact("c-2", "p"))
			const set = area.set.bind(area)
			let failures = 1
			const flaky: MinimalStorageArea = {
				get: area.get.bind(area),
				remove: area.remove.bind(area),
				set: (items) => (failures-- > 0 ? Promise.reject(new Error("quota")) : set(items)),
			}

			await expect(sealedEntityStorage("contacts", flaky, keys.source).sealLegacy("p", unlocked)).rejects.toThrow("quota")
			expect(await store().sealLegacy("p", unlocked)).toBe(2)
			expect(JSON.stringify(await raw(area))).not.toContain(MARKER)
		})
	})

	describe("rawRowsOf", () => {
		test("opens the profile's rows, keeps its plaintext ones, and names apart the ones it has no keys for and the ones its keys refuse", async () => {
			await store().set("c-1", contact("c-1", "p"))
			await legacy(area, contact("c-2", "p"))
			await store().set("c-3", contact("c-3", "q"))
			await area.set({ [`${ROOT}@c-4`]: (await raw(area))[`${ROOT}@c-1`] })
			expect(await store().rawRowsOf("p")).toEqual({
				rows: [
					{ storageId: "c-1", naturalId: "c-1", row: contact("c-1", "p") },
					{ storageId: "c-2", naturalId: "c-2", row: contact("c-2", "p") },
				],
				unopened: ["c-4"],
				keyless: [],
			})

			keys.drop("p")
			expect(await store().rawRowsOf("p")).toEqual({
				rows: [{ storageId: "c-2", naturalId: "c-2", row: contact("c-2", "p") }],
				unopened: [],
				keyless: ["c-1", "c-4"],
			})
		})
	})

	describe("keyed roots", () => {
		const id = "scope:0xsecret"

		test("store a profile's row under its keyed id, apart from another profile's twin", async () => {
			await keyedStore().set(id, contact(id, "p"))
			await keyedStore().set(id, contact(id, "q", "other"))

			const stored = Object.keys(await raw(area))
			expect(stored).toHaveLength(2)
			expect(stored.join()).not.toContain("0xsecret")
			expect(await keyedStore().get(id, "p")).toEqual(contact(id, "p"))
			expect(await keyedStore().get(id, "q")).toEqual(contact(id, "q", "other"))
			expect(await keyedStore().contains(id, "p")).toBe(true)
			expect((await keyedStore().getAll()).map(([natural]) => natural)).toEqual([id, id])

			await keyedStore().delete(id, "p")
			expect(await keyedStore().get(id, "p")).toBeUndefined()
			expect(await keyedStore().get(id, "q")).toEqual(contact(id, "q", "other"))
		})

		test("a write, a pass or an adoption whose sealed write is refused keeps the plaintext original", async () => {
			await legacy(area, contact(id, "p"))
			const txKey = `${TRANSACTION_STORAGE_ROOT}@0x${"11".repeat(32)}`
			const ownerless = JSON.stringify({ hash: `0x${"11".repeat(32)}`, account: "0xab", chainId: 1 })
			await area.set({ [txKey]: ownerless })
			const before = await area.get()
			vi.spyOn(area, "set").mockRejectedValue(new Error("disk full"))

			await expect(keyedStore().set(id, contact(id, "p", "renamed"))).rejects.toThrow("disk full")
			await expect(keyedStore().sealLegacy("p", (fn) => fn(() => true))).rejects.toThrow("disk full")
			await expect(
				sealedEntityStorage("txs", area, keys.source).adoptOwnerless(`0x${"11".repeat(32)}`, ownerless, "p"),
			).rejects.toThrow("disk full")
			expect(await area.get()).toEqual(before)
		})

		test("a write, or a pass, replaces the row's plaintext twin, and a leftover twin never doubles a read", async () => {
			await legacy(area, contact(id, "p"))
			expect(await keyedStore().get(id, "p")).toEqual(contact(id, "p"))

			const sealedOnly = await keyedStore().prepare(id, contact(id, "p", "renamed"))
			await area.set(sealedOnly.items)
			expect(await keyedStore().getValues()).toEqual([contact(id, "p", "renamed")])

			expect(await keyedStore().sealLegacy("p", (fn) => fn(() => true))).toBe(1)
			expect(Object.keys(await raw(area))).toEqual(Object.keys(sealedOnly.items))
			expect(await keyedStore().get(id, "p")).toEqual(contact(id, "p", "renamed"))
		})
	})

	describe("rows that name no profile (the transaction root)", () => {
		const HASH = `0x${"11".repeat(32)}`
		const tx = (overrides: Partial<Tx> = {}): Tx => ({
			chainId: 1,
			account: `0x${"ab".repeat(32)}`,
			nonce: "0",
			feePaymentMethod: 0 as never,
			hash: HASH,
			createdAt: 1,
			updatedAt: 1,
			status: TxStatus.Proposed,
			origin: { type: 0 } as never,
			calls: [],
			...overrides,
		})
		const txs = () => sealedEntityStorage("txs", area, keys.source)
		const legacyKey = `${TRANSACTION_STORAGE_ROOT}@${HASH}`
		const stored = async () =>
			Object.fromEntries(Object.entries(await area.get()).filter(([key]) => key.startsWith(TRANSACTION_STORAGE_ROOT)))

		test("one reads for every profile and is rewritten in place as plaintext; nothing creates one", async () => {
			await area.set({ [legacyKey]: JSON.stringify(tx()) })
			expect(await txs().get(HASH, "p")).toEqual(tx())
			expect(await txs().get(HASH, "q")).toEqual(tx())
			expect(await txs().contains(HASH, "q")).toBe(true)

			await txs().set(HASH, tx({ status: TxStatus.Finalized }))
			expect(await stored()).toEqual({ [legacyKey]: JSON.stringify(tx({ status: TxStatus.Finalized })) })

			await area.remove(legacyKey)
			await expect(txs().set(HASH, tx())).rejects.toThrow(/only a stored ownerless row/)
			expect(await stored()).toEqual({})
		})

		test("its adoption seals it to the profile at a keyed id and removes the plaintext key", async () => {
			const text = JSON.stringify(tx())
			await area.set({ [legacyKey]: text })
			expect(await txs().adoptOwnerless(HASH, text, "p")).toBe(true)

			const keysNow = Object.keys(await stored())
			expect(keysNow).toHaveLength(1)
			expect(keysNow[0]).not.toContain(HASH.slice(2))
			expect(await txs().get(HASH, "p")).toEqual({ ...tx(), profileId: "p" })
			expect(await txs().get(HASH, "q")).toBeUndefined()
		})

		test("its adoption keeps a sealed row the profile already holds and drops only the plaintext", async () => {
			await txs().set(HASH, tx({ profileId: "p", status: TxStatus.Finalized }))
			const sealedOnly = await stored()
			const planted = JSON.stringify(tx({ status: TxStatus.Dropped }))
			await area.set({ [legacyKey]: planted })

			expect(await txs().adoptOwnerless(HASH, planted, "p")).toBe(true)
			expect(await stored()).toEqual(sealedOnly)
			expect(await txs().get(HASH, "p")).toEqual(tx({ profileId: "p", status: TxStatus.Finalized }))
		})

		test.each([
			[
				"the stored text changed since it was read",
				() => JSON.stringify(tx()),
				() => JSON.stringify(tx({ status: TxStatus.Pending })),
			],
			["the row names a profile", () => JSON.stringify(tx({ profileId: "q" })), () => JSON.stringify(tx({ profileId: "q" }))],
			["the row is not one", () => "{", () => "{"],
		])("an adoption refuses when %s, and writes nothing", async (_label, storedText, readText) => {
			await area.set({ [legacyKey]: storedText() })
			const before = await stored()
			expect(await txs().adoptOwnerless(HASH, readText(), "p")).toBe(false)
			expect(await stored()).toEqual(before)
		})

		test("a profile with no keys adopts nothing", async () => {
			const text = JSON.stringify(tx())
			await area.set({ [legacyKey]: text })
			expect(await txs().adoptOwnerless(HASH, text, "locked")).toBe(false)
			expect(await stored()).toEqual({ [legacyKey]: text })
		})

		test("only a keyed root may keep ownerless rows", () => {
			expect(
				() =>
					new SealedEntityStorage(
						new EntityStorage<Contact>(ROOT, area, (row) => ContactSchema.parse(row)),
						area,
						ROOT,
						keys.source,
						{
							ownerless: "plaintext",
						},
					),
			).toThrow()
		})
	})
})
