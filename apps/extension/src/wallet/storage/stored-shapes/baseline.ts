/**
 * The stored-shape baseline: what `snapshot.json` records, how the goldens are read back, and the
 * rules a new stamp must satisfy. Shared by `snapshot.test.ts` and the generator
 * (`apps/extension/scripts/storage-baseline/generate.ts`), so both judge a change the same way.
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { type Migration, Migrator, SCHEMA_RESERVED_PREFIX, SCHEMA_VERSION_KEY, type StorageRef } from "@nulo/wallet-core/migration"
import type { StorageArea } from "@nulo/wallet-core/ports"
import { MemoryStorageArea, type MinimalStorageArea } from "@nulo/wallet-core/storage"
import { asMasterSecretBytes, deriveRowKeys, type RowKeys } from "@nulo/wallet-crypto"
import { z } from "zod"
import { DummyLogger } from "@/wallet/logger/utils"
import { BACKUP_SLICE_REGISTRY, normalizeBackupData } from "@/wallet/services/backup/backup-migration-registry"
import { migrateBackupData } from "@/wallet/services/backup/backup-migrator"
import { IMPORT_BLOCKING_ACK } from "@/wallet/services/backup/import-blocking-ack"
import { signDappSession } from "@/wallet/services/dapp-session/integrity"
import { DappSessionMacStorage } from "@/wallet/services/dapp-session/mac-storage"
import type { DappSession } from "@/wallet/services/dapp-session/spec"
import {
	AccountIntegrityBlockedRepository,
	AccountIntegrityVerifiedStampRepository,
} from "@/wallet/services/account-integrity/blocked-repository"
import { readSeedOffers } from "@/wallet/services/network/seed-offers"
import { RestorePendingRepository } from "@/wallet/services/profile/restore-pending-repository"
import { TombstoneRepository } from "@/wallet/services/profile/tombstone-repository"
import { StaleNetworkRepository } from "@/wallet/services/stale-network/repository"
import { BASELINE_VERSION } from "../migrations"
import { parseEnvelope, type RowKeysSource, type SealedRootOptions } from "../sealed-entity-storage"
import { STORED_SHAPES, type StoredShape, type StoredShapeName } from "../stored-shapes"
import {
	entityStorage,
	type PerProfileValueStoreName,
	type PlainEntityStoreName,
	type SealedStoreName,
	STORES,
	sealedEntityStorage,
	type ValueStoreName,
	valueStorage,
} from "../stores"
import { canonical, canonicalText, emitSchema, type Json } from "./emit"

/** One stored row as a build wrote it. `value` is the stored value; a json shape stores its
 *  `JSON.stringify`. `stamp` is the index of the stamp whose build wrote it. `sealed`: authored as
 *  the plaintext row, which the generator replaces with its envelope under the golden row keys; a
 *  golden without it is a row as a build before the seal wrote it, and keeps that plaintext form. */
export type Golden = { id: string; stamp: number; shape: StoredShapeName; key: string; value: Json; sealed?: true }
export type GoldensFile = { goldens: Golden[] }

export type ShapeRecord = {
	ref: StorageRef
	encoding: StoredShape["encoding"]
	read: "codec" | "described"
	options?: Json
	authenticated?: true
	engine?: true
	sealed?: true
	schema: Json
}

/** Everything that decides how a stored row is read, at one schema version. */
export type Stamp = {
	version: number
	zod: string
	shapes: Record<string, ShapeRecord>
	/** Every golden of this stamp or an earlier one, decoded after this stamp's migrations; `null`
	 *  when they removed it. Written by the generator at {@link GOLDEN_NOW}. */
	expected: Record<string, Json>
	/** The registered migration that takes the previous stamp's rows to this version. */
	migration?: number
	/** A same-version change with no migration: the shapes it changes and why old rows still read. */
	additive?: { names: string[]; reason: string }
}
export type Snapshot = { stamps: Stamp[] }

