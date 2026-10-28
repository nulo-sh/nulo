/**
 * Full-backup restore stages, free of Vue reactivity. A caller passes a RestoreIo of LIVE
 * callbacks, never a captured error-log object: the log's ref value is replaced at restore start.
 */

import { asBase64MasterSecret, type PasskeyCredentialData } from "@nulo/wallet-crypto"
import { isClientDisconnectRejection, RpcDisconnectedError, SessionEndedError } from "@nulo/extension-messaging/errors"
import { awaitLivenessAdvance, readLiveness } from "@/utils/background-liveness"
import { logCredentialFailure } from "@/utils/credential-refusal"
import { capRecords, remapNetworkIdByChain, resolveRestoredActiveNetworkIdByChain } from "@/utils/full-backup-helpers"
import type { RestoreSecret, RunFence } from "@/wallet/services/profile/client"
import { admitRestoreOutcome, finishRestoreOutcome } from "@/utils/restore-outcome"
import { sentenceName } from "@/utils/string"
import type { HeldAccount } from "@/components/composite/import/restore-warning"
import {
	ACCOUNT_SERVICE_NAME,
	type AccountScope,
	DEFAULT_IMPORTED_ACCOUNT_NAME,
	IMPORTED_KEYS_SERVICE_NAME,
	accountScopeKey,
} from "@/wallet/services/account/spec"
import { AUTH_REGISTRY_SERVICE_NAME } from "@/wallet/services/auth-registry/spec"
import { TOKEN_BALANCE_SERVICE_NAME } from "@/wallet/services/token-balance/spec"
import { ACCOUNT_STATE_SERVICE_NAME } from "@/wallet/services/account-state/spec"
import { TRANSACTION_SERVICE_NAME } from "@/wallet/services/transaction/spec"
import { TOKEN_SERVICE_NAME } from "@/wallet/services/token/spec"
import { TokenServiceClient } from "@/wallet/services/token/client"
import { AccountStateServiceClient } from "@/wallet/services/account-state/client"
import {
	type NormalizedAccountStateItem,
	normalizeAccountStateSlice,
	registrableNetworkIds,
} from "@/wallet/services/account-state/normalize"
import { NetworkServiceClient } from "@/wallet/services/network/client"
import { ProfileServiceClient } from "@/wallet/services/profile/client"
import { IMPORT_CHAIN_SYNC_TOTAL_BUDGET_MS, runImportChainSync } from "./importChainSync"
import { errorMessageFromUnknown } from "@nulo/wallet-core/utils"

export type RestoreStatus = "" | "progress" | "failed" | "finished" | null | undefined

/**
 * Phase marker for the restore leg, exposed to the import pages as
 * `data-restore-stage`. OBSERVABILITY ONLY — no control flow reads it; it
 * exists so a crash mid-restore is attributable to a NAMED phase (the
 * `restoreStatus` field is flat "progress" across the whole leg). The
 * `rolling-back` / `rolled-back` / `rollback-failed` values are the one
 * genuinely new signal: a direct causal marker for the pre-finalize orphan
 * rollback, instead of inferring it from storage side effects.
 */
export type RestoreStage =
	| ""
	| "picked"
	| "restoring:profile"
	| "restoring:networks"
	| "restoring:tokens"
	| "restoring:services"
	| "finalizing"
	| "restoring:account-state"
	| "chain-sync"
	| "finished"
	| "failed"
	| "rolling-back"
	| "rolled-back"
	| "rollback-failed"

/** How many times to retry the compensating profile delete on rollback. */
const ROLLBACK_MAX_ATTEMPTS = 3

// Ceiling for the crash-rollback liveness gate. Structural, never the success
// mechanism: the SW heartbeat re-writes liveness every 10s and a booting
// worker writes immediately after full wiring, so a healthy respawn resolves
// in seconds; 60s (the transport RPC ceiling) bounds the pathological case,
// after which the rollback fails CLOSED to the cleanup-pending path.
const LIVENESS_CEILING_MS = 60_000

/** Shown when a partial import can't be rolled back — the profile row survives,
 *  so tell the user how to remove it rather than hiding the failure. */
export const CLEANUP_PENDING_MESSAGE =
	"Import didn't finish and the partial profile couldn't be removed automatically. Delete it in Settings, then try again."

/** The composable-owned io a stage reads and writes — live callbacks only. */
export interface RestoreIo {
	fillError: (type: string, title: string, tooltip?: string) => void
	setStatus: (s: RestoreStatus) => void
	setStage: (s: RestoreStage) => void
	/** collectRestoreErrors + append into the live error log (never a captured object); returns
	 *  the rows it appended. */
	recordRestoreErrors: (serviceName: string, data: unknown) => unknown[]
	/** Direct append for pre-collected records (the dropped-balances path). */
	appendErrors: (serviceName: string, records: unknown[]) => void
}

/** A stage's terminal descriptor. "proceed" carries the stage's payload; everything else
 *  ends the restore and is rendered exactly once by applyOutcome. */
export type StageFail = { kind: "fail"; title: string; message: string; status?: RestoreStatus }
export type StageOutcome = { kind: "proceed" } | StageFail

/** Render a terminal outcome; returns true when the flow must stop. */
export function applyOutcome(io: RestoreIo, o: StageOutcome): boolean {
	if (o.kind === "proceed") return false
	io.setStatus(o.status ?? "failed")
	io.fillError("full_backup", o.title, o.message)
	return true
}

/** Bookkeeping the outer catch must see the moment it exists (deposit's out-param pattern). */
export interface RestoreScratch {
	createdProfileId: string | undefined
	finalizeStarted: boolean
}

/** The service-client surfaces the stages consume — structural, so the composable's
 *  real clients and the suites' fakes both satisfy them. */
