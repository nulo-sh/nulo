/**
 * Storage ownership for the incoming-transfer surface. Five independent EntityStorage tables under
 * the injected `browserApi.storage.local`:
 *   - `nulo:core:incoming-transfers` keyed by the record `id` (profile+network-scoped, `kind`-
 *     prefixed — `note:…` / `pub:…`; see `noteRecordId`/`publicRecordId`).
 *   - `nulo:core:incoming-trust` keyed by `${profileId}|${networkId}|${contract}`; it also carries
 *     the token's arrival floor.
 *   - `nulo:core:incoming-public-cursors` keyed by `${profileId}|${networkId}|${contract}`.
 *   - `nulo:core:incoming-balance-outbox` keyed by
 *     `${profileId}|${networkId}|${accountAddress}|${tokenId}`.
 *   - `nulo:core:incoming-arrivals` keyed by `${profileId}|${networkId}|${accountAddress}`: the
 *     account's arrival floor and the receipts it has played.
 *
 * Idempotent inserts are an emergent property of keying by a stable PK. Cleanup hooks
 * (`clearProfile`, `clearChain`) iterate the full key space and filter — fine at the cardinality we
 * expect (hundreds of rows per profile, not millions).
 *
 * Every row is sealed under its profile's row keys, and each stored key keeps its kind, profile and
 * network while the keyed hash of the profile replaces what follows (`stores.ts`). A write with a
 * `fence` seals first, then reads the fence, then dispatches with no await between: false writes
 * nothing.
 */

import { commitSealedTogether, type RowKeysSource, type SealedEntityStorage } from "@/wallet/storage/sealed-entity-storage"
import { sealedEntityStorage } from "@/wallet/storage/stores"
import type { MinimalStorageArea } from "@nulo/wallet-core/storage"
import type { BrowserApi } from "@nulo/wallet-core/ports"
import {
	type IncomingBalanceOutboxRow,
	type IncomingTransferRecord,
	type IncomingTrustRecord,
	type IncomingTrustState,
	type PublicScanCursor,
	balanceOutboxKey,
	publicCursorKey,
} from "./spec"
import { type ArrivalRow, arrivalKey } from "./arrival-state"

/** Build a stable key for the trust table. Profile + network + contract are
 *  all stringified to defend against numeric drift. */
export function trustKey(profileId: string, networkId: string, contract: string): string {
	return `${profileId}|${networkId}|${contract}`
}

export class IncomingTransferRepository {
	private readonly local: MinimalStorageArea
	private readonly records: SealedEntityStorage<IncomingTransferRecord>
	private readonly trust: SealedEntityStorage<IncomingTrustRecord>
	private readonly cursors: SealedEntityStorage<PublicScanCursor>
	private readonly outbox: SealedEntityStorage<IncomingBalanceOutboxRow>
	private readonly arrivals: SealedEntityStorage<ArrivalRow>

	public constructor(browserApi: BrowserApi, rowKeys: RowKeysSource) {
		this.local = browserApi.storage.local
		this.records = sealedEntityStorage("incomingTransfers", this.local, rowKeys)
		this.trust = sealedEntityStorage("incomingTrust", this.local, rowKeys)
		this.cursors = sealedEntityStorage("incomingPublicCursors", this.local, rowKeys)
		this.outbox = sealedEntityStorage("incomingBalanceOutbox", this.local, rowKeys)
		this.arrivals = sealedEntityStorage("incomingArrivals", this.local, rowKeys)
	}

	/** Seals `profileId`'s plaintext rows of all five tables, one `withLock` section per row; a row
	 *  commits only while `stillHeld` holds at its commit. */
	public async sealLegacy(profileId: string, withLock: <R>(fn: () => Promise<R>) => Promise<R>, stillHeld: () => boolean): Promise<void> {
		for (const store of [this.trust, this.records, this.cursors, this.outbox, this.arrivals] as const) {
			await (store as SealedEntityStorage<unknown>).sealLegacy(profileId, withLock, () => !stillHeld())
		}
	}

	/** Seals `row` at `id`, then writes it while `fence` (when given) still holds. */
	private async write<T>(store: SealedEntityStorage<T>, id: string, row: T, fence?: () => boolean): Promise<boolean> {
		const prepared = await store.prepare(id, row)
		if (fence && !fence()) return false
		await prepared.commit()
		return true
	}

	/** Removes `id`'s row while `fence` (when given) still holds once its storage keys are resolved. */
	private async remove<T>(store: SealedEntityStorage<T>, id: string, fence?: () => boolean): Promise<boolean> {
		const prepared = await store.prepareDelete(id)
		if (fence && !fence()) return false
		await prepared.commit()
		return true
	}

