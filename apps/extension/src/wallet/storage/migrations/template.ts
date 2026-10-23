/**
 * TEMPLATE for a new data-preserving migration. To add one:
 *   1. Copy this file to `NNN-short-description.ts` (NNN = current max REAL
 *      migration + 1 — the e2e fixtures' 9001 sentinel doesn't count).
 *   2. Set `version` to that number and describe the shape change.
 *   3. **Prefer the BACKUP-SAFE declarative form** (`defineRowMapMigration`,
 *      example below): pure data, so it also migrates imported full-backups.
 *      Fall back to imperative `defineMigration` ONLY when the transform
 *      doesn't fit the finite DSL — an imperative migration is NOT
 *      backup-safe and BLOCKS backup import at every version it covers
 *      (users must re-export; `footprint-coverage.test.ts` makes you
 *      acknowledge that explicitly). Do NOT try to widen the DSL with
 *      callback fields — arbitrary code cannot be proven row-local, which is
 *      the property the backup path depends on (rejected 4× in audit).
 *   4. Declare the EXACT roots + value keys you read and write — the engine
 *      snapshots ONLY that footprint into the pre-migration backup, so an
 *      undeclared read/write is a data-loss risk. (The declarative form
 *      derives its footprint from `rowMaps`/`valueMaps` automatically.)
 *      Once shipped, the footprint is frozen: a crash-resume refuses a
 *      journal whose refs differ from the registered migration's.
 *   5. Keep `up` IDEMPOTENT (guard with `hasProperty`/presence checks) — the
 *      test harness runs it twice and asserts equality. Give it a pre-shape
 *      seed in `registry.test.ts`'s `SEEDS`, which `up` must change.
 *   6. **HOSTILE-INPUT RULE (standing):** `up()` input is UNTRUSTED. The
 *      migration engine also runs over imported backup blobs, whose bytes an
 *      attacker fully controls (a plain-backup checksum is not
 *      authentication) — and even live rows can be half-written. No unguarded
 *      `JSON.parse`, no trusting a field's type or presence: the
 *      `MigrationArea` type params are call-site assertions, not validation.
 *      Presence-guard every access and THROW on anything malformed
 *      (fail-closed) — a migration that trusts its input is a vulnerability,
 *      not just a bug.
 *   7. **SCHEMA-CONFORMANCE RULE (row codecs):** every service now
 *      validates each stored row against a zod schema ON READ; a row that
 *      fails is KEPT but read back as `undefined` — written successfully, then
 *      INVISIBLE in the UI and dropped from the next export. So your
 *      migration's OUTPUT row MUST satisfy the destination service's row
 *      schema (`<Service>Schema` in its `spec.ts`). The two traps: `drop`ping
 *      or `retype`ing a schema-REQUIRED field, and — when a release ADDS a new
 *      required field — failing to `addDefault` it (old rows won't have it).
 *      Your colocated test MUST assert `Schema.parse(migratedRow)` succeeds
 *      for every before→after fixture. The stored-shape guard
 *      (`stored-shapes/snapshot.test.ts`, R3) also runs the real engine over
 *      every frozen golden row and reads each back through its service's read
 *      path, so an output the codec hides fails CI there too.
 *   8. Import it into `index.ts`'s `realMigrations` array, then run
 *      `bun run baseline:storage`: it appends the stamp this migration
 *      justifies and the decoded value of every golden after it; review that
 *      diff, and add the pin it prints to `stored-shapes/pins.ts`.
 *   9. Add a colocated `*.test.ts` with before→after fixtures. R3 holds every
 *      older golden to the expectations the generator wrote, so a value your
 *      migration changes by accident shows in the stamp's diff.
 *
 * `breaking` defaults to `true` (the new code REQUIRES this shape; a failed
 * migration blocks with recovery). Set `false` ONLY if the code genuinely
 * tolerates the un-migrated shape (a failed migration then boots degraded).
 *
 * A `root` is an EntityStorage namespace (rows keyed `${root}@${id}`); a `value`
 * is a single ValueStorage key. NEVER migrate the encrypted secret / KDF here —
 * the migrator runs pre-unlock and has no password (see wallet-crypto/README.md).
 * Nor a sealed root (`STORES` entries marked `sealed`): the registry refuses it, and
 * its rows convert at the profile's unlock instead.
 */
import { defineMigration } from "@nulo/wallet-core/migration"
import { defineRowMapMigration } from "@/wallet/services/backup/row-map-migration"
import { PROFILE_TOMBSTONE_ROOT } from "@/wallet/services/profile/tombstone-repository"

/** PREFERRED: the backup-safe declarative form. Finite data-only clauses
 *  (`rename` / `drop` / `retype` / `remapValues` / `addDefault`), applied per
 *  row in that fixed order — structurally row-local, so the SAME object
 *  migrates live storage at boot AND imported backups. Footprint is derived;
 *  idempotency is inherent (and still harness-verified). */
export const exampleRowMapMigration = defineRowMapMigration({
	version: 2,
	description: "example: add a default `attempts` count to every deletion tombstone",
	rowMaps: {
		[PROFILE_TOMBSTONE_ROOT]: { addDefault: { attempts: 0 } },
	},
})

/** FALLBACK: the imperative form — full power, NOT backup-safe (blocks backup
 *  import at this version; see the header). Note the presence-guarded access
 *  per the hostile-input rule. */
export const exampleMigration = defineMigration({
	version: 2,
	description: "example: add a default `attempts` count to every deletion tombstone",
	reads: [{ kind: "root", root: "nulo:core:profile-tombstones" }],
	writes: [{ kind: "root", root: "nulo:core:profile-tombstones" }],
	up: async (ctx) => {
		// Declare the PRE-migration shape once via the type parameter. It is an
		// assertion over untrusted JSON, not a validation — keep field access
		// guarded (spread + default below is presence-safe and idempotent).
		type TombstoneRow = { attempts?: number; [k: string]: unknown }
		const rows = await ctx.local.rows<TombstoneRow>("nulo:core:profile-tombstones")
		await ctx.local.setRows<TombstoneRow>(
			"nulo:core:profile-tombstones",
			rows.map(([id, row]) => [id, { attempts: 0, ...row }]),
		)
	},
})