/* The client surfaces below use METHOD-SHORTHAND syntax deliberately: TS checks shorthand
 * methods bivariantly, so the real service clients (whose params are narrower branded
 * types) remain assignable while the stages stay honestly typed at the call sites. */
export interface ProfileRestoreClient {
	restore(
		profile: unknown,
		secret: RestoreSecret,
		password: string | undefined,
		allowDuplicate: boolean | undefined,
		credentialData?: PasskeyCredentialData,
	): Promise<{ id: string; restoreError?: unknown } | undefined>
	finalizeRestore(profileId: string, password?: string, credentialData?: PasskeyCredentialData): Promise<{ fence: RunFence }>
	deleteProfile(profileId: string): Promise<unknown>
	disconnect(): void
}
/** The fence check a tail makes before it settles the reminder. */
export interface RunFenceClient {
	assertRunFence(fence: RunFence): Promise<unknown>
}
export interface NetworkRestoreClient {
	seedDefaultsForProfile(profileId: string): Promise<unknown>
	setActiveForProfile(profileId: string, networkId: string): Promise<unknown>
	probeNodeStatus(networkId: string, timeoutMs: number): Promise<unknown>
	disconnect(): void
}
export interface AccountRestoreClient {
	restore(rows: unknown[] | undefined): Promise<unknown>
	restoreImportedKeys(rows: unknown[]): Promise<unknown>
	reconcileImportedAccounts(profileId: string): Promise<AccountScope[]>
	disconnect(): void
}

/**
 * Roll back a partially-imported profile with a bounded retry, shared
 * by all three failure paths. A single `deleteProfile` that rejected
 * (e.g. its tombstone write failed) used to be swallowed to `console.error`,
 * leaving the profile row as a normal, selectable, never-finalized entry.
 * Returns whether the orphan was actually removed so the caller can surface
 * an actionable "cleanup pending" message instead of a generic failure.
 */
export async function rollbackCreatedProfile(profileService: ProfileRestoreClient, profileId: string): Promise<boolean> {
	for (let attempt = 1; attempt <= ROLLBACK_MAX_ATTEMPTS; attempt++) {
		try {
			await profileService.deleteProfile(profileId)
			return true
		} catch (err) {
			// NOTE: deleteProfile is commit-ambiguous / non-idempotent — a
			// prior partial attempt may reserve the id so a retry sees "Invalid
			// profile id". We deliberately do NOT treat that as success (the
			// reservation can be dropped on a worker restart, re-revealing the
			// orphan), nor is a persistent failure provably durable. Surfacing
			// the actionable cleanup-pending message is the safe conservative
			// choice; a truly authoritative deletion-status check is a
			// ProfileService-level follow-up beyond this rollback helper.
			console.error(`[full-backup] rollback delete attempt ${attempt}/${ROLLBACK_MAX_ATTEMPTS} failed:`, err)
		}
	}
	return false
}

/** Rollback-with-copy shared by the no-networks and duplicate-account paths. Deliberately
 *  does NOT emit rolling-back/rolled-back stage markers (historical: the stage stays at
 *  the last restoring:* value — pinned by the stages suite). */
async function rollbackAndFail(
	profileService: ProfileRestoreClient,
	profileId: string,
	rolledBackCopy: { title: string; message: string },
): Promise<StageFail> {
	const rolledBack = await rollbackCreatedProfile(profileService, profileId)
	if (rolledBack) return { kind: "fail", ...rolledBackCopy }
	return { kind: "fail", title: "Import incomplete", message: CLEANUP_PENDING_MESSAGE }
}

/** What a backup that is not the one the wallet exported shows, whichever check refused it. */
export const INTEGRITY_FAILED = {
	title: "Backup Integrity Check Failed",
	message: "The backup file appears to be corrupted or has been tampered with. Please ensure you have the correct backup file.",
} as const

/**
 * The restore secret at the backup boundary, the same for both unlock methods: `master-key` is the
 * base64 plain master, `entropy` the recovery phrase's entropy (the service checks the words
 * derive the master before sealing) and `imported-keys-dek` the plaintext transfer key the
 * backup's key rows are sealed under. Each is REQUIRED.
 */
export function buildRestoreSecret(
	backup: Record<string, unknown>,
	masterKey: string,
): ({ kind: "proceed"; restoreSecret: RestoreSecret } & Record<never, never>) | StageFail {
	const entropyField = backup.entropy
	if (typeof entropyField !== "string") {
		return { kind: "fail", title: "Can't import", message: "This backup is missing its recovery-phrase entropy." }
	}
	// The service uses the carrier only inside the rewrap context (clone divergence: the restored
	// row gets a FRESH dek; the backup's key rows rewrap onto it).
	const dekField = backup["imported-keys-dek"]
	if (typeof dekField !== "string") {
		return { kind: "fail", title: "Can't import", message: "This backup is missing its imported-keys key." }
	}
	return {
		kind: "proceed",
		restoreSecret: { masterKey: asBase64MasterSecret(masterKey), entropy: entropyField, importedKeysDek: dekField },
	}
}

/** A network a tail registers into. The service re-validates the whole stored row it is handed,
 *  so callers pass rows as the network service returned them. */
export type TailNetwork = { id: string; name: string; chainId: number }

export interface RestoredNetwork {
	id: string
	name: string
	rpcUrl: string
	chainId: number
	restoreError?: string
}

/**
 * Networks stage: the backup carries no network rows — the built-in networks are seeded for the
 * restored profile and every row that names a chain is bound to the seed of that chain. Rows on
 * a chain no seed serves (a custom network's state) are dropped and reported; nothing in the
 * backup can choose an endpoint.
 */
