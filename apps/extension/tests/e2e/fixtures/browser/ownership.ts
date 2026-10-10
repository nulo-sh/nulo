import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { E2E_DATA_ROOT } from "../../lockfile"
import {
	MARKER_SHAPE,
	type RecordedProcess,
	type SweepOptions,
	newMarker,
	orphanedLaunch,
	readStartTime,
	selfLaunch,
	sweep,
} from "../../owned-processes"

/**
 * Ownership records for launched WebDriver processes.
 *
 * Many agents share this host, so teardown must kill exactly what this launch started and nothing
 * else: no `pkill -f geckodriver`, which would take down a neighbour's run and leave it believing
 * its browser crashed. Identity is the launch marker of `owned-processes.ts`, which every process
 * the launch starts inherits together with its owner.
 *
 * Records live on real disk, not tmpfs: a run killed before teardown must leave a record the next
 * run can read, and a profile directory under `/tmp` would be RAM-backed and pinned open by the
 * very process that failed to exit.
 */

const RECORD_ROOT = path.join(E2E_DATA_ROOT, "webdriver-owned")

/** The only place a driver creates profiles, and so the only place teardown may delete one. */
const PROFILE_ROOT = path.join(E2E_DATA_ROOT, "firefox-profiles")
const PROFILE_PREFIX = "profile-"
const PROFILE_MARKER_FILE = ".nulo-launch"

export const newLaunchMarker = newMarker

export interface LaunchOwnership {
	marker: string
	/** The process we spawned, 0 until it exists. Never an identity for a signal. */
	pid: number
	/** Its `/proc` start time: what tells it from a later holder of its pid. */
	pidStartTime?: string
	/** The test run that spawned it. A record whose owner is still alive belongs to a run in
	 *  progress — possibly another agent's — and is never an orphan. Pid plus start time is sound
	 *  here where it is not for the launch, because the owner is only ever COMPARED, never
	 *  signalled: a reissued pid cannot share the tick its predecessor started on, and with no
	 *  signal there is no gap between the read and an action for a reissue to fall into. */
	ownerPid: number
	ownerStartTime: string
	profileDir: string
	/** False when the caller supplied the directory. A relaunch-on-the-same-profile test owns its
	 *  dir and its whole point is that the data survives teardown, so deleting it is destroying
	 *  the fixture, not cleaning up after it. */
	ownsProfile: boolean
	label: string
}

/** Throws rather than record an owner it could not identify: that record would read as orphaned
 *  to every other run on the host, and be reaped under its live owner. */
export function ownedByThisRun(record: Omit<LaunchOwnership, "ownerPid" | "ownerStartTime">): LaunchOwnership {
	const ownerStartTime = readStartTime(process.pid)
	if (!ownerStartTime) throw new Error("cannot read this run's start time — refusing to record a launch it could not be shown to own")
	return { ...record, ownerPid: process.pid, ownerStartTime }
}

/** A profile stamped with the launch that will own it, so a record cannot claim another's. */
export function newProfileDir(marker: string): string {
	mkdirSync(PROFILE_ROOT, { recursive: true })
	const dir = mkdtempSync(path.join(PROFILE_ROOT, PROFILE_PREFIX))
	try {
		writeFileSync(path.join(dir, PROFILE_MARKER_FILE), marker, "utf8")
	} catch (err) {
		// Unstamped, no record could ever claim it, so nothing later would remove it.
		rmSync(dir, { recursive: true, force: true })
		throw err
	}
	return dir
}

/**
 * The canonical path to delete, or `undefined` if this record has no right to one. A record is a
 * file any process on this host can write and it names a directory to remove recursively, so
 * the claim is checked against the filesystem rather than the string: resolved through symlinks,
 * directly inside the profile root, and stamped with this launch's own marker — which also stops
 * a record naming another live launch's perfectly well-formed profile.
 */
function deletableProfile(record: LaunchOwnership): string | undefined {
	try {
		const real = realpathSync(record.profileDir)
		if (path.dirname(real) !== realpathSync(PROFILE_ROOT) || !path.basename(real).startsWith(PROFILE_PREFIX)) return undefined
		return readFileSync(path.join(real, PROFILE_MARKER_FILE), "utf8") === record.marker ? real : undefined
	} catch {
		return undefined
	}
}

