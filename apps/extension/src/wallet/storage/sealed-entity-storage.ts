/**
 * A profile-scoped root whose rows are sealed at rest: each stored value is the JSON envelope
 * `{ profileId, sealed }`, `sealed` being the row-seal frame of the row under its profile's row
 * keys, bound to the root, the storage key and the profile. Rows written before the root was sealed
 * stay plaintext until their profile's next unlock converts them (`sealLegacy`); until then they
 * read as they always did (the dual read).
 *
 * Every refusal keeps the row, as `EntityStorage` keeps a codec failure: reads never delete. A
 * sealed row of a profile with no keys in this worker reads as absent; one that fails to open, or
 * opens to another profile's row, reads as absent and logs a fixed category with no content.
 */
import type { EntityStorage, MinimalStorageArea } from "@nulo/wallet-core/storage"
import { prefixedEntries } from "@nulo/wallet-core/storage"
import { keyedSegment, openRow, type RowKeys, sealRow } from "@nulo/wallet-crypto"
import { WalletLockedError } from "@/wallet/services/profile/wallet-locked-error"

/** The row keys of a profile opened in this worker, or `undefined`. Synchronous. */
export type RowKeysSource = (profileId: string) => RowKeys | undefined

/** A stored value of a sealed root once sealed. A legacy row of a sealed root never has exactly
 *  these two string fields: no sealed root's schema has a `sealed` field. */
export type SealedEnvelope = { profileId: string; sealed: string }

export function parseEnvelope(parsed: unknown): SealedEnvelope | undefined {
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined
	const keys = Object.keys(parsed)
	const { profileId, sealed } = parsed as Record<string, unknown>
	if (keys.length !== 2 || typeof profileId !== "string" || typeof sealed !== "string") return undefined
	return { profileId, sealed }
}

/** How a keyed root names a row: its storage id keeps the scope segments of the natural id and
 *  replaces each address or hash segment with the profile's keyed hash of it. */
export type KeyedIds = { physicalId(naturalId: string, hash: (segment: string) => Promise<string>): Promise<string> }

export type SealedRootOptions = {
	/** The profile a row belongs to, read from the parsed row or its natural id. Default:
	 *  `row.profileId`. Must accept anything a raw legacy row parses to. */
	ownerOf?: (row: unknown, naturalId: string) => string | undefined
	keyed?: KeyedIds
	/** Keyed roots only. A legacy row that names no profile stays plaintext at its natural id: no
	 *  profile's keys may seal it while its owner is unknown, so every profile's lookup of that id
	 *  finds it. Such a row is updated in place; nothing creates one. */
	ownerless?: "plaintext"
}

/** One sealed write, prepared: the caller runs its own liveness checks after `prepare` resolves
 *  and then calls `commit` with no `await` in between, so nothing interleaves after a check. */
export type PreparedWrite = { items: Record<string, string>; commit(): Promise<void> }

/** Where a readable row is stored: its storage id, the natural id it answers to, the profile it
 *  belongs to (none for an ownerless row) and whether it is sealed. */
export type Located = { storageId: string; naturalId: string; owner: string | undefined; sealed: boolean }

const defaultOwner = (row: unknown): string | undefined => {
	const owner = typeof row === "object" && row !== null ? (row as { profileId?: unknown }).profileId : undefined
	return typeof owner === "string" ? owner : undefined
}

function tryParse(raw: unknown): { ok: true; value: unknown } | { ok: false } {
	if (typeof raw !== "string") return { ok: false }
	try {
		return { ok: true, value: JSON.parse(raw) }
	} catch {
		return { ok: false }
	}
}

export class SealedEntityStorage<T> {
	private readonly prefix: string
	private readonly ownerOf: (row: unknown, naturalId: string) => string | undefined

	public constructor(
		private readonly inner: EntityStorage<T>,
		private readonly area: MinimalStorageArea,
		private readonly root: string,
		private readonly keysFor: RowKeysSource,
		private readonly options: SealedRootOptions = {},
	) {
		this.prefix = `${root}@`
		this.ownerOf = options.ownerOf ?? defaultOwner
		if (options.ownerless && !options.keyed) throw new Error(`${root}: only a keyed root keeps ownerless rows`)
	}

