import type { ConversionLock, LegacySeal, PreparedWrite, RowKeysSource, SealedEntityStorage } from "@/wallet/storage/sealed-entity-storage"
import { sealedEntityStorage } from "@/wallet/storage/stores"
import type { StorageArea } from "@nulo/wallet-core/ports"
import { accountRowId, accountRowIdOf, type ImportedAccountKey } from "./spec"

/**
 * Storage for imported accounts' encrypted signing keys, 1:1 with the `Account` rows they belong
 * to (same composite `accountRowId`, keyed-hashed alike, so a key row sits at its account's
 * storage id). Kept separate from the Account root so the Account row stays secret-free and the
 * key store has its own backup-slice owner. Each row is sealed under the profile's row keys on top
 * of the signing key's own DEK box.
 */
export class ImportedKeysRepository {
	private readonly storage: SealedEntityStorage<ImportedAccountKey>

	public constructor(storage: StorageArea, rowKeys: RowKeysSource) {
		this.storage = sealedEntityStorage("importedAccountKeys", storage, rowKeys)
	}

	public async get(profileId: string, chainId: number, address: string): Promise<ImportedAccountKey | undefined> {
		const row = await this.storage.get(accountRowId(profileId, chainId, address))
		return row?.profileId === profileId && row.chainId === chainId && row.address === address ? row : undefined
	}

	public async set(row: ImportedAccountKey): Promise<void> {
		await this.storage.set(accountRowIdOf(row), row)
	}

	/** Seals `row`: the caller checks its fence after this resolves and commits with no await. */
	public prepare(row: ImportedAccountKey): Promise<PreparedWrite> {
		return this.storage.prepare(accountRowIdOf(row), row)
	}

	public async delete(profileId: string, chainId: number, address: string): Promise<void> {
		await this.storage.delete(accountRowId(profileId, chainId, address))
	}

	/** All key rows stored under their canonical composite key (ignores stray non-canonical keys). */
	public async liveRows(): Promise<ImportedAccountKey[]> {
		const rows: ImportedAccountKey[] = []
		for (const [key, row] of await this.storage.getAll()) {
			if (key === accountRowIdOf(row)) rows.push(row)
		}
		return rows
	}

	/** All key rows for a profile — used by profile-deletion purge and the orphan sweep. */
	public async forProfile(profileId: string): Promise<ImportedAccountKey[]> {
		return (await this.liveRows()).filter((r) => r.profileId === profileId)
	}

	/** A deletion's removal of one key row: with no row keys, only its plaintext form. */
	public purge(profileId: string, chainId: number, address: string): Promise<void> {
		return this.storage.purgeId(accountRowId(profileId, chainId, address))
	}

	/** Backup: dump this profile's imported-key rows. */
	public async backup(profileId: string): Promise<ImportedAccountKey[]> {
		return this.forProfile(profileId)
	}

	/** The plaintext key row at an account's natural id, prepared to convert in its account's
	 *  commit; none when it is sealed, absent or the profile has no keys. */
	public async legacySealsAt(profileId: string, rowId: string): Promise<LegacySeal[]> {
		const seal = await this.storage.prepareLegacyRow(profileId, rowId)
		return seal ? [seal] : []
	}

	/** Seals the profile's plaintext key rows left once their accounts converted. */
	public sealLegacy(profileId: string, withLock: ConversionLock): Promise<number> {
		return this.storage.sealLegacy(profileId, withLock)
	}
}
