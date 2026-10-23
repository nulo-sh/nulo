import { defineMigration, type Migration } from "@nulo/wallet-core/migration"
import { describe, expect, test } from "vitest"
import { z } from "zod"
import { CONTACT_STORAGE_ROOT } from "@/wallet/services/contact/spec"
import { DAPP_SESSION_STORAGE_ROOT } from "@/wallet/services/dapp-session/spec"
import { RESTORE_PENDING_ROOT } from "@/wallet/services/profile/restore-pending-repository"
import { PROFILE_TOMBSTONE_ROOT } from "@/wallet/services/profile/tombstone-repository"
import { TOKEN_STORAGE_ROOT } from "@/wallet/services/token/spec"
import { defineRowMapMigration } from "@/wallet/services/backup/row-map-migration"
import {
	committedBaseline,
	type Golden,
	decodeGoldens,
	isBackupSliced,
	justify,
	preservationProblems,
	propose,
	REFUSED_BY_ACK,
	type ShapeRecord,
	type Stamp,
	currentShapes,
	wire,
	zodVersion,
} from "./baseline"
import { canonical, canonicalText, emitSchema, type Json } from "./emit"

const contactGolden: Golden = {
	id: "contacts.full",
	stamp: 0,
	shape: "contacts",
	key: "nulo:core:contacts@c1",
	value: { id: "c1", profileId: "0a1b2c3d", name: "Ada", address: `0x${"ab".repeat(32)}`, abbr: "AD" },
}

/** A plain json row a migration may cover: every content root is sealed, which no migration may
 *  touch, so the example is a deletion tombstone. */
const tombstoneGolden: Golden = {
	id: "profileTombstones.full",
	stamp: 0,
	shape: "profileTombstones",
	key: "nulo:core:profile-tombstones@0a1b2c3d",
	value: { profileId: "0a1b2c3d", addresses: [], tokenIds: [1], networkIds: [], epoch: 3, pxeGeneration: "g" },
}

const stampOf = (shapes: Record<string, ShapeRecord>, extra: Partial<Stamp> = {}): Stamp => ({
	version: 1,
	zod: zodVersion(),
	shapes,
	expected: {},
	...extra,
})

function withShape(name: string, change: (record: ShapeRecord) => ShapeRecord | undefined): Record<string, ShapeRecord> {
	const shapes = structuredClone(currentShapes())
	const record = shapes[name]
	if (!record) throw new Error(`no shape ${name}`)
	const next = change(record)
	if (next) shapes[name] = next
	else delete shapes[name]
	return shapes
}

const widened = (record: ShapeRecord): ShapeRecord => ({
	...record,
	schema: { ...(record.schema as Record<string, Json>), "x-test": "widened" },
})

const migrationOver = (version: number, root: string): Migration =>
	defineMigration({ version, description: "test", reads: [{ kind: "root", root }], writes: [{ kind: "root", root }], up: async () => {} })

