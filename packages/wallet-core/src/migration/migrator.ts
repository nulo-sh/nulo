/**
 * The data-preserving migration engine (pure, `chrome.*`-free).
 *
 * Applies numbered migrations where `version > persisted`, under a durable
 * crash-safe journal so a service-worker kill at ANY point converges on the
 * next boot:
 *
 *   1. set `running`               ← run-scoped UI barrier (whole run, no gaps)
 *   2. per migration N:
 *      a. set `backup={version,refs,entries}` ← single atomic key: all-or-nothing
 *      b. run migration.up()       ← writes accumulate in a staging buffer
 *      c. guard + commit the diff  ← staged keys must be inside declared writes
 *      d. set `version=N`          ← checkpoint (1…N-1 stay durable)
 *      e. clear backup
 *   3. stamp max, clear `running`
 *
 * Resume on boot with `running` set:
 *   - valid backup + `version >= backup.version` ⇒ the commit+stamp completed;
 *     clear the journal WITHOUT restoring (restoring here would silently revert
 *     committed data underneath the new version marker).
 *   - valid backup + `version < backup.version` ⇒ interrupted mid-migration;
 *     restore the declared footprint from the backup, then clear + re-run —
 *     only when the journal's refs equal its registered migration's declared
 *     footprint and every entry lies inside it; otherwise fail closed to
 *     `needs-recovery`, journal kept.
 *   - no backup ⇒ the crash predated any write; clear + proceed.
 *   - PRESENT-but-invalid backup ⇒ tampering/corruption (the backup is written
 *     as one atomic set, so a prep-crash cannot produce a partial one); fail
 *     closed to `needs-recovery`, journal kept.
 *
 * A failure inside a migration restores + clears the journal IMMEDIATELY (not
 * just on the next boot): the boot that continues past a non-breaking failure
 * must not leave `running` set, or every UI storage access would park on the
 * barrier forever. A throw never advances `version`. Durable attempt counters
 * (stored under the engine's own reserved namespace, never inside a footprint)
 * bound both the up() retries and the restore retries across boots.
 *
 * An `up()` still unsettled after `upTimeoutMs` fails like an interrupted one: its staging area
 * is revoked, so it can no longer read the store or have a write committed. The bound covers an
 * `up()` that awaits forever, not one that never yields, nor a store that stops answering.
 *
 * The journal is not authenticated, by decision: no secret exists before unlock, a checksum
 * detects nothing a forger cannot recompute, and whoever can forge the journal can write the same
 * keys directly. Resume confines a restore to the registered footprint, inside which a forged
 * journal can still delete or substitute any key.
 */

import type { Migration, MigrationContext, MigrationResult, MinimalStorageArea, StorageRef } from "./types"
import { StagingArea } from "./staging"
import { errorMessageFromUnknown } from "../utils/errors"

/** The engine's own durable keys. The whole `nulo:schema:` prefix is reserved:
 *  footprints never include it and migrations may not write into it. */
export const SCHEMA_VERSION_KEY = "nulo:schema:version"
export const SCHEMA_RUNNING_KEY = "nulo:schema:running"
const SCHEMA_BACKUP_KEY = "nulo:schema:backup"
/** Exported for the host's boot gate: a build-version invalidation of a
 *  blocked verdict must also reset this durable budget — a new build is a new
 *  episode, and its first failure must not inherit exhausted attempts. */
export const SCHEMA_ATTEMPTS_KEY = "nulo:schema:attempts"
/** Everything under this prefix belongs to the engine: migrations may not
 *  footprint or write it, and adapters (e.g. the backup-import migrator's
 *  scratch read-back) must filter it out of user data. */
export const SCHEMA_RESERVED_PREFIX = "nulo:schema:"
const RESERVED_PREFIX = SCHEMA_RESERVED_PREFIX
/** The forked-app's legacy wipe marker. Its presence is positive evidence of a
 *  non-fresh install (the "reinstall fresh" assumption is violated) → fail closed. */
const LEGACY_VERSION_KEY = "nulo:core:storage-version"

export const RESERVED_KEYS: readonly string[] = [SCHEMA_VERSION_KEY, SCHEMA_RUNNING_KEY, SCHEMA_BACKUP_KEY, SCHEMA_ATTEMPTS_KEY]