	public async get(id: string, owner?: string): Promise<T | undefined> {
		if (!this.options.keyed) return (await this.readKey(this.prefix + id))?.row
		const ownerId = this.requireOwner(owner)
		const sealed = await this.readKey(this.prefix + (await this.physicalId(id, ownerId)))
		if (sealed && sealed.located.naturalId === id) return sealed.row
		const legacy = await this.readKey(this.prefix + id)
		return legacy && !legacy.located.sealed && this.servesLegacy(legacy.located.owner, ownerId) ? legacy.row : undefined
	}

	/** The readable row stored at exactly `storageId`, whatever its form. */
	public async readStorageId(storageId: string): Promise<{ located: Located; row: T } | undefined> {
		return this.readKey(this.prefix + storageId)
	}

	/** Whether `id` is taken: by any stored row of a natural root, readable or not; for a keyed root,
	 *  by `owner`'s sealed row, its legacy twin, or an ownerless legacy row at `id`. */
	public async contains(id: string, owner?: string): Promise<boolean> {
		if (!this.options.keyed) return this.inner.contains(id)
		const ownerId = this.requireOwner(owner)
		if (await this.inner.contains(await this.physicalId(id, ownerId))) return true
		const legacy = await this.legacyAt(id)
		return legacy !== undefined && this.servesLegacy(legacy.owner, ownerId)
	}

	/** Seals `row` for the profile it belongs to. Throws `WalletLockedError` when that profile has
	 *  no row keys in this worker: nothing writes a plaintext row, except an update of an ownerless
	 *  row that is already one. */
	public async prepare(id: string, row: T): Promise<PreparedWrite> {
		const owner = this.ownerOf(row, id)
		if (owner === undefined) return this.prepareOwnerless(id, row)
		const keys = this.keysFor(owner)
		if (!keys) throw new WalletLockedError()
		const text = JSON.stringify(row)
		if (!this.options.keyed) {
			const storageKey = this.prefix + id
			const items = { [storageKey]: await this.envelope(keys, owner, storageKey, text) }
			return { items, commit: () => this.whileHeld(owner, keys, () => this.area.set(items)) }
		}
		const storageKey = this.prefix + (await this.physicalId(id, owner, keys))
		const items = { [storageKey]: await this.envelope(keys, owner, storageKey, JSON.stringify({ k: id, r: text })) }
		const legacyTwin = (await this.legacyOwner(id)) === owner ? [this.prefix + id] : []
		return { items, commit: () => this.whileHeld(owner, keys, () => this.commitWithRemovals(items, legacyTwin)) }
	}

	/** An ownerless row is written back in place and in plaintext, only over the ownerless row it
	 *  updates, checked again at commit: a new row, or one a profile has sealed or adopted meanwhile,
	 *  is never written in plaintext. */
	private async prepareOwnerless(id: string, row: T): Promise<PreparedWrite> {
		if (this.options.ownerless !== "plaintext") throw new Error(`${this.root}: a sealed row must name its profile`)
		const key = this.prefix + id
		const items = { [key]: JSON.stringify(row) }
		const ownerless = async () => {
			const legacy = await this.legacyAt(id)
			return legacy !== undefined && legacy.owner === undefined
		}
		if (!(await ownerless())) throw new Error(`${this.root}: only a stored ownerless row is written in plaintext`)
		return {
			items,
			commit: async () => {
				if (!(await ownerless())) throw new Error(`${this.root}: the ownerless row changed before its write`)
				await this.area.set(items)
			},
		}
	}

	/** Dispatches a prepared write only while its profile still holds the keys it was sealed under,
	 *  checked synchronously, so a write that outlived the profile's deletion never lands behind the
	 *  deletion's keyless sweep. */
	private whileHeld(owner: string, keys: RowKeys, write: () => Promise<void>): Promise<void> {
		if (this.keysFor(owner) !== keys) return Promise.reject(new WalletLockedError())
		return write()
	}

	public async set(id: string, row: T): Promise<void> {
		await (await this.prepare(id, row)).commit()
	}

	/** Removes the row of `id`; for a keyed root, `owner`'s sealed row and its legacy twin. */
	public async delete(id: string, owner?: string): Promise<void> {
		if (!this.options.keyed) return this.area.remove(this.prefix + id)
		const ownerId = this.requireOwner(owner)
		const keys = [this.prefix + (await this.physicalId(id, ownerId))]
		if ((await this.legacyOwner(id)) === ownerId) keys.push(this.prefix + id)
		return this.area.remove(keys)
	}

