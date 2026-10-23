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

/** Whether a stored value is a seal envelope. A plaintext row of a keyed root sits at its natural
 *  id; an envelope sits at the keyed id, whose hashed segments name nothing. */
export function isSealedText(raw: unknown): boolean {
	const parsed = tryParse(raw)
	return parsed.ok && parseEnvelope(parsed.value) !== undefined
}

/** How a keyed root names a row: its storage id keeps the scope segments of the natural id and
 *  replaces each address or hash segment with the profile's keyed hash of it. */
export type KeyedIds = { physicalId(naturalId: string, hash: (segment: string) => Promise<string>): Promise<string> }

export type SealedRootOptions = {
	/** The profile a row belongs to, read from the parsed row or its natural id. Default:
	 *  `row.profileId`. Must accept anything a raw legacy row parses to; given no row, it answers
	 *  the profile the id alone names, if it names one. */
	ownerOf?: (row: unknown, naturalId: string) => string | undefined
	keyed?: KeyedIds
	/** Keyed roots only. A legacy row that names no profile stays plaintext at its natural id: no
	 *  profile's keys may seal it while its owner is unknown, so every profile's lookup of that id
	 *  finds it. Such a row is updated in place; nothing creates one. */
	ownerless?: "plaintext"
}

/** One sealed write, prepared: the caller runs its own liveness checks after `prepare` resolves
 *  and then calls `commit` with no `await` in between, so nothing interleaves after a check.
 *  `sealed` is absent only for an ownerless row's plaintext write. */
export type PreparedWrite = {
	items: Record<string, string>
	commit(): Promise<void>
	/** The legacy twins the commit removes once the items are written, and whether the profile still
	 *  holds the keys the items were sealed under. */
	sealed?: { removals: string[]; held(): boolean }
}

/**
 * Dispatches several sealed writes, of any roots, as ONE `set` before returning, so the area
 * applies them as one batch and a refused write leaves none of them; the legacy twins they replace
 * are removed after it. Refuses unless every write's profile still holds its keys.
 */
export function commitSealedTogether(area: MinimalStorageArea, writes: readonly PreparedWrite[]): Promise<void> {
	const sealed = writes.map((write) => write.sealed)
	if (sealed.some((write) => write === undefined)) return Promise.reject(new Error("only sealed writes commit together"))
	if (sealed.some((write) => !write?.held())) return Promise.reject(new WalletLockedError())
	const items = Object.assign({}, ...writes.map((write) => write.items)) as Record<string, string>
	const removals = sealed.flatMap((write) => write?.removals ?? [])
	const written = area.set(items)
	return removals.length > 0 ? written.then(() => area.remove(removals)) : written
}

/** A lock section for one row's conversion, given the row's natural id for a root whose writers
 *  lock per row; `isCurrent` holds while the section still owns the lock, as `Lock.withLock`
 *  passes it. */
export type ConversionLock = <R>(fn: (isCurrent: () => boolean) => Promise<R>, naturalId: string) => Promise<R>

/** One legacy row's conversion, prepared: the sealed copy to write (none when its sealed twin is
 *  already stored), the plaintext key it reads from, the keys the commit removes, and whether a
 *  stored value is still the one it was sealed from with the profile still holding its keys. */
export type LegacySeal = { items: Record<string, string>; legacyKey: string; removals: string[]; current(stored: unknown): boolean }

/** The legacy rows of other roots that convert in the same commit as the row at `naturalId`,
 *  prepared inside its lock section. */
export type Companions = (naturalId: string) => Promise<LegacySeal[]>

/**
 * Commits prepared legacy conversions, of any sealed roots, as one: only while every legacy key
 * still holds the text it was sealed from, every profile its keys and `isCurrent()` holds, all
 * read after the last read and before the dispatch. Then ONE `set` of every sealed copy and, once
 * it lands, ONE `remove` of every plaintext key a keyed root leaves behind; a crash between leaves
 * both forms of each row, which reads dedupe and the next pass finishes. Returns whether it did.
 */