describe("emitSchema", () => {
	test("an undescribed custom, refinement or transform node throws, naming its shape and path", () => {
		expect(() => emitSchema("s", z.object({ a: z.custom<object>(() => true) }))).toThrow("s: the x-custom node at /properties/a")
		expect(() => emitSchema("s", z.object({ b: z.string().refine(() => true) }))).toThrow("x-refine")
		expect(() => emitSchema("s", z.object({ c: z.string().transform((v) => v) }))).toThrow("x-transform")
		expect(() => emitSchema("s", z.object({ d: z.string().trim() }))).toThrow("s: the x-transform node at /properties/d")
		expect(() => emitSchema("s", z.object({ e: z.coerce.number() }))).toThrow("x-transform")
	})

	test("a wrapper's description labels the wrapper, never an undescribed node inside it", () => {
		const custom = z.custom<string>(() => true)
		expect(() => emitSchema("s", z.object({ a: custom.catch("x").describe("else x") }))).toThrow("x-custom")
		expect(() =>
			emitSchema(
				"s",
				z.object({
					a: z
						.string()
						.refine(() => true)
						.catch("x")
						.describe("else x"),
				}),
			),
		).toThrow("x-refine")
	})

	test("a described copy of a node does not label the bare node used beside it", () => {
		const fee = z.custom<object>(() => true)
		expect(() => emitSchema("s", z.object({ a: fee, b: fee.describe("x") }))).toThrow("/properties/a")
		expect(() => emitSchema("s", z.object({ b: fee.describe("x"), a: fee }))).toThrow("/properties/a")
		expect(emitSchema("s", z.object({ b: fee.describe("x") }))).toMatchObject({ properties: { b: { "x-custom": "x" } } })
	})

	test("a described node is emitted under its marker, an inner one through its wrapper", () => {
		const schema = z.object({
			a: z.custom<object>(() => true).describe("any object"),
			c: z
				.custom<number>(() => true)
				.describe("a level")
				.optional()
				.catch(undefined)
				.describe("else absent"),
		})
		expect(emitSchema("s", schema)).toMatchObject({
			properties: { a: { "x-custom": "any object" }, c: { "x-custom": "a level", "x-catch": "else absent" } },
		})
	})

	test("the output depends on the schema, not on the order it was declared in", () => {
		const one = emitSchema("s", z.object({ b: z.string(), a: z.number() }))
		const two = emitSchema("s", z.object({ a: z.number(), b: z.string() }))
		expect(JSON.stringify(one)).toBe(JSON.stringify(two))
		expect(one).toMatchObject({ required: ["a", "b"] })
	})

	test("a pipe's validating output side is part of the shape", () => {
		const message = z
			.string()
			.transform((v) => v.trim())
			.describe("trimmed")
		const piped = z.object({ m: message.pipe(z.string().max(100)).describe("trimmed, then at most 100") })
		expect(emitSchema("s", piped)).toMatchObject({ properties: { m: { "x-pipe-out": [{ type: "string", maxLength: 100 }] } } })
		expect(JSON.stringify(emitSchema("s", z.object({ m: message })))).not.toContain("x-pipe-out")
	})

	test("each validating side of a pipe chain is part of the shape, not only the last", () => {
		const chain = (min: number) =>
			z.string().pipe(z.string().min(min)).describe("at least min").pipe(z.string().max(100)).describe("then at most 100")
		expect(JSON.stringify(emitSchema("s", chain(1)))).not.toBe(JSON.stringify(emitSchema("s", chain(10))))
	})

	test("a plain schema needs no description", () => {
		expect(() => emitSchema("s", z.object({ a: z.string().optional(), b: z.array(z.number()) }))).not.toThrow()
	})
})

describe("canonical", () => {
	test("keeps plain data, drops undefined properties and refuses what JSON cannot carry", () => {
		expect(canonical({ b: 1, a: [true, null], c: undefined })).toEqual({ a: [true, null], b: 1 })
		expect(() => canonical({ a: 1n })).toThrow("/a")
		expect(() => canonical({ a: new Map() })).toThrow("Map")
		expect(() => canonical([Number.NaN])).toThrow("/0")
	})

	test("keeps an own `__proto__` key as data, so it changes what a pin hashes", () => {
		expect(canonicalText(JSON.parse('{"a":{"__proto__":"x"}}'))).toBe('{"a":{"__proto__":"x"}}')
	})
})

