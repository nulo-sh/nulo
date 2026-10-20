/**
 * Storage ownership for `TokenBalanceRaw`.
 *
 * Frozen invariants:
 * - Storage key `nulo:core:token-balances`.
 * - Injected `browserApi.storage.local` (the chrome.storage.local adapter in prod).
 * - IDs are numeric; `allocateId()` delegates to `nextNumericId`, which
 *   allocates max(allocatable ids) + 1 with hostile keys excluded (canonical
 *   round-trip + safe-integer bound; the candidate itself safe and free) —
 *   identical to the old `array_max(map(+)) + 1` on every legitimate store.
 */

import type { EntityStorage } from "@/wallet/storage"
import { entityStorage } from "@/wallet/storage/stores"
import { type NumericIdBatch, nextNumericId, numericIdBatch } from "@/wallet/services/id-allocators"
import { purgeMalformedRows } from "@/wallet/services/purge-rows"
import type { BrowserApi } from "@nulo/wallet-core/ports"
import type { TokenBalanceRaw } from "./spec"

export class BalanceRepository {
	private readonly storage: EntityStorage<TokenBalanceRaw>

	public constructor(browserApi: BrowserApi) {
		this.storage = entityStorage("tokenBalances", browserApi.storage.local)
	}

	public async get(id: number): Promise<TokenBalanceRaw | undefined> {
		return this.storage.get(`${id}`)
	}

	public async getAll(): Promise<TokenBalanceRaw[]> {
		return this.storage.getValues()
	}

	public async set(balance: TokenBalanceRaw): Promise<void> {
		await this.storage.set(`${balance.id}`, balance)
	}

	public async delete(id: number): Promise<void> {
		await this.storage.delete(`${id}`)
	}

	/** Allocate a fresh numeric id via the hardened allocator: max(allocatable
	 *  ids) + 1 on every legitimate store, with hostile keys excluded and a
	 *  safe, physically-free candidate guaranteed (downward gap-fill at the
	 *  hostile boundary). */
	public async allocateId(): Promise<number> {
		return nextNumericId(this.storage)
	}

	/** Allocate a fresh id treating `avoid` (fence-invalidated ids) as
	 *  occupied. Blindly incrementing past a fenced id assumed a forward-
	 *  contiguous free space, which the allocator's hostile-boundary gap-fill
	 *  does not guarantee — a step past the fence could land on (and
	 *  overwrite) a physically occupied key. Feeding the fence in as pseudo-
	 *  keys lets the one allocator resolve occupancy, safety, and the fence
	 *  together. */
	public async allocateIdAvoiding(avoid: ReadonlySet<number>): Promise<number> {
		return (await this.idBatch()).next(avoid)
	}

	/** One listing of the key space for many allocations; valid only while the caller holds the
	 *  allocation lock for the whole batch, since another allocator's write is not in the listing. */
	public async idBatch(): Promise<NumericIdBatch> {
		return numericIdBatch(await this.storage.getKeys())
	}

	/** Raw second pass over the balance rows — the codec-hidden complement
	 *  of `delete`, kept here so storage stays repository-private. */
	public async purgeMalformed(
		matchesRaw: (raw: Record<string, unknown>, storageId: string) => boolean,
		onPurged?: (storageId: string) => void,
		onMatch?: (storageId: string) => void,
	): Promise<number> {
		return purgeMalformedRows(this.storage, matchesRaw, onPurged, onMatch)
	}
}