export async function reseedNetworksStage(
	data: Record<string, unknown>,
	networkService: NetworkRestoreClient,
	profileService: ProfileRestoreClient,
	profileId: string,
	io: RestoreIo,
): Promise<({ kind: "proceed"; seeded: RestoredNetwork[] } & Record<never, never>) | StageFail> {
	let seeded: RestoredNetwork[] = []
	try {
		seeded = ((await networkService.seedDefaultsForProfile(profileId)) as RestoredNetwork[]).filter((n) => !n.restoreError)
	} catch (error) {
		console.warn("[full-backup] seeding the default networks failed:", error)
	}
	if (!seeded.length) {
		return rollbackAndFail(profileService, profileId, {
			title: "Can't import",
			message: "Couldn't seed the default networks for this backup",
		})
	}
	// Ordinal-only records: the dropped rows are backup payload (senders, artifacts, tx bodies)
	// and the error log is user-visible and exportable.
	const dropped = remapNetworkIdByChain(data, seeded, [ACCOUNT_STATE_SERVICE_NAME, TRANSACTION_SERVICE_NAME])
	for (const [slice, ordinals] of Object.entries(dropped)) {
		io.appendErrors(
			slice,
			capRecords(ordinals.map((row) => ({ row, restoreError: "Skipped: its network is not one of the built-in networks" }))),
		)
	}
	return { kind: "proceed", seeded }
}

/**
 * The exported `active-chain-id` is a preference among the seeded networks; anything that does
 * not name a seeded chain leaves the primary seed active. Written for the NEW profile via the
 * profileId-parameterized setter BEFORE `finalizeRestore` (the profile is not active yet).
 */
export async function restoreActiveNetworkPointer(
	activeChainId: unknown,
	seeded: RestoredNetwork[],
	networkService: NetworkRestoreClient,
	profileId: string,
): Promise<void> {
	const restoredActiveId = resolveRestoredActiveNetworkIdByChain(activeChainId, seeded as Array<{ id: string; chainId: number }>)
	if (!restoredActiveId) return
	try {
		await networkService.setActiveForProfile(profileId, restoredActiveId)
	} catch (activeErr) {
		// `requireOwnedRow` rejection or a write hiccup — the primary seed the reseed already
		// pointed at stays active. Never fail the whole import over the active-network pointer.
		console.warn("[full-backup] could not restore active-network selection:", activeErr)
	}
}

/**
 * The migrated backup body the restore stages read and filter in place. `validateAndMigrateBackup`
 * guarantees each present root slice is an array of plain objects with a valid row id, and that
 * `profile` is a {@link BackupProfile}.
 */
export type RestoreData = Record<string, unknown> & {
	account?: Array<Record<string, unknown>>
	token?: Array<Record<string, unknown>>
	"token-balance"?: Array<Record<string, unknown>>
	profile?: unknown
}

/** The backup's profile part as the restore reads it; the profile service judges the `id`. */
export type BackupProfile = { id: unknown; name: string; type: "password" | "passkey" }

/** Bound on dropped-balance records. This path never reaches the collector, so it carries no cap
 *  of its own — and a hostile backup can ship tens of thousands of un-relinkable rows. */
const MAX_DROPPED_BALANCES_RECORDED = 200

// Account and token restores forward absent slices unchanged, and their results stay unvalidated:
// keep the local names, because native errors reach the import failure copy.

/** A restored imported account whose chain has no network in the new profile, and its position in
 *  the backup's account slice. */
export type HeldScope = AccountScope & { name: string; row: number }

/**
 * Restores the account slice, then drops every transaction, authwit and token-balance row whose
 * account this restore did not import successfully onto a network the new profile has. Mutates
 * `data` in place and returns the `accountScopeKey` allow-set of those accounts, which the balance
 * re-link requires for its chain-equality check: thread it, never re-derive it. A held account
 * (`networkChains` lacks its chain) brings back its row and key only, and is returned apart.
 * `rows` places every restored account, held ones included, at its position in the slice.
 * Client lifecycle, the duplicate-account catch and stage markers stay with the caller; every
 * throw propagates with its identity intact (the caller matches `.message`, the outer catch
 * classifies disconnects).
 */