const DEFAULT_MAX_RETRIES = 3
/** A policy bound, not a measurement: a data transform over extension storage takes seconds. */
const DEFAULT_UP_TIMEOUT_MS = 60_000

const interruptedMidWrite = (version: number): string => `migration ${version} was interrupted mid-write`
/** The reason once the footprint is restored; it reaches the recovery screen verbatim. */
const interruptedReason = (version: number): string => `${interruptedMidWrite(version)} (restored cleanly)`

/** The watchdog's error: reported as `interruptedReason` only after its restore succeeds. */
class UpTimeoutError extends Error {}

/** Awaits `up()`, or revokes `staging` and throws once `ms` pass first. The abandoned promise
 *  keeps a no-op handler, so its later rejection is never unhandled. */
async function runWithWatchdog(up: () => Promise<void>, staging: StagingArea, ms: number, version: number): Promise<void> {
	const running = up()
	running.catch(() => {})
	let timer: ReturnType<typeof setTimeout> | undefined
	const expired = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			staging.revoke()
			reject(new UpTimeoutError(interruptedMidWrite(version)))
		}, ms)
	})
	try {
		await Promise.race([running, expired])
	} finally {
		clearTimeout(timer)
	}
}

/** `counted` marks a retained journal whose failure has already been recorded
 *  in the attempt counter — the resume path must not count it again. Set
 *  BEFORE the bump wherever a journal outlives a counted failure, so a kill
 *  between the two under-counts (never double-counts: the bias is to never
 *  falsely terminalize). */
type BackupPayload = { version: number; refs: StorageRef[]; entries: Record<string, unknown>; counted?: true }
/** Attempt identity is the VERSION alone: kills, up() throws, and restore
 *  failures of one migration all accumulate on one counter (a per-phase
 *  identity would let alternating failure kinds reset each other forever).
 *  `phase` records the LAST failure's kind, informationally. */
type AttemptRecord = { version: number; phase: "up" | "restore"; count: number }

function isValidRef(r: unknown): r is StorageRef {
	if (typeof r !== "object" || r === null) return false
	const ref = r as { kind?: unknown; root?: unknown; key?: unknown }
	if (ref.kind === "root") return typeof ref.root === "string" && ref.root.length > 0
	if (ref.kind === "value") return typeof ref.key === "string" && ref.key.length > 0
	return false
}

/** Full shape validation: `restore()` trusts these refs to tombstone live keys,
 *  so a malformed ref array from hostile persisted state must never reach it. */
function isValidBackup(v: unknown): v is BackupPayload {
	if (typeof v !== "object" || v === null) return false
	const b = v as Partial<BackupPayload>
	return (
		Number.isInteger(b.version) &&
		Array.isArray(b.refs) &&
		b.refs.every(isValidRef) &&
		typeof b.entries === "object" &&
		b.entries !== null &&
		!Array.isArray(b.entries)
	)
}

/** One text for every journal resume will not trust: the reason reaches the recovery screen
 *  verbatim, and which check refused is a storage-forensics detail. */
const INVALID_JOURNAL: MigrationResult = {
	kind: "needs-recovery",
	reason: "interrupted migration journal has an invalid backup payload",
	retryable: false,
}

const refId = (r: StorageRef): string => (r.kind === "root" ? `root:${r.root}` : `value:${r.key}`)

/** The keys `refs` cover. The engine's namespace is excluded unconditionally:
 *  a migration cannot footprint the journal itself. */
function footprintCovers(refs: StorageRef[]): (key: string) => boolean {
	const roots = refs.flatMap((r) => (r.kind === "root" ? [`${r.root}@`] : []))
	const values = new Set(refs.flatMap((r) => (r.kind === "value" ? [r.key] : [])))
	return (k) => !k.startsWith(RESERVED_PREFIX) && (values.has(k) || roots.some((p) => k.startsWith(p)))
}

export interface MigratorOptions {
	store: MinimalStorageArea
	migrations: Migration[]
	maxRetries?: number
	/** The store's current shape is already at this version (the launch baseline).
	 *  The effective max is `max(baselineVersion, …migration versions)`; fresh
	 *  installs stamp it and run nothing. Default 0. */
	baselineVersion?: number
	/** How long one `up()` may stay unsettled before it fails as interrupted. Default 60 s. */
	upTimeoutMs?: number
}

