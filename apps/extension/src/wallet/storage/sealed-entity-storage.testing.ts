import { EventHandler } from "@nulo/wallet-core/utils"
import { asMasterSecretBytes, deriveRowKeys, type RowKeys } from "@nulo/wallet-crypto"
import type { RowKeysSource } from "./sealed-entity-storage"

/** Row keys for tests, as a worker's keyring holds them: derived from one fixed master per
 *  unlocked profile; a profile never unlocked, or dropped, has none. */
export class TestRowKeys {
	readonly #keys = new Map<string, RowKeys>()

	public readonly source: RowKeysSource = (profileId) => this.#keys.get(profileId)

	public async unlock(...profileIds: string[]): Promise<this> {
		const master = asMasterSecretBytes(new Uint8Array(32).fill(0x2a) as Uint8Array<ArrayBuffer>)
		for (const id of profileIds) this.#keys.set(id, await deriveRowKeys(master, id, "test-generation"))
		return this
	}

	public drop(profileId: string): void {
		this.#keys.delete(profileId)
	}
}

/** The row-key surface of `ProfileService` for a fake that stands one key for every profile, as
 *  these fakes' single MAC key does: every profile is unlocked, and the conversion event is inert
 *  until a test fires it. */
export async function rowKeysForEveryProfile(): Promise<{ rowKeys: RowKeysSource; onRowKeysReady: EventHandler<string> }> {
	const keys = await deriveRowKeys(
		asMasterSecretBytes(new Uint8Array(32).fill(0x2b) as Uint8Array<ArrayBuffer>),
		"any",
		"test-generation",
	)
	return { rowKeys: () => keys, onRowKeysReady: new EventHandler<string>() }
}
