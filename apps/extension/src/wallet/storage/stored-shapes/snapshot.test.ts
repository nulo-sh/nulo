import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, test } from "vitest"
import { realMigrations } from "../migrations"
import { STORED_SHAPES, type StoredShape, type StoredShapeName } from "../stored-shapes"
import {
	changedShapes,
	currentShapes,
	type Decoding,
	decodeGoldens,
	type Golden,
	type GoldensFile,
	isBackupSliced,
	justify,
	pinOf,
	preservationProblems,
	type Snapshot,
	schemaVersionOf,
	zodVersion,
} from "./baseline"
import { PINNED_STAMPS } from "./pins"

/**
 * The stored-shape guard. Until the baseline is frozen (`pins.ts` empty) the one stamp follows the
 * code: R1 and R3 hold it fresh. Once frozen, every stamp is pinned and a change to how any stored
 * key is written or read lands only as a new stamp, justified by a registered migration or a
 * reviewed additive mark (R2), and every row an earlier build wrote still reads to the value its
 * stamp pinned (R3).
 */

const here = dirname(fileURLToPath(import.meta.url))
const snapshot = JSON.parse(readFileSync(join(here, "snapshot.json"), "utf8")) as Snapshot
const goldens = (JSON.parse(readFileSync(join(here, "goldens.json"), "utf8")) as GoldensFile).goldens
const last = snapshot.stamps.at(-1)
const REGENERATE = "run `bun run baseline:storage` (CLAUDE.md § Persisted-storage shape changes)"

const lastStamp = () => {
	if (!last) throw new Error("snapshot.json holds no stamp")
	return last
}

describe("R1 · the last stamp is the registry as it stands", () => {
	test("its shapes are what the emitter writes for the registry today", () => {
		const changed = changedShapes(lastStamp(), { shapes: currentShapes() })
		expect(changed, `stored shapes changed: ${changed.join(", ")}; ${REGENERATE}`).toEqual([])
	})

	test("its zod and schema version are the installed zod and the migrations' version", () => {
		expect(lastStamp().zod, REGENERATE).toBe(zodVersion())
		expect(lastStamp().version, REGENERATE).toBe(schemaVersionOf(realMigrations))
	})
})

describe("R3 · every golden still reads to the value its stamp pinned", () => {
	let decoding: Decoding
	beforeAll(async () => {
		decoding = await decodeGoldens(goldens, snapshot.stamps, realMigrations)
	})

	test("through the real engine and each shape's real read path", () => {
		expect(decoding.live, `a golden decodes differently; before the freeze ${REGENERATE}`).toEqual(lastStamp().expected)
	})

	test("through a full backup's import migrator, for every backup-sliced golden", () => {
		for (const golden of goldens.filter(isBackupSliced)) {
			expect(decoding.backup[golden.id], `golden ${golden.id} through a backup`).toEqual(lastStamp().expected[golden.id])
		}
	})

	test("every row a migration keeps is still stored, and none appears beside them", () => {
		for (const [index] of snapshot.stamps.entries()) {
			const group = goldens.filter((golden) => golden.stamp === index)
			if (group.length === 0) continue
			const kept = group.filter((golden) => lastStamp().expected[golden.id] !== null).map((golden) => golden.key)
			expect(decoding.keys[index], `rows of stamp ${index} after the migrations`).toEqual([...new Set(kept)].sort())
		}
	})

	test("a shape no step's migration covers keeps every value its old rows read to", () => {
		for (let i = 1; i < snapshot.stamps.length; i++) {
			const [prev, cur] = [snapshot.stamps[i - 1], snapshot.stamps[i]]
			if (prev && cur) expect(preservationProblems(prev, cur, goldens, realMigrations), `stamp ${i}`).toEqual([])
		}
	})
})

describe("R2 · every stamp is justified by the one before it", () => {
	test("by a registered migration whose footprint covers its changes, or by an additive mark", () => {
		for (let i = 1; i < snapshot.stamps.length; i++) {
			const [prev, cur] = [snapshot.stamps[i - 1], snapshot.stamps[i]]
			if (prev && cur) expect(justify(prev, cur, realMigrations), `stamp ${i}`).toEqual([])
		}
	})
})

describe("R4 · the stamps are append-only once pinned", () => {
	test("frozen, every stamp has its pin and matches it; unfrozen, there is exactly one stamp", async () => {
		if (PINNED_STAMPS.length === 0) {
			expect(snapshot.stamps).toHaveLength(1)
			return
		}
		expect(snapshot.stamps.length, "a stamp with no pin, or a pin with no stamp: add the pin the generator printed").toBe(
			PINNED_STAMPS.length,
		)
		for (const [index, stamp] of snapshot.stamps.entries()) {
			expect(await pinOf(stamp, goldens, index), `stamp ${index} or the goldens it introduced changed after its pin`).toEqual(
				PINNED_STAMPS[index],
			)
		}
	})
})

describe("the goldens", () => {
	const shapeOf = (golden: Golden): StoredShape => STORED_SHAPES[golden.shape]

	test("every shape but the engine's has a full and a minimal golden; the engine's has none", () => {
		for (const [name, shape] of Object.entries(STORED_SHAPES) as [StoredShapeName, StoredShape][]) {
			const ids = goldens.filter((golden) => golden.shape === name).map((golden) => golden.id)
			if (shape.engine) expect(ids, name).toEqual([])
			else expect(ids, name).toEqual(expect.arrayContaining([`${name}.full`, `${name}.minimal`]))
		}
	})

	test("ids are unique, each key belongs to its shape, and each stamp index exists", () => {
		expect(new Set(goldens.map((golden) => golden.id)).size).toBe(goldens.length)
		for (const golden of goldens) {
			const { ref } = shapeOf(golden)
			const belongs = ref.kind === "value" ? golden.key === ref.key : golden.key.startsWith(`${ref.root}@`)
			expect(belongs, `${golden.id}: ${golden.key}`).toBe(true)
			expect(golden.stamp, golden.id).toBeLessThan(snapshot.stamps.length)
		}
	})

	test("each one decodes to a value: a golden its read code drops proves nothing", () => {
		const dropped = goldens.filter((golden) => lastStamp().expected[golden.id] === null).map((golden) => golden.id)
		expect(dropped).toEqual([])
	})
})