/** The SHA-256 of a pinned stamp and of the goldens it introduced, both over canonical JSON. */
export type Pin = { stamp: string; goldens: string }

/** The committed `snapshot.json` and `goldens.json`, read fresh. */
export function committedBaseline(): { snapshot: Snapshot; goldens: Golden[] } {
	const read = (file: string) => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), file), "utf8"))
	return { snapshot: read("snapshot.json") as Snapshot, goldens: (read("goldens.json") as GoldensFile).goldens }
}

/** The clock every clock-dependent decoder reads goldens at. */
export const GOLDEN_NOW = Date.UTC(2026, 9, 1)

/** The fixed HMAC key the authenticated goldens are signed and read with. */
const GOLDEN_MAC_KEY_BYTES = new Uint8Array(32).fill(0x4e)
const goldenMacKey = (): Promise<CryptoKey> =>
	crypto.subtle.importKey("raw", GOLDEN_MAC_KEY_BYTES, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])

/** The fixed master the sealed goldens are sealed and read with, under {@link GOLDEN_GENERATION}. */
const GOLDEN_MASTER = asMasterSecretBytes(new Uint8Array(32).fill(0x53) as Uint8Array<ArrayBuffer>)
const GOLDEN_GENERATION = "golden-generation"
const goldenRowKeys = (profileId: string): Promise<RowKeys> => deriveRowKeys(GOLDEN_MASTER, profileId, GOLDEN_GENERATION)

/** The golden row keys of the profile whose envelope `stored` is, as a keyring holding that one
 *  profile; none for a plaintext value. */
async function goldenKeysFor(stored: unknown): Promise<RowKeysSource> {
	let envelope: ReturnType<typeof parseEnvelope>
	try {
		envelope = typeof stored === "string" ? parseEnvelope(JSON.parse(stored)) : undefined
	} catch {
		envelope = undefined
	}
	if (!envelope) return () => undefined
	const keys = await goldenRowKeys(envelope.profileId)
	return (profileId) => (profileId === envelope.profileId ? keys : undefined)
}

export function zodVersion(): string {
	const { major, minor, patch } = z.core.version
	return `${major}.${minor}.${patch}`
}

export function schemaVersionOf(migrations: readonly Migration[]): number {
	return Math.max(BASELINE_VERSION, ...migrations.map((m) => m.version))
}

export function shapeRecord(name: StoredShapeName): ShapeRecord {
	const shape: StoredShape = STORED_SHAPES[name]
	return {
		ref: shape.ref,
		encoding: shape.encoding,
		read: shape.read === "codec" ? "codec" : "described",
		...(shape.options ? { options: canonical(shape.options) } : {}),
		...(shape.authenticated ? { authenticated: true as const } : {}),
		...(shape.engine ? { engine: true as const } : {}),
		...(shape.sealed ? { sealed: true as const } : {}),
		schema: emitSchema(name, shape.schema),
	}
}

export function currentShapes(): Record<string, ShapeRecord> {
	return Object.fromEntries((Object.keys(STORED_SHAPES) as StoredShapeName[]).sort().map((name) => [name, shapeRecord(name)]))
}

/** The id a key carries after its root, for a `root` ref. */
function idOf(shape: StoredShape, key: string): string {
	if (shape.ref.kind !== "root" || !key.startsWith(`${shape.ref.root}@`))
		throw new Error(`${key} is not a key of ${JSON.stringify(shape.ref)}`)
	return key.slice(shape.ref.root.length + 1)
}

const wire = (shape: StoredShape, value: Json): unknown => (shape.encoding === "json" ? JSON.stringify(value) : value)
const unwire = (shape: StoredShape, stored: unknown): Json =>
	stored === undefined ? null : canonical(shape.encoding === "json" && typeof stored === "string" ? JSON.parse(stored) : stored)

async function macStorage(area: MinimalStorageArea, keys: RowKeysSource): Promise<DappSessionMacStorage> {
	const key = await goldenMacKey()
	return new DappSessionMacStorage(sealedEntityStorage("dappSessions", area, keys), async () => key, new DummyLogger())
}

