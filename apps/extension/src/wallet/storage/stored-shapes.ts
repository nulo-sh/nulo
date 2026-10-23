/**
 * Every key family the wallet keeps in `chrome.storage.local`, what is written under it, and how it
 * is read back. `stored-shapes.scan.test.ts` refuses a `nulo:` key that is not here, and
 * `stored-shapes/snapshot.test.ts` refuses a change to an entry the snapshot has not recorded:
 * once the baseline is frozen, one that ships neither a migration nor a reviewed additive mark.
 *
 * Read by tests and the baseline generator only: the wallet builds its stores from `./stores.ts`.
 */
import { LEGAL_ACCEPTANCE_KEY, parseAcceptanceRecord } from "@nulo/legal"
import {
	LEGACY_VERSION_KEY,
	SCHEMA_ATTEMPTS_KEY,
	SCHEMA_BACKUP_KEY,
	SCHEMA_RUNNING_KEY,
	SCHEMA_VERSION_KEY,
	type StorageRef,
} from "@nulo/wallet-core/migration"
import { z } from "zod"
import { readSendPicks, readAppPicks } from "@/utils/fee-picks"
import { LAST_ACTIVE_PROFILE_KEY } from "@/utils/lastActiveProfile"
import {
	FEE_PICKS_ROOT,
	GET_STARTED_AZTEC_OPENED_ROOT,
	GET_STARTED_BACKUP_SAVED_ROOT,
	GET_STARTED_FEE_JUICE_HELD_ROOT,
	GET_STARTED_HIDDEN_ROOT,
	GET_STARTED_PHRASE_SAVED_ROOT,
	GET_STARTED_PRESTO_OPENED_ROOT,
	PINNED_TOKENS_ROOT,
	PROFILE_IMPORTED_ROOT,
	PROFILE_NOT_FIRST_ROOT,
	RESTORE_OUTCOME_ROOT,
	SEND_FEE_PICKS_ROOT,
} from "@/utils/profile-ui-keys"
import { decodeRestoreOutcome } from "@/utils/restore-outcome"
import { sanitizePinMap } from "@/composables/usePinnedTokens"
import { ConfigSchema } from "@/wallet/config/config"
import { decodeStoredConfig } from "@/wallet/config/store"
import { ACCOUNT_INTEGRITY_BLOCKED_ROOT, ACCOUNT_INTEGRITY_VERIFIED_ROOT } from "@/wallet/services/account-integrity/types"
import { decodeRegistrationCounts, RegistrationCountsSchema } from "@/wallet/services/dapp-session/registration-allowance"
import { AccountIntegrityBlockedSchema, VerifiedStampSchema } from "@/wallet/services/account-integrity/types"
import { SEED_OFFERS_ROOT, SeedOffersSchema } from "@/wallet/services/network/seed-offers"
import { ACTIVE_NETWORK_STORAGE_ROOT, decodeActiveNetworkId } from "@/wallet/services/network/spec"
import { usableQuotes } from "@/wallet/services/price/service"
import { RESTORE_PENDING_ROOT, RestorePendingSchema } from "@/wallet/services/profile/restore-pending-repository"
import { PROFILE_TOMBSTONE_ROOT, TombstoneSchema } from "@/wallet/services/profile/tombstone-repository"
import {
	NETWORK_RESET_DONE_ROOT,
	NETWORK_RESET_ROOT,
	ResetJournalSchema,
	ResetNoticeSchema,
	STALE_NETWORKS_ROOT,
	StaleNetworksRecordSchema,
} from "@/wallet/services/stale-network/types"
import { decodeSeedMarkers } from "@/wallet/services/token/seeder"
import { decodeTokenListState } from "@/wallet/services/token-list/service"
import { SCHEMA_BLOCKED_KEY, SCHEMA_DEGRADED_KEY, SCHEMA_RETRY_REQUESTED_KEY } from "./migrations"
import { type KeyIdentityOptions, type SealedStoreName, STORES, type StoreName } from "./stores"

/** How a stored value is read: `json` is a `JSON.stringify` string, `structured` an object or bare
 *  value written as is. The migration engine stages json only. */