export async function restoreAccountsAndFilterOwnedSlices(
	data: RestoreData,
	accountService: AccountRestoreClient,
	recordRestoreErrors: (serviceName: string, rows: unknown) => void,
	networkChains: ReadonlySet<number>,
): Promise<{ importedChainAddress: Set<string>; held: HeldScope[]; rows: Map<string, number> }> {
	const importedChainAddress = new Set<string>()
	const held: HeldScope[] = []
	const rows = new Map<string, number>()
	const newAccounts = await accountService.restore(data.account)
	recordRestoreErrors(ACCOUNT_SERVICE_NAME, newAccounts)

	// Provenance filter for EVERY account-owned slice (tx, auth-registry,
	// token-balance). Each service writes rows verbatim and reads them by
	// `account`, so a backup row whose `account` is NOT an account
	// SUCCESSFULLY imported by THIS restore could surface in a victim
	// profile (auth-registry corrupts its revocation index; a balance
	// grafts under the victim). "Account exists in storage" is NOT
	// sufficient (a crafted backup could name a pre-existing foreign
	// account); the allow-set is exactly this restore's accounts. Drop
	// BEFORE the restore loop below writes them.
	const importedAddresses = new Set<string>()
	let row = -1
	for (const a of newAccounts as Array<{ address?: unknown; chainId?: unknown; name?: unknown; restoreError?: unknown }>) {
		row++
		if (a.restoreError || typeof a.address !== "string") continue
		if (typeof a.chainId === "number") rows.set(accountScopeKey(a.chainId, a.address), row)
		// `AccountService.restore` refuses a derived row with no network, so this row is imported.
		if (typeof a.chainId === "number" && !networkChains.has(a.chainId)) {
			held.push({ chainId: a.chainId, address: a.address, name: typeof a.name === "string" ? a.name : "", row })
			continue
		}
		importedAddresses.add(a.address)
		if (typeof a.chainId === "number") importedChainAddress.add(accountScopeKey(a.chainId, a.address))
	}
	// Drop-and-record via console.warn, NOT restoreErrorLog: a filtered row
	// is a security action (foreign/corrupt account, nothing the user did or
	// can fix), so it must not flip a clean import into the "finished with
	// errors" UX. A failed-account row is already surfaced by its account's
	// own restoreError above.
	const filterByAccount = (name: string, keep: (row: Record<string, unknown>) => boolean, label: string) => {
		const slice = (data as Record<string, unknown>)[name]
		if (!Array.isArray(slice)) return
		let dropped = 0
		;(data as Record<string, unknown>)[name] = (slice as Array<Record<string, unknown>>).filter((row) => {
			const ok = keep(row)
			if (!ok) dropped++
			return ok
		})
		if (dropped > 0) {
			console.warn(`[full-backup-import] dropped ${dropped} ${label} referencing an account not imported from this backup`)
		}
	}
	// tx carries its OWN chainId → key by the (chainId, account) tuple so a
	// tx can't reference an imported address on a DIFFERENT chain.
	filterByAccount(
		TRANSACTION_SERVICE_NAME,
		(tx) =>
			typeof tx.account === "string" &&
			typeof tx.chainId === "number" &&
			importedChainAddress.has(accountScopeKey(tx.chainId, tx.account)),
		"transaction(s)",
	)
	// auth-registry rows carry their own chainId → the same (chainId, account) key as txs.
	// token-balance rows carry identity fields too, but those are DERIVED service-side at
	// restore — address membership here is a pre-filter, with token-ownership + chain-equality
	// in the re-link step below.
	filterByAccount(
		AUTH_REGISTRY_SERVICE_NAME,
		(aw) =>
			typeof aw.account === "string" &&
			typeof aw.chainId === "number" &&
			importedChainAddress.has(accountScopeKey(aw.chainId, aw.account)),
		"authwit(s)",
	)
	filterByAccount(
		TOKEN_BALANCE_SERVICE_NAME,
		(tb) => typeof tb.account === "string" && importedAddresses.has(tb.account),
		"token-balance(s)",
	)
	return { importedChainAddress, held, rows }
}

/** The scope a backup row names, or undefined when it names none. */
function scopeOfRow(row: unknown): AccountScope | undefined {
	const { chainId, address } = (typeof row === "object" && row !== null ? row : {}) as { chainId?: unknown; address?: unknown }
	return typeof chainId === "number" && typeof address === "string" ? { chainId, address } : undefined
}

/** Whether the key restore receives `row`: a key of an account this restore wrote, or a row without
 *  a scope to match, which the service refuses and records. A key no restored account uses is
 *  dropped: with no account row, the next start's orphan sweep would delete it anyway. */
function keyOfRestoredAccount(row: unknown, restored: ReadonlySet<string>): boolean {
	const scope = scopeOfRow(row)
	return scope === undefined || restored.has(accountScopeKey(scope.chainId, scope.address))
}

const KEY_WITHOUT_ACCOUNT = "Skipped: no account in this backup uses this key"
const ACCOUNT_WITHOUT_KEY = "Not restored: its key is not in this backup"

/**
 * Restores the keys of this restore's accounts and records, at its position in the slice, each key
 * that no account row of the backup uses. A key whose account row is in the backup but was refused
 * records nothing: that account's own row says why.
 */
async function restoreKeysOfRestoredAccounts(
	keySlice: readonly unknown[],
	accountSlice: unknown,
	restored: ReadonlySet<string>,
	deps: { accountService: AccountRestoreClient; profileId: string; io: RestoreIo },
): Promise<void> {
	const positions = keySlice.flatMap((row, i) => (keyOfRestoredAccount(row, restored) ? [i] : []))
	const results = await deps.accountService.restoreImportedKeys(positions.map((i) => keySlice[i]))
	const placed = atSourcePositions(results, positions)
	const records: unknown[] = Array.isArray(placed) ? placed : []
	const inBackup = new Set(
		(Array.isArray(accountSlice) ? accountSlice : []).flatMap((row) => {
			const scope = scopeOfRow(row)
			return scope ? [accountScopeKey(scope.chainId, scope.address)] : []
		}),
	)
	keySlice.forEach((row, i) => {
		const scope = scopeOfRow(row)
		if (scope === undefined) return
		const key = accountScopeKey(scope.chainId, scope.address)
		if (restored.has(key) || inBackup.has(key)) return
		records[i] = { profileId: deps.profileId, chainId: scope.chainId, restoreError: KEY_WITHOUT_ACCOUNT }
	})
	deps.io.recordRestoreErrors(IMPORTED_KEYS_SERVICE_NAME, records)
}

/** Each result back at its row's position in the backup's slice, so the error log locates a failed
 *  row there and not among the rows the restore was handed. */
function atSourcePositions(results: unknown, positions: readonly number[]): unknown {
	if (!Array.isArray(results)) return results
	const placed: unknown[] = []
	results.forEach((result, i) => {
		if (i < positions.length) placed[positions[i]!] = result
	})
	return placed
}

/**
 * Re-links restored balance rows to this restore's tokens by result index and drops each one whose
 * account was not imported on its token's chain. Mutates `data["token-balance"]` in place and
 * returns the dropped rows, restoreError-tagged, for the caller to append.
 */