async function readOrAbsent(read: () => Promise<unknown>): Promise<unknown> {
	try {
		return await read()
	} catch {
		return undefined
	}
}

/** The raw-row repositories' own reads: each adds a rule of its own to the codec (a tombstone's
 *  profile id must match its key; a reset notice is withheld while its network's journal exists). */
const RAW_REPOSITORY_READS: Partial<Record<StoredShapeName, (area: StorageArea, id: string) => Promise<unknown>>> = {
	profileTombstones: (area, id) => new TombstoneRepository(area).get(id),
	restorePending: async (area, id) => {
		const lookup = await new RestorePendingRepository(area).get(id)
		return lookup.kind === "valid" ? lookup.marker : undefined
	},
	accountIntegrityBlocked: (area, id) => new AccountIntegrityBlockedRepository(area).get(id),
	accountIntegrityVerified: (area, id) => new AccountIntegrityVerifiedStampRepository(area).get(id),
	staleNetworks: (area, id) => new StaleNetworkRepository(area).getRecord(id),
	networkReset: (area, id) => new StaleNetworkRepository(area).getJournal(id),
	networkResetDone: async (area, id) => (await new StaleNetworkRepository(area).takeNotice(id)) ?? undefined,
	networkSeeded: async (area, id) => {
		const record = await readSeedOffers(area, id)
		return record.kind === "valid" ? record.value : undefined
	},
}

/** The repositories take a full area; a decode reads and removes, and never clears or listens. */
const repositoryArea = (area: MinimalStorageArea): StorageArea => ({
	get: (keys) => area.get(keys ?? undefined),
	set: (entries) => area.set(entries),
	remove: (keys) => area.remove(keys),
	clear: () => Promise.reject(new Error("a golden decode never clears its area")),
	onChange: () => {
		throw new Error("a golden decode never listens to its area")
	},
})

/** The value the wallet reads from `key`, through the same store, codec, key-identity options, MAC
 *  check or decoder its service reads with. */
export async function readStored(name: StoredShapeName, area: MinimalStorageArea, key: string, now: number): Promise<unknown> {
	const shape: StoredShape = STORED_SHAPES[name]
	if (shape.engine) throw new Error(`${name} is the engine's own state: it has no goldens`)
	const keys = shape.sealed ? await goldenKeysFor((await area.get(key))[key]) : () => undefined
	if (shape.authenticated) return (await macStorage(area, keys)).get(idOf(shape, key))
	if (shape.sealed) {
		const row = (await sealedEntityStorage(name as SealedStoreName, area, keys).readStorageId(idOf(shape, key)))?.row
		return shape.read === "codec" || row === undefined ? row : shape.read(row, now)
	}
	const store = name in STORES ? STORES[name as keyof typeof STORES] : undefined
	if (shape.read === "codec") {
		const reader = RAW_REPOSITORY_READS[name]
		if (!reader) throw new Error(`${name} has a codec but neither a sealed store nor a repository read`)
		return reader(repositoryArea(area), idOf(shape, key))
	}
	let value: unknown
	if (store?.kind === "entity") value = await entityStorage<unknown>(name as PlainEntityStoreName, area).get(idOf(shape, key))
	else if (store?.ref.kind === "value") value = await readOrAbsent(() => valueStorage(name as ValueStoreName, area).get())
	else if (store) value = await readOrAbsent(() => valueStorage(name as PerProfileValueStoreName, area, idOf(shape, key)).get())
	else value = (await area.get(key))[key]
	return shape.read(value, now)
}

/** Fills the MAC of every authenticated golden that has none, with the real signer, then seals
 *  every sealed golden still in its plaintext form with the real sealing store. */
export async function signGoldens(goldens: readonly Golden[]): Promise<Golden[]> {
	return sealGoldens(await macGoldens(goldens))
}