export type StoredEncoding = "json" | "structured"

/** A hand-written read: the decoded value of one stored value at `now`. For a json store, `value` is
 *  what its `ValueStorage` / `EntityStorage` returns (a read that throws is `undefined`). */
export type StoredDecoder = (value: unknown, now: number) => unknown

export type StoredShape = {
	ref: StorageRef
	encoding: StoredEncoding
	/** `read: "codec"`: the codec every read parses with. Otherwise the shape the writer stores. */
	schema: z.ZodType
	read: "codec" | StoredDecoder
	options?: KeyIdentityOptions
	/** Read through a MAC over the parsed row: a schema change that alters what a row parses to
	 *  fails every stored row's check, which deletes it. */
	authenticated?: true
	/** The migration engine's and the boot gate's own state, which no migration can cover. */
	engine?: true
	/** Each row is a row-seal envelope over a row `schema` reads: only an unlocked profile's keys
	 *  open it, so the pre-unlock migration engine can never cover it. */
	sealed?: true
}

const root = (r: string): StorageRef => ({ kind: "root", root: r })
const value = (key: string): StorageRef => ({ kind: "value", key })

function fromStore(name: SealedStoreName): StoredShape {
	const { ref, schema, ...rest } = STORES[name]
	const options = "options" in rest ? rest.options : undefined
	const sealed = "sealed" in rest && rest.sealed === true
	return { ref, encoding: "json", schema, read: "codec", ...(options ? { options } : {}), ...(sealed ? { sealed: true as const } : {}) }
}

function described(name: Exclude<StoreName, SealedStoreName>, schema: z.ZodType, read: StoredDecoder): StoredShape {
	const store = STORES[name]
	const options = "options" in store ? store.options : undefined
	return { ref: store.ref, encoding: "json", schema, read, ...(options ? { options } : {}) }
}

/** A sealed root whose service reads the opened row with its own decoder, not a codec. */
function sealedDescribed(name: SealedStoreName, schema: z.ZodType, read: StoredDecoder): StoredShape {
	return { ref: STORES[name].ref, encoding: "json", schema, read, sealed: true }
}

const rawRow = (r: string, schema: z.ZodType): StoredShape => ({ ref: root(r), encoding: "json", schema, read: "codec" })
const asStored: StoredDecoder = (v) => v

/** A per-profile flag of Home's Get started card (`utils/get-started.ts`): written `true` only, and
 *  anything else reads as not set. */
const uiFlag = (r: string): StoredShape => ({ ref: root(r), encoding: "structured", schema: z.literal(true), read: (v) => v === true })

export const PriceStateSchema = z.record(
	z.string(),
	z.object({ coingeckoId: z.string(), usd: z.number(), fetchedAt: z.number(), providerUpdatedAt: z.number().nullable() }),
)

export const TokenListStateSchema = z.object({
	envelope: z.string().optional(),
	lastSuccessAt: z.number().optional(),
	nextAttemptAt: z.number().optional(),
	failures: z.number(),
})

export const SeedMarkersSchema = z.record(
	z.string(),
	z.object({
		attempts: z.number(),
		cappedAtVersion: z.string().optional(),
		rejectedAtVersion: z.string().optional(),
		nextAttemptAt: z.number().optional(),
		outcome: z.enum(["seeded", "deleted"]).optional(),
		observedDecimals: z.number().optional(),
		verifiedPins: z.string().optional(),
	}),
)

const profileBase = { id: z.string(), name: z.string(), pxeGeneration: z.string(), dekSealed: z.string(), walletFingerprint: z.string() }
export const ProfileRowSchema = z.discriminatedUnion("type", [
	z.object({
		...profileBase,
		type: z.literal("password"),
		guard: z.string(),
		secret: z.string(),
		entropy: z.string(),
		envelopeMac: z.string(),
	}),
	z.object({ ...profileBase, type: z.literal("passkey"), credentialId: z.string() }),
])

const legalEntry = {
	termsVersion: z.string(),
	privacyVersionShown: z.string(),
	acceptedAt: z.number(),
	surface: z.enum(["onboarding", "popup"]),
}
export const LegalAcceptanceSchema = z.object({ ...legalEntry, history: z.array(z.object(legalEntry)) })