	/** Every readable row as `[naturalId, row]`. A keyed root yields one row per (profile, natural
	 *  id), the sealed copy over its legacy twin. */
	public async getAll(): Promise<Array<[string, T]>> {
		const rows = await this.readAll()
		const sealed = new Set(rows.filter(({ located }) => located.sealed).map(({ located }) => `${located.owner}|${located.naturalId}`))
		return rows
			.filter(({ located }) => located.sealed || !sealed.has(`${located.owner}|${located.naturalId}`))
			.map(({ located, row }) => [located.naturalId, row])
	}

	public async getValues(): Promise<T[]> {
		return (await this.getAll()).map(([, row]) => row)
	}

	/** Every readable row where it is stored, legacy twins included, for a caller that deletes or
	 *  rewrites by storage id. */
	public async entries(): Promise<Array<{ located: Located; row: T }>> {
		return this.readAll()
	}

	/** Every storage id under the root, readable or not: what id allocation must avoid. */
	public getKeys(): Promise<string[]> {
		return this.inner.getKeys()
	}

	public rawEntries(): Promise<Array<[string, unknown]>> {
		return this.inner.rawEntries()
	}

	public rawStringEntries(): Promise<Array<[string, string]>> {
		return this.inner.rawStringEntries()
	}

	public rawValue(id: string): Promise<string | undefined> {
		return this.inner.rawValue(id)
	}

	/** Removes a row by its storage id, as a raw enumeration names it. */
	public deleteStorageId(storageId: string): Promise<void> {
		return this.area.remove(this.prefix + storageId)
	}

	/**
	 * Every row of `profileId` with its storage id, sealed rows opened, for a maintenance delete
	 * that filters on a row field. The rows are parsed JSON with no codec, as a raw enumeration
	 * yields them, so a codec-invalid row of the profile is still found. The profile's sealed rows
	 * whose fields such a caller cannot read come apart: `keyless` when the scan found no keys for
	 * the profile, so which of them match is unknown; `unopened` when the keys refused them.
	 */
	public async rawRowsOf(
		profileId: string,
	): Promise<{ rows: Array<{ storageId: string; row: unknown }>; unopened: string[]; keyless: string[] }> {
		const rows: Array<{ storageId: string; row: unknown }> = []
		const unopened: string[] = []
		const keyless: string[] = []
		for (const [key, storageId, raw] of prefixedEntries(await this.area.get(), this.prefix)) {
			const parsed = tryParse(raw)
			if (!parsed.ok) continue
			const envelope = parseEnvelope(parsed.value)
			if (!envelope) {
				if (this.ownerOf(parsed.value, storageId) === profileId) rows.push({ storageId, row: parsed.value })
				continue
			}
			if (envelope.profileId !== profileId) continue
			if (!this.keysFor(profileId)) {
				keyless.push(storageId)
				continue
			}
			const opened = await this.open(key, envelope)
			if (opened) rows.push({ storageId, row: opened.inner })
			else unopened.push(storageId)
		}
		return { rows, unopened, keyless }
	}

	/**
	 * Converts `profileId`'s legacy rows, one `withLock` section per row so no lock is held for the
	 * whole pass. Each row seals the exact stored text (a codec-invalid row too, so nothing stays
	 * readable and nothing is lost) and commits only while its key still holds that text. A keyed
	 * row is written under its sealed key and its legacy key removed in the same dispatch; a crash
	 * between leaves both, which reads dedupe and the next pass finishes. A row commits only while
	 * the profile still holds the keys the pass began with, so a pass outliving the profile's
	 * deletion writes nothing after the deletion's keyless sweep. Returns the rows sealed.
	 */
	public async sealLegacy(profileId: string, withLock: <R>(fn: () => Promise<R>) => Promise<R>): Promise<number> {
		const keys = this.keysFor(profileId)
		if (!keys) return 0
		let converted = 0
		for (const [storageId, text] of await this.inner.rawStringEntries()) {
			const parsed = tryParse(text)
			if (!parsed.ok || parseEnvelope(parsed.value) || this.ownerOf(parsed.value, storageId) !== profileId) continue
			if (await withLock(() => this.sealLegacyRow(keys, profileId, storageId, text))) converted++
		}
		return converted
	}