	// --- Records (keyed by `id`) ---

	public async getRecord(id: string): Promise<IncomingTransferRecord | undefined> {
		return this.records.get(id)
	}

	public async hasRecord(id: string): Promise<boolean> {
		return this.records.contains(id)
	}

	public upsertRecord(record: IncomingTransferRecord, fence?: () => boolean): Promise<boolean> {
		return this.write(this.records, record.id, record, fence)
	}

	public deleteRecord(id: string, fence?: () => boolean): Promise<boolean> {
		return this.remove(this.records, id, fence)
	}

	public async listRecords(): Promise<IncomingTransferRecord[]> {
		return this.records.getValues()
	}

	public async listForAccount(profileId: string, networkId: string, accountAddress: string): Promise<IncomingTransferRecord[]> {
		const all = await this.records.getValues()
		return all.filter((r) => r.profileId === profileId && r.networkId === networkId && r.accountAddress === accountAddress)
	}

	public async listByTxHash(profileId: string, networkId: string, txHash: string): Promise<IncomingTransferRecord[]> {
		const all = await this.records.getValues()
		return all.filter((r) => r.profileId === profileId && r.networkId === networkId && r.txHash === txHash)
	}

	public async listByContract(profileId: string, networkId: string, contract: string): Promise<IncomingTransferRecord[]> {
		const all = await this.records.getValues()
		return all.filter((r) => r.profileId === profileId && r.networkId === networkId && r.contract === contract)
	}

	// --- Trust ---

	public async getTrust(profileId: string, networkId: string, contract: string): Promise<IncomingTrustRecord | undefined> {
		return this.trust.get(trustKey(profileId, networkId, contract))
	}

	/** A state change keeps the stored arrival floor: a floor that moved with the state could fall. */
	public async setTrust(profileId: string, networkId: string, contract: string, state: IncomingTrustState): Promise<IncomingTrustRecord>
	/** With a `fence`: read after the stored row is read and the new one sealed; false writes nothing
	 *  and returns undefined. */
	public async setTrust(
		profileId: string,
		networkId: string,
		contract: string,
		state: IncomingTrustState,
		fence?: () => boolean,
	): Promise<IncomingTrustRecord | undefined>
	public async setTrust(
		profileId: string,
		networkId: string,
		contract: string,
		state: IncomingTrustState,
		fence?: () => boolean,
	): Promise<IncomingTrustRecord | undefined> {
		const stored = await this.getTrust(profileId, networkId, contract)
		const record: IncomingTrustRecord = { profileId, networkId, contract, state, updatedAt: Date.now() }
		if (stored?.arrivalFloor !== undefined) record.arrivalFloor = stored.arrivalFloor
		if (stored?.arrivalFloorPending) record.arrivalFloorPending = true
		return (await this.write(this.trust, trustKey(profileId, networkId, contract), record, fence)) ? record : undefined
	}

	/** Rewrites a trust row the caller has just read, with new floor fields. No read of its own: the
	 *  caller's `fence` is read between the seal and the write. */
	public setArrivalFloor(
		stored: IncomingTrustRecord,
		floor: { arrivalFloor: number | undefined; pending: boolean },
		fence?: () => boolean,
	): Promise<boolean> {
		const { profileId, networkId, contract } = stored
		const record: IncomingTrustRecord = { profileId, networkId, contract, state: stored.state, updatedAt: stored.updatedAt }
		if (floor.arrivalFloor !== undefined) record.arrivalFloor = floor.arrivalFloor
		if (floor.pending) record.arrivalFloorPending = true
		return this.write(this.trust, trustKey(profileId, networkId, contract), record, fence)
	}

	/** Seals `trust` and every record; the returned commit writes them all in ONE `storage.local.set`
	 *  call, dispatched before it returns. The area applies one call as one batch, so a rejected write
	 *  leaves none of the rows written. */
	public async prepareAcceptance(trust: IncomingTrustRecord, records: IncomingTransferRecord[]): Promise<() => Promise<void>> {
		const writes = await Promise.all([
			this.trust.prepare(trustKey(trust.profileId, trust.networkId, trust.contract), trust),
			...records.map((record) => this.records.prepare(record.id, record)),
		])
		return () => commitSealedTogether(this.local, writes)
	}

	public async listTrust(): Promise<IncomingTrustRecord[]> {
		return this.trust.getValues()
	}

	// --- Public-event cursors ---

