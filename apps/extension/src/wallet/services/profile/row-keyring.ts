import { deriveRowKeys, type MasterSecretBytes, type RowKeys } from "@nulo/wallet-crypto"

/**
 * The row-seal keys of every profile opened in this worker's lifetime, held until the worker ends
 * or the profile is deleted, never dropped at lock or switch: work that lands after a lock (a
 * session-ended journal entry, a broadcast completing for a profile no longer active) must still
 * seal. The keys are non-extractable; the master never lands here.
 *
 * Each entry is bound to the incarnation (`pxeGeneration`) it was derived for, so a profile id
 * reused after a deletion never inherits the dead incarnation's keys.
 */
export class RowKeyring {
	readonly #entries = new Map<string, { generation: string; keys: RowKeys }>()

	/** Synchronous and lock-free: callers read it inside their own locked sections. */
	public get(profileId: string): RowKeys | undefined {
		return this.#entries.get(profileId)?.keys
	}

	public has(profileId: string): boolean {
		return this.#entries.has(profileId)
	}

	public profileIds(): string[] {
		return [...this.#entries.keys()]
	}

	/** Derives and stores the keys of `(profileId, generation)`. Returns `false`, deriving nothing,
	 *  when that incarnation's keys are already held. The master stays caller-owned. */
	public async fill(profileId: string, generation: string, master: MasterSecretBytes): Promise<boolean> {
		if (typeof generation !== "string" || generation === "") {
			throw new Error("profile predates the pxe-generation fence. Reinstall the extension (pre-production, no migration)")
		}
		if (this.#entries.get(profileId)?.generation === generation) return false
		const keys = await deriveRowKeys(master, profileId, generation)
		this.#entries.set(profileId, { generation, keys })
		return true
	}

	public drop(profileId: string): void {
		this.#entries.delete(profileId)
	}
}
