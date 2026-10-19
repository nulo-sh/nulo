import { MemoryStorageArea } from "@nulo/wallet-core/storage"
import { beforeAll, describe, expect, test } from "vitest"
import { realMigrations } from "./migrations"
import { committedBaseline, type Decoding, decodeGoldens } from "./stored-shapes/baseline"
import { type CodecStoreName, entityStorage, STORES, valueStorage } from "./stores"

const { snapshot, goldens } = committedBaseline()
const codecNames = (Object.keys(STORES) as (keyof typeof STORES)[]).filter((name): name is CodecStoreName => "schema" in STORES[name])

let decoding: Decoding
beforeAll(async () => {
	decoding = await decodeGoldens(goldens, snapshot.stamps, realMigrations)
})

/** A shape's `full` golden as the migrations leave it: a row of the shape as it stands. */
const fullRow = (name: string) => {
	const golden = goldens.find((g) => g.id === `${name}.full`)
	const row = golden && decoding.stored[golden.id]
	if (!golden || row === null || row === undefined) throw new Error(`no stored ${name}.full golden`)
	return { key: golden.key, row }
}

describe("the store factories", () => {
	test("a store built by name reads a row through its registered codec, and hides one the codec refuses", async () => {
		for (const name of codecNames) {
			const { key, row } = fullRow(name)
			const id = key.slice(STORES[name].ref.root.length + 1)
			const area = new MemoryStorageArea().seed({
				[key]: JSON.stringify(row),
				[`${STORES[name].ref.root}@refused`]: "[]",
			})
			const store = entityStorage(name, area)
			expect(await store.get(id), name).toEqual(STORES[name].schema.parse(row))
			expect(await store.get("refused"), name).toBeUndefined()
		}
	})

	test("a store built by name applies its key-identity options: a row under another key reads as absent", async () => {
		for (const name of ["authRegistry", "tokenBalances"] as const) {
			const area = new MemoryStorageArea().seed({ [`${STORES[name].ref.root}@999999`]: JSON.stringify(fullRow(name).row) })
			expect(await entityStorage(name, area).get("999999"), name).toBeUndefined()
		}
		const profile = fullRow("profiles").row
		const area = new MemoryStorageArea().seed({ [`${STORES.profiles.ref.root}@ffffffff`]: JSON.stringify(profile) })
		expect(await entityStorage<unknown>("profiles", area).get("ffffffff")).toBeUndefined()
	})

	test("a per-profile value store needs its profile id and writes under it", async () => {
		const area = new MemoryStorageArea()
		await valueStorage<{ a: number }>("tokenSeeded", area, "0a1b2c3d").set({ a: 1 })
		expect([...area.data.keys()]).toEqual(["nulo:core:token-seeded@0a1b2c3d"])
		expect(() => valueStorage("tokenSeeded" as never, area)).toThrow("a profile id is required")
	})
})