const isSealedForm = (golden: Golden) => golden.sealed === true && parseEnvelope(golden.value) !== undefined

async function macGoldens(goldens: readonly Golden[]): Promise<Golden[]> {
	const key = await goldenMacKey()
	return Promise.all(
		goldens.map(async (golden) => {
			const shape: StoredShape = STORED_SHAPES[golden.shape]
			const row = golden.value as Record<string, Json>
			if (!shape.authenticated || isSealedForm(golden) || typeof row.mac === "string") return golden
			const { mac: _unsigned, ...signable } = row
			return { ...golden, value: { ...signable, mac: await signDappSession(key, signable as unknown as Omit<DappSession, "mac">) } }
		}),
	)
}

/** The profile a sealed row belongs to, as its store reads it: the row's own, or its natural id's. */
function sealedOwnerOf(name: SealedStoreName, row: Json, naturalId: string): string | undefined {
	const ownerOf = (STORES[name] as { sealedRoot?: SealedRootOptions }).sealedRoot?.ownerOf
	if (ownerOf) return ownerOf(row, naturalId)
	const profileId = row !== null && typeof row === "object" && !Array.isArray(row) ? row.profileId : undefined
	return typeof profileId === "string" ? profileId : undefined
}

async function sealGoldens(goldens: readonly Golden[]): Promise<Golden[]> {
	return Promise.all(
		goldens.map(async (golden) => {
			if (!golden.sealed || isSealedForm(golden)) return golden
			const shape: StoredShape = STORED_SHAPES[golden.shape]
			const id = idOf(shape, golden.key)
			const owner = shape.sealed ? sealedOwnerOf(golden.shape as SealedStoreName, golden.value, id) : undefined
			if (owner === undefined) throw new Error(`${golden.id}: only a sealed shape's row with a profile seals`)
			const keys = await goldenRowKeys(owner)
			const area = new MemoryStorageArea()
			await sealedEntityStorage(golden.shape as SealedStoreName, area, () => keys).set(id, golden.value as never)
			// A keyed root stores the row under its keyed id, not the natural key it was authored at.
			const [[key, value]] = [...area.data]
			return { ...golden, key, value: JSON.parse(value as string) as Json }
		}),
	)
}

type Decoded = Record<string, Json>

const decodedOf = (value: unknown): Json => (value === undefined ? null : canonical(value))

function contents(area: MemoryStorageArea): string {
	return canonicalText(Object.fromEntries([...area.data].filter(([key]) => !key.startsWith(SCHEMA_RESERVED_PREFIX))))
}

/** One stamp's goldens, seeded at its version, migrated by the real engine, read back. Throws when
 *  the engine refuses or a second run from the same marker changes anything. */
async function decodeLive(
	goldens: readonly Golden[],
	version: number,
	migrations: Migration[],
): Promise<{ decoded: Decoded; keys: string[]; stored: Decoded }> {
	const area = new MemoryStorageArea().seed({ [SCHEMA_VERSION_KEY]: version })
	for (const golden of goldens) area.seed({ [golden.key]: wire(STORED_SHAPES[golden.shape], golden.value) })
	const run = async () => {
		const result = await new Migrator({ store: area, migrations, baselineVersion: BASELINE_VERSION }).run()
		if (result.kind !== "noop" && result.kind !== "migrated")
			throw new Error(`the engine refused goldens at v${version}: ${JSON.stringify(result)}`)
	}
	await run()
	const once = contents(area)
	await area.set({ [SCHEMA_VERSION_KEY]: version })
	await run()
	if (contents(area) !== once) throw new Error(`a second run of the migrations from v${version} changed the goldens: not idempotent`)
	const keys = [...area.data.keys()].filter((key) => !key.startsWith(SCHEMA_RESERVED_PREFIX)).sort()
	const stored: Decoded = {}
	for (const golden of goldens) stored[golden.id] = unwire(STORED_SHAPES[golden.shape], area.data.get(golden.key))
	const decoded: Decoded = {}
	for (const golden of goldens) decoded[golden.id] = decodedOf(await readStored(golden.shape, area, golden.key, GOLDEN_NOW))
	return { decoded, keys, stored }
}

