import { z } from "zod"
import type { StorageArea } from "@nulo/wallet-core/ports"
import { prefixedEntries } from "@nulo/wallet-core/storage"
import { decodeRow } from "@/wallet/utils/raw-row"

export const PROFILE_TOMBSTONE_ROOT = "nulo:core:profile-tombstones"

/**
 * A profile-deletion tombstone: written UNDER the facade lock before the profile
 * row is deleted, cleared only after every purge succeeds. It reserves the
 * profile id against reuse and carries the exact `Account[]`/`Token[]`/`Network[]`
 * snapshot the coordinator needs to finish (or resume) cleanup even after the
 * source rows are gone.
 */
export const TombstoneSchema = z.object({
	profileId: z.string(),
	addresses: z.array(z.string()),
	tokenIds: z.array(z.number()),
	networkIds: z.array(z.string()),
	/** Deletion epoch captured when the tombstone was written (fencing + clear-guard). */
	epoch: z.number(),
	/** The incarnation generation being erased — carried so a RESUMED deletion
	 *  still fences its PXE clear after the profile row is gone. */
	pxeGeneration: z.string(),
})
export type Tombstone = z.infer<typeof TombstoneSchema>

/**
 * Durable delete-in-progress markers over RAW `storage.local`.
 *
 * Deliberately NOT an `EntityStorage`: a corrupt tombstone must still RESERVE
 * its id, and `EntityStorage`'s codec-filtered reads (`getValues()`/`get()`)
 * hide an undecodable row — its id would stop being reserved (id-reuse fails
 * OPEN → successor-clobber). (`decodeRow` no longer deletes such rows, but the
 * hiding alone still disqualifies it here.) This
 * repo NEVER removes a row it can't decode: `reservedIds()` derives ids from
 * RAW keys (no decode), so a corrupt tombstone still reserves its id; only
 * `validPayloads()` (valid rows) drive cleanup. A row is valid only when its
 * `profileId` equals the id in its key: a misfiled row is corrupt, reserved
 * under its key's id and never steering a deletion of the id it names.
 */
export class TombstoneRepository {
	public constructor(private readonly storage: StorageArea) {}

	private key(id: string): string {
		return `${PROFILE_TOMBSTONE_ROOT}@${id}`
	}

	public async write(t: Tombstone): Promise<void> {
		await this.storage.set({ [this.key(t.profileId)]: JSON.stringify(t) })
	}

	private decode(id: string, raw: unknown): Tombstone | undefined {
		const row = decodeRow(TombstoneSchema, raw)
		return row.kind === "valid" && row.value.profileId === id ? row.value : undefined
	}

	public async get(id: string): Promise<Tombstone | undefined> {
		return this.decode(id, (await this.storage.get(this.key(id)))[this.key(id)])
	}

	/** Removes the row only if it is valid and of `epoch` (a concurrent re-deletion's
	 *  marker survives). Resolves `true` iff no row remains under `id`'s key, the one
	 *  condition under which its reservation may be released: every boot re-reserves
	 *  from the raw keys, so a kept corrupt row must keep the id reserved now too. */
	public async clearIfSame(id: string, epoch: number): Promise<boolean> {
		const raw = (await this.storage.get(this.key(id)))[this.key(id)]
		if (raw === undefined) return true
		if (this.decode(id, raw)?.epoch !== epoch) return false
		await this.storage.remove(this.key(id))
		return true
	}

	/** RESERVED ids from RAW keys — NEVER decodes, so a corrupt tombstone still
	 *  reserves its id (fail-CLOSED against id-reuse). */
	public async reservedIds(): Promise<Set<string>> {
		return new Set(prefixedEntries(await this.storage.get(), `${PROFILE_TOMBSTONE_ROOT}@`).map(([, id]) => id))
	}

	/** VALID payloads only (drives resume/cleanup) — skips a corrupt row but
	 *  NEVER removes it (it stays reserved + surfaces "deletion pending"). */
	public async validPayloads(): Promise<Tombstone[]> {
		const out: Tombstone[] = []
		for (const [, id, v] of prefixedEntries(await this.storage.get(), `${PROFILE_TOMBSTONE_ROOT}@`)) {
			const t = this.decode(id, v)
			if (t) out.push(t)
		}
		return out
	}

	/** TELEMETRY only: ids whose raw row EXISTS but can NOT be decoded — reserved
	 *  (the id stays locked, fail-CLOSED) but un-resumable, so cleanup can't finish
	 *  automatically. Surfaced at resume for manual recovery. It is NEVER dropped:
	 *  a corrupt tombstone whose profile row is absent is a phase-1-done,
	 *  purge-PENDING deletion (the tombstone is written BEFORE the row is deleted),
	 *  so auto-dropping it would fail OPEN — abandoning a real in-progress deletion
	 *  + reopening the id for reuse. */
	public async corruptIds(): Promise<string[]> {
		return prefixedEntries(await this.storage.get(), `${PROFILE_TOMBSTONE_ROOT}@`)
			.filter(([, id, v]) => this.decode(id, v) === undefined)
			.map(([, id]) => id)
	}
}
