import { MemoryStorageArea } from "@nulo/wallet-core/storage"
import { beforeAll, describe, expect, test } from "vitest"
import { realMigrations } from "./migrations"
import { committedBaseline, type Decoding, decodeGoldens } from "./stored-shapes/baseline"
import { entityStorage, type SealedStoreName, STORES, sealedEntityStorage } from "./stores"

const { snapshot, goldens } = committedBaseline()
const codecNames = (Object.keys(STORES) as (keyof typeof STORES)[]).filter((name): name is SealedStoreName => "schema" in STORES[name])

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
	test("a store built by name reads a plaintext row through its registered codec, and hides one the codec refuses", async () => {
		for (const name of codecNames) {
			const { key, row } = fullRow(name)
			const id = key.slice(STORES[name].ref.root.length + 1)
			const area = new MemoryStorageArea().seed({
				[key]: JSON.stringify(row),
				[`${STORES[name].ref.root}@refused`]: "[]",
			})
			const store = sealedEntityStorage(name, area, () => undefined)
			const schema = STORES[name].schema
			expect((await store.readStorageId(id))?.row, name).toEqual(schema.parse(row))
			// The marker root's codec refuses nothing: its seeder decodes each entry itself.
			const refused = schema.safeParse([]).success ? [] : undefined
			expect((await store.readStorageId("refused"))?.row, name).toEqual(refused)
		}
	})

	test("a store built by name applies its key-identity options: a row under another key reads as absent", async () => {
		for (const name of ["authRegistry", "tokenBalances"] as const) {
			const area = new MemoryStorageArea().seed({ [`${STORES[name].ref.root}@999999`]: JSON.stringify(fullRow(name).row) })
			expect(await sealedEntityStorage(name, area, () => undefined).get("999999"), name).toBeUndefined()
		}
		const profile = fullRow("profiles").row
		const area = new MemoryStorageArea().seed({ [`${STORES.profiles.ref.root}@ffffffff`]: JSON.stringify(profile) })
		expect(await entityStorage<unknown>("profiles", area).get("ffffffff")).toBeUndefined()
	})
})