export function relinkRestoredTokenBalances(
	data: RestoreData,
	newTokens: Array<{ id: unknown; chainId: number; contract: string; restoreError?: string }>,
	importedChainAddress: ReadonlySet<string>,
): unknown[] {
	// Pair each restored token to its source by RESULT INDEX
	// (`TokenService.restore` returns one ordered result per input, same as
	// networks). This REPLACES the (chainId,contract) composite key: no
	// cross-chain collapse, no ambiguity heuristic, and one duplicate token
	// FAILING no longer drops a surviving token's balance. The index also
	// gives token-OWNERSHIP for free — a balance's token maps only to a
	// token THIS restore created.
	const oldTokens = data.token as Array<{ id: unknown; chainId: number }>
	// NB (dup-token-id): the index-paired maps below key on `old.id`, so two
	// backup tokens sharing an id would last-wins-collapse. That case is
	// UNREACHABLE here — backup normalization rejects a slice with a duplicate
	// row id up front (backup-migration-registry.ts "duplicate row id"), so a
	// dup-token-id backup fails before restore. No composable guard needed.
	const oldIdToNew = new Map<unknown, unknown>()
	const oldIdToChain = new Map<unknown, number>()
	for (let i = 0; i < newTokens.length; i++) {
		const old = oldTokens[i]
		if (!old || newTokens[i].restoreError) continue
		// Chain authority is the RESTORED token (parsed, persisted) — the old row is raw
		// attacker-controlled blob content, and a failed row must not feed the chain map.
		oldIdToChain.set(old.id, newTokens[i].chainId)
		oldIdToNew.set(old.id, newTokens[i].id)
	}
	const droppedBalances: unknown[] = []
	let droppedTotal = 0
	data["token-balance"] = (data["token-balance"] as Array<Record<string, unknown>>).flatMap(
		(tb: Record<string, unknown>, index: number) => {
			const newId = oldIdToNew.get(tb.token)
			// token/account chain-equality (final pass): the balance's account
			// must be an account imported ON THE TOKEN'S CHAIN. Addresses are
			// chain-distinct, so this rejects a balance pairing an imported
			// account with a token on a chain that account wasn't imported on.
			const tokenChain = oldIdToChain.get(tb.token)
			const chainOk =
				tokenChain !== undefined &&
				typeof tb.account === "string" &&
				importedChainAddress.has(accountScopeKey(tokenChain, tb.account))
			if (newId === undefined || !chainOk) {
				// This path bypasses `collectRestoreErrors` entirely — these rows are dropped BEFORE any
				// service sees them — so it must do its own allowlisting AND its own bounding.
				//
				// `tb` is raw, unvalidated backup content: it carries `publicBalance`/`privateBalance`,
				// and migration validates only `tb.id`, so `token` can be an arbitrary nested object
				// holding a URL or a secret. Only the POSITION is recorded, which is all that
				// distinguishes one dropped row from another anyway.
				droppedTotal++
				if (droppedBalances.length < MAX_DROPPED_BALANCES_RECORDED) {
					droppedBalances.push({
						row: index,
						restoreError: "Token balance could not be re-linked to a restored token",
					})
				}
				return []
			}
			return [{ ...tb, token: newId }]
		},
	)
	// Say what was dropped rather than letting the cap read as "exactly 200 failures".
	if (droppedTotal > droppedBalances.length) {
		droppedBalances.push({
			restoreError: `${droppedTotal - droppedBalances.length} further dropped balance(s) not recorded`,
		})
	}
	return droppedBalances
}

/** The accounts stage's hand-off: the allow-set, the held accounts, and each restored account's
 *  position in the backup's account slice, by `accountScopeKey`. */
export type RestoredAccounts = {
	importedChainAddress: ReadonlySet<string>
	held: HeldScope[]
	rows: ReadonlyMap<string, number>
}

/**
 * Accounts stage: account rows + imported-account key rows (RIGHT AFTER the account rows and
 * BEFORE reconciliation/finalize — the ciphertext is HKDF-bound to (master, chainId, address),
 * not profileId, so it survives the id remap). The duplicate-account collision rolls back;
 * any other failure rethrows so the orphan profile isn't left half-restored.
 */
export async function restoreAccountsStage(
	data: Record<string, unknown>,
	deps: {
		accountService: AccountRestoreClient
		profileService: ProfileRestoreClient
		profileId: string
		/** The new profile's networks: an imported account on any other chain is held. */
		networks: ReadonlyArray<{ chainId: number }>
		io: RestoreIo
	},
): Promise<({ kind: "proceed" } & RestoredAccounts) | StageFail> {
	const { accountService, profileService, profileId, io } = deps
	try {
		const networkChains = new Set(deps.networks.map((n) => n.chainId))
		const { importedChainAddress, held, rows } = await restoreAccountsAndFilterOwnedSlices(
			data,
			accountService,
			io.recordRestoreErrors,
			networkChains,
		)
		const importedKeySlice = data[IMPORTED_KEYS_SERVICE_NAME]
		if (Array.isArray(importedKeySlice)) {
			const restored = new Set([...importedChainAddress, ...held.map((h) => accountScopeKey(h.chainId, h.address))])
			await restoreKeysOfRestoredAccounts(importedKeySlice, data.account, restored, { accountService, profileId, io })
		}
		return { kind: "proceed", importedChainAddress, held, rows }
	} catch (err) {
		// `AccountService` throws `new Error("Duplicate account")` when an imported row
		// collides with one already in storage. Rows are keyed by `(profileId, chainId,
		// address)`, so importing the same mnemonic into a NEW profile no longer collides —
		// this now fires only for a genuine repeat of the same account. The RPC layer
		// (`extension-messaging/client.ts`) reconstructs that as an `Error` instance on the
		// client — so match on `.message`, not via string-equality on `err` itself.
		const msg = errorMessageFromUnknown(err)
		if (msg === "Duplicate account") {
			// NetworkService.onProfileDeleted cascades — purges this profile's networks
			// automatically. No explicit cleanup needed.
			// `return await` (not a bare return): the finally's disconnect must run AFTER the
			// bounded rollback completes, matching the original catch-then-finally ordering.
			return await rollbackAndFail(profileService, profileId, {
				title: "Can't import",
				message: "An account from this backup is already in your wallet",
			})
		}
		// Non-duplicate failure: fall through to the outer catch so the orphan profile
		// isn't left in a half-restored state.
		throw err
	} finally {
		accountService.disconnect()
	}
}

