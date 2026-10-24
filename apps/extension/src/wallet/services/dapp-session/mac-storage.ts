import { type ILogger, LogLevel } from "@/wallet/logger"
import type { ConversionLock, PreparedWrite, SealedEntityStorage } from "@/wallet/storage/sealed-entity-storage"
import { signDappSession, verifyDappSession } from "./integrity"
import type { DappSession } from "./spec"

/** Derives the per-profile MAC `CryptoKey`; throws when the profile is locked. */
type MacKeyProvider = (profileId: string) => Promise<CryptoKey>

/**
 * MAC-verifying wrapper over the sealed `DappSession` store.
 *
 * The seal hides a row and binds it to its storage key, but its key is master-only, which a
 * same-phrase sibling profile also derives; the MAC, keyed by `master ‖ dek`, is what stops that
 * sibling forging a grant. So every row is signed on write and verified on read, inside the seal.
 * A row that is **tampered** (mac mismatch) or has **no mac** (unsigned / wipe-reseed) is DROPPED
 * and quarantine-deleted at the key it was read from. When the profile is **locked** (the key
 * provider throws) the row is hidden but NOT deleted, since it is legitimate and verifies again
 * after unlock — fail-closed: a locked read yields no sessions, never a broadened grant. A sealed
 * row whose profile has no row keys never reaches this layer.
 *
 * Presents exactly the subset of the store surface that `DappSessionService` uses, so its call
 * sites are unchanged.
 */
export class DappSessionMacStorage {
	constructor(
		private readonly inner: SealedEntityStorage<DappSession>,
		private readonly keyFor: MacKeyProvider,
		private readonly logger: ILogger,
	) {}

	/** Signs and seals `session`; the caller commits after its own checks, with no `await` between. */
	public async prepare(id: string, session: DappSession): Promise<PreparedWrite> {
		const key = await this.keyFor(session.profileId)
		const { mac: _drop, ...signable } = session
		const mac = await signDappSession(key, signable)
		return this.inner.prepare(id, { ...signable, mac } as DappSession)
	}

	public async set(id: string, session: DappSession): Promise<void> {
		await (await this.prepare(id, session)).commit()
	}

	public async get(id: string): Promise<DappSession | undefined> {
		return this.verifyOrDrop(id, await this.inner.get(id))
	}

	public async getValues(): Promise<DappSession[]> {
		const out: DappSession[] = []
		for (const [storageId, row] of await this.inner.getAll()) {
			const verified = await this.verifyOrDrop(storageId, row)
			if (verified) out.push(verified)
		}
		return out
	}

	public async contains(id: string): Promise<boolean> {
		return (await this.get(id)) !== undefined
	}

	public delete(id: string): Promise<void> {
		return this.inner.delete(id)
	}

	/**
	 * Every row belonging to `profileId`, as `{storageId, row}`, for a maintenance delete. Sealed
	 * rows are opened with the row keys and every row is read with no codec and no MAC check —
	 * three reasons the MAC view (`getValues()`) is unsafe for a delete-by-profile:
	 *
	 *  1. It runs the MAC key provider, which THROWS for an INACTIVE profile (the
	 *     common deletion case) → rows hidden, left behind, revived on re-import.
	 *  2. It runs the codec, which KEEPS-but-hides a schema-invalid row → a row
	 *     with `profileId=P` but e.g. a missing field survives the profile purge.
	 *  3. It has no key info, so a caller would delete by the row's SELF-REPORTED
	 *     `id`; a valid row copied to a different storage key (alias) would not be
	 *     removed and would re-verify after a same-secret re-import.
	 *
	 * Deletion needs no authorization proof. `keyless` names the profile's sealed rows the scan had
	 * no row keys for, `unopened` the ones its keys refused (tampered): their fields cannot be read,
	 * but their envelope still names the profile, so a delete by profile alone removes them too.
	 */
	public async rowsForProfile(
		profileId: string,
	): Promise<{ rows: Array<{ storageId: string; row: DappSession }>; unopened: string[]; keyless: string[] }> {
		const { rows, unopened, keyless } = await this.inner.rawRowsOf(profileId)
		return {
			rows: rows.filter(({ row }) => typeof row === "object" && row !== null) as Array<{ storageId: string; row: DappSession }>,
			unopened,
			keyless,
		}
	}

	/** Seals `profileId`'s plaintext rows byte for byte, MAC included and unchecked: every read
	 *  still verifies it, and recovery mode, which has no MAC key, converts too. */
	public sealLegacy(profileId: string, withLock: ConversionLock): Promise<number> {
		return this.inner.sealLegacy(profileId, withLock)
	}

	private async verifyOrDrop(storageId: string, row: DappSession | undefined): Promise<DappSession | undefined> {
		if (!row) return undefined
		const { mac, ...signable } = row
		if (!mac) {
			this.drop(storageId, "missing integrity mac")
			return undefined
		}
		let key: CryptoKey
		try {
			key = await this.keyFor(row.profileId)
		} catch {
			// Locked (or wrong active profile): can't verify → hide, but do NOT
			// delete (the row is legitimate and verifies after unlock).
			return undefined
		}
		if (!(await verifyDappSession(key, signable, mac))) {
			this.drop(storageId, "integrity mac mismatch (tampered)")
			return undefined
		}
		return row
	}

	/** Deletes the row at the storage id it was read from, never at the id it claims. */
	private drop(storageId: string, reason: string): void {
		this.logger.log("dapp-session", LogLevel.Warn, `Dropping DappSession row "${storageId}" — ${reason}`)
		void this.inner.delete(storageId).catch(() => {})
	}
}