	private async sealLegacyRow(keys: RowKeys, owner: string, naturalId: string, text: string): Promise<boolean> {
		const legacyKey = this.prefix + naturalId
		if (!this.options.keyed) {
			const items = { [legacyKey]: await this.envelope(keys, owner, legacyKey, text) }
			if ((await this.area.get(legacyKey))[legacyKey] !== text || this.keysFor(owner) !== keys) return false
			await this.area.set(items)
			return true
		}
		const sealedKey = this.prefix + (await this.physicalId(naturalId, owner, keys))
		const twin = (await this.area.get(sealedKey))[sealedKey]
		const items =
			twin === undefined
				? { [sealedKey]: await this.envelope(keys, owner, sealedKey, JSON.stringify({ k: naturalId, r: text })) }
				: {}
		if ((await this.area.get(legacyKey))[legacyKey] !== text || this.keysFor(owner) !== keys) return false
		await this.commitWithRemovals(items, [legacyKey])
		return true
	}

	/**
	 * Gives the ownerless legacy row at `naturalId` to `profileId`: seals it, stamped with the
	 * profile, under the profile's keyed id and removes the plaintext original in the same dispatch,
	 * only while the original still holds `text` and the profile the keys it was sealed under. A
	 * sealed row the profile already holds at that id is kept and only the original removed: an
	 * unauthenticated row never replaces an authenticated one. The caller decides the profile owns it
	 * and holds the lock its root's writers hold. Returns whether it was adopted.
	 */
	public async adoptOwnerless(naturalId: string, text: string, profileId: string): Promise<boolean> {
		const keys = this.keysFor(profileId)
		const parsed = tryParse(text)
		if (!this.options.ownerless || !keys || !parsed.ok || typeof parsed.value !== "object" || parsed.value === null) return false
		if (parseEnvelope(parsed.value) || this.ownerOf(parsed.value, naturalId) !== undefined) return false
		const adopted = JSON.stringify({ ...parsed.value, profileId })
		const legacyKey = this.prefix + naturalId
		const sealedKey = this.prefix + (await this.physicalId(naturalId, profileId, keys))
		const twin = (await this.area.get(sealedKey))[sealedKey]
		const items =
			twin === undefined
				? { [sealedKey]: await this.envelope(keys, profileId, sealedKey, JSON.stringify({ k: naturalId, r: adopted })) }
				: {}
		if ((await this.area.get(legacyKey))[legacyKey] !== text || this.keysFor(profileId) !== keys) return false
		await this.commitWithRemovals(items, [legacyKey])
		return true
	}

	private commitWithRemovals(items: Record<string, string>, removals: string[]): Promise<void> {
		const writes = [Object.keys(items).length > 0 ? this.area.set(items) : Promise.resolve()]
		if (removals.length > 0) writes.push(this.area.remove(removals))
		return Promise.all(writes).then(() => undefined)
	}

	private async envelope(keys: RowKeys, profileId: string, storageKey: string, text: string): Promise<string> {
		const sealed = await sealRow(keys, text, { root: this.root, storageKey, profileId })
		return JSON.stringify({ profileId, sealed } satisfies SealedEnvelope)
	}

	private async physicalId(naturalId: string, owner: string, held?: RowKeys): Promise<string> {
		const keyed = this.options.keyed
		if (!keyed) return naturalId
		const keys = held ?? this.keysFor(owner)
		if (!keys) throw new WalletLockedError()
		return keyed.physicalId(naturalId, (segment) => keyedSegment(keys, segment))
	}

	private requireOwner(owner: string | undefined): string {
		if (owner === undefined) throw new Error(`${this.root} is keyed per profile: name the owner`)
		return owner
	}

	/** The owner of the legacy row stored at the natural id itself, if one is. */
	private async legacyOwner(naturalId: string): Promise<string | undefined> {
		return (await this.legacyAt(naturalId))?.owner
	}