/**
 * Reconciles the imported accounts, then records each account the reconcile dropped for want of a
 * usable key and each held account that kept its key, so the import stops at its warning. Runs
 * before the session opens; a reconcile failure propagates, so the created profile is rolled back.
 * The client is closed once the call settles.
 */
export async function settleHeldAccounts(
	accountService: AccountRestoreClient,
	profileId: string,
	accounts: Pick<RestoredAccounts, "held" | "rows">,
	io: RestoreIo,
): Promise<HeldAccount[]> {
	let dropped: AccountScope[]
	try {
		dropped = await accountService.reconcileImportedAccounts(profileId)
	} finally {
		accountService.disconnect()
	}
	// Scope COUNT only — the tuples carry on-chain account addresses.
	if (dropped.length > 0) console.warn(`[import] dropped ${dropped.length} imported account(s) with no key row`)
	const gone = new Set(dropped.map((scope) => accountScopeKey(scope.chainId, scope.address)))
	const kept = accounts.held.filter((h) => !gone.has(accountScopeKey(h.chainId, h.address)))
	// Each record sits at its account's position in the slice, as the account restore's own do, and
	// names the chain only: the name is backup content, and an address links on-chain activity.
	const records: unknown[] = []
	for (const h of kept) {
		records[h.row] = { profileId, chainId: h.chainId, restoreError: `Waiting for a network with chain ID ${h.chainId}` }
	}
	// The reconcile reads only this restore's accounts, so every dropped scope has its row.
	for (const scope of dropped) {
		const row = accounts.rows.get(accountScopeKey(scope.chainId, scope.address))
		if (row !== undefined) records[row] = { profileId, chainId: scope.chainId, restoreError: ACCOUNT_WITHOUT_KEY }
	}
	io.recordRestoreErrors(ACCOUNT_SERVICE_NAME, records)
	return kept.map((h) => ({ name: sentenceName(h.name, DEFAULT_IMPORTED_ACCOUNT_NAME), chainId: h.chainId }))
}

/** Tokens stage: restore + balance re-link + error recording (P7: disconnect even on throw). */
export async function restoreTokensStage(
	data: Record<string, unknown>,
	importedChainAddress: ReadonlySet<string>,
	io: RestoreIo,
): Promise<void> {
	const tokenService = new TokenServiceClient()
	let tokenRestoreResult: unknown
	try {
		tokenRestoreResult = await tokenService.restore(data.token)
	} finally {
		tokenService.disconnect() // P7: disconnect even if restore throws
	}
	const newTokens = tokenRestoreResult as Array<{ id: unknown; chainId: number; contract: string; restoreError?: string }>
	if ((data["token-balance"] as unknown[] | undefined)?.length) {
		const droppedBalances = relinkRestoredTokenBalances(data, newTokens, importedChainAddress)
		if (droppedBalances.length) io.appendErrors("token-balance", droppedBalances)
	}
	io.recordRestoreErrors(TOKEN_SERVICE_NAME, newTokens)
}

/**
 * Reads the restored tokens from their chains on the tail's deadline, after `finalizeRestore` opened
 * the session the reads need. Best effort: a token the chain does not answer in time keeps the
 * backup's name, symbol and decimals and holds no class, and the import never fails on it.
 */
export async function refreshRestoredTokensStage(fence: RunFence, deadlineAt: number): Promise<void> {
	const remaining = deadlineAt - Date.now()
	if (remaining <= 0) return
	const tokenService = new TokenServiceClient()
	let timer: ReturnType<typeof setTimeout> | undefined
	try {
		const deadline = new Promise<void>((resolve) => {
			timer = setTimeout(resolve, remaining)
		})
		const refresh = tokenService.refreshRestoredTokens(fence, deadlineAt).catch((error: unknown) => {
			console.debug("[full-backup] restored tokens kept their backup metadata", { error })
		})
		await Promise.race([refresh, deadline])
	} finally {
		clearTimeout(timer)
		tokenService.disconnect()
	}
}

/** One service's restore surface in the six-client loop. */
export interface SliceRestoreClient {
	restore: (rows: unknown[], profileId: string) => Promise<unknown>
	disconnect: () => void
}

/**
 * The six-service loop. Whole-loop try/finally: every client is constructed up-front, so a
 * mid-loop throw (or a non-array slice that skips a client's body) must still disconnect
 * ALL of them — a per-iteration finally would only clean the client that threw, leaking
 * the ones after it (P7). The created-profile id rides along on every restore: authwits
 * and txs key their deletion fence on it, balances additionally derive their identity
 * fields from it; the rest ignore the extra argument.
 */
export async function restoreServiceSlices(
	data: Record<string, unknown>,
	services: Array<{ name: string; client: SliceRestoreClient }>,
	profileId: string,
	io: RestoreIo,
): Promise<void> {
	try {
		for (const { name, client } of services) {
			const sliceData = data[name]
			if (Array.isArray(sliceData)) {
				io.recordRestoreErrors(name, await client.restore(sliceData, profileId))
			}
		}
	} finally {
		for (const { client } of services) client.disconnect()
	}
}

/**
 * Restore account-state (PXE contract registrations + senders) AFTER finalizeRestore — its
 * `registerContract` needs the per-profile PXE store key, which the client's
 * PXE_STORE_KEY_MISSING retry-once provisions via `getProfileSecret` — and that only yields
 * the master once the session is OPEN (finalizeRestore opens it). BOUNDED: this is the one
 * import leg that dials the network (the PXE boot fetches L1 addresses from the compiled-in
 * seed endpoint of the chain the item names — never from anything the backup carries); the
 * tail runs on one shared wall-clock budget through the SAME errors screen. Present-but-malformed slices (a hostile
 * `{}`/`null`) MUST still enter the chain-sync: the normalizer converts them into a
 * violation record — gating on Array.isArray here would let a malformed slice auto-route
 * past the Continue gate unrecorded.
 */