function isRecord(value: unknown): value is LaunchOwnership {
	const r = value as Partial<LaunchOwnership> | null
	return (
		typeof r === "object" &&
		r !== null &&
		typeof r.marker === "string" &&
		MARKER_SHAPE.test(r.marker) &&
		Number.isInteger(r.pid) &&
		(r.pidStartTime === undefined || typeof r.pidStartTime === "string") &&
		Number.isInteger(r.ownerPid) &&
		typeof r.ownerStartTime === "string" &&
		typeof r.profileDir === "string" &&
		typeof r.ownsProfile === "boolean" &&
		typeof r.label === "string"
	)
}

const recordFile = (record: Pick<LaunchOwnership, "marker">): string => path.join(RECORD_ROOT, `${record.marker}.json`)

/** `undefined` for anything that is not a well-formed record filed under its own marker. */
function readRecord(file: string): LaunchOwnership | undefined {
	try {
		const parsed: unknown = JSON.parse(readFileSync(path.join(RECORD_ROOT, file), "utf8"))
		return isRecord(parsed) && file === `${parsed.marker}.json` ? parsed : undefined
	} catch {
		return undefined
	}
}

export function recordLaunch(record: LaunchOwnership): void {
	mkdirSync(RECORD_ROOT, { recursive: true })
	const tmp = `${recordFile(record)}.tmp`
	writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, "utf8")
	renameSync(tmp, recordFile(record))
}

function recordFiles(): string[] {
	try {
		return readdirSync(RECORD_ROOT).filter((f) => f.endsWith(".json"))
	} catch {
		return []
	}
}

/** Persisted, not just set: a sweep reads the record from disk, and a run that dies before its
 *  own cleanup would otherwise leave one that still authorises deleting the profile. */
export function disownProfile(record: LaunchOwnership): void {
	record.ownsProfile = false
	recordLaunch(record)
}

/** Every well-formed record on disk, this run's and other runs'. */
export function listOwnedLaunches(): LaunchOwnership[] {
	return recordFiles().flatMap((file) => readRecord(file) ?? [])
}

/**
 * Stop the launch's processes and only then delete the profile. Deleting a profile a live Firefox
 * still holds open leaves the store pinned as a deleted-but-open file, which is how a reaper turns
 * one failed run into host-wide memory pressure. `self` releases a launch this process owns; an
 * `orphan` release signals only processes whose own owner is dead, whatever the record says.
 */
export async function releaseLaunch(record: LaunchOwnership, mode: "self" | "orphan" = "self", opts: SweepOptions = {}): Promise<boolean> {
	const recorded: RecordedProcess[] = record.pidStartTime ? [{ pid: record.pid, startTime: record.pidStartTime }] : []
	const status = await sweep(mode === "self" ? selfLaunch(record.marker) : orphanedLaunch(record.marker), { ...opts, recorded })
	// A process that outlived SIGKILL, one still owned by a live run, or one nobody could read: the
	// profile stays, the lesser harm, and the record survives for the next sweep.
	if (status !== "stopped") {
		console.warn(`[firefox] ${record.label}: processes ${status}; its profile and record are kept`)
		return false
	}
	const profile = record.ownsProfile ? deletableProfile(record) : undefined
	if (profile) rmSync(profile, { recursive: true, force: true })
	rmSync(recordFile(record), { force: true })
	return true
}

/** A `/proc` that cannot answer is no evidence the owner died. */
function ownerLives(record: LaunchOwnership): boolean {
	try {
		return readStartTime(record.ownerPid) === record.ownerStartTime
	} catch {
		return true
	}
}

/**
 * Sweep records whose owning test run is gone. A record whose owner is still alive belongs to a
 * run in progress — very often another agent on this host — and killing it would look to that run
 * exactly like its browser crashing, which is the failure this whole module exists to prevent.
 */
export async function reapOrphanLaunches(): Promise<string[]> {
	const reaped: string[] = []
	for (const file of recordFiles()) {
		const record = readRecord(file)
		if (!record) {
			// Unreadable or misfiled: it identifies nothing that could be safely signalled or deleted.
			rmSync(path.join(RECORD_ROOT, file), { force: true })
			continue
		}
		if (ownerLives(record)) continue
		if (await releaseLaunch(record, "orphan")) reaped.push(record.label)
	}
	return reaped
}