export class Migrator {
	private readonly store: MinimalStorageArea
	private readonly migrations: Migration[]
	private readonly maxRetries: number
	private readonly maxVersion: number
	private readonly upTimeoutMs: number

	constructor({
		store,
		migrations,
		maxRetries = DEFAULT_MAX_RETRIES,
		baselineVersion = 0,
		upTimeoutMs = DEFAULT_UP_TIMEOUT_MS,
	}: MigratorOptions) {
		this.store = store
		this.maxRetries = maxRetries
		this.upTimeoutMs = upTimeoutMs
		this.migrations = [...migrations].sort((a, b) => a.version - b.version)
		for (let i = 0; i < this.migrations.length; i++) {
			const v = this.migrations[i].version
			if (!Number.isInteger(v) || v < 1) throw new Error(`migration version must be a positive integer, got ${v}`)
			if (i > 0 && v === this.migrations[i - 1].version) throw new Error(`duplicate migration version ${v}`)
		}
		const migMax = this.migrations.length ? this.migrations[this.migrations.length - 1].version : 0
		this.maxVersion = Math.max(baselineVersion, migMax)
	}

	/** Drive persisted storage to the current max version. Idempotent + crash-safe.
	 *  NEVER throws: the host writes the recovery UX off the RETURN value, so a
	 *  thrown storage exception (disk-full, internal chrome.storage error) would
	 *  be the one failure class with no defined recovery. The catch deliberately
	 *  clears NOTHING — a throw can escape the RESUME path while an armed backup
	 *  is load-bearing, and deleting it here would destroy the only copy of the
	 *  pre-migration state. The resume matrix owns journal cleanup and converges
	 *  every stranded shape on the next boot (running-without-backup is cleared,
	 *  an armed backup restores or completes); this session the host's blocked
	 *  status outranks the updating overlay, so no silent wedge either. */
	async run(): Promise<MigrationResult> {
		// Per-RUN flag — run() is reusable, so a bump in an earlier run on the
		// same instance must not mask a later run's genuinely free failure.
		this.attemptRecorded = false
		try {
			return await this.runInner()
		} catch (err) {
			return {
				kind: "needs-recovery",
				reason: `unexpected storage failure during migration: ${errorMessageFromUnknown(err)}`,
				retryable: true,
				// "Free" ONLY when no bump landed this run — a throw can escape
				// after a successful bump (e.g. the journal clear that follows
				// it), and labeling that boot unrecorded would hand the host an
				// extra autonomous retry past the gesture-terminalization bound.
				...(this.attemptRecorded ? {} : { spentAttempt: false as const }),
			}
		}
	}

	private async runInner(): Promise<MigrationResult> {
		const resumed = await this.resumeIfInterrupted()
		if (resumed) return resumed

		const all = await this.store.get()
		const rawVersion = all[SCHEMA_VERSION_KEY]

		if (!(SCHEMA_VERSION_KEY in all)) {
			// No marker. A stale legacy key means a non-fresh install → fail closed.
			if (LEGACY_VERSION_KEY in all) {
				return {
					kind: "needs-recovery",
					reason: `legacy "${LEGACY_VERSION_KEY}" present without a schema version — reinstall for a clean dev state`,
					retryable: false,
				}
			}
			await this.store.set({ [SCHEMA_VERSION_KEY]: this.maxVersion })
			return { kind: "fresh", version: this.maxVersion }
		}

		if (!this.isValidMarker(rawVersion)) {
			return {
				kind: "needs-recovery",
				reason: `corrupt or out-of-range schema version ${JSON.stringify(rawVersion)} (expected 0..${this.maxVersion})`,
				retryable: false,
			}
		}
		const from = rawVersion
		if (from === this.maxVersion) return { kind: "noop", version: from }

		// The barrier spans the WHOLE run: per-migration set/clear would open
		// gaps where a queued UI write lands between two migrations' snapshots.
		await this.store.set({ [SCHEMA_RUNNING_KEY]: this.maxVersion })
		for (const m of this.migrations) {
			if (m.version <= from) continue
			const failure = await this.applyOne(m)
			if (failure) return this.escalateIfLaterPending(failure, m)
		}
		// Reach maxVersion even when a baseline floor sits above the last
		// migration (no bridging migration). Idempotent if already stamped.
		await this.store.set({ [SCHEMA_VERSION_KEY]: this.maxVersion })
		await this.store.remove([SCHEMA_ATTEMPTS_KEY, SCHEMA_RUNNING_KEY])
		return { kind: "migrated", from, to: this.maxVersion }
	}

