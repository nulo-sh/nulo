/**
 * Every `chrome.storage.local` store the wallet builds as an `EntityStorage` or a `ValueStorage`,
 * and the only place that constructs one. A store is built from its entry, so the root, the codec
 * and the key-identity options a service reads with are the ones the stored-shape registry
 * (`./stored-shapes.ts`) snapshots.
 *
 * Imports only spec modules: a service importing this must never close an import cycle.
 */
import type { StorageRef } from "@nulo/wallet-core/migration"
import { EntityStorage, type MinimalStorageArea, ValueStorage } from "@nulo/wallet-core/storage"
import type { z } from "zod"
import { CONFIG_STORAGE_KEY } from "@/wallet/config/config"
import {
	ACCOUNT_STORAGE_ROOT,
	AccountSchema,
	accountRowId,
	IMPORTED_KEYS_STORAGE_ROOT,
	ImportedAccountKeySchema,
	parseAccountRowId,
} from "@/wallet/services/account/spec"
import {
	AUTH_REGISTRY_ENABLED_STORAGE_ROOT,
	AUTH_REGISTRY_STORAGE_ROOT,
	AuthwitSchema,
	AuthwitStatusSchema,
	authwitStatusRowId,
	parseAuthwitStatusRowId,
} from "@/wallet/services/auth-registry/spec"
import { CONTACT_STORAGE_ROOT, ContactSchema } from "@/wallet/services/contact/spec"
import {
	DAPP_REGISTRATIONS_STORAGE_ROOT,
	DAPP_SESSION_STORAGE_ROOT,
	DappSessionSchema,
	RegistrationCountsRowSchema,
} from "@/wallet/services/dapp-session/spec"
import { FPC_STORAGE_ROOT, StoredFpcSchema } from "@/wallet/services/fpc/spec"
import { ArrivalRowSchema } from "@/wallet/services/incoming-transfer/arrival-state"
import {
	INCOMING_ARRIVALS_STORAGE_ROOT,
	INCOMING_CURSORS_STORAGE_ROOT,
	INCOMING_OUTBOX_STORAGE_ROOT,
	INCOMING_RECORDS_STORAGE_ROOT,
	INCOMING_TRUST_STORAGE_ROOT,
	IncomingBalanceOutboxRowSchema,
	IncomingTransferRecordSchema,
	IncomingTrustRecordSchema,
	PublicScanCursorSchema,
} from "@/wallet/services/incoming-transfer/spec"
import { NETWORK_STORAGE_ROOT, NetworkRowSchema } from "@/wallet/services/network/spec"
import { OPERATION_JOURNAL_STORAGE_ROOT, OperationRecordSchema } from "@/wallet/services/operation-journal/spec"
import { TOKEN_PRICES_STORAGE_KEY } from "@/wallet/services/price/spec"
import { PROFILE_STORAGE_ROOT } from "@/wallet/services/profile/spec"
import { SeedMarkerRowSchema, TOKEN_SEEDED_STORAGE_ROOT, TOKEN_STORAGE_ROOT, TokenSchema } from "@/wallet/services/token/spec"
import { TOKEN_BALANCE_STORAGE_ROOT, TokenBalanceRawSchema } from "@/wallet/services/token-balance/spec"
import { TOKEN_LIST_STORAGE_KEY } from "@/wallet/services/token-list/spec"
import { TRANSACTION_STORAGE_ROOT, TxSchema } from "@/wallet/services/transaction/spec"
import { type RowKeysSource, SealedEntityStorage, type SealedRootOptions } from "./sealed-entity-storage"

export type KeyIdentityOptions = { requireKeyIdentityMatch: true; keyIdentityMode?: "numeric" }

type RootRef = Extract<StorageRef, { kind: "root" }>
type ValueRef = Extract<StorageRef, { kind: "value" }>

/** An EntityStorage root whose zod codec is its read code. `sealed`: each row is stored as a
 *  row-seal envelope under its profile's row keys, laid out as `sealedRoot` says
 *  (`./sealed-entity-storage.ts`). */
