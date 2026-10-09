import { defineMigration, type Migration, Migrator, RESERVED_KEYS, SCHEMA_VERSION_KEY } from "@nulo/wallet-core/migration"
import { describe, expect, test } from "vitest"
import { backupMigrationFixture } from "@/e2e/backup-migration-fixture"
import { MIGRATION_FIXTURE_ROOT, migrationFixture } from "@/e2e/migration-fixture"
import { CONTACT_STORAGE_ROOT } from "@/wallet/services/contact/spec"
import { BASELINE_VERSION, backupMigrations, migrations, realMigrations } from "./index"

/** Minimal in-memory store for structural registry checks. */
function memStore() {
	const data = new Map<string, unknown>()
	return {
		data,
		async get(keys?: string | string[]) {
			if (keys === undefined) return Object.fromEntries(data)
			const arr = Array.isArray(keys) ? keys : [keys]
			const out: Record<string, unknown> = {}
			for (const k of arr) if (data.has(k)) out[k] = data.get(k)
			return out
		},
		async set(items: Record<string, unknown>) {
			for (const [k, v] of Object.entries(items)) data.set(k, v)
		},
		async remove(keys: string | string[]) {
			for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k)
		},
	}
}

/** Runs `m` from its prior version over `seed` twice; returns the store's non-reserved contents
 *  before the first run and after each run, each run asserted to have succeeded. */
async function runTwice(m: Migration, seed: Record<string, unknown>): Promise<[string, string, string]> {
	const store = memStore()
	await store.set(seed)
	const contents = () => JSON.stringify(Object.fromEntries([...store.data].filter(([k]) => !RESERVED_KEYS.includes(k))))
	const pass = async () => {
		await store.set({ [SCHEMA_VERSION_KEY]: m.version - 1 })
		const result = await new Migrator({ store, migrations: [m] }).run()
		expect(result, `migration ${m.version} did not run`).toEqual({ kind: "migrated", from: m.version - 1, to: m.version })
		return contents()
	}
	const before = contents()
	return [before, await pass(), await pass()]
}

const legacyRow = (root: string) => ({ [`${root}@seed`]: JSON.stringify({ id: "seed", legacyName: "Ada" }) })

/** Every migration the wallet can run, real or fixture, once each: the two fixtures share version
 *  9001, so they are told apart by identity. Each needs a pre-shape seed its `up()` transforms. */
const UNDER_TEST = [...new Set([...realMigrations, ...migrations, ...backupMigrations, migrationFixture, backupMigrationFixture])]
const SEEDS = new Map<Migration, Record<string, unknown>>([
	[migrationFixture, legacyRow(MIGRATION_FIXTURE_ROOT)],
	[backupMigrationFixture, legacyRow(CONTACT_STORAGE_ROOT)],
])

/** Structural invariants over the registry and both e2e fixtures, so a non-idempotent or
 *  mis-versioned entry fails the unit gate the moment it is registered. */
describe("migrations registry (structural)", () => {
	test("versions are unique, ascending, and above the baseline", () => {
		const versions = migrations.map((m) => m.version)
		expect(versions).toEqual([...versions].sort((a, b) => a - b))
		expect(new Set(versions).size).toBe(versions.length)
		for (const v of versions) expect(v).toBeGreaterThan(BASELINE_VERSION)
	})

	test("real migrations are CONTIGUOUS from the baseline (a gap means one was skipped or unregistered)", () => {
		// The e2e fixture's 9001 sentinel is excluded; real migrations must be
		// baseline+1, baseline+2, … — a jump (1 → 3) would boot existing users
		// past a transform their data still needs.
		const real = migrations.map((m) => m.version).filter((v) => v < 9000)
		real.forEach((v, i) => {
			expect(v, `version gap before v${v}`).toBe(BASELINE_VERSION + 1 + i)
		})
	})

	test("every NNN-*.ts migration file in this directory is actually registered", async () => {
		// An authored-but-unimported migration file passes every other check
		// while existing users silently skip its transform.
		const { readdirSync } = await import("node:fs")
		const { dirname, join } = await import("node:path")
		const { fileURLToPath } = await import("node:url")
		const here = dirname(fileURLToPath(import.meta.url))
		const files = readdirSync(join(here)).filter((f) => /^\d{3}-.*\.ts$/.test(f) && !f.endsWith(".test.ts"))
		const registered = new Set(migrations.map((m) => m.version))
		for (const f of files) {
			const v = Number.parseInt(f.slice(0, 3), 10)
			expect(registered.has(v), `${f} exists but version ${v} is not in the migrations array`).toBe(true)
		}
	})

	test("every migration declares a footprint", () => {
		for (const m of UNDER_TEST) {
			expect(m.reads.length + m.writes.length, `migration ${m.version} declares no refs`).toBeGreaterThan(0)
		}
	})

	// Every REAL migration still ships its own colocated test with seeded pre-shape fixtures
	// (template.ts step 6); this is the safety net, not the proof.
	test("every migration transforms its seed and is idempotent (run twice ≡ once)", async () => {
		expect(UNDER_TEST.length).toBeGreaterThanOrEqual(2)
		for (const m of UNDER_TEST) {
			const seed = SEEDS.get(m)
			expect(seed, `migration ${m.version} has no pre-shape seed here`).toBeDefined()
			const [before, once, twice] = await runTwice(m, seed ?? {})
			expect(once, `migration ${m.version} left its seed unchanged`).not.toBe(before)
			expect(twice, `migration ${m.version} is not idempotent`).toBe(once)
		}
	})

	test("(control) the same check reports a migration that appends to a value key", async () => {
		const key = "nulo:test:log"
		const appender = defineMigration({
			version: 2,
			description: "appends on every run",
			reads: [{ kind: "value", key }],
			writes: [{ kind: "value", key }],
			up: async (ctx) => {
				await ctx.local.setValue(key, [...((await ctx.local.value<string[]>(key)) ?? []), "run"])
			},
		})
		const [, once, twice] = await runTwice(appender, {})
		expect(twice).not.toBe(once)
	})
})