export async function commitLegacyTogether(
	area: MinimalStorageArea,
	seals: readonly LegacySeal[],
	isCurrent: () => boolean,
): Promise<boolean> {
	const stored = await area.get(seals.map((seal) => seal.legacyKey))
	if (!isCurrent() || seals.some((seal) => !seal.current(stored[seal.legacyKey]))) return false
	const items = Object.assign({}, ...seals.map((seal) => seal.items)) as Record<string, string>
	const removals = seals.flatMap((seal) => seal.removals)
	if (Object.keys(items).length > 0) await area.set(items)
	if (removals.length > 0) await area.remove(removals)
	return true
}

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
		const ownerId = this.requireOwner(id, owner)
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
	 *  by `owner`'s sealed row, its legacy twin, or an ownerless legacy row at `id`. A keyed root whose
	 *  ids name their profile needs no `owner` in this or `get` or `delete`. */
	public async contains(id: string, owner?: string): Promise<boolean> {
		if (!this.options.keyed) return this.inner.contains(id)
		const ownerId = this.requireOwner(id, owner)
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
		const held = () => this.keysFor(owner) === keys
		if (!this.options.keyed) {
			const storageKey = this.prefix + id
			const items = { [storageKey]: await this.envelope(keys, owner, storageKey, text) }
			return { items, commit: () => this.whileHeld(owner, keys, () => this.area.set(items)), sealed: { removals: [], held } }
		}
		const storageKey = this.prefix + (await this.physicalId(id, owner, keys))
		const items = { [storageKey]: await this.envelope(keys, owner, storageKey, JSON.stringify({ k: id, r: text })) }
		const legacyTwin = (await this.legacyOwner(id)) === owner ? [this.prefix + id] : []
		return {
			items,
			commit: () => this.whileHeld(owner, keys, () => this.commitWithRemovals(items, legacyTwin)),
			sealed: { removals: legacyTwin, held },
		}
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
		await (await this.prepareDelete(id, owner)).commit()
	}

	/** The removal of `id`'s row with its storage keys resolved: a fenced caller checks its fence
	 *  after this resolves and calls `commit`, which dispatches at once, with no `await` between. */
	public async prepareDelete(id: string, owner?: string): Promise<{ commit(): Promise<void> }> {
		if (!this.options.keyed) {
			const key = this.prefix + id
			return { commit: () => this.area.remove(key) }
		}
		const ownerId = this.requireOwner(id, owner)
		const keys = [this.prefix + (await this.physicalId(id, ownerId))]
		if ((await this.legacyOwner(id)) === ownerId) keys.push(this.prefix + id)
		return { commit: () => this.area.remove(keys) }
	}

	/** Every readable row as `[naturalId, row]`. A keyed root yields one row per (profile, natural
	 *  id), the sealed copy over its legacy twin, and an ownerless row only where `get` serves one. */
	public async getAll(): Promise<Array<[string, T]>> {
		const rows = await this.readAll()
		const sealed = new Set(rows.filter(({ located }) => located.sealed).map(({ located }) => `${located.owner}|${located.naturalId}`))
		const unowned = this.options.keyed !== undefined && this.options.ownerless === undefined
		return rows
			.filter(({ located }) => located.sealed || !sealed.has(`${located.owner}|${located.naturalId}`))
			.filter(({ located }) => !unowned || located.owner !== undefined)
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
	 * Every row of `profileId` with its storage id and the natural id it answers to, sealed rows
	 * opened, for a maintenance delete that filters on a row field. The rows are parsed JSON with no
	 * codec, as a raw enumeration yields them, so a codec-invalid row of the profile is still found.
	 * The profile's sealed rows whose fields such a caller cannot read come apart: `keyless` when the
	 * scan found no keys for the profile, so which of them match is unknown; `unopened` when the keys
	 * refused them.
	 */
	public async rawRowsOf(
		profileId: string,
	): Promise<{ rows: Array<{ storageId: string; naturalId: string; row: unknown }>; unopened: string[]; keyless: string[] }> {
		const rows: Array<{ storageId: string; naturalId: string; row: unknown }> = []
		const unopened: string[] = []
		const keyless: string[] = []
		for (const [key, storageId, raw] of prefixedEntries(await this.area.get(), this.prefix)) {
			const parsed = tryParse(raw)
			if (!parsed.ok) continue
			const envelope = parseEnvelope(parsed.value)
			if (!envelope) {
				if (this.ownerOf(parsed.value, storageId) === profileId) rows.push({ storageId, naturalId: storageId, row: parsed.value })
				continue
			}
			if (envelope.profileId !== profileId) continue
			if (!this.keysFor(profileId)) {
				keyless.push(storageId)
				continue
			}
			const opened = await this.open(key, envelope)
			if (opened) rows.push({ storageId, naturalId: opened.naturalId, row: opened.inner })
			else unopened.push(storageId)
		}
		return { rows, unopened, keyless }
	}

	/**
	 * Converts `profileId`'s legacy rows, one `withLock` section per row so no lock is held for the
	 * whole pass. Each row seals the exact stored text (a codec-invalid row too, so nothing stays
	 * readable and nothing is lost) and commits only while its key still holds that text. A keyed
	 * row is written under its sealed key first, then its legacy key is removed; a crash between
	 * leaves both, which reads dedupe and the next pass finishes. A row commits only while
	 * the profile still holds the keys the pass began with, so a pass outliving the profile's
	 * deletion writes nothing after the deletion's keyless sweep. Returns the rows sealed.
	 */
	public async sealLegacy(
		profileId: string,
		withLock: ConversionLock,
		skip?: (naturalId: string) => boolean,
		companions?: Companions,
	): Promise<number> {
		const keys = this.keysFor(profileId)
		if (!keys) return 0
		let converted = 0
		for (const [storageId, text] of await this.inner.rawStringEntries()) {
			const parsed = tryParse(text)
			if (!parsed.ok || parseEnvelope(parsed.value) || this.ownerOf(parsed.value, storageId) !== profileId) continue
			const sealRow = async (isCurrent: () => boolean) => {
				const seal = await this.prepareLegacySeal(keys, profileId, storageId, text, skip)
				const others = companions ? await companions(storageId) : []
				return commitLegacyTogether(this.area, [seal, ...others], isCurrent)
			}
			if (await withLock(sealRow, storageId)) converted++
		}
		return converted
	}

	/** The conversion of `profileId`'s legacy row at `naturalId`, when it is stored there in
	 *  plaintext and the profile holds its keys: for a caller that commits it with a row of another
	 *  root, under the lock both rows' writers hold. */
	public async prepareLegacyRow(profileId: string, naturalId: string): Promise<LegacySeal | undefined> {
		const keys = this.keysFor(profileId)
		const text = await this.inner.rawValue(naturalId)
		const parsed = tryParse(text)
		if (!keys || !parsed.ok || parseEnvelope(parsed.value) || this.ownerOf(parsed.value, naturalId) !== profileId) return undefined
		return this.prepareLegacySeal(keys, profileId, naturalId, text as string)
	}

	/** Seals the exact stored text. `current` is asked after the row's last read, synchronously
	 *  before the commit, with the lock's `isCurrent`: a section the lock's watchdog displaced may
	 *  have read the row before a purge deleted it. */
	private async prepareLegacySeal(
		keys: RowKeys,
		owner: string,
		naturalId: string,
		text: string,
		skip?: (naturalId: string) => boolean,
	): Promise<LegacySeal> {
		const legacyKey = this.prefix + naturalId
		const current = (stored: unknown) => stored === text && this.keysFor(owner) === keys && !skip?.(naturalId)
		if (!this.options.keyed) {
			return { items: { [legacyKey]: await this.envelope(keys, owner, legacyKey, text) }, legacyKey, removals: [], current }
		}
		const sealedKey = this.prefix + (await this.physicalId(naturalId, owner, keys))
		const twin = (await this.area.get(sealedKey))[sealedKey]
		const items =
			twin === undefined
				? { [sealedKey]: await this.envelope(keys, owner, sealedKey, JSON.stringify({ k: naturalId, r: text })) }
				: {}
		return { items, legacyKey, removals: [legacyKey], current }
	}

	/** Whether any value is stored for `id`, readable or not: at its sealed key or, for a keyed
	 *  root, at the natural id itself. A row its codec or its keys hide is still there. */
	public async occupied(id: string, owner?: string): Promise<boolean> {
		if (!this.options.keyed) return this.inner.contains(id)
		if (await this.inner.contains(id)) return true
		return this.inner.contains(await this.physicalId(id, this.requireOwner(id, owner)))
	}

	/** A deletion's removal of `id`: both forms while the owner's keys are held; with none, only the
	 *  plaintext row, since no keyed id can be computed, and the deletion's keyless sweep removes
	 *  the sealed one. */
	public async purgeId(id: string, owner?: string): Promise<void> {
		if (!this.options.keyed || this.keysFor(this.requireOwner(id, owner))) return this.delete(id, owner)
		await this.area.remove(this.prefix + id)
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

	/** The write is dispatched at once; the removal waits for it, so a rejected write leaves the
	 *  original, and an interrupted pair leaves both copies, which the next pass resolves. */
	private async commitWithRemovals(items: Record<string, string>, removals: string[]): Promise<void> {
		if (Object.keys(items).length > 0) await this.area.set(items)
		if (removals.length > 0) await this.area.remove(removals)
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

	/** `owner`, or the profile the id itself names on a root whose ids carry it. */
	private requireOwner(id: string, owner: string | undefined): string {
		const ownerId = owner ?? this.ownerOf(undefined, id)
		if (ownerId === undefined) throw new Error(`${this.root} is keyed per profile: name the owner`)
		return ownerId
	}

	/** The owner of the legacy row stored at the natural id itself, if one is. */
	private async legacyOwner(naturalId: string): Promise<string | undefined> {
		return (await this.legacyAt(naturalId))?.owner
	}

	/** The legacy row stored at the natural id itself, with its owner (none when ownerless). A row
	 *  that is not an object counts only where its id names the owner (a bare flag): no other row
	 *  is ever one, so an ownerless non-object is debris. */
	private async legacyAt(naturalId: string): Promise<{ owner: string | undefined } | undefined> {
		const key = this.prefix + naturalId
		const parsed = tryParse((await this.area.get(key))[key])
		if (!parsed.ok || parseEnvelope(parsed.value)) return undefined
		const owner = this.ownerOf(parsed.value, naturalId)
		if (owner === undefined && (typeof parsed.value !== "object" || parsed.value === null)) return undefined
		return { owner }
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