	/** `breaking: false` promises the code tolerates THAT migration's old shape —
	 *  it says nothing about the LATER migrations a failure would leave
	 *  unapplied (and sequential migrations may depend on the failed one's
	 *  output). A degraded boot is only sound when the failure is the tail. */
	private escalateIfLaterPending(failure: MigrationResult, m: Migration): MigrationResult {
		if (failure.kind !== "failed" || failure.breaking) return failure
		if (!this.migrations.some((x) => x.version > m.version)) return failure
		return {
			...failure,
			breaking: true,
			reason: `${failure.reason} (escalated: later migrations remain unapplied behind the failure)`,
		}
	}

	private isValidMarker(v: unknown): v is number {
		return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= this.maxVersion
	}

	/** One migration under the journal. On failure: restore + clear NOW (this
	 *  boot must not stay barrier-wedged), report with the durable attempt count.
	 *  Returns `undefined` on success. */
	private async applyOne(m: Migration): Promise<MigrationResult | undefined> {
		const refs = [...m.reads, ...m.writes]
		const snapshot = await this.snapshot(await this.footprintKeysFor(refs))
		const backup: BackupPayload = { version: m.version, refs, entries: snapshot }
		await this.store.set({ [SCHEMA_BACKUP_KEY]: backup })

		// Once the version stamp lands the migration IS complete — a failure in
		// the journal cleanup after it must NEVER trigger a restore (that would
		// revert committed data underneath the stamped marker, the exact
		// data-loss shape the crash-resume path guards against, reached via a
		// synchronous remove() rejection instead of a kill).
		let stamped = false
		try {
			const staging = new StagingArea(this.store)
			await runWithWatchdog(() => m.up({ local: staging } satisfies MigrationContext), staging, this.upTimeoutMs, m.version)

			const { sets, removes } = staging.diff()
			this.guardCommit(m, Object.keys(sets).concat(removes))
			if (Object.keys(sets).length) await this.store.set(sets)
			if (removes.length) await this.store.remove(removes)

			await this.store.set({ [SCHEMA_VERSION_KEY]: m.version })
			stamped = true
			await this.store.remove(SCHEMA_BACKUP_KEY)
			return undefined
		} catch (err) {
			if (stamped) {
				// Only the cleanup failed; the next boot's resume sees
				// version >= backup.version and clears without restoring.
				return undefined
			}
			try {
				await this.restore(backup)
			} catch (restoreErr) {
				// Journal kept: the next boot retries the restore (bounded).
				// Marked counted FIRST so the resume path never re-counts this
				// same incident.
				await this.markJournalCounted(backup)
				const attempts = await this.bumpAttempts(m.version, "restore")
				return {
					kind: "needs-recovery",
					reason: `failed to restore after migration ${m.version} failed: ${errorMessageFromUnknown(restoreErr)} (migration error: ${errorMessageFromUnknown(err)})`,
					retryable: attempts < this.maxRetries,
				}
			}
			// Marker → bump → clear, in that order: the journal is still armed
			// here, so the bump must be preceded by the counted stamp — a throw
			// (or kill) after the bump but before the clear would otherwise leave
			// an armed UNcounted journal for the resume to count a second time.
			await this.markJournalCounted(backup)
			const attempts = await this.bumpAttempts(m.version, "up")
			await this.store.remove([SCHEMA_BACKUP_KEY, SCHEMA_RUNNING_KEY])
			return {
				kind: "failed",
				version: m.version,
				breaking: m.breaking,
				reason: err instanceof UpTimeoutError ? interruptedReason(m.version) : errorMessageFromUnknown(err),
				attempts,
				terminal: attempts >= this.maxRetries,
			}
		}
	}