/** The backup slice service whose root (or value key) holds `shape`, if a full backup carries it. */
function sliceOf(shape: StoredShape): string | undefined {
	for (const [service, slice] of Object.entries(BACKUP_SLICE_REGISTRY)) {
		if (slice.kind === "root" && shape.ref.kind === "root" && slice.root === shape.ref.root) return service
		if (slice.kind === "value-projection" && shape.ref.kind === "value" && slice.key === shape.ref.key) return service
	}
	return undefined
}

/** A sealed golden is never sliced: a backup carries a profile's rows as its services decrypt them,
 *  which the shape's plaintext goldens already prove. */
export const isBackupSliced = (golden: Golden): boolean => !golden.sealed && sliceOf(STORED_SHAPES[golden.shape]) !== undefined

/** A full backup carries every required slice, so one a store holds no golden of is carried empty,
 *  as a migration reading it requires. */
export const emptyBackup = (): Record<string, unknown[]> =>
	Object.fromEntries(
		Object.entries(BACKUP_SLICE_REGISTRY)
			.filter(([, slice]) => (slice.kind === "root" && !slice.optional) || slice.kind === "value-projection")
			.map(([service]) => [service, []]),
	)

/** The goldens as the slices of a full backup's `data`. */
function backupData(goldens: readonly Golden[]): Record<string, unknown[]> {
	const data = emptyBackup()
	for (const golden of goldens.filter(isBackupSliced)) {
		const service = sliceOf(STORED_SHAPES[golden.shape])
		const slice = service ? BACKUP_SLICE_REGISTRY[service] : undefined
		if (!service || !slice) continue
		if (slice.kind !== "value-projection") {
			data[service] = [...(data[service] ?? []), golden.value]
			continue
		}
		const projected = slice.fromStored(golden.value)
		if (!projected.ok) throw new Error(`${golden.id}: ${projected.reason}`)
		data[service] = projected.slice
	}
	return data
}

/** The migration in `ack` that refuses every backup exported at `version` on purpose, if any: the
 *  lowest acknowledged one above it, which the import names. */
export function acknowledgedBlock(
	version: number,
	migrations: readonly Migration[],
	ack: ReadonlySet<number> = IMPORT_BLOCKING_ACK,
): number | undefined {
	const blocking = migrations.map((m) => m.version).filter((v) => v > version && ack.has(v))
	return blocking.length > 0 ? Math.min(...blocking) : undefined
}

/** A backup-sliced golden's backup decoding when an acknowledged migration refuses its stamp's backups. */
export const REFUSED_BY_ACK = "refused by an acknowledged import-blocking migration"

/** The same goldens as a full backup's slices, through the backup-import migrator and back. */
async function decodeBackup(
	goldens: readonly Golden[],
	version: number,
	migrations: Migration[],
	ack: ReadonlySet<number>,
): Promise<Decoded> {
	const migrated = await migrateBackupData({ data: backupData(goldens), backupSchemaVersion: version, migrations })
	const block = acknowledgedBlock(version, migrations, ack)
	if (block !== undefined && migrated.kind === "incompatible" && migrated.reason.includes(`migration ${block} `))
		return Object.fromEntries(goldens.filter(isBackupSliced).map((golden) => [golden.id, REFUSED_BY_ACK]))
	if (migrated.kind !== "noop" && migrated.kind !== "migrated")
		throw new Error(`the backup migrator refused goldens at v${version}: ${JSON.stringify(migrated)}`)
	const normalized = normalizeBackupData(migrated.data)
	if (!normalized.ok) throw new Error(`a migrated backup of the goldens does not normalize: ${normalized.reason}`)
	const area = new MemoryStorageArea().seed(normalized.normalized.entries)
	const decoded: Decoded = {}
	for (const golden of goldens.filter(isBackupSliced))
		decoded[golden.id] = decodedOf(await readStored(golden.shape, area, golden.key, GOLDEN_NOW))
	return decoded
}