export type CodecStore<S extends z.ZodType = z.ZodType> = {
	kind: "entity"
	ref: RootRef
	schema: S
	options?: KeyIdentityOptions
	sealed?: true
	sealedRoot?: SealedRootOptions
}
/** An EntityStorage root read with no codec: its service checks every row it uses. */
export type PlainEntityStore = { kind: "entity"; ref: RootRef; options?: KeyIdentityOptions }
/** A ValueStorage key read with no codec. */
export type PlainValueStore = { kind: "value"; ref: ValueRef }
export type Store = CodecStore | PlainEntityStore | PlainValueStore

const codec = <S extends z.ZodType>(root: string, schema: S, options?: KeyIdentityOptions) =>
	({ kind: "entity", ref: { kind: "root", root }, schema, ...(options ? { options } : {}) }) as const
const sealedCodec = <S extends z.ZodType>(root: string, schema: S, sealedRoot?: SealedRootOptions, options?: KeyIdentityOptions) =>
	({ ...codec(root, schema, options), sealed: true, ...(sealedRoot ? { sealedRoot } : {}) }) as const
const plainEntity = (root: string, options: KeyIdentityOptions) => ({ kind: "entity", ref: { kind: "root", root }, options }) as const
const value = (key: string) => ({ kind: "value", ref: { kind: "value", key } }) as const

/** Ids minted `max + 1` over the key space: every identity decision downstream trusts the embedded id.
 *  The default string mode would hide every numeric row while `getKeys()` still saw its key. */
const NUMERIC_ID = { requireKeyIdentityMatch: true, keyIdentityMode: "numeric" } as const

type KeyedHash = (segment: string) => Promise<string>

type IncomingScope = { scope: string; profileId: string; networkId: string; tail: string[] }

/** An incoming key, `[kind:]profileId|networkId|…`, split at its scope; with `tailLength`, only a
 *  key with exactly that many segments after its scope is one. */
function incomingScope(id: string, kinded: boolean, tailLength?: number): IncomingScope | undefined {
	const kind = kinded ? /^(?:note|pub):/.exec(id)?.[0] : ""
	if (kind === undefined) return undefined
	const [profileId, networkId, ...tail] = id.slice(kind.length).split("|")
	if (networkId === undefined || tail.length === 0 || (tailLength !== undefined && tail.length !== tailLength)) return undefined
	return { scope: `${kind}${profileId}|${networkId}|`, profileId, networkId, tail }
}

/** A record or trust row names its scope; one naming another than its key's belongs to no
 *  profile, so no lookup serves it and no profile's keys seal or open it. */
function bodyOwner(row: unknown, scope: IncomingScope): string | undefined {
	if (typeof row !== "object" || row === null) return undefined
	const { profileId, networkId } = row as { profileId?: unknown; networkId?: unknown }
	return profileId === scope.profileId && networkId === scope.networkId ? scope.profileId : undefined
}

type IncomingLayout = {
	hashTail: (tail: string[], keyedHash: KeyedHash) => Promise<string>
	tailLength?: number
	kinded?: boolean
	/** The row names its profile and network: a record or trust row. */
	scoped?: boolean
}

/** An incoming root's key keeps its kind, profile and network, so a scope wipe needs no key, and
 *  `hashTail` replaces what names a note, transaction, account or contract. A key of another shape
 *  belongs to no profile, so conversion skips it rather than failing on it. The rows that carry
 *  no scope (cursor, outbox, arrival) are owned by their key alone. */
function incomingLayout({ hashTail, tailLength, kinded = false, scoped = false }: IncomingLayout): SealedRootOptions {
	return {
		ownerOf: (row, naturalId) => {
			const parsed = incomingScope(naturalId, kinded, tailLength)
			if (!parsed) return undefined
			return scoped && row !== undefined ? bodyOwner(row, parsed) : parsed.profileId
		},
		keyed: {
			physicalId: async (naturalId, keyedHash) => {
				const parsed = incomingScope(naturalId, kinded, tailLength)
				if (!parsed) throw new Error("not an incoming id")
				return parsed.scope + (await hashTail(parsed.tail, keyedHash))
			},
		},
	}
}