	/** Enforce the declared footprint at commit time: an undeclared write is not
	 *  in the backup and therefore cannot be restored — reject it fail-closed.
	 *  The engine's own namespace is never writable from a migration. */
	private guardCommit(m: Migration, stagedKeys: string[]): void {
		const roots = m.writes.filter((r) => r.kind === "root").map((r) => `${r.root}@`)
		const values = new Set(m.writes.filter((r) => r.kind === "value").map((r) => r.key))
		const offenders = stagedKeys.filter((k) => {
			if (k.startsWith(RESERVED_PREFIX) || k === LEGACY_VERSION_KEY) return true
			return !(values.has(k) || roots.some((p) => k.startsWith(p)))
		})
		if (offenders.length) {
			throw new Error(`migration ${m.version} staged writes outside its declared footprint: ${offenders.join(", ")}`)
		}
	}

	/** Converge an interrupted journal (see the file header for the matrix). */
	private async resumeIfInterrupted(): Promise<MigrationResult | undefined> {
		const j = await this.store.get([SCHEMA_RUNNING_KEY, SCHEMA_BACKUP_KEY, SCHEMA_VERSION_KEY])
		if (!(SCHEMA_RUNNING_KEY in j)) {
			// A backup without the barrier is cleanup debris (a post-stamp
			// remove() that failed): the migration completed, nothing to restore
			// — but the snapshot may hold sensitive rows, so sweep it.
			if (SCHEMA_BACKUP_KEY in j) await this.store.remove(SCHEMA_BACKUP_KEY)
			return undefined
		}

		if (!(SCHEMA_BACKUP_KEY in j)) {
			// Crash predated any backup write — nothing was touched.
			await this.store.remove(SCHEMA_RUNNING_KEY)
			return undefined
		}
		const backup = j[SCHEMA_BACKUP_KEY]
		if (!isValidBackup(backup)) {
			// The backup is written atomically, so partial-from-crash is impossible;
			// an invalid one means tampering or corruption. Keep it, fail closed.
			return INVALID_JOURNAL
		}
		// An armed journal REQUIRES a valid marker AND an in-range backup version
		// (every path that writes the journal starts from a validated marker and
		// a registered migration). Anything else is external mutation — a restore
		// or clear here would mutate hostile state BEFORE the marker table gets
		// to fail closed (e.g. `-1`, `1.5`, `NaN`, or an impossible backup
		// version whose refs restore would trust to tombstone live keys).
		const version = j[SCHEMA_VERSION_KEY]
		if (!this.isValidMarker(version)) {
			return {
				kind: "needs-recovery",
				reason: `interrupted migration journal with a ${version === undefined ? "missing" : "corrupt"} schema version`,
				retryable: false,
			}
		}
		if (backup.version < 1 || backup.version > this.maxVersion) {
			return {
				kind: "needs-recovery",
				reason: `interrupted migration journal backup carries an unregistered version ${backup.version} (expected 1..${this.maxVersion})`,
				retryable: false,
			}
		}
		if (version >= backup.version) {
			// The migration committed + stamped before the crash — restoring now
			// would revert committed data underneath the new version marker.
			await this.store.remove([SCHEMA_BACKUP_KEY, SCHEMA_RUNNING_KEY])
			return undefined
		}
		if (!this.journalMatchesRegistry(backup)) return INVALID_JOURNAL
		try {
			await this.restore(backup)
		} catch (err) {
			await this.markJournalCounted(backup)
			const attempts = await this.bumpAttempts(backup.version, "restore")
			return {
				kind: "needs-recovery",
				reason: `failed to restore backup for interrupted migration ${backup.version}: ${errorMessageFromUnknown(err)}`,
				retryable: attempts < this.maxRetries,
			}
		}
		if (backup.counted !== true) {
			// An armed, uncounted journal means the previous boot's up() was
			// interrupted before it could resolve — count it, then STAND DOWN:
			// one boot's authorization covers at most one up() execution, so the
			// re-attempt belongs to whatever NEXT boot gets authorized (without
			// this, a resumed kill plus this run's own up() would spend two
			// attempts under a single authorization and could terminalize on an
			// autonomous wake). Marker-first + journal-clear-last: any kill in
			// between under-counts once, never double-counts.
			await this.markJournalCounted({ ...backup, counted: true })
			const attempts = await this.bumpAttempts(backup.version, "up")
			await this.store.remove([SCHEMA_BACKUP_KEY, SCHEMA_RUNNING_KEY])
			return {
				kind: "needs-recovery",
				reason: interruptedReason(backup.version),
				retryable: attempts < this.maxRetries,
			}
		}
		// A counted journal's failure is already on the books — resume silently;
		// the run continuing past this point IS this boot's one authorized up().
		await this.store.remove([SCHEMA_BACKUP_KEY, SCHEMA_RUNNING_KEY])
		return undefined
	}

