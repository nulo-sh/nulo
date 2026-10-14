import type { StorageArea } from "@nulo/wallet-core/ports"
import { KeyedLock } from "@nulo/wallet-core/utils"
import { decodeRow } from "@/wallet/utils/raw-row"
import {
	NETWORK_RESET_DONE_ROOT,
	NETWORK_RESET_ROOT,
	ResetJournalSchema,
	ResetNoticeSchema,
	STALE_NETWORKS_ROOT,
	StaleNetworksRecordSchema,
	type ResetJournal,
	type ResetNotice,
	type StaleEntry,
	type StaleNetworksRecord,
} from "./types"

/** Shared by every repository instance, so the classifier, the network service and the reset
 *  service serialize on one lock per profile. A leaf lock: only storage is awaited under it. */
const recordLocks = new KeyedLock({ name: "stale-network" })

const recordKey = (profileId: string) => `${STALE_NETWORKS_ROOT}@${profileId}`
const journalKey = (profileId: string) => `${NETWORK_RESET_ROOT}@${profileId}`
const noticeKey = (profileId: string) => `${NETWORK_RESET_DONE_ROOT}@${profileId}`

export type QuarantineState = { record: StaleNetworksRecord | undefined; journal: ResetJournal | undefined }

/** A chain is quarantined by a record entry or by either end of a reset journal. */
export function quarantinedBy(state: QuarantineState, chainId: number): boolean {
	if (state.record?.entries.some((e) => e.chainId === chainId)) return true
	return state.journal !== undefined && (state.journal.fromChainId === chainId || state.journal.toChainId === chainId)
}

/**
 * The stale-network record, the reset journal and the reset notice, over raw `storage.local`.
 * An undecodable value reads as absent: the record heals at the next classification, and the
 * row-computed network cause keeps a seeded chain quarantined without either.
 */
export class StaleNetworkRepository {
	public constructor(private readonly storage: StorageArea) {}

	public withLock<T>(profileId: string, fn: () => Promise<T>): Promise<T> {
		return recordLocks.withLock(profileId, fn)
	}

	public async readQuarantineState(profileId: string): Promise<QuarantineState> {
		const res = await this.storage.get([recordKey(profileId), journalKey(profileId)])
		return { record: this.decodeRecord(res[recordKey(profileId)]), journal: this.decodeJournal(res[journalKey(profileId)]) }
	}

	public async getRecord(profileId: string): Promise<StaleNetworksRecord | undefined> {
		const res = await this.storage.get(recordKey(profileId))
		return this.decodeRecord(res[recordKey(profileId)])
	}

	public async getJournal(profileId: string): Promise<ResetJournal | undefined> {
		const res = await this.storage.get(journalKey(profileId))
		return this.decodeJournal(res[journalKey(profileId)])
	}

	/**
	 * Writes a full classification only while the profile's account set still has the digest it
	 * was classified from; `currentDigest` is read under the lock. An empty verdict removes the key.
	 * @returns false, having written nothing, when the account set changed.
	 */
	public compareAndSetRecord(record: StaleNetworksRecord, currentDigest: () => Promise<string>): Promise<boolean> {
		return this.withLock(record.profileId, async () => {
			if ((await currentDigest()) !== record.accountSetDigest) return false
			await this.writeRecord(record)
			return true
		})
	}

	/** A runtime verdict for one chain: replaces that chain's entry and keeps every other. */
	public mergeEntry(profileId: string, entry: StaleEntry, accountSetDigest: string): Promise<void> {
		return this.withLock(profileId, async () => {
			const prior = await this.getRecord(profileId)
			const entries = (prior?.entries ?? []).filter((e) => e.chainId !== entry.chainId)
			await this.writeRecord({
				profileId,
				accountSetDigest: prior?.accountSetDigest ?? accountSetDigest,
				entries: [...entries, entry],
			})
		})
	}

	/** Caller holds the lock. */
	public async removeEntryLocked(profileId: string, networkId: string): Promise<void> {
		const prior = await this.getRecord(profileId)
		if (!prior) return
		await this.writeRecord({ ...prior, entries: prior.entries.filter((e) => e.networkId !== networkId) })
	}

	/** Caller holds the lock. */
	public async setJournalLocked(journal: ResetJournal): Promise<void> {
		await this.storage.set({ [journalKey(journal.profileId)]: JSON.stringify(journal) })
	}

	/** Caller holds the lock. */
	public async deleteJournalLocked(profileId: string): Promise<void> {
		await this.storage.remove(journalKey(profileId))
	}

	/** Caller holds the lock. */
	public async setNoticeLocked(profileId: string, notice: ResetNotice): Promise<void> {
		await this.storage.set({ [noticeKey(profileId)]: JSON.stringify(notice) })
	}

	/** Returns the notice once and deletes it; nothing while that network's journal still exists,
	 *  so a run interrupted between the two writes cannot announce before it finishes. */
	public takeNotice(profileId: string): Promise<ResetNotice | null> {
		return this.withLock(profileId, async () => {
			const res = await this.storage.get([noticeKey(profileId), journalKey(profileId)])
			const notice = decodeRow(ResetNoticeSchema, res[noticeKey(profileId)])
			if (notice.kind === "absent") return null
			const journal = this.decodeJournal(res[journalKey(profileId)])
			if (notice.kind === "valid" && journal?.networkId === notice.value.networkId) return null
			await this.storage.remove(noticeKey(profileId))
			return notice.kind === "valid" ? notice.value : null
		})
	}

	/** Profile deletion: all three keys. */
	public clearProfile(profileId: string): Promise<void> {
		return this.withLock(profileId, () => this.storage.remove([recordKey(profileId), journalKey(profileId), noticeKey(profileId)]))
	}

	private async writeRecord(record: StaleNetworksRecord): Promise<void> {
		if (record.entries.length === 0) await this.storage.remove(recordKey(record.profileId))
		else await this.storage.set({ [recordKey(record.profileId)]: JSON.stringify(record) })
	}

	private decodeRecord(raw: unknown): StaleNetworksRecord | undefined {
		const row = decodeRow(StaleNetworksRecordSchema, raw)
		return row.kind === "valid" ? row.value : undefined
	}

	private decodeJournal(raw: unknown): ResetJournal | undefined {
		const row = decodeRow(ResetJournalSchema, raw)
		return row.kind === "valid" ? row.value : undefined
	}
}