/** `stored`: each golden's row as the migrations leave it in storage, a current-shape sample. */
export type Decoding = { live: Decoded; backup: Decoded; keys: Record<number, string[]>; stored: Decoded }

/** Every golden decoded after the given migrations, each stamp's rows seeded at that stamp's version. */
export async function decodeGoldens(
	goldens: readonly Golden[],
	stamps: readonly Pick<Stamp, "version">[],
	migrations: Migration[],
	ack: ReadonlySet<number> = IMPORT_BLOCKING_ACK,
): Promise<Decoding> {
	const out: Decoding = { live: {}, backup: {}, keys: {}, stored: {} }
	for (const [index, stamp] of stamps.entries()) {
		for (const round of rounds(goldens.filter((golden) => golden.stamp === index))) {
			const live = await decodeLive(round, stamp.version, migrations)
			Object.assign(out.live, live.decoded)
			Object.assign(out.stored, live.stored)
			out.keys[index] = [...new Set([...(out.keys[index] ?? []), ...live.keys])].sort()
			Object.assign(out.backup, await decodeBackup(round, stamp.version, migrations, ack))
		}
	}
	return out
}

/** A stamp's goldens in as few stores as hold them with no two on one key: a value key holds one
 *  row, so its `full` and `minimal` goldens are read in stores of their own. */
function rounds(goldens: readonly Golden[]): Golden[][] {
	const out: Golden[][] = []
	for (const golden of goldens) {
		const round = out.find((stores) => !stores.some((other) => other.key === golden.key))
		if (round) round.push(golden)
		else out.push([golden])
	}
	return out
}

/** The shapes whose record differs between two stamps, added and removed ones included. */
export function changedShapes(prev: Pick<Stamp, "shapes">, cur: Pick<Stamp, "shapes">): string[] {
	const names = new Set([...Object.keys(prev.shapes), ...Object.keys(cur.shapes)])
	return [...names].filter((name) => canonicalText(prev.shapes[name] ?? null) !== canonicalText(cur.shapes[name] ?? null)).sort()
}

const sameRef = (a: StorageRef, b: StorageRef) => canonicalText(a) === canonicalText(b)
const restricted = (record: ShapeRecord | undefined) =>
	record !== undefined && (record.encoding === "structured" || record.engine || record.authenticated || record.sealed)

/** What a downgrade of `name` from `prev` to `cur` would weaken, or `undefined`. */
function downgradeOf(name: string, prev: ShapeRecord, cur: ShapeRecord): string | undefined {
	if (prev.authenticated && !cur.authenticated) return `${name} drops its MAC check`
	if (prev.engine && !cur.engine) return `${name} stops being engine state`
	if (prev.sealed && !cur.sealed) return `${name} drops its seal`
	if (prev.read === "codec" && cur.read === "described") return `${name} stops reading through its codec`
	if (prev.encoding !== cur.encoding) return `${name} changes its encoding from ${prev.encoding} to ${cur.encoding}`
	if (prev.options !== undefined && canonicalText(prev.options) !== canonicalText(cur.options ?? null))
		return `${name} changes its key-identity options`
	return undefined
}