const ONE_SEGMENT = { hashTail: (tail: string[], keyedHash: KeyedHash) => keyedHash(tail[0]), tailLength: 1 }

/** A flag's key keeps its profile and chain and replaces the account with its keyed hash; the
 *  flag is a bare boolean, so its key alone names the profile. */
const REGISTRY_FLAG_LAYOUT: SealedRootOptions = {
	ownerOf: (_row, naturalId) => parseAuthwitStatusRowId(naturalId)?.profileId,
	keyed: {
		physicalId: async (naturalId, keyedHash) => {
			const scope = parseAuthwitStatusRowId(naturalId)
			if (!scope) throw new Error("not a registry-flag id")
			return authwitStatusRowId(scope.profileId, scope.chainId, await keyedHash(scope.account))
		},
	},
}

/** An account or imported-key id, `["account", profileId, chainId, address]`, keeps its profile
 *  and chain and replaces the address with its keyed hash. The hash takes the address alone, so
 *  both roots store an account and its signing key at one id. The key alone names the profile, as
 *  it already did for a row its codec hides; the service still serves a row only where its body
 *  agrees with its key. */
const ACCOUNT_LAYOUT: SealedRootOptions = {
	ownerOf: (_row, naturalId) => parseAccountRowId(naturalId)?.profileId,
	keyed: {
		physicalId: async (naturalId, keyedHash) => {
			const id = parseAccountRowId(naturalId)
			if (!id) throw new Error("not an account id")
			return accountRowId(id.profileId, id.chainId, await keyedHash(id.address))
		},
	},
}

/** One row per profile, stored at the profile's id: the id alone names the owner. */
const PROFILE_ROW_LAYOUT: SealedRootOptions = { ownerOf: (_row, naturalId) => naturalId }

export const STORES = {
	accounts: sealedCodec(ACCOUNT_STORAGE_ROOT, AccountSchema, ACCOUNT_LAYOUT),
	importedAccountKeys: sealedCodec(IMPORTED_KEYS_STORAGE_ROOT, ImportedAccountKeySchema, ACCOUNT_LAYOUT),
	authRegistry: sealedCodec(AUTH_REGISTRY_STORAGE_ROOT, AuthwitSchema, undefined, NUMERIC_ID),
	authRegistryEnabled: sealedCodec(AUTH_REGISTRY_ENABLED_STORAGE_ROOT, AuthwitStatusSchema, REGISTRY_FLAG_LAYOUT),
	contacts: sealedCodec(CONTACT_STORAGE_ROOT, ContactSchema),
	dappSessions: sealedCodec(DAPP_SESSION_STORAGE_ROOT, DappSessionSchema),
	dappRegistrations: sealedCodec(DAPP_REGISTRATIONS_STORAGE_ROOT, RegistrationCountsRowSchema, PROFILE_ROW_LAYOUT),
	fpcs: sealedCodec(FPC_STORAGE_ROOT, StoredFpcSchema),
	journal: sealedCodec(OPERATION_JOURNAL_STORAGE_ROOT, OperationRecordSchema),
	networks: sealedCodec(NETWORK_STORAGE_ROOT, NetworkRowSchema),
	tokens: sealedCodec(TOKEN_STORAGE_ROOT, TokenSchema),
	tokenBalances: sealedCodec(TOKEN_BALANCE_STORAGE_ROOT, TokenBalanceRawSchema, undefined, NUMERIC_ID),
	tokenSeeded: sealedCodec(TOKEN_SEEDED_STORAGE_ROOT, SeedMarkerRowSchema, PROFILE_ROW_LAYOUT),
	// A tx hash links a row to on-chain activity, so no key carries one; rows written before rows
	// named their profile keep their hash until a profile is shown to own them.
	txs: sealedCodec(TRANSACTION_STORAGE_ROOT, TxSchema, {
		keyed: { physicalId: (hash, keyedHash) => keyedHash(hash) },
		ownerless: "plaintext",
	}),
	// A record's id ends in its note hash, or its transaction hash and log index.
	incomingTransfers: sealedCodec(
		INCOMING_RECORDS_STORAGE_ROOT,
		IncomingTransferRecordSchema,
		incomingLayout({ hashTail: (tail, keyedHash) => keyedHash(tail.join("|")), kinded: true, scoped: true }),
	),
	incomingTrust: sealedCodec(INCOMING_TRUST_STORAGE_ROOT, IncomingTrustRecordSchema, incomingLayout({ ...ONE_SEGMENT, scoped: true })),
	incomingPublicCursors: sealedCodec(INCOMING_CURSORS_STORAGE_ROOT, PublicScanCursorSchema, incomingLayout(ONE_SEGMENT)),
	// The account is hashed; the token id is a local sequence number.
	incomingBalanceOutbox: sealedCodec(
		INCOMING_OUTBOX_STORAGE_ROOT,
		IncomingBalanceOutboxRowSchema,
		incomingLayout({ hashTail: async (tail, keyedHash) => `${await keyedHash(tail[0])}|${tail[1]}`, tailLength: 2 }),
	),
	incomingArrivals: sealedCodec(INCOMING_ARRIVALS_STORAGE_ROOT, ArrivalRowSchema, incomingLayout(ONE_SEGMENT)),
	// Every sealed-slot, MAC and fingerprint decision trusts the row fetched by its id.
	profiles: plainEntity(PROFILE_STORAGE_ROOT, { requireKeyIdentityMatch: true }),
	config: value(CONFIG_STORAGE_KEY),
	tokenPrices: value(TOKEN_PRICES_STORAGE_KEY),
	tokenList: value(TOKEN_LIST_STORAGE_KEY),
} as const satisfies Record<string, Store>