	public async getCursor(profileId: string, networkId: string, contract: string): Promise<PublicScanCursor | undefined> {
		return this.cursors.get(publicCursorKey(profileId, networkId, contract))
	}

	public setCursor(
		profileId: string,
		networkId: string,
		contract: string,
		cursor: PublicScanCursor,
		fence?: () => boolean,
	): Promise<boolean> {
		return this.write(this.cursors, publicCursorKey(profileId, networkId, contract), cursor, fence)
	}

	public async deleteCursor(profileId: string, networkId: string, contract: string): Promise<void> {
		await this.cursors.delete(publicCursorKey(profileId, networkId, contract))
	}

	public async listCursors(): Promise<Array<[string, PublicScanCursor]>> {
		return this.cursors.getAll()
	}

	// --- Balance-refresh outbox ---

	public async getOutbox(
		profileId: string,
		networkId: string,
		accountAddress: string,
		tokenId: number,
	): Promise<IncomingBalanceOutboxRow | undefined> {
		return this.outbox.get(balanceOutboxKey(profileId, networkId, accountAddress, tokenId))
	}

	public setOutbox(
		profileId: string,
		networkId: string,
		accountAddress: string,
		tokenId: number,
		row: IncomingBalanceOutboxRow,
		fence?: () => boolean,
	): Promise<boolean> {
		return this.write(this.outbox, balanceOutboxKey(profileId, networkId, accountAddress, tokenId), row, fence)
	}

	public deleteOutbox(
		profileId: string,
		networkId: string,
		accountAddress: string,
		tokenId: number,
		fence?: () => boolean,
	): Promise<boolean> {
		return this.remove(this.outbox, balanceOutboxKey(profileId, networkId, accountAddress, tokenId), fence)
	}

	public async listOutbox(): Promise<Array<[string, IncomingBalanceOutboxRow]>> {
		return this.outbox.getAll()
	}

	// --- Arrival rows ---

	public async getArrivalRow(profileId: string, networkId: string, accountAddress: string): Promise<ArrivalRow | undefined> {
		return this.arrivals.get(arrivalKey(profileId, networkId, accountAddress))
	}

	public setArrivalRow(
		profileId: string,
		networkId: string,
		accountAddress: string,
		row: ArrivalRow,
		fence?: () => boolean,
	): Promise<boolean> {
		return this.write(this.arrivals, arrivalKey(profileId, networkId, accountAddress), row, fence)
	}

	public async deleteArrivalRow(profileId: string, networkId: string, accountAddress: string): Promise<void> {
		await this.arrivals.delete(arrivalKey(profileId, networkId, accountAddress))
	}

	// --- Cleanup ---

	/** Delete every record / trust / cursor / outbox / arrival row belonging to `profileId`. Profile-delete fanout. */
	public clearProfile(profileId: string): Promise<void> {
		return this.clearScope(`${profileId}|`)
	}

	/** Delete every record / trust / cursor / outbox / arrival row belonging to `(profileId, networkId)`. Chain-purge fanout. */
	public clearChain(profileId: string, networkId: string): Promise<void> {
		return this.clearScope(`${profileId}|${networkId}|`)
	}

	/** The five tables, in order, by key prefix and never by value: `get()` returns `undefined` for a
	 *  codec-invalid row and keeps it, so a value sweep would leave it behind. Record ids carry a
	 *  `note:`/`pub:` kind prefix; every other key starts with the scope, sealed or not, so the wipe
	 *  needs no row key. */
	private async clearScope(prefix: string): Promise<void> {
		await this.deleteKeysWhere(this.records, (key) => key.startsWith(`note:${prefix}`) || key.startsWith(`pub:${prefix}`))
		await this.deleteKeysWhere(this.trust, (key) => key.startsWith(prefix))
		await this.deleteKeysWhere(this.cursors, (key) => key.startsWith(prefix))
		await this.deleteKeysWhere(this.outbox, (key) => key.startsWith(prefix))
		await this.deleteKeysWhere(this.arrivals, (key) => key.startsWith(prefix))
	}

	/**
	 * Delete rows by KEY prefix across all five tables. Every key embeds `profileId|networkId|…` (record
	 * ids additionally carry a `note:`/`pub:` kind prefix), so a key-prefix match is exact — and it
	 * survives a row that failed codec validation (which `get` reads as `undefined`), where a
	 * value-predicate sweep would silently skip it.
	 */
	private async deleteKeysWhere<T>(store: SealedEntityStorage<T>, pred: (key: string) => boolean): Promise<void> {
		for (const key of await store.getKeys()) {
			if (pred(key)) await store.deleteStorageId(key)
		}
	}
}