function migrationProblems(prev: Stamp, cur: Stamp, changed: readonly string[], migrations: readonly Migration[]): string[] {
	const migration = migrations.find((m) => m.version === cur.version)
	if (cur.migration !== cur.version || !migration) return [`v${cur.version} names no registered migration ${cur.version}`]
	const footprint = [...migration.reads, ...migration.writes]
	const restrictedNames = new Set(
		[...Object.keys(prev.shapes), ...Object.keys(cur.shapes)].filter(
			(name) => restricted(prev.shapes[name]) || restricted(cur.shapes[name]),
		),
	)
	const written = [...restrictedNames].filter((name) => {
		const { ref } = cur.shapes[name] ?? prev.shapes[name] ?? {}
		return ref && !changed.includes(name) && migration.writes.some((write) => sameRef(write, ref))
	})
	return [
		...written.map((name) => `migration ${cur.version} writes ${name}, which is structured, engine, authenticated or sealed`),
		...changed.flatMap((name) => {
			if (restrictedNames.has(name)) return [`${name} is structured, engine, authenticated or sealed: no migration may change it`]
			const { ref } = cur.shapes[name] ?? prev.shapes[name] ?? {}
			return ref && footprint.some((covered) => sameRef(covered, ref))
				? []
				: [`${name} changed, but migration ${cur.version}'s footprint does not cover it`]
		}),
	]
}

function additiveProblems(cur: Stamp, changed: readonly string[]): string[] {
	const problems = changed.filter((name) => !cur.shapes[name]).map((name) => `${name} is removed with no migration`)
	if (cur.migration !== undefined) problems.push(`a same-version stamp names migration ${cur.migration}`)
	if (!cur.additive || cur.additive.reason.trim() === "")
		return [...problems, "a same-version change needs an additive mark with a reason"]
	if (canonicalText([...cur.additive.names].sort()) !== canonicalText(changed)) {
		problems.push(
			`the additive mark names ${JSON.stringify(cur.additive.names)}, but the changed shapes are ${JSON.stringify(changed)}`,
		)
	}
	return problems
}

/**
 * Why `cur` may not follow `prev`, empty when it may: a `+1` version names its registered migration,
 * whose footprint covers every changed or removed shape and none of them structured, engine,
 * authenticated or sealed; a same version carries an additive mark naming exactly the changed shapes and
 * removes none. No step weakens how a shape it keeps is read. Both stamps' restrictions apply.
 */
export function justify(prev: Stamp, cur: Stamp, migrations: readonly Migration[]): string[] {
	const changed = changedShapes(prev, cur)
	const downgrades = changed.flatMap((name) => {
		const before = prev.shapes[name]
		const after = cur.shapes[name]
		const downgrade = before && after ? downgradeOf(name, before, after) : undefined
		return downgrade ? [downgrade] : []
	})
	if (cur.version === prev.version + 1) return [...downgrades, ...migrationProblems(prev, cur, changed, migrations)]
	if (cur.version === prev.version) return [...downgrades, ...additiveProblems(cur, changed)]
	return [...downgrades, `v${prev.version} → v${cur.version} skips or rewinds the schema version`]
}

/** Every JSON path of `before` that `after` lacks or holds differently. */
export function lostPaths(before: Json, after: Json, path = ""): string[] {
	if (before === null || typeof before !== "object") return canonicalText(before) === canonicalText(after) ? [] : [path || "/"]
	if (after === null || typeof after !== "object" || Array.isArray(before) !== Array.isArray(after)) return [path || "/"]
	const lost: string[] = []
	for (const [key, value] of Object.entries(before)) {
		const next = (after as Record<string, Json>)[key]
		if (next === undefined) lost.push(`${path}/${key}`)
		else lost.push(...lostPaths(value as Json, next, `${path}/${key}`))
	}
	return lost
}

/** The goldens a stamp introduced, in file order. */
export const introducedBy = (goldens: readonly Golden[], index: number): Golden[] => goldens.filter((golden) => golden.stamp === index)