export async function restoreAccountStateStage(
	data: Record<string, unknown>,
	createdNetworks: TailNetwork[],
	networkService: NetworkRestoreClient,
	io: RestoreIo,
	restoreRun: RestoreRun,
	profileService: RunFenceClient,
	deadlineAt: number,
): Promise<AccountStateTail> {
	const accountStateSlice = data[ACCOUNT_STATE_SERVICE_NAME]
	if (accountStateSlice === undefined) return { restored: [] }
	const admitted = await admitReminder(restoreRun)
	const accountStateService = new AccountStateServiceClient()
	let outcomeRows: unknown[] = []
	let outcomes: unknown[] = []
	let cut: string[] = []
	try {
		io.setStage("chain-sync")
		const retryable = await runImportChainSync({
			slice: accountStateSlice,
			deadlineAt,
			...chainSyncClients(accountStateService, networkService, createdNetworks, restoreRun.fence),
			record: (records, kind) => {
				const rows = io.recordRestoreErrors(ACCOUNT_STATE_SERVICE_NAME, records)
				if (kind === "violations") cut = cutNetworkIds(records, createdNetworks)
				if (kind !== "outcomes") return
				outcomeRows = rows
				outcomes = records
			},
		})
		const restored = restoredNetworkIds(outcomes).filter((id) => !cut.includes(id))
		if (admitted) await settleReminder(restoreRun, restored, profileService)
		return {
			restored,
			retry: retryable.length ? { networks: createdNetworks, retryable, outcomeRows, cut, restoreRun } : undefined,
		}
	} finally {
		accountStateService.disconnect()
	}
}

export interface AccountStateTail {
	restored: string[]
	retry?: AccountStateRetryContext
}

/** Binds a tail to its restore: the session it registers under, and the reminder run it settles. */
export interface RestoreRun {
	fence: RunFence
	/** Absent when nothing was armed. */
	run: string | undefined
}

/**
 * What Restore again restores from a verified backup: the account-state items of `networks` only,
 * each bound by its chain. Every other slice, and every item on another chain, drops; the tail's
 * normalizer bounds what is left.
 */
export function planRestoreAgain(
	data: Record<string, unknown>,
	networks: ReadonlyArray<{ id: string; chainId: number }>,
): Record<string, unknown> {
	const planned: Record<string, unknown> = { [ACCOUNT_STATE_SERVICE_NAME]: data[ACCOUNT_STATE_SERVICE_NAME] }
	if (planned[ACCOUNT_STATE_SERVICE_NAME] === undefined) return {}
	remapNetworkIdByChain(planned, networks, [ACCOUNT_STATE_SERVICE_NAME])
	return planned
}

/** The networks the tail will try to restore: the normalized, remapped items with registrable work. */
export function accountStateNetworkIds(data: Record<string, unknown>): string[] {
	const slice = data[ACCOUNT_STATE_SERVICE_NAME]
	return slice === undefined ? [] : registrableNetworkIds(normalizeAccountStateSlice(slice))
}

/**
 * The networks a tail restored, read from its raw outcome records (the collected error rows leave
 * successes out): an outcome with no error of its own or on any child. A network refused for its
 * chain or with a refused contract is not restored, though no Retry would change it.
 */
export function restoredNetworkIds(outcomes: readonly unknown[]): string[] {
	return outcomes.flatMap((record) => {
		const { networkId, restoreError, senders, contracts } = (record ?? {}) as Record<string, unknown>
		if (typeof networkId !== "string" || restoreError !== undefined) return []
		const children = [senders, contracts].flatMap((list) => (Array.isArray(list) ? list : []))
		return children.some((child) => (child as { restoreError?: unknown } | null)?.restoreError !== undefined) ? [] : [networkId]
	})
}

/**
 * The networks whose items the normalizer cut: registering the rest leaves them incomplete, and no
 * Retry brings the cut back. A slice-wide cut names no network, so it marks every one.
 */
function cutNetworkIds(violations: readonly unknown[], networks: readonly TailNetwork[]): string[] {
	const named = new Set(violations.map((record) => (record as { networkId?: unknown } | null)?.networkId))
	return networks.map((network) => network.id).filter((id) => named.has(id) || named.has("(slice)"))
}

/** Renews the reminder's lease for this tail; false once the reminder is gone or another run's. */
async function admitReminder({ fence, run }: RestoreRun): Promise<boolean> {
	if (!run) return false
	try {
		return (await admitRestoreOutcome(fence.profileId, run)) !== undefined
	} catch (error) {
		console.warn("[restore-outcome] the reminder could not be renewed", { error })
		return false
	}
}

/** Whether `fence`'s session is still the open one; any failure other than its end is thrown. */
export async function runFenceLive(profileService: RunFenceClient, fence: RunFence): Promise<boolean> {
	try {
		await profileService.assertRunFence(fence)
		return true
	} catch (error) {
		if (error instanceof SessionEndedError) return false
		throw error
	}
}

/** Drops the networks the tail restored from the reminder; a tail whose session ended writes nothing. */
async function settleReminder({ fence, run }: RestoreRun, restored: readonly string[], profileService: RunFenceClient) {
	if (!run) return
	try {
		await profileService.assertRunFence(fence)
	} catch {
		return
	}
	try {
		await finishRestoreOutcome(fence.profileId, run, restored)
	} catch (error) {
		console.warn("[restore-outcome] the reminder could not be settled", { error })
	}
}

/** What a Retry replays. It lives in the page's memory while the errors screen shows and is
 *  never persisted: the items are hostile backup content, bounded by the normalizer. */
