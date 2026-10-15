/**
 * The reminder a full-backup restore leaves for the networks whose account state it did not
 * restore: one record per profile, read by Home's banner and settled by the restore run that armed
 * it. Every write runs under one Web Lock per profile, so pages never interleave a read and a write;
 * the worker's own removals (a row commit, a profile deletion) take no part in it.
 */
import { storageLocalGet, storageLocalRemove, storageLocalSet } from "@/utils/storage"
import { restoreOutcomeKey } from "@/utils/profile-ui-keys"

/** The networks one restore run has not restored. */
export type RestoreOutcome = {
	/** The run that armed the record; only that run settles it. */
	run: string
	/** The verified checksum of the backup that armed it: Restore again takes no other file. */
	backup: string
	networkIds: string[]
	/** While in the future, a run is restoring these networks and the reminder stays hidden. */
	leaseUntil: number
}

/** A run's whole tail fits its 45 s budget; the slack covers the writes around it. */
export const RESTORE_OUTCOME_LEASE_MS = 60_000

const MAX_NETWORK_IDS = 64
const MAX_NETWORK_ID_LENGTH = 64

function decode(raw: unknown): RestoreOutcome | undefined {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined
	const { run, backup, networkIds, leaseUntil } = raw as Record<string, unknown>
	if (typeof run !== "string" || !/^[0-9a-f]{32}$/.test(run)) return undefined
	if (typeof backup !== "string" || !/^[0-9a-f]{64}$/.test(backup)) return undefined
	if (!Array.isArray(networkIds) || networkIds.length === 0 || networkIds.length > MAX_NETWORK_IDS) return undefined
	if (!networkIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= MAX_NETWORK_ID_LENGTH)) return undefined
	if (typeof leaseUntil !== "number" || !Number.isFinite(leaseUntil)) return undefined
	return { run, backup, networkIds: [...networkIds], leaseUntil }
}

function withLock<T>(profileId: string, fn: () => Promise<T>): Promise<T> {
	return navigator.locks.request(`nulo:restoreOutcome@${profileId}`, fn)
}

/** The stored record, removing a malformed one; the caller holds the lock. */
async function readHoldingLock(profileId: string): Promise<RestoreOutcome | undefined> {
	const key = restoreOutcomeKey(profileId)
	const raw = (await storageLocalGet(key))[key]
	if (raw === undefined) return undefined
	const record = decode(raw)
	if (!record) await storageLocalRemove(key)
	return record
}

function newRunToken(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/**
 * Records that a run is about to restore `networkIds` from the backup whose checksum is `backup`,
 * replacing any earlier record, and returns the run's token. Arms nothing for no network.
 */
export async function armRestoreOutcome(profileId: string, backup: string, networkIds: string[]): Promise<string | undefined> {
	const ids = [...new Set(networkIds)]
	if (ids.length === 0) return undefined
	const record: RestoreOutcome = { run: newRunToken(), backup, networkIds: ids, leaseUntil: Date.now() + RESTORE_OUTCOME_LEASE_MS }
	if (!decode(record)) throw new Error("restore outcome out of bounds")
	await withLock(profileId, () => storageLocalSet({ [restoreOutcomeKey(profileId)]: record }))
	return record.run
}

/**
 * Lets `run` start restoring: renews its lease and returns the current record. Returns `undefined`,
 * writing nothing, once the record is gone or another run's.
 */
export function admitRestoreOutcome(profileId: string, run: string): Promise<RestoreOutcome | undefined> {
	return withLock(profileId, async () => {
		const record = await readHoldingLock(profileId)
		if (record?.run !== run) return undefined
		const admitted = { ...record, leaseUntil: Date.now() + RESTORE_OUTCOME_LEASE_MS }
		await storageLocalSet({ [restoreOutcomeKey(profileId)]: admitted })
		return admitted
	})
}

/** Ends `run`: drops the networks it restored and releases its lease; an emptied record goes. */
export function finishRestoreOutcome(profileId: string, run: string, restoredIds: readonly string[]): Promise<void> {
	return withLock(profileId, async () => {
		const record = await readHoldingLock(profileId)
		if (record?.run !== run) return
		const restored = new Set(restoredIds)
		const networkIds = record.networkIds.filter((id) => !restored.has(id))
		const key = restoreOutcomeKey(profileId)
		if (networkIds.length === 0) await storageLocalRemove(key)
		else await storageLocalSet({ [key]: { ...record, networkIds, leaseUntil: 0 } })
	})
}

/** Dismiss: the reminder goes, whatever run armed it. */
export function clearRestoreOutcome(profileId: string): Promise<void> {
	return withLock(profileId, () => storageLocalRemove(restoreOutcomeKey(profileId)))
}

/**
 * The profile's record, with a lease further ahead than any run takes read as ended. Never removes
 * a well-formed record: whether its networks still exist is the reader's to judge.
 */
export async function readRestoreOutcome(profileId: string, now = Date.now()): Promise<RestoreOutcome | undefined> {
	const key = restoreOutcomeKey(profileId)
	const raw = (await storageLocalGet(key))[key]
	if (raw === undefined) return undefined
	const record = decode(raw) ?? (await withLock(profileId, () => readHoldingLock(profileId)))
	if (!record) return undefined
	return record.leaseUntil > now + RESTORE_OUTCOME_LEASE_MS ? { ...record, leaseUntil: 0 } : record
}