type Stores = typeof STORES
export type StoreName = keyof Stores
type NamesWhere<C> = { [N in StoreName]: Stores[N] extends C ? N : never }[StoreName]
/** A sealed root is built only by {@link sealedEntityStorage}: no plain store reads or writes it. */
export type SealedStoreName = NamesWhere<{ sealed: true }>
export type PlainEntityStoreName = Exclude<NamesWhere<{ kind: "entity" }>, SealedStoreName>
export type ValueStoreName = NamesWhere<{ kind: "value" }>

/** The value a sealed root reads: its schema's output. */
export type StoredRow<N extends SealedStoreName> = z.output<Stores[N]["schema"]>

/** The roots whose rows are sealed at rest. */
export const SEALED_ROOTS: readonly string[] = Object.values(STORES as Record<string, Store>).flatMap((store) =>
	"sealed" in store && store.sealed === true ? [store.ref.root] : [],
)

/** The plain local store `name` names, read with no codec under its key-identity options: `T` is
 *  the caller's claim, which the registry's writer-type check holds. Every codec root is sealed. */
export function entityStorage<T>(name: PlainEntityStoreName, area: MinimalStorageArea): EntityStorage<T> {
	const store: PlainEntityStore = STORES[name]
	return new EntityStorage<T>(store.ref.root, area, undefined, store.options)
}

/** A sealed root, read and written through its registered codec and layout under the row keys
 *  `keys` holds. */
export function sealedEntityStorage<N extends SealedStoreName>(
	name: N,
	area: MinimalStorageArea,
	keys: RowKeysSource,
): SealedEntityStorage<StoredRow<N>> {
	const store: CodecStore = STORES[name]
	const inner = new EntityStorage<StoredRow<N>>(store.ref.root, area, (raw) => store.schema.parse(raw) as StoredRow<N>, store.options)
	return new SealedEntityStorage(inner, area, store.ref.root, keys, store.sealedRoot)
}

export function valueStorage<T>(name: ValueStoreName, area: MinimalStorageArea): ValueStorage<T> {
	return new ValueStorage<T>(STORES[name].ref.key, area)
}