const feePickType = z.enum(["fj", "private_fpc", "fpc"])
export const AppPicksSchema = z.record(
	z.string(),
	z.object({
		type: feePickType,
		title: z.string().optional(),
		subtitle: z.string().optional(),
		fpc: z.object({ id: z.string(), isProtocol: z.boolean().optional() }).optional(),
	}),
)
const sendPick = z.object({ type: feePickType, fpc: z.object({ id: z.string(), name: z.string().optional() }).nullable().optional() })
export const SendPicksSchema = z.record(z.string(), z.object({ private: sendPick.optional(), public: sendPick.optional() }))

export const RestoreOutcomeSchema = z.object({
	run: z.string(),
	backup: z.string(),
	networkIds: z.array(z.string()),
	leaseUntil: z.number(),
})

const storageRef = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("root"), root: z.string() }),
	z.object({ kind: z.literal("value"), key: z.string() }),
])
export const MigrationBlockedSchema = z.object({
	kind: z.enum(["needs-recovery", "failed"]),
	detail: z.string(),
	terminal: z.boolean(),
	atExtensionVersion: z.string(),
	lastAttemptAt: z.number(),
	backstopRuns: z.number(),
	gestureRuns: z.number(),
	claimedAt: z.number().optional(),
})
export const MigrationDegradedSchema = z.object({ version: z.number(), error: z.string() })

/** The engine's own keys, read by its decoders (`decodeBlockedStatus`, `isValidRetryRequest`), never
 *  through `read`: they have no goldens, and no migration may write them. */
const engine = (key: string, schema: z.ZodType): StoredShape => ({
	ref: value(key),
	encoding: "structured",
	schema,
	read: asStored,
	engine: true,
})