	/** Whether the registered migration of the journal's version could have written it: its refs
	 *  equal that migration's declared footprint and every entry lies inside them. `restore()`
	 *  writes every entry and removes every key the refs cover, so this confines a restore to the
	 *  registered footprint. It does not authenticate the journal: forged entries under matching
	 *  refs still restore. Because of the equality, a shipped migration's footprint is frozen. */
	private journalMatchesRegistry(backup: BackupPayload): boolean {
		const m = this.migrations.find((x) => x.version === backup.version)
		if (!m) return false
		const declared = new Set([...m.reads, ...m.writes].map(refId))
		const journaled = new Set(backup.refs.map(refId))
		if (declared.size !== journaled.size || [...journaled].some((r) => !declared.has(r))) return false
		const covers = footprintCovers(backup.refs)
		return Object.keys(backup.entries).every(covers)
	}

	/** Bring the DECLARED footprint back to its pre-migration state: re-set the
	 *  snapshot, remove footprint keys the interrupted run created. Scanning the
	 *  declared refs (not keys re-inferred from the snapshot) is what catches
	 *  rows created under a root that was EMPTY at backup time, and keeps
	 *  `@`-bearing value keys from being misread as roots. Defense-in-depth: a
	 *  backup entry can never write into the engine's namespace. */
	private async restore(backup: BackupPayload): Promise<void> {
		const entries: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(backup.entries)) {
			if (k.startsWith(RESERVED_PREFIX) || k === LEGACY_VERSION_KEY) continue
			entries[k] = v
		}
		const nowKeys = await this.footprintKeysFor(backup.refs)
		const keep = new Set(Object.keys(entries))
		const toRemove = nowKeys.filter((k) => !keep.has(k))
		if (Object.keys(entries).length) await this.store.set(entries)
		if (toRemove.length) await this.store.remove(toRemove)
	}

	/** True once any bump landed durably in THIS run — `run()`'s catch uses it
	 *  to report `spentAttempt: false` only when genuinely nothing was recorded
	 *  (a throw can escape AFTER a successful bump, e.g. from the journal clear
	 *  that follows it; labeling that boot "free" would hand the host an extra
	 *  autonomous retry and break the gesture-terminalization bound). */
	private attemptRecorded = false

	private async bumpAttempts(version: number, phase: AttemptRecord["phase"]): Promise<number> {
		const cur = (await this.store.get(SCHEMA_ATTEMPTS_KEY))[SCHEMA_ATTEMPTS_KEY] as AttemptRecord | undefined
		// The counter is the terminalization authority — a corrupt persisted
		// count (string, NaN, negative) must reset to a fresh episode, never
		// arithmetic its way into an instant terminal verdict.
		const prior = cur && cur.version === version && Number.isInteger(cur.count) && cur.count >= 0 ? cur.count : 0
		const count = prior + 1
		await this.store.set({ [SCHEMA_ATTEMPTS_KEY]: { version, phase, count } satisfies AttemptRecord })
		this.attemptRecorded = true
		return count
	}

	/** `counted` stamp on a journal that is about to outlive a counted failure.
	 *  NON-swallowing on purpose: a failed stamp must abort the bump (the throw
	 *  escapes to `run()`'s catch, which reports the boot as unrecorded), so the
	 *  incident is counted exactly once by a LATER boot's resume instead of
	 *  possibly twice — never-double beats never-undercount now that the
	 *  attempt-recorded flag keeps the free-failure classification honest. */
	private async markJournalCounted(backup: BackupPayload): Promise<void> {
		await this.store.set({ [SCHEMA_BACKUP_KEY]: { ...backup, counted: true } satisfies BackupPayload })
	}

	private async footprintKeysFor(refs: StorageRef[]): Promise<string[]> {
		return Object.keys(await this.store.get()).filter(footprintCovers(refs))
	}

	private async snapshot(keys: string[]): Promise<Record<string, unknown>> {
		if (!keys.length) return {}
		const got = await this.store.get(keys)
		const out: Record<string, unknown> = {}
		for (const k of keys) if (k in got) out[k] = got[k]
		return out
	}
}