describe("justify", () => {
	const base = stampOf(currentShapes())

	test("an unchanged step at the same version needs nothing", () => {
		expect(justify(base, stampOf(currentShapes(), { additive: { names: [], reason: "zod bump" } }), [])).toEqual([])
	})

	test("a same-version change needs an additive mark naming exactly the changed shapes", () => {
		const shapes = withShape("contacts", widened)
		expect(justify(base, stampOf(shapes), [])).toEqual(["a same-version change needs an additive mark with a reason"])
		expect(justify(base, stampOf(shapes, { additive: { names: ["contacts"], reason: "an optional field" } }), [])).toEqual([])
		expect(justify(base, stampOf(shapes, { additive: { names: ["tokens"], reason: "wrong name" } }), [])[0]).toContain(
			"changed shapes are",
		)
	})

	test("an additive mark cannot remove a shape", () => {
		const shapes = withShape("contacts", () => undefined)
		expect(justify(base, stampOf(shapes, { additive: { names: ["contacts"], reason: "gone" } }), [])).toContain(
			"contacts is removed with no migration",
		)
	})

	test("a +1 step needs its registered migration, whose footprint covers each change", () => {
		const shapes = withShape("profileTombstones", widened)
		const next = stampOf(shapes, { version: 2, migration: 2 })
		expect(justify(base, next, [])).toEqual(["v2 names no registered migration 2"])
		expect(justify(base, next, [migrationOver(2, PROFILE_TOMBSTONE_ROOT)])).toEqual([])
		expect(justify(base, next, [migrationOver(2, RESTORE_PENDING_ROOT)])[0]).toContain("footprint does not cover it")
	})

	test("no migration may change a structured, engine, authenticated or sealed shape", () => {
		for (const name of ["uiRestoreOutcome", "schemaBlocked", "dappSessions", "contacts"]) {
			const shapes = withShape(name, widened)
			const ref = shapes[name]?.ref
			const root = ref?.kind === "root" ? ref.root : (ref?.key ?? "")
			const problems = justify(base, stampOf(shapes, { version: 2, migration: 2 }), [migrationOver(2, root)])
			expect(problems, name).toContain(`${name} is structured, engine, authenticated or sealed: no migration may change it`)
		}
	})

	test("no migration may write a structured, engine, authenticated or sealed shape, changed or not", () => {
		const next = stampOf(currentShapes(), { version: 2, migration: 2 })
		expect(justify(base, next, [migrationOver(2, DAPP_SESSION_STORAGE_ROOT)])).toEqual([
			"migration 2 writes dappSessions, which is structured, engine, authenticated or sealed",
		])
		// The pre-unlock engine holds no row key: a footprint naming a sealed root is refused.
		expect(justify(base, next, [migrationOver(2, CONTACT_STORAGE_ROOT)])).toEqual([
			"migration 2 writes contacts, which is structured, engine, authenticated or sealed",
		])
	})

	test("no step may weaken how a kept shape is read, even with a mark", () => {
		const cases: Array<[string, (r: ShapeRecord) => ShapeRecord, string]> = [
			["dappSessions", ({ authenticated: _, ...r }) => r, "dappSessions drops its MAC check"],
			["authRegistry", ({ options: _, ...r }) => r, "authRegistry changes its key-identity options"],
			["contacts", (r) => ({ ...r, read: "described" }), "contacts stops reading through its codec"],
			["schemaVersion", ({ engine: _, ...r }) => r, "schemaVersion stops being engine state"],
			["contacts", ({ sealed: _, ...r }) => r, "contacts drops its seal"],
			["uiPinnedTokens", ({ legacy: _, ...r }) => r, "uiPinnedTokens stops reading its rows from before the seal"],
		]
		for (const [name, change, problem] of cases) {
			const problems = justify(base, stampOf(withShape(name, change), { additive: { names: [name], reason: "test" } }), [])
			expect(problems, name).toContain(problem)
		}
	})

	test("a step may not skip or rewind the schema version", () => {
		expect(justify(base, stampOf(currentShapes(), { version: 3 }), [])).toContain("v1 → v3 skips or rewinds the schema version")
		expect(justify(stampOf(currentShapes(), { version: 2 }), base, [])).toContain("v2 → v1 skips or rewinds the schema version")
	})
})

describe("preservationProblems", () => {
	const prev = stampOf(currentShapes(), { expected: { "profileTombstones.full": { profileId: "0a1b2c3d", epoch: 3 } } })

	test("an old row outside the migration's footprint keeps every value; new paths are allowed", () => {
		const lost = stampOf(currentShapes(), {
			expected: { "profileTombstones.full": { profileId: "0a1b2c3d" } },
			additive: { names: [], reason: "t" },
		})
		expect(preservationProblems(prev, lost, [tombstoneGolden], [])).toEqual([
			"golden profileTombstones.full (profileTombstones) changes /epoch with no migration covering it",
		])
		const grown = stampOf(currentShapes(), { expected: { "profileTombstones.full": { profileId: "0a1b2c3d", epoch: 3, tag: "new" } } })
		expect(preservationProblems(prev, grown, [tombstoneGolden], [])).toEqual([])
	})

	test("a row the step's migration covers may change", () => {
		const migrated = stampOf(currentShapes(), {
			version: 2,
			migration: 2,
			expected: { "profileTombstones.full": { profileId: "0a1b2c3d" } },
		})
		expect(preservationProblems(prev, migrated, [tombstoneGolden], [migrationOver(2, PROFILE_TOMBSTONE_ROOT)])).toEqual([])
	})

	test("a sealed row never counts as covered: its old values must hold", () => {
		const contactsPrev = stampOf(currentShapes(), { expected: { "contacts.full": { id: "c1", name: "Ada" } } })
		const migrated = stampOf(currentShapes(), { version: 2, migration: 2, expected: { "contacts.full": { id: "c1" } } })
		expect(preservationProblems(contactsPrev, migrated, [contactGolden], [migrationOver(2, CONTACT_STORAGE_ROOT)])).toEqual([
			"golden contacts.full (contacts) changes /name with no migration covering it",
		])
	})
})