	/** The legacy row stored at the natural id itself, with its owner (none when ownerless). */
	private async legacyAt(naturalId: string): Promise<{ owner: string | undefined } | undefined> {
		const key = this.prefix + naturalId
		const parsed = tryParse((await this.area.get(key))[key])
		if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null || parseEnvelope(parsed.value)) return undefined
		return { owner: this.ownerOf(parsed.value, naturalId) }
	}

	/** Whether a lookup by `owner` is served a legacy row owned by `rowOwner`: its own, or, on a root
	 *  that keeps them, an ownerless one. */
	private servesLegacy(rowOwner: string | undefined, owner: string): boolean {
		return rowOwner === owner || (rowOwner === undefined && this.options.ownerless === "plaintext")
	}

	private async readKey(key: string): Promise<{ located: Located; row: T } | undefined> {
		const stored = await this.area.get(key)
		return key in stored ? this.decode(key, stored[key]) : undefined
	}

	/** Opens every row at once: WebCrypto pipelines concurrent decryptions, and one await per row
	 *  costs a full round trip each (Firefox: about 0.1 ms a row). */
	private async readAll(): Promise<Array<{ located: Located; row: T }>> {
		const entries = prefixedEntries(await this.area.get(), this.prefix)
		const reads = await Promise.all(entries.map(([key, , raw]) => this.decode(key, raw)))
		return reads.filter((read) => read !== undefined)
	}

	/** One stored value, through the envelope when it is one, else through the plain codec. */
	private async decode(key: string, raw: unknown): Promise<{ located: Located; row: T } | undefined> {
		const storageId = key.slice(this.prefix.length)
		const parsed = tryParse(raw)
		const envelope = parsed.ok ? parseEnvelope(parsed.value) : undefined
		if (!envelope) {
			if (!parsed.ok) {
				// The codec's own path logs a malformed string with no payload. A value that is not a
				// string is refused too: no delete or conversion path reads one, so none could remove it.
				if (typeof raw === "string") this.inner.decodeStored(key, raw)
				else
					console.warn(
						`SealedEntityStorage[${this.root}]: row ${this.inner.describeKey(key)} — not-a-string — KEEPING (not deleting)`,
					)
				return undefined
			}
			const row = this.inner.decodeParsed(key, parsed.value)
			if (row === undefined) return undefined
			return { located: { storageId, naturalId: storageId, owner: this.ownerOf(parsed.value, storageId), sealed: false }, row }
		}
		const opened = await this.open(key, envelope)
		if (!opened) return undefined
		const row = this.inner.decodeParsed(key, opened.inner)
		if (row === undefined) return undefined
		return { located: { storageId, naturalId: opened.naturalId, owner: envelope.profileId, sealed: true }, row }
	}

	/** The parsed inner row of an envelope, or `undefined` (logged) when it does not open under its
	 *  profile's keys, is not the inner shape, or names another profile. */
	private async open(key: string, envelope: SealedEnvelope): Promise<{ naturalId: string; inner: unknown } | undefined> {
		const keys = this.keysFor(envelope.profileId)
		if (!keys) {
			console.debug(`SealedEntityStorage[${this.root}]: row ${this.inner.describeKey(key)} belongs to a profile not opened here`)
			return undefined
		}
		let text: string
		try {
			text = await openRow(keys, envelope.sealed, { root: this.root, storageKey: key, profileId: envelope.profileId })
		} catch {
			return this.refuse("sealed-authentication", key)
		}
		const opened = tryParse(text)
		if (!opened.ok) return this.refuse("sealed-format", key)
		let naturalId = key.slice(this.prefix.length)
		let inner: unknown = opened.value
		if (this.options.keyed) {
			const { k, r } = (opened.value ?? {}) as { k?: unknown; r?: unknown }
			const row = tryParse(r)
			if (typeof k !== "string" || !row.ok) return this.refuse("sealed-format", key)
			naturalId = k
			inner = row.value
		}
		if (this.ownerOf(inner, naturalId) !== envelope.profileId) return this.refuse("sealed-identity", key)
		return { naturalId, inner }
	}

	/** A tamper or corruption signal: the category and the key's shape, never the row, the key's
	 *  id, the ciphertext or the WebCrypto message. */
	private refuse(category: "sealed-authentication" | "sealed-format" | "sealed-identity", key: string): undefined {
		console.warn(`SealedEntityStorage[${this.root}]: row ${this.inner.describeKey(key)} — ${category} — KEEPING (not deleting)`)
		return undefined
	}
}
