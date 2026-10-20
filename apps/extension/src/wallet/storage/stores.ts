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
import { ACCOUNT_STORAGE_ROOT, AccountSchema, IMPORTED_KEYS_STORAGE_ROOT, ImportedAccountKeySchema } from "@/wallet/services/account/spec"
import {
	AUTH_REGISTRY_ENABLED_STORAGE_ROOT,
	AUTH_REGISTRY_STORAGE_ROOT,
	AuthwitSchema,
	AuthwitStatusSchema,
} from "@/wallet/services/auth-registry/spec"
import { CONTACT_STORAGE_ROOT, ContactSchema } from "@/wallet/services/contact/spec"
import { DAPP_SESSION_STORAGE_ROOT, DappSessionSchema } from "@/wallet/services/dapp-session/spec"
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
import { TOKEN_SEEDED_STORAGE_ROOT, TOKEN_STORAGE_ROOT, TokenSchema } from "@/wallet/services/token/spec"
import { TOKEN_BALANCE_STORAGE_ROOT, TokenBalanceRawSchema } from "@/wallet/services/token-balance/spec"
import { TOKEN_LIST_STORAGE_KEY } from "@/wallet/services/token-list/spec"
import { TRANSACTION_STORAGE_ROOT, TxSchema } from "@/wallet/services/transaction/spec"

export type KeyIdentityOptions = { requireKeyIdentityMatch: true; keyIdentityMode?: "numeric" }

type RootRef = Extract<StorageRef, { kind: "root" }>
type ValueRef = Extract<StorageRef, { kind: "value" }>

/** An EntityStorage root whose zod codec is its read code. */
export type CodecStore<S extends z.ZodType = z.ZodType> = { kind: "entity"; ref: RootRef; schema: S; options?: KeyIdentityOptions }
/** An EntityStorage root read with no codec: its service checks every row it uses. */
export type PlainEntityStore = { kind: "entity"; ref: RootRef; options?: KeyIdentityOptions }
/** A ValueStorage key read with no codec; a `root` ref is one key per profile, `${root}@${id}`. */
export type PlainValueStore = { kind: "value"; ref: RootRef | ValueRef }
export type Store = CodecStore | PlainEntityStore | PlainValueStore

const codec = <S extends z.ZodType>(root: string, schema: S, options?: KeyIdentityOptions) =>
	({ kind: "entity", ref: { kind: "root", root }, schema, ...(options ? { options } : {}) }) as const
const plainEntity = (root: string, options: KeyIdentityOptions) => ({ kind: "entity", ref: { kind: "root", root }, options }) as const
const value = (key: string) => ({ kind: "value", ref: { kind: "value", key } }) as const
const perProfileValue = (root: string) => ({ kind: "value", ref: { kind: "root", root } }) as const

/** Ids minted `max + 1` over the key space: every identity decision downstream trusts the embedded id.
 *  The default string mode would hide every numeric row while `getKeys()` still saw its key. */
const NUMERIC_ID = { requireKeyIdentityMatch: true, keyIdentityMode: "numeric" } as const

export const STORES = {
	accounts: codec(ACCOUNT_STORAGE_ROOT, AccountSchema),
	importedAccountKeys: codec(IMPORTED_KEYS_STORAGE_ROOT, ImportedAccountKeySchema),
	authRegistry: codec(AUTH_REGISTRY_STORAGE_ROOT, AuthwitSchema, NUMERIC_ID),
	authRegistryEnabled: codec(AUTH_REGISTRY_ENABLED_STORAGE_ROOT, AuthwitStatusSchema),
	contacts: codec(CONTACT_STORAGE_ROOT, ContactSchema),
	dappSessions: codec(DAPP_SESSION_STORAGE_ROOT, DappSessionSchema),
	fpcs: codec(FPC_STORAGE_ROOT, StoredFpcSchema),
	journal: codec(OPERATION_JOURNAL_STORAGE_ROOT, OperationRecordSchema),
	networks: codec(NETWORK_STORAGE_ROOT, NetworkRowSchema),
	tokens: codec(TOKEN_STORAGE_ROOT, TokenSchema),
	tokenBalances: codec(TOKEN_BALANCE_STORAGE_ROOT, TokenBalanceRawSchema, NUMERIC_ID),
	txs: codec(TRANSACTION_STORAGE_ROOT, TxSchema),
	incomingTransfers: codec(INCOMING_RECORDS_STORAGE_ROOT, IncomingTransferRecordSchema),
	incomingTrust: codec(INCOMING_TRUST_STORAGE_ROOT, IncomingTrustRecordSchema),
	incomingPublicCursors: codec(INCOMING_CURSORS_STORAGE_ROOT, PublicScanCursorSchema),
	incomingBalanceOutbox: codec(INCOMING_OUTBOX_STORAGE_ROOT, IncomingBalanceOutboxRowSchema),
	incomingArrivals: codec(INCOMING_ARRIVALS_STORAGE_ROOT, ArrivalRowSchema),
	// Every sealed-slot, MAC and fingerprint decision trusts the row fetched by its id.
	profiles: plainEntity(PROFILE_STORAGE_ROOT, { requireKeyIdentityMatch: true }),
	config: value(CONFIG_STORAGE_KEY),
	tokenPrices: value(TOKEN_PRICES_STORAGE_KEY),
	tokenList: value(TOKEN_LIST_STORAGE_KEY),
	tokenSeeded: perProfileValue(TOKEN_SEEDED_STORAGE_ROOT),
} as const satisfies Record<string, Store>

type Stores = typeof STORES
export type StoreName = keyof Stores
type NamesWhere<C> = { [N in StoreName]: Stores[N] extends C ? N : never }[StoreName]
export type CodecStoreName = NamesWhere<CodecStore>
export type PlainEntityStoreName = Exclude<NamesWhere<{ kind: "entity" }>, CodecStoreName>
export type ValueStoreName = NamesWhere<{ kind: "value"; ref: ValueRef }>
export type PerProfileValueStoreName = NamesWhere<{ kind: "value"; ref: RootRef }>

/** The value a codec store reads: its schema's output. */
export type StoredRow<N extends CodecStoreName> = z.output<Stores[N]["schema"]>

/** The local store `name` names, reading through its registered codec and key-identity options. */
export function entityStorage<N extends CodecStoreName>(name: N, area: MinimalStorageArea): EntityStorage<StoredRow<N>>
/** A store with no codec: `T` is the caller's claim, which the registry's writer-type check holds. */
export function entityStorage<T>(name: PlainEntityStoreName, area: MinimalStorageArea): EntityStorage<T>
export function entityStorage(name: CodecStoreName | PlainEntityStoreName, area: MinimalStorageArea): EntityStorage<unknown> {
	const store: CodecStore | PlainEntityStore = STORES[name]
	const parse = "schema" in store ? (raw: unknown) => store.schema.parse(raw) : undefined
	return new EntityStorage<unknown>(store.ref.root, area, parse, store.options)
}

export function valueStorage<T>(name: ValueStoreName, area: MinimalStorageArea): ValueStorage<T>
export function valueStorage<T>(name: PerProfileValueStoreName, area: MinimalStorageArea, profileId: string): ValueStorage<T>
export function valueStorage<T>(
	name: ValueStoreName | PerProfileValueStoreName,
	area: MinimalStorageArea,
	profileId?: string,
): ValueStorage<T> {
	const { ref } = STORES[name]
	if (ref.kind === "value") return new ValueStorage<T>(ref.key, area)
	if (profileId === undefined) throw new Error(`${name} is one key per profile: a profile id is required`)
	return new ValueStorage<T>(`${ref.root}@${profileId}`, area)
}