export interface AccountStateRetryContext {
	restoreRun: RestoreRun
	networks: TailNetwork[]
	/** The normalized items of the networks the last run left retryable. */
	retryable: NormalizedAccountStateItem[]
	/** The account-state rows the registration outcomes wrote, the only ones a Retry replaces. */
	outcomeRows: unknown[]
	/** The networks the normalizer cut, which no Retry restores in full. */
	cut: string[]
}

/** The rows a Retry of `ctx` replaces: the retried networks' outcome rows only. A violation row
 *  records entries the normalizer discarded, which no registration brings back. */
export function retryReplacedRows(ctx: AccountStateRetryContext): unknown[] {
	const retried = new Set<unknown>(ctx.retryable.map((item) => item.networkId))
	return ctx.outcomeRows.filter((row) => retried.has((row as { networkId?: unknown } | null)?.networkId))
}

/**
 * Replays the chain-sync tail for the networks the last run left retryable, on fresh connections
 * closed once it settles. `replaceRestoreErrors` swaps the retried networks' outcome rows for the
 * Retry's own and returns the rows it wrote. The next context is absent when no network is left to
 * retry.
 */
export async function retryAccountStateStage(
	ctx: AccountStateRetryContext,
	replaceRestoreErrors: (serviceName: string, stale: unknown[], data: unknown) => unknown[],
): Promise<AccountStateTail> {
	const accountStateService = new AccountStateServiceClient()
	const networkService = new NetworkServiceClient()
	const profileService = new ProfileServiceClient()
	let records: unknown[] = []
	try {
		// An ended run's registrations are refused and read as timeouts: it neither retries nor
		// renews the lease.
		if (!(await runFenceLive(profileService, ctx.restoreRun.fence))) return { restored: [] }
		const admitted = await admitReminder(ctx.restoreRun)
		const retryable = await runImportChainSync({
			slice: ctx.retryable,
			deadlineAt: Date.now() + IMPORT_CHAIN_SYNC_TOTAL_BUDGET_MS,
			...chainSyncClients(accountStateService, networkService, ctx.networks, ctx.restoreRun.fence),
			// Items the normalizer already bounded yield no violations: only outcomes arrive.
			record: (outcomes, kind) => {
				if (kind === "outcomes") records = outcomes
			},
		})
		const restored = restoredNetworkIds(records).filter((id) => !ctx.cut.includes(id))
		if (admitted) await settleReminder(ctx.restoreRun, restored, profileService)
		const stale = retryReplacedRows(ctx)
		const fresh = replaceRestoreErrors(ACCOUNT_STATE_SERVICE_NAME, stale, records)
		const outcomeRows = [...ctx.outcomeRows.filter((row) => !stale.includes(row)), ...fresh]
		return {
			restored,
			retry: retryable.length ? { ...ctx, retryable, outcomeRows } : undefined,
		}
	} finally {
		accountStateService.disconnect()
		networkService.disconnect()
		profileService.disconnect()
	}
}

function chainSyncClients(
	accountStateService: AccountStateServiceClient,
	networkService: NetworkRestoreClient,
	networks: TailNetwork[],
	fence: RunFence,
) {
	return {
		createdNetworkIds: networks.map((n) => n.id),
		restore: (items: unknown[], deadlineMs: number) =>
			accountStateService.restore(items as never, networks as never, fence, deadlineMs) as Promise<unknown>,
		probe: (networkId: string, timeoutMs: number) => networkService.probeNodeStatus(networkId, timeoutMs) as never,
	}
}

/**
 * The outer-catch rollback: pre-finalize failure with a created profile deletes the orphan
 * so a retry starts clean; post-finalize errors keep the profile (its data is fully in
 * storage — the user can unlock it later). A DISCONNECT-classified failure means the
 * service worker died mid-restore (MV3 respawn gap): any delete issued now rejects in
 * milliseconds against doomed ports, before a worker exists to refuse it. Gate the
 * rollback on the worker's own liveness signal advancing (written only after full service
 * wiring, so the deletion coordinator is guaranteed registered); the ceiling fails CLOSED
 * to the same cleanup-pending path, backed by the restore-pending marker's torn-unlock
 * refusal. Non-disconnect failures keep the immediate path — the worker is alive; waiting
 * would only add latency.
 */
export async function runRestoreFailurePath(
	err: unknown,
	scratch: RestoreScratch,
	profileService: ProfileRestoreClient,
	io: RestoreIo,
): Promise<void> {
	if (scratch.createdProfileId !== undefined && !scratch.finalizeStarted) {
		io.setStage("rolling-back")
		let workerReady = true
		if (isClientDisconnectRejection(err) || err instanceof RpcDisconnectedError) {
			// One failure handler spans BOTH the baseline read and the advance wait: a
			// rejected storage read must fail CLOSED to the same cleanup-pending path,
			// never escape this catch with the stage stuck at rolling-back.
			workerReady = await readLiveness()
				.then((baseline) => awaitLivenessAdvance(baseline, LIVENESS_CEILING_MS))
				.then(
					() => true,
					(gateErr) => {
						console.error("[full-backup] rollback liveness gate failed:", gateErr)
						return false
					},
				)
		}
		if (workerReady && (await rollbackCreatedProfile(profileService, scratch.createdProfileId))) {
			io.setStage("rolled-back")
		} else {
			// The orphan couldn't be removed — surface an actionable message instead of the
			// generic failure, and mark the import failed.
			io.setStage("rollback-failed")
			io.setStatus("failed")
			io.fillError("full_backup", "Import incomplete", CLEANUP_PENDING_MESSAGE)
			console.error("[full-backup] restore failed; rollback incomplete:", { error: err })
			return
		}
	} else {
		io.setStage("failed")
	}
	io.setStatus("")
	io.fillError("full_backup", "Import failed", String((err as Error)?.message ?? err))
	logCredentialFailure("[full-backup] restore failed:", err)
}