async function sha256(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function pinOf(stamp: Stamp, goldens: readonly Golden[], index: number): Promise<Pin> {
	return { stamp: await sha256(canonicalText(stamp)), goldens: await sha256(canonicalText(introducedBy(goldens, index))) }
}

/** The shapes a migration's footprint covers; a structured, engine, authenticated or sealed one never is. */
function coveredBy(migration: Migration | undefined, stamp: Stamp): Set<string> {
	const refs = migration ? [...migration.reads, ...migration.writes] : []
	return new Set(
		(Object.keys(STORED_SHAPES) as StoredShapeName[]).filter(
			(name) => !restricted(stamp.shapes[name]) && refs.some((ref) => sameRef(ref, STORED_SHAPES[name].ref)),
		),
	)
}

/** Every old golden outside the step's migration footprint keeps each value it decoded to (new
 *  paths may appear), so a stamp cannot change an old row's value unseen. */
export function preservationProblems(prev: Stamp, cur: Stamp, goldens: readonly Golden[], migrations: readonly Migration[]): string[] {
	const covered = coveredBy(cur.migration === undefined ? undefined : migrations.find((m) => m.version === cur.migration), prev)
	const shapeOf = new Map(goldens.map((golden) => [golden.id, golden.shape]))
	return Object.entries(prev.expected).flatMap(([id, before]) => {
		const shape = shapeOf.get(id)
		if (shape && covered.has(shape)) return []
		const after = cur.expected[id]
		if (after === undefined) return [`golden ${id} has no expectation in v${cur.version}`]
		return lostPaths(before, after).map(
			(path) => `golden ${id} (${shape ?? "unknown shape"}) changes ${path} with no migration covering it`,
		)
	})
}

export type Proposal =
	| { kind: "unchanged" }
	| { kind: "rewrite"; stamp: Stamp }
	| { kind: "append"; stamp: Stamp }
	| { kind: "refused"; reasons: string[] }

/**
 * What the generator writes next. Unfrozen, the one stamp is rewritten. Frozen, an unchanged
 * registry and unchanged decodes are a no-op; otherwise a stamp is appended when the step is a
 * registered `+1` migration or carries `additive`, and only if it satisfies {@link justify} and
 * {@link preservationProblems}; anything else is refused with both ways out.
 */
export async function propose(
	snapshot: Snapshot,
	goldens: readonly Golden[],
	{ frozen, additive, migrations }: { frozen: boolean; additive?: string; migrations: Migration[] },
): Promise<Proposal> {
	const base = { version: schemaVersionOf(migrations), zod: zodVersion(), shapes: currentShapes() }
	if (!frozen) {
		const strays = goldens.filter((golden) => golden.stamp !== 0).map((golden) => golden.id)
		if (strays.length > 0)
			return { kind: "refused", reasons: [`before the freeze every golden belongs to stamp 0: ${strays.join(", ")}`] }
		const { live } = await decodeGoldens(goldens, [base], migrations)
		return { kind: "rewrite", stamp: { ...base, expected: live } }
	}
	const last = snapshot.stamps.at(-1)
	if (!last) return { kind: "refused", reasons: ["the baseline is pinned but snapshot.json holds no stamp"] }
	const { live } = await decodeGoldens(goldens, [...snapshot.stamps, base], migrations)
	const unchanged =
		changedShapes(last, base).length === 0 &&
		last.version === base.version &&
		last.zod === base.zod &&
		canonicalText(last.expected) === canonicalText(live)
	if (unchanged) return { kind: "unchanged" }
	const step =
		base.version === last.version + 1
			? { migration: base.version }
			: additive
				? { additive: { names: changedShapes(last, base), reason: additive } }
				: undefined
	if (!step) {
		const changed = changedShapes(last, base)
		return {
			kind: "refused",
			reasons: [
				`stored shapes changed since v${last.version} with no migration or additive mark: ${changed.join(", ") || "(decoded goldens only)"}`,
				`either register migration ${last.version + 1} (copy wallet/storage/migrations/template.ts) and run this again,`,
				`or, when every row already stored still reads to what it did, run it with -- --additive "<why old rows still read>"`,
			],
		}
	}
	const stamp: Stamp = { ...base, expected: live, ...step }
	const reasons = [...justify(last, stamp, migrations), ...preservationProblems(last, stamp, goldens, migrations)]
	return reasons.length > 0 ? { kind: "refused", reasons } : { kind: "append", stamp }
}
