import { MemoryStorageArea } from "@nulo/wallet-core/storage"
import { describe, expect, test } from "vitest"
import { STORED_SHAPES } from "./stored-shapes"
import type { GoldensFile } from "./stored-shapes/baseline"
import goldensFile from "./stored-shapes/goldens.json"
import { type CodecStoreName, entityStorage, STORES, valueStorage } from "./stores"

const goldens = (goldensFile as GoldensFile).goldens
const codecNames = (Object.keys(STORES) as (keyof typeof STORES)[]).filter((name): name is CodecStoreName => "schema" in STORES[name])

const fullGolden = (name: string) => {
	const golden = goldens.find((g) => g.id === `${name}.full`)
	if (!golden) throw new Error(`no ${name}.full golden`)
	return golden
}

describe("the store factories", () => {
	test("every codec store is the registry's: same ref, schema object and options", () => {
		for (const name of codecNames) {
			const shape = STORED_SHAPES[name]
			expect(shape.ref, name).toEqual(STORES[name].ref)
			expect(shape.schema, name).toBe(STORES[name].schema)
			expect(shape.options, name).toEqual("options" in STORES[name] ? STORES[name].options : undefined)
		}
	})

	test("a store built by name reads a row through its registered codec, and hides one the codec refuses", async () => {
		for (const name of codecNames) {
			const golden = fullGolden(name)
			const id = golden.key.slice(STORES[name].ref.root.length + 1)
			const area = new MemoryStorageArea().seed({
				[golden.key]: JSON.stringify(golden.value),
				[`${STORES[name].ref.root}@refused`]: "[]",
			})
			const store = entityStorage(name, area)
			expect(await store.get(id), name).toEqual(STORES[name].schema.parse(golden.value))
			expect(await store.get("refused"), name).toBeUndefined()
		}
	})

	test("a store built by name applies its key-identity options: a row under another key reads as absent", async () => {
		for (const name of ["authRegistry", "tokenBalances"] as const) {
			const golden = fullGolden(name)
			const area = new MemoryStorageArea().seed({ [`${STORES[name].ref.root}@999999`]: JSON.stringify(golden.value) })
			expect(await entityStorage(name, area).get("999999"), name).toBeUndefined()
		}
		const profile = fullGolden("profiles")
		const area = new MemoryStorageArea().seed({ [`${STORES.profiles.ref.root}@ffffffff`]: JSON.stringify(profile.value) })
		expect(await entityStorage<unknown>("profiles", area).get("ffffffff")).toBeUndefined()
	})

	test("a per-profile value store needs its profile id and writes under it", async () => {
		const area = new MemoryStorageArea()
		await valueStorage<{ a: number }>("tokenSeeded", area, "0a1b2c3d").set({ a: 1 })
		expect([...area.data.keys()]).toEqual(["nulo:core:token-seeded@0a1b2c3d"])
		expect(() => valueStorage("tokenSeeded" as never, area)).toThrow("a profile id is required")
	})
})