export const STORED_SHAPES = {
	accounts: fromStore("accounts"),
	importedAccountKeys: fromStore("importedAccountKeys"),
	authRegistry: fromStore("authRegistry"),
	authRegistryEnabled: fromStore("authRegistryEnabled"),
	contacts: fromStore("contacts"),
	dappSessions: { ...fromStore("dappSessions"), authenticated: true },
	fpcs: fromStore("fpcs"),
	journal: fromStore("journal"),
	networks: fromStore("networks"),
	tokens: fromStore("tokens"),
	tokenBalances: fromStore("tokenBalances"),
	txs: fromStore("txs"),
	incomingTransfers: fromStore("incomingTransfers"),
	incomingTrust: fromStore("incomingTrust"),
	incomingPublicCursors: fromStore("incomingPublicCursors"),
	incomingBalanceOutbox: fromStore("incomingBalanceOutbox"),
	incomingArrivals: fromStore("incomingArrivals"),

	profileTombstones: rawRow(PROFILE_TOMBSTONE_ROOT, TombstoneSchema),
	restorePending: rawRow(RESTORE_PENDING_ROOT, RestorePendingSchema),
	accountIntegrityBlocked: rawRow(ACCOUNT_INTEGRITY_BLOCKED_ROOT, AccountIntegrityBlockedSchema),
	accountIntegrityVerified: rawRow(ACCOUNT_INTEGRITY_VERIFIED_ROOT, VerifiedStampSchema),
	staleNetworks: rawRow(STALE_NETWORKS_ROOT, StaleNetworksRecordSchema),
	networkReset: rawRow(NETWORK_RESET_ROOT, ResetJournalSchema),
	networkResetDone: rawRow(NETWORK_RESET_DONE_ROOT, ResetNoticeSchema),
	networkSeeded: rawRow(SEED_OFFERS_ROOT, SeedOffersSchema),

	// No profile codec: a row the service cannot fully check still opens derived-only.
	profiles: described("profiles", ProfileRowSchema, asStored),
	config: described("config", ConfigSchema, (v) => decodeStoredConfig(v)),
	tokenPrices: described("tokenPrices", PriceStateSchema, usableQuotes),
	tokenList: described("tokenList", TokenListStateSchema, decodeTokenListState),
	tokenSeeded: sealedDescribed("tokenSeeded", SeedMarkersSchema, decodeSeedMarkers),
	dappRegistrations: sealedDescribed("dappRegistrations", RegistrationCountsSchema, decodeRegistrationCounts),

	activeNetwork: { ref: root(ACTIVE_NETWORK_STORAGE_ROOT), encoding: "structured", schema: z.string(), read: decodeActiveNetworkId },
	legalAccepted: { ref: value(LEGAL_ACCEPTANCE_KEY), encoding: "structured", schema: LegalAcceptanceSchema, read: parseAcceptanceRecord },
	// The popup compares the stored address with its accounts; anything else matches none.
	uiActiveAccount: { ref: value("nulo:ui:activeAccount"), encoding: "structured", schema: z.string(), read: asStored },
	uiLastActiveProfile: { ref: value(LAST_ACTIVE_PROFILE_KEY), encoding: "structured", schema: z.string(), read: asStored },
	// `useSyncedRef("loggerWindowId")`: the log viewer's window id, or null with none open.
	uiLoggerWindowId: { ref: value("nulo:ui:loggerWindowId"), encoding: "structured", schema: z.number().nullable(), read: asStored },
	onboardingCompleted: {
		ref: value("nulo:onboarding:completed"),
		encoding: "structured",
		schema: z.boolean(),
		read: (v) => v === true,
	},
	uiPinnedTokens: {
		ref: root(PINNED_TOKENS_ROOT),
		encoding: "structured",
		schema: z.record(z.string(), z.array(z.string())),
		read: sanitizePinMap,
	},
	uiFeePicks: { ref: root(FEE_PICKS_ROOT), encoding: "structured", schema: AppPicksSchema, read: readAppPicks },
	uiSendFeePicks: { ref: root(SEND_FEE_PICKS_ROOT), encoding: "structured", schema: SendPicksSchema, read: readSendPicks },
	uiRestoreOutcome: { ref: root(RESTORE_OUTCOME_ROOT), encoding: "structured", schema: RestoreOutcomeSchema, read: decodeRestoreOutcome },
	uiGetStartedPhraseSaved: uiFlag(GET_STARTED_PHRASE_SAVED_ROOT),
	uiGetStartedBackupSaved: uiFlag(GET_STARTED_BACKUP_SAVED_ROOT),
	uiGetStartedAztecOpened: uiFlag(GET_STARTED_AZTEC_OPENED_ROOT),
	uiGetStartedHidden: uiFlag(GET_STARTED_HIDDEN_ROOT),
	uiGetStartedFeeJuiceHeld: uiFlag(GET_STARTED_FEE_JUICE_HELD_ROOT),
	uiGetStartedPrestoOpened: uiFlag(GET_STARTED_PRESTO_OPENED_ROOT),
	uiProfileImported: uiFlag(PROFILE_IMPORTED_ROOT),
	uiProfileNotFirst: uiFlag(PROFILE_NOT_FIRST_ROOT),

	schemaVersion: engine(SCHEMA_VERSION_KEY, z.number()),
	schemaRunning: engine(SCHEMA_RUNNING_KEY, z.number()),
	schemaBackup: engine(
		SCHEMA_BACKUP_KEY,
		z.object({
			version: z.number(),
			refs: z.array(storageRef),
			entries: z.record(z.string(), z.unknown()),
			counted: z.literal(true).optional(),
		}),
	),
	schemaAttempts: engine(SCHEMA_ATTEMPTS_KEY, z.object({ version: z.number(), phase: z.enum(["up", "restore"]), count: z.number() })),
	schemaBlocked: engine(SCHEMA_BLOCKED_KEY, MigrationBlockedSchema),
	schemaDegraded: engine(SCHEMA_DEGRADED_KEY, MigrationDegradedSchema),
	schemaRetryRequested: engine(SCHEMA_RETRY_REQUESTED_KEY, z.object({ requestedAt: z.number() })),
	// The forked app's marker: its presence alone stops the engine, whatever it holds.
	legacyStorageVersion: engine(LEGACY_VERSION_KEY, z.unknown().describe("any value: read by presence only")),
} as const satisfies Record<string, StoredShape>

export type StoredShapeName = keyof typeof STORED_SHAPES
