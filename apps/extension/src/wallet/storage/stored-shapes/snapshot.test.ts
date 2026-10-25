import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, test } from "vitest"
import { realMigrations } from "../migrations"
import { STORED_SHAPES, type StoredShape, type StoredShapeName } from "../stored-shapes"
import {
	acknowledgedBlock,
	changedShapes,
	committedBaseline,
	currentShapes,
	type Decoding,
	decodeGoldens,
	GOLDEN_NOW,
	type Golden,
	isBackupSliced,
	justify,
	pinOf,
	preservationProblems,
	REFUSED_BY_ACK,
	schemaVersionOf,
	zodVersion,
} from "./baseline"
import { openFullBackupText } from "@/utils/full-backup-helpers"
import { BACKUP_SCHEMA_VERSION_FIELD } from "@/wallet/services/backup/backup-migration-registry"
import { backupProblems } from "./backups"
import { PINNED_BACKUPS, PINNED_STAMPS } from "./pins"

/**
 * The stored-shape guard. The baseline is frozen from 1.0.0: every stamp is pinned, and a change to
 * how any stored key is written or read lands only as a new stamp, justified by a registered
 * migration or a reviewed additive mark (R2); every row an earlier build wrote still reads to the
 * value its stamp pinned (R3); and the full backups pinned at the freeze still validate, migrate and
 * read, unless a release decision in `IMPORT_BLOCKING_ACK` refuses them (R5).
 */

const { snapshot, goldens } = committedBaseline()
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
			if (decoding.backup[golden.id] === REFUSED_BY_ACK) continue
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
	test("the baseline is frozen, and every stamp has its pin and matches it", async () => {
		expect(PINNED_STAMPS.length, "the baseline is frozen from 1.0.0: a pin is never removed").toBeGreaterThan(0)
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

describe("R5 · the full backups pinned at the freeze still validate, migrate and read", () => {
	const dir = join(dirname(fileURLToPath(import.meta.url)), "backups")
	/** The e2e test profile's password (`tests/e2e/fixtures/constants.ts`), which seals `password.txt`. */
	const PASSWORD = "TestPassword123!"

	test("every file in backups/ is pinned, and every pin names a file", () => {
		expect(readdirSync(dir).sort()).toEqual(Object.keys(PINNED_BACKUPS).sort())
	})

	test.each(Object.keys(PINNED_BACKUPS))("%s, unchanged, opens, validates, migrates and every restored row reads", async (name) => {
		const text = readFileSync(join(dir, name), "utf8")
		expect(createHash("sha256").update(text).digest("hex"), `${name} changed after its pin`).toBe(PINNED_BACKUPS[name])
		const envelope = JSON.parse(name === "password.txt" ? await openFullBackupText(text, PASSWORD) : text) as Record<string, unknown>
		const problems = await backupProblems(envelope, GOLDEN_NOW)
		const block = acknowledgedBlock(Number(envelope[BACKUP_SCHEMA_VERSION_FIELD]), realMigrations)
		if (block === undefined) {
			expect(problems).toEqual([])
			return
		}
		expect(problems).toHaveLength(1)
		expect(problems[0]).toContain("refused: Incompatible backup: ")
		expect(problems[0]).toContain(`migration ${block} `)
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

	test("an object shape's full golden holds every property its stamp had, and its minimal one only the required ones", () => {
		for (const golden of goldens.filter(({ id }) => id.endsWith(".full") || id.endsWith(".minimal"))) {
			const record = snapshot.stamps[golden.stamp]?.shapes[golden.shape]
			const schema = record?.schema as { properties?: Record<string, unknown>; required?: string[] } | undefined
			if (!schema?.properties || typeof golden.value !== "object" || golden.value === null || Array.isArray(golden.value)) continue
			const keys = Object.keys(golden.value).sort()
			// The MAC check refuses a row with no `mac`, which the codec alone would accept.
			const required = [...(schema.required ?? []), ...(record?.authenticated ? ["mac"] : [])]
			const expected = golden.id.endsWith(".full") ? Object.keys(schema.properties) : required
			expect(keys, golden.id).toEqual([...new Set(expected)].sort())
		}
	})

	test("ids are unique, each key belongs to its shape, and each stamp index exists", () => {
		expect(new Set(goldens.map((golden) => golden.id)).size).toBe(goldens.length)
		for (const golden of goldens) {
			const { ref } = shapeOf(golden)
			const belongs = ref.kind === "value" ? golden.key === ref.key : golden.key.startsWith(`${ref.root}@`)
			expect(belongs, `${golden.id}: ${golden.key}`).toBe(true)
			expect(Number.isInteger(golden.stamp) && golden.stamp >= 0 && golden.stamp < snapshot.stamps.length, golden.id).toBe(true)
		}
	})

	test("each one decodes to a value under the stamp that introduced it: a golden its read code drops proves nothing", () => {
		const dropped = goldens.filter((golden) => (snapshot.stamps[golden.stamp]?.expected[golden.id] ?? null) === null)
		expect(dropped.map((golden) => golden.id)).toEqual([])
	})
})