describe("decodeGoldens", () => {
	test("a pre-seal golden of a shape whose old rows were stored as is is seeded as is and reads to its value", async () => {
		const value = { "7": [`0x${"a1".repeat(32)}`] }
		const golden: Golden = { id: "uiPinnedTokens.full", stamp: 0, shape: "uiPinnedTokens", key: "nulo:ui:pinnedTokens@0a1b2c3d", value }
		expect(wire(golden)).toBe(value)
		expect(wire({ ...golden, sealed: true })).toBe(JSON.stringify(value))
		expect(wire(contactGolden)).toBe(JSON.stringify(contactGolden.value))
		const decoding = await decodeGoldens([golden], [{ version: 1 }], [])
		expect(decoding.live[golden.id]).toEqual(value)
		expect(decoding.stored[golden.id]).toEqual(value)
	})

	test("an acknowledged import-blocking migration refuses each backup-sliced golden; an unacknowledged one throws", async () => {
		const goldens = committedBaseline().goldens.filter((golden) => golden.stamp === 0)
		const imperative = migrationOver(2, CONTACT_STORAGE_ROOT)
		const decoding = await decodeGoldens(goldens, [{ version: 1 }], [imperative], new Set([2]))
		const sliced = goldens.filter(isBackupSliced).map((golden) => golden.id)
		expect(sliced.length).toBeGreaterThan(0)
		expect(sliced.map((id) => decoding.backup[id])).toEqual(sliced.map(() => REFUSED_BY_ACK))
		expect(decoding.live["contacts.full"]).toBeDefined()
		await expect(decodeGoldens(goldens, [{ version: 1 }], [imperative], new Set())).rejects.toThrow(
			"the backup migrator refused goldens at v1",
		)
		await expect(decodeGoldens(goldens, [{ version: 1 }], [imperative], new Set([3]))).rejects.toThrow(
			"the backup migrator refused goldens at v1",
		)
	})

	test("a migration reading a backup slice decodes every golden, though one store holds only some of them", async () => {
		const reads = defineRowMapMigration({
			version: 2,
			description: "test",
			rowMaps: { [TOKEN_STORAGE_ROOT]: { addDefault: { tag: "t" } } },
		})
		const { goldens } = committedBaseline()
		const decoding = await decodeGoldens(goldens, [{ version: 1 }], [reads])
		expect(Object.keys(decoding.backup).length).toBeGreaterThan(0)
	})
})

describe("propose", () => {
	test("unfrozen, the one stamp is rewritten from the registry and the goldens", async () => {
		const proposal = await propose({ stamps: [] }, [contactGolden], { frozen: false, migrations: [] })
		expect(proposal.kind).toBe("rewrite")
		if (proposal.kind === "rewrite") expect(proposal.stamp.expected["contacts.full"]).toEqual(contactGolden.value)
	})

	test("unfrozen, a golden of a later stamp is refused", async () => {
		const proposal = await propose({ stamps: [] }, [{ ...contactGolden, stamp: 1 }], { frozen: false, migrations: [] })
		expect(proposal.kind).toBe("refused")
	})

	test("frozen, nothing changed is a no-op, and a change with neither way out is refused naming both", async () => {
		const rewrite = await propose({ stamps: [] }, [contactGolden], { frozen: false, migrations: [] })
		if (rewrite.kind !== "rewrite") throw new Error("expected a rewrite")
		const frozen = { stamps: [rewrite.stamp] }
		expect((await propose(frozen, [contactGolden], { frozen: true, migrations: [] })).kind).toBe("unchanged")
		const stale = { stamps: [{ ...rewrite.stamp, shapes: withShape("contacts", widened) }] }
		const refused = await propose(stale, [contactGolden], { frozen: true, migrations: [] })
		expect(refused.kind).toBe("refused")
		if (refused.kind === "refused") expect(refused.reasons.join("\n")).toMatch(/register migration 2[\s\S]*--additive/)
		expect((await propose(stale, [contactGolden], { frozen: true, additive: "test", migrations: [] })).kind).toBe("append")
	})
})
