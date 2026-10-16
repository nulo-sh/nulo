// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { computed, ref, type Ref, type ShallowRef, shallowRef, toRaw } from "vue"
import { EncryptionKey } from "@nulo/wallet-crypto"
import { sanitizeString } from "@/utils/string"
import { AccountServiceClient } from "@/wallet/services/account/client"
import { AuthRegistryServiceClient } from "@/wallet/services/auth-registry/client"
import { AUTH_REGISTRY_SERVICE_NAME } from "@/wallet/services/auth-registry/spec"
import { ConfigServiceClient } from "@/wallet/services/config/client"
import { CONFIG_SERVICE_NAME } from "@/wallet/services/config/spec"
import { ContactServiceClient } from "@/wallet/services/contact/client"
import { CONTACT_SERVICE_NAME } from "@/wallet/services/contact/spec"
import { NetworkServiceClient } from "@/wallet/services/network/client"
import { type ProfileInfo, ProfileServiceClient, type RestoreSecret } from "@/wallet/services/profile/client"
import { TokenBalanceServiceClient } from "@/wallet/services/token-balance/client"
import { TOKEN_BALANCE_SERVICE_NAME } from "@/wallet/services/token-balance/spec"
import { TransactionServiceClient } from "@/wallet/services/transaction/client"
import { TRANSACTION_SERVICE_NAME } from "@/wallet/services/transaction/spec"
import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import type { PasskeyRequest } from "@/wallet/services/passkey/spec"
import type { ToastOptions } from "@/composables/toast"
import { FilePickCanceledError } from "@/utils/files"
import {
	BACKUP_MAC_FIELD,
	type BackupSelection,
	collectRestoreErrors,
	normalizeAllIds,
	openEncryptedBackup,
	readBackupFile,
} from "@/utils/full-backup-helpers"
import { BACKUP_SCHEMA_VERSION_FIELD, COMPAT_EPOCH_FIELD, isSupportedCompatEpoch } from "@/wallet/services/backup/backup-migration-registry"
import { maxBackupSchemaVersion, migrateBackupData } from "@/wallet/services/backup/backup-migrator"
import { armRestoreOutcome } from "@/utils/restore-outcome"
import {
	accountStateNetworkIds,
	type AccountStateRetryContext,
	applyOutcome,
	type BackupProfile,
	buildRestoreSecret,
	type RestoreData,
	type RestoreIo,
	type RestoreRun,
	type RestoreScratch,
	resolvePasskeyCredential,
	type RestoredNetwork,
	restoreAccountStateStage,
	restoreAccountsStage,
	restoreActiveNetworkPointer,
	reseedNetworksStage,
	restoreServiceSlices,
	type SliceRestoreClient,
	restoreTokensStage,
	trustRestoredTokens,
	retryAccountStateStage,
	retryReplacedRows,
	runRestoreFailurePath,
	verifyPasskeyBody,
	INTEGRITY_FAILED,
} from "./full-backup-restore"

export type { RestoreStage, RestoreStatus } from "./full-backup-restore"
import type { RestoreStage, RestoreStatus } from "./full-backup-restore"
import { errorMessageFromUnknown } from "@nulo/wallet-core/utils"
import { isNewPasswordValid } from "@/utils/password"

/** The full-backup envelope: the checksum, a passkey body's MAC of it, and the checksum-covered body. */
export type FullBackupEnvelope = {
	checksum?: string
	[BACKUP_MAC_FIELD]?: unknown
	"compat-epoch"?: unknown
	"backup-schema-version"?: unknown
	"master-key"?: string
	"active-chain-id"?: number
	data: Record<string, unknown>
}

/** The checksum-stripped body + the migrated slices that survive stage 1. */
type ValidatedBackup = {
	data: RestoreData & { profile: BackupProfile }
	backup: Omit<FullBackupEnvelope, "checksum" | typeof BACKUP_MAC_FIELD>
	/** The verified checksum: it names this exact backup. */
	checksum: string
	/** A passkey body's MAC of the checksum, verified once the passkey answers. */
	mac?: string
}

type ValidateAndMigrateResult = ({ kind: "ok" } & ValidatedBackup) | { kind: "rejected"; title: string; message: string }

/** A picked file that is no backup the wallet reads. */
export const UNRECOGNIZED_BACKUP = {
	title: "Unrecognized Backup File",
	message: "The selected file is not a valid backup. Please select a correct backup file.",
} as const

export const DECRYPTION_FAILED = {
	title: "Decryption Failed",
	message:
		"The provided password is incorrect or the backup file is corrupted. Please try again with the correct password or select another file.",
} as const

const INTEGRITY_REFUSAL = { kind: "rejected", ...INTEGRITY_FAILED } as const

const INCOMPATIBLE_BACKUP = {
	kind: "rejected",
	title: "Incompatible backup",
	message:
		"This backup was created by an incompatible wallet version and cannot be imported. Re-export a backup from a current version of the wallet.",
} as const

/** The restore reads `type` and `name` as the wallet wrote them; `id` is replaced by the service
 *  whenever the wallet would not have generated it. */
function isBackupProfile(profile: unknown): profile is BackupProfile {
	if (typeof profile !== "object" || profile === null || Array.isArray(profile)) return false
	const { type, name } = profile as Record<string, unknown>
	return (type === "password" || type === "passkey") && typeof name === "string"
}

/**
 * Stage 1 of the full-backup restore — integrity + compatibility gate,
 * then migrate the verified slices forward, all BEFORE any live state is
 * touched. Deliberately closure-state-free (a pure function of the envelope +
 * the module-level codec/migrator): a `rejected` result carries the exact
 * user-facing title/message the caller surfaces via `fillError`; an `ok` result
 * carries the migrated `data` + the checksum-stripped `backup`. The re-entrancy
 * / permission guard and the `restoreStatus`/`fillError` side effects stay with
 * the caller.
 */
export async function validateAndMigrateBackup(fullBackup: FullBackupEnvelope): Promise<ValidateAndMigrateResult> {
	const { checksum, [BACKUP_MAC_FIELD]: mac, ...backup } = fullBackup

	// Trust-gate order is deliberate: integrity FIRST — re-serialized exactly as
	// the exporter hashed it (the exporter also hashed JSON.stringify of the
	// object, so this IS the exported body) — then the non-migratable
	// compat-epoch, then the migratable schema-version range. The checksum is
	// accidental-integrity detection only — a plain backup's checksum is
	// attacker-recomputable, so nothing downstream may treat it as authentication.
	const comparisonChecksum = await EncryptionKey.getHashHex(JSON.stringify(backup))
	if (checksum !== comparisonChecksum) return INTEGRITY_REFUSAL

	// A pre-baseline blob (the legacy conflated `schema-version: 2`, no
	// `compat-epoch`) fails this gate too — intended fail-closed.
	if (!isSupportedCompatEpoch(backup[COMPAT_EPOCH_FIELD])) return INCOMPATIBLE_BACKUP

	const backupSchemaVersion = backup[BACKUP_SCHEMA_VERSION_FIELD]
	if (typeof backupSchemaVersion !== "number" || !Number.isInteger(backupSchemaVersion) || backupSchemaVersion < 1) {
		return {
			kind: "rejected",
			title: "Incompatible backup",
			message: "This backup does not carry a valid schema version. Re-export a backup from a current version of the wallet.",
		}
	}
	if (backupSchemaVersion > maxBackupSchemaVersion()) {
		return {
			kind: "rejected",
			title: "Backup is too new",
			message: "This backup was created by a newer version of the wallet. Update the wallet, then import it again.",
		}
	}

	// Migrate the verified slices forward BEFORE anything touches live storage:
	// pure and in-memory, so a failure here rejects the import with ZERO live
	// state to roll back. The migrated data replaces the parsed slices; the
	// checksum was already verified over the ORIGINAL bytes and is dropped —
	// migration is a pure function of verified input, so its output is covered
	// transitively (never recompute-and-trust a post-migration checksum).
	// `master-key` is a top-level field, not a slice — it never enters the migrator.
	const migrationResult = await migrateBackupData({ data: backup.data, backupSchemaVersion })
	if (migrationResult.kind === "incompatible") {
		return { kind: "rejected", title: "Incompatible backup", message: migrationResult.reason }
	}
	if (migrationResult.kind === "failed") {
		return {
			kind: "rejected",
			title: "Import failed",
			message: `The backup could not be upgraded to the current format: ${migrationResult.reason}`,
		}
	}

	const data = migrationResult.data as RestoreData
	if (!isBackupProfile(data.profile)) return INTEGRITY_REFUSAL
	// A passkey body exported before it carried a check is refused before any passkey prompt.
	if (data.profile.type === "passkey" && typeof mac !== "string") return INCOMPATIBLE_BACKUP
	return {
		kind: "ok",
		data: data as ValidatedBackup["data"],
		backup,
		checksum: comparisonChecksum,
		mac: typeof mac === "string" ? mac : undefined,
	}
}

export interface UseFullBackupImportOptions {
	password: Ref<string>
	repeatedPassword: Ref<string>
	fillError: (type: string, title: string, tooltip?: string) => void
	clearError: () => void
	pickFile: () => Promise<File | null | undefined>
	completeImport: (profile: unknown) => Promise<void> | void
	/**
	 * Page-supplied passkey-ceremony driver. When the backup's profile is
	 * passkey-typed, the composable runs `{ mode: "get", credentialId }`
	 * against the page's `PasskeyCeremonyDialog` BEFORE calling
	 * `profileService.restore`. Required for passkey backups (without it,
	 * the service rejects with `credentialData is required`). Password
	 * profile imports don't touch this.
	 */
	runCeremony?: (req: PasskeyRequest) => Promise<PasskeyCredentialData>
	/** The shell's toast, which says a passkey prompt went unconfirmed while the form stays usable. */
	openToast: (toast: ToastOptions) => void
	/**
	 * Shell-specific "show me the import errors" handler. Popup wires this
	 * to its data-viewer overlay (cacheStore + popupStore). Onboarding wires
	 * it to a simpler notification. Defaults to console.error so the
	 * composable stays usable from any shell.
	 */
	showErrorLog?: (errors: Record<string, unknown[]>, networks: RestoreErrorNetworks) => void
	/**
	 * The name the restored profile gets, asked inside the restore's latch once the backup is
	 * validated. `backupName` is the validated backup's own name, sanitized (`null` when it has
	 * none). Resolves `null` to stop the restore quietly (a typed name failed validation);
	 * rejects when the profile list cannot be read. The embedded name never reaches `restore`
	 * unless it comes back from here; the service still suffixes an exact duplicate.
	 */
	resolveProfileName: (backupName: string | null) => Promise<string | null>
	/**
	 * Duplicate-phrase override from the warn-and-confirm dialog. Set by `confirmDuplicate` while
	 * it re-runs the restore; the service then accepts the duplicate (soft guard by owner policy).
	 */
	allowDuplicate?: Ref<boolean>
	/**
	 * Wraps the restore so a `DuplicateWalletError` surfaces the shared warn-and-confirm dialog
	 * and, on confirm, re-runs with `allowDuplicate` set. Supplied by `useProfileImportFlow` so
	 * the copy + retry semantics are identical across the seed / passkey / full-backup paths.
	 * Resolves `undefined` when the user declines. Absent → no dialog (the error propagates).
	 */
	confirmDuplicate?: <T>(run: () => Promise<T>) => Promise<T | undefined>
}

/** What an error surface needs to name networks: the restored ones by id, and the names of those a
 *  Retry would replay. */
export interface RestoreErrorNetworks {
	byNetworkId: ReadonlyMap<string, string>
	unrestored: string[]
}

export interface UseFullBackupImportResult {
	selectedBackup: Ref<BackupSelection | null>
	decryptionPassword: Ref<string>
	restoreStatus: Ref<RestoreStatus>
	restoreStage: Ref<RestoreStage>
	restoreErrorLog: Ref<Record<string, unknown[]>>
	importedProfile: Ref<unknown>
	isAllowedToImportBackup: Ref<boolean>
	isRestoreHasErrors: Ref<boolean>
	/**
	 * The current selection's embedded profile name, sanitized, so the parent page can prefill
	 * its Profile-name input. `null` while the selection has no usable name: before a plain
	 * file is parsed or an encrypted one decrypted, for a nameless backup, and after
	 * `resetBackupState`.
	 */
	parsedBackupName: Ref<string | null>
	/** The finished import left a network that ran out of time or could not be reached. */
	canRetryAccountState: Ref<boolean>
	/** The seeded names of the networks a Retry replays, in seed order; empty while none can. */
	unrestoredNetworkNames: Ref<string[]>
	/** The last Retry left a network a Retry would replay again. */
	retryFailedAgain: Ref<boolean>
	/** The error log holds a row that no Retry replaces. */
	hasOtherRestoreErrors: Ref<boolean>
	/** A Retry is running; Continue and View Errors wait for it. */
	isRetryingAccountState: Ref<boolean>
	/**
	 * Replays the retryable networks once; a press while one runs does nothing. When no error row
	 * is left afterwards, completes the import the way a clean restore does.
	 */
	retryAccountState: () => Promise<void>
	/** Continue from the errors screen. Drops the Retry first: a press while the completion
	 *  handshake waits would otherwise run the tail again and complete the import twice. */
	continueImport: () => Promise<void>
	pickBackupFile: () => Promise<void>
	decryptBackup: () => Promise<void>
	restoreBackup: () => Promise<void>
	showRestoreErrorLog: () => void
	resetBackupState: () => void
	/** Drops a running Retry, so one that settles after the page unmounted changes nothing. */
	dispose: () => void
}

/** The backup-embedded profile name, sanitized — a maliciously crafted backup can embed
 *  bidi-override / zero-width / unauthorized chars, and neither the prefill's `v-model`
 *  assignment nor the restore passes through `Input.vue`'s input-event sanitizer. Trimmed,
 *  so a name of spaces around a stripped character is no name at all. */
function sanitizedBackupName(raw: unknown): string | null {
	if (typeof raw !== "string" || raw.length === 0) return null
	const cleaned = sanitizeString(raw, 32).trim()
	return cleaned.length > 0 ? cleaned : null
}

/** The post-token slice clients, constructed up-front for the whole-loop finally. */
function buildSliceClients(): Array<{ name: string; client: SliceRestoreClient }> {
	return [
		{ name: TRANSACTION_SERVICE_NAME, client: new TransactionServiceClient() },
		{ name: TOKEN_BALANCE_SERVICE_NAME, client: new TokenBalanceServiceClient() },
		{ name: AUTH_REGISTRY_SERVICE_NAME, client: new AuthRegistryServiceClient() },
		{ name: CONTACT_SERVICE_NAME, client: new ContactServiceClient() },
		{ name: CONFIG_SERVICE_NAME, client: new ConfigServiceClient() },
	]
}

/**
 * Profile restore with the duplicate-confirm wiring, under the resolved `name` (spread-clone:
 * the parsed `data.profile` is never mutated in place — the structure may be re-read on retry
 * paths; the service-side auto-suffix still resolves collisions). The dup guard throws a TYPED
 * error out of restore (deliberately rethrown past restore's restoreError flattening);
 * `confirmDuplicate` surfaces the shared dialog and re-runs with the same name. `undefined` =
 * the user declined → abandon cleanly (no profile was created — the guard runs before the row
 * commit).
 */
async function restoreProfileStep(
	profile: BackupProfile,
	name: string,
	restoreSecret: RestoreSecret,
	credentialData: PasskeyCredentialData | undefined,
	deps: { profileService: ProfileServiceClient; opts: UseFullBackupImportOptions },
	io: RestoreIo,
): Promise<{ id: string; restoreError?: unknown } | null> {
	const { profileService, opts } = deps
	// The service judges the unchecked fields: the type against the restore secret, the id's shape.
	const profileForRestore = { ...profile, name } as ProfileInfo
	const runRestore = () =>
		profileService.restore(profileForRestore, restoreSecret, opts.password.value, credentialData, opts.allowDuplicate?.value)
	const newProfile = opts.confirmDuplicate ? await opts.confirmDuplicate(runRestore) : await runRestore()
	if (!newProfile) {
		io.setStatus("")
		return null
	}
	if (newProfile.restoreError) {
		applyOutcome(io, { kind: "fail", title: "Import failed", message: errorMessageFromUnknown(newProfile.restoreError) })
		return null
	}
	return newProfile
}

/** Arming is best effort: a failure costs only the reminder. The tail runs under the fence
 *  finalize returns. */
async function finalizeWithReminder(
	validated: ValidatedBackup,
	profileId: string,
	deps: { profileService: ProfileServiceClient; opts: UseFullBackupImportOptions },
): Promise<RestoreRun> {
	let run: string | undefined
	try {
		run = await armRestoreOutcome(profileId, validated.checksum, accountStateNetworkIds(validated.data))
	} catch (error) {
		console.warn("[restore-outcome] the reminder could not be armed", { error })
	}
	const { fence } = await deps.profileService.finalizeRestore(profileId, deps.opts.password.value || undefined)
	return { fence, run }
}

/**
 * The staged restore sequence between the validate gate and completion — the order-of-restore
 * law lives here (see full-backup-restore.ts for each stage's own invariants). Returns the
 * restored profile with what a Retry of its account-state would replay, or null when a stage
 * already rendered its terminal outcome. `scratch` is the deposit-style out-param: the caller's
 * catch must see `createdProfileId` and `finalizeStarted` the moment they exist.
 */
async function executeRestore(
	validated: ValidatedBackup,
	scratch: RestoreScratch,
	io: RestoreIo,
	deps: { profileService: ProfileServiceClient; networkService: NetworkServiceClient; opts: UseFullBackupImportOptions },
): Promise<{
	profile: { id: string; restoreError?: unknown }
	networks: RestoredNetwork[]
	accountStateRetry?: AccountStateRetryContext
} | null> {
	const { data, backup } = validated
	const { profileService, networkService, opts } = deps
	const masterKey = backup["master-key"] as string
	const profile = data.profile

	// Before the passkey ceremony, so a name the user must fix never costs a ceremony.
	const name = await opts.resolveProfileName(sanitizedBackupName(profile.name))
	if (name === null) {
		io.setStatus("")
		return null
	}
	const cred = await resolvePasskeyCredential(profile, masterKey, opts.runCeremony, name, opts.openToast)
	if (cred.kind !== "proceed") {
		applyOutcome(io, cred)
		return null
	}
	const checked = await verifyPasskeyBody(profile, cred.credentialData, validated.checksum, validated.mac)
	if (applyOutcome(io, checked)) return null
	const secretOut = buildRestoreSecret(profile, backup as Record<string, unknown>, masterKey)
	if (secretOut.kind !== "proceed") {
		applyOutcome(io, secretOut)
		return null
	}
	const newProfile = await restoreProfileStep(profile, name, secretOut.restoreSecret, cred.credentialData, deps, io)
	if (!newProfile) return null
	scratch.createdProfileId = newProfile.id

	// UNCONDITIONAL all-rows remap, even when the restored root profile id is unchanged. A
	// full backup is exactly ONE profile's data, so every child row must bind to the profile
	// we just created. Guarding this on `newProfile.id !== profile.id` left a graft hole: a
	// crafted backup whose root profile id is unused (so restore keeps it) but whose child
	// rows carry a VICTIM profile id would skip the remap and write those rows under the
	// victim. Rewriting every `profileId` to `newProfile.id` closes it.
	normalizeAllIds(data, "profileId", newProfile.id)

	io.setStage("restoring:networks")
	const nets = await reseedNetworksStage(data, networkService, profileService, newProfile.id, io)
	if (nets.kind !== "proceed") {
		applyOutcome(io, nets)
		return null
	}
	await restoreActiveNetworkPointer(backup["active-chain-id"], nets.seeded, networkService, newProfile.id)

	const accountService = new AccountServiceClient()
	const accounts = await restoreAccountsStage(data, {
		accountService,
		profileService,
		profileId: newProfile.id,
		io,
	})
	if (accounts.kind !== "proceed") {
		applyOutcome(io, accounts)
		return null
	}

	io.setStage("restoring:tokens")
	await restoreTokensStage(data, accounts.importedChainAddress, io)
	await trustRestoredTokens(newProfile.id)

	const sliceClients = buildSliceClients()
	// The profile restore above always ran first; its id is the fence key every slice
	// restore carries (defensive internal check preserved from the original).
	if (scratch.createdProfileId === undefined) {
		throw new Error("internal: services restore reached without a created profile")
	}
	io.setStage("restoring:services")
	await restoreServiceSlices(data, sliceClients, scratch.createdProfileId, io)

	// Reconcile imported accounts BEFORE activation: an epoch-4 backup carrying a type-1
	// Account row with no matching key row would restore as a zombie that fails at signing —
	// drop it now (both slices have landed). Fail-fast, deliberately uncaught: a
	// reconcile/purge failure escapes to the outer catch, which (pre-finalize) rolls the
	// created profile back — the import must not commit with orphaned balance rows. Inside
	// the call, registered dependents (token balances) are purged BEFORE the Account rows.
	// The accounts stage closed this client; the call reconnects it, and nothing uses it after,
	// so it is closed again once the call settles — including on the failure path above.
	let droppedImported: Awaited<ReturnType<typeof accountService.reconcileImportedAccounts>>
	try {
		droppedImported = await accountService.reconcileImportedAccounts(newProfile.id)
	} finally {
		accountService.disconnect()
	}
	if (droppedImported.length > 0) {
		// Scope COUNT only — the tuples carry on-chain account addresses.
		console.warn(`[import] dropped ${droppedImported.length} imported account(s) with no key row`)
	}

	// Late activation: open the session NOW that all backup data is in storage. This emits
	// `onActiveProfileChanged` → app.vue's handler → `getOrInitNetworks`/`ensureDefaultAccount`
	// see the imported data, not an empty profile that needs default seeding.
	scratch.finalizeStarted = true
	io.setStage("finalizing")
	let restoreRun: RestoreRun
	try {
		restoreRun = await finalizeWithReminder(validated, newProfile.id, deps)
	} catch (err) {
		applyOutcome(io, {
			kind: "fail",
			title: "Couldn't open the imported profile",
			message: errorMessageFromUnknown(err),
		})
		return null
	}

	io.setStage("restoring:account-state")
	const tail = await restoreAccountStateStage(data, nets.seeded, networkService, io, restoreRun, profileService)
	return { profile: newProfile, networks: nets.seeded, accountStateRetry: tail.retry }
}

/** The composable's reactive state, bundled for the module-level flow functions. */
interface ImportRefs {
	selectedBackup: Ref<BackupSelection | null>
	decryptionPassword: Ref<string>
	restoreStatus: Ref<RestoreStatus>
	restoreStage: Ref<RestoreStage>
	restoreErrorLog: Ref<Record<string, unknown[]>>
	importedProfile: Ref<unknown>
	parsedBackupName: Ref<string | null>
	/** The networks the last restore seeded; error surfaces name rows by them. */
	restoredNetworks: ShallowRef<RestoredNetwork[]>
	retryFailedAgain: Ref<boolean>
	/** What a Retry replays; a reset, a new import and an unmount drop it. */
	accountStateRetry: ShallowRef<AccountStateRetryContext | null>
	/** The context a running Retry replays; a Retry whose context was dropped writes nothing. */
	retryingAccountState: ShallowRef<AccountStateRetryContext | null>
}

function dropAccountStateRetry(state: ImportRefs) {
	state.accountStateRetry.value = null
	state.retryingAccountState.value = null
	state.retryFailedAgain.value = false
}

/**
 * AWAIT completeImport in an isolated try/catch. At this point the import genuinely succeeded
 * (data written, session opened via finalizeRestore), so a rejected completion handshake must NOT
 * flip the status back to "failed" or reach the failure path's rollback — it must only surface,
 * never undo. An un-awaited call also leaves a dangling promise that hangs the spinner.
 */
async function completeAfterRestore(opts: UseFullBackupImportOptions, profile: unknown): Promise<void> {
	try {
		await opts.completeImport(profile)
	} catch (err) {
		console.error("completeImport failed after a successful restore:", { error: err })
	}
}

async function runPickBackupFile(state: ImportRefs, opts: UseFullBackupImportOptions) {
	if (state.restoreStatus.value === "progress") return
	try {
		const file = await opts.pickFile()
		// A Retry belongs to the import of the selection a new pick replaces.
		dropAccountStateRetry(state)
		// A pick that yields no file (the capped wrapper's too-large path)
		// must also drop any PREVIOUS selection — otherwise the old file's
		// name and enabled import CTA sit under the new error banner, and
		// the user can "import" a file the UI just said failed.
		if (!file) {
			state.selectedBackup.value = null
			state.parsedBackupName.value = null
			return
		}
		const { selection, parseError } = await readBackupFile(file)
		state.selectedBackup.value = selection
		// Every selection replaces the previous one's name, a nameless one included.
		state.parsedBackupName.value = null
		if (parseError) {
			opts.fillError("full_backup", parseError.title, parseError.tooltip)
			return
		}
		if (selection.type === "unknown" || (selection.type === "plain" && !selection.profileType)) {
			opts.fillError("full_backup", UNRECOGNIZED_BACKUP.title, UNRECOGNIZED_BACKUP.message)
			return
		}
		// Surface the backup-embedded profile name as soon as it's available so the parent
		// page can prefill the Profile-name input. Plain backups carry it in the parsed
		// JSON; encrypted backups only expose it after `decryptBackup`, handled there.
		if (selection.type === "plain") {
			const parsed = selection.backup as { data?: { profile?: { name?: string } } } | null
			state.parsedBackupName.value = sanitizedBackupName(parsed?.data?.profile?.name)
		}
		state.restoreStatus.value = null
		opts.password.value = ""
		opts.repeatedPassword.value = ""
		state.decryptionPassword.value = ""
		opts.clearError()
	} catch (err) {
		// A closed chooser keeps the chosen backup, its name and its Retry.
		if (err instanceof FilePickCanceledError) return
		opts.fillError("full_backup", "Failed to read the backup file")
		console.error("Failed to read backup file:", { error: err })
	}
}

async function runDecryptBackup(state: ImportRefs, opts: UseFullBackupImportOptions) {
	if (!state.decryptionPassword.value) return
	// Snapshot the selection this decrypt belongs to (the stale fences live in
	// openEncryptedBackup — a late publication must not resurrect a replaced selection).
	const target = state.selectedBackup.value
	if (!target) return
	try {
		const opened = await openEncryptedBackup(
			target.backup as string,
			state.decryptionPassword.value,
			() => state.selectedBackup.value !== target,
		)
		if (opened.kind === "stale") return
		// The helper fences internally, but its resolution yields a microtask before this
		// continuation — a queued re-pick in that window must not be overwritten (same
		// await-boundary class as useProfileBootstrap's network write).
		if (state.selectedBackup.value !== target) return
		const backupObject = opened.backupObject
		state.selectedBackup.value = {
			...target,
			backup: backupObject,
			profileType: backupObject?.data?.profile?.type ?? null,
		}
		// Encrypted backups only expose the embedded name AFTER decrypt succeeds. Surface it
		// for the parent's prefill watcher (same sanitization rationale as pickBackupFile).
		state.parsedBackupName.value = sanitizedBackupName(backupObject?.data?.profile?.name)
		opts.clearError()
	} catch {
		if (state.selectedBackup.value !== target) return
		opts.fillError("full_backup", DECRYPTION_FAILED.title, DECRYPTION_FAILED.message)
	}
}

async function runRestoreBackup(
	state: ImportRefs,
	opts: UseFullBackupImportOptions,
	guards: { isAllowed: () => boolean; hasErrors: () => boolean; recordRestoreErrors: (serviceName: string, data: unknown) => unknown[] },
) {
	// Re-entrancy guard: a second concurrent run (double-click, or the popup's
	// document-level Enter handler firing again mid-flight) would create a second
	// profile and race the un-locked account restore into duplicate/last-writer-wins
	// rows. `AccountService.restore` has no lock, so this guard is the barrier.
	// Mirrors `pickBackupFile`'s guard.
	if (state.restoreStatus.value === "progress") return
	if (!guards.isAllowed()) return
	opts.clearError()
	dropAccountStateRetry(state)
	state.restoreStatus.value = "progress"
	state.restoreStage.value = "restoring:profile"

	const sel = state.selectedBackup.value as BackupSelection
	// Integrity + compatibility gate + forward-migration, all before any live state
	// is touched. The earlier profile name/type reads in pickBackupFile/decryptBackup are
	// sanitized display-only prefill and gate nothing.
	const validated = await validateAndMigrateBackup(sel.backup as FullBackupEnvelope)
	if (validated.kind === "rejected") {
		state.restoreStatus.value = "failed"
		opts.fillError("full_backup", validated.title, validated.message)
		return
	}

	// Kept alive for the whole restore so the duplicate-address rollback can call
	// `profileService.deleteProfile()` and so we can call `finalizeRestore()` at the
	// end. Disconnect in finally.
	const profileService = new ProfileServiceClient()
	const networkService = new NetworkServiceClient()
	// Rollback bookkeeping for the failure path: a restore failure AFTER the profile row
	// landed but BEFORE finalize must delete the orphan; once finalize is in flight the
	// profile is deliberately KEPT (its data is fully in storage — the user can unlock it
	// later). Out-param scratch so the catch sees the fields the moment they exist.
	const scratch: RestoreScratch = { createdProfileId: undefined, finalizeStarted: false }
	const io: RestoreIo = {
		fillError: opts.fillError,
		setStatus: (v) => {
			state.restoreStatus.value = v
		},
		setStage: (v) => {
			state.restoreStage.value = v
		},
		recordRestoreErrors: guards.recordRestoreErrors,
		appendErrors: (serviceName, records) => {
			state.restoreErrorLog.value[serviceName] = [...(state.restoreErrorLog.value[serviceName] ?? []), ...records]
		},
	}

	try {
		state.restoreErrorLog.value = {}
		state.restoredNetworks.value = []
		const restored = await executeRestore(validated, scratch, io, { profileService, networkService, opts })
		if (!restored) return

		state.restoreStatus.value = "finished"
		state.restoreStage.value = "finished"
		state.restoredNetworks.value = restored.networks
		if (!guards.hasErrors()) {
			await completeAfterRestore(opts, restored.profile)
			return
		}
		state.importedProfile.value = restored.profile
		state.accountStateRetry.value = restored.accountStateRetry ?? null
	} catch (err) {
		await runRestoreFailurePath(err, scratch, profileService, io)
	} finally {
		profileService.disconnect()
		networkService.disconnect()
	}
}

/** One Retry of the account-state tail, fenced to the context it started from. */
async function runRetryAccountState(
	state: ImportRefs,
	opts: UseFullBackupImportOptions,
	deps: { hasErrors: () => boolean; replaceRestoreErrors: (serviceName: string, stale: unknown[], data: unknown) => unknown[] },
) {
	const ctx = state.accountStateRetry.value
	if (!ctx || state.retryingAccountState.value) return
	state.retryingAccountState.value = ctx
	// A reset, a new import or an unmount drops the context while the Retry runs: from then on
	// nothing it learns belongs to this page.
	const live = () => state.accountStateRetry.value === ctx
	let next: AccountStateRetryContext | undefined
	try {
		next = (
			await retryAccountStateStage(ctx, (serviceName, stale, data) =>
				live() ? deps.replaceRestoreErrors(serviceName, stale, data) : [],
			)
		).retry
	} finally {
		if (state.retryingAccountState.value === ctx) state.retryingAccountState.value = null
	}
	if (!live()) return
	state.accountStateRetry.value = next ?? null
	state.retryFailedAgain.value = next !== undefined
	if (!deps.hasErrors()) await completeAfterRestore(opts, state.importedProfile.value)
}

function retryNetworkNames(ctx: AccountStateRetryContext): string[] {
	const retried = new Set(ctx.retryable.map((item) => item.networkId))
	return ctx.networks.filter((network) => retried.has(network.id)).map((network) => network.name)
}

/** Whether `log` holds a row a Retry of `ctx` would not replace; with no context, any row. */
export function hasRowsBeyondRetry(log: Record<string, unknown[]>, ctx: AccountStateRetryContext | null): boolean {
	const replaced = new Set(ctx ? retryReplacedRows(ctx) : [])
	// Rows read back through the reactive log are proxies: compare the raw rows.
	return Object.values(log).some((rows) => rows.some((row) => !replaced.has(toRaw(row))))
}

function retryWarningRefs(state: ImportRefs) {
	return {
		unrestoredNetworkNames: computed(() => {
			const ctx = state.accountStateRetry.value
			return state.restoreStatus.value === "finished" && ctx ? retryNetworkNames(ctx) : []
		}),
		hasOtherRestoreErrors: computed(() => hasRowsBeyondRetry(state.restoreErrorLog.value, state.accountStateRetry.value)),
	}
}

function reportRestoreErrors(serviceName: string, data: unknown): unknown[] {
	const errors = collectRestoreErrors(serviceName, data) ?? []
	// Names the service and the count only: the rows carry network ids and addresses, which stay
	// in the error viewer and never reach the exportable log.
	if (errors.length) console.warn(`[full-backup-import] ${serviceName} reported ${errors.length} restore error(s)`)
	return errors
}

/** The error log's two writers: a stage's append, and a Retry's swap of the rows it replaces. */
export function errorLogWriters(restoreErrorLog: Ref<Record<string, unknown[]>>) {
	function recordRestoreErrors(serviceName: string, data: unknown): unknown[] {
		const errors = reportRestoreErrors(serviceName, data)
		// APPEND, not assign: some services already have entries recorded before
		// their restore runs (e.g. token-balance's un-relinkable rows are recorded
		// pre-restore) — a plain assignment would clobber those diagnostics.
		if (errors.length) restoreErrorLog.value[serviceName] = [...(restoreErrorLog.value[serviceName] ?? []), ...errors]
		return errors
	}
	/** Swaps `stale` rows for `data`'s in ONE assignment, so the screen never passes through an
	 *  empty log; an emptied key is deleted, because a key alone counts as an error. */
	function replaceRestoreErrors(serviceName: string, stale: unknown[], data: unknown): unknown[] {
		const fresh = reportRestoreErrors(serviceName, data)
		// Rows read back through the reactive log are proxies: compare the raw rows.
		const staleRows = new Set(stale.map((row) => toRaw(row)))
		const { [serviceName]: current = [], ...others } = toRaw(restoreErrorLog.value)
		const rows = [...current.filter((row) => !staleRows.has(toRaw(row))), ...fresh]
		restoreErrorLog.value = rows.length ? { ...others, [serviceName]: rows } : others
		return fresh
	}
	return { recordRestoreErrors, replaceRestoreErrors }
}

function createImportRefs(): ImportRefs {
	return {
		selectedBackup: ref<BackupSelection | null>(null),
		decryptionPassword: ref(""),
		restoreStatus: ref<RestoreStatus>(""),
		restoreStage: ref<RestoreStage>(""),
		restoreErrorLog: ref<Record<string, unknown[]>>({}),
		importedProfile: ref<unknown>(null),
		parsedBackupName: ref<string | null>(null),
		restoredNetworks: shallowRef<RestoredNetwork[]>([]),
		retryFailedAgain: ref(false),
		accountStateRetry: shallowRef<AccountStateRetryContext | null>(null),
		retryingAccountState: shallowRef<AccountStateRetryContext | null>(null),
	}
}

export function useFullBackupImport(opts: UseFullBackupImportOptions): UseFullBackupImportResult {
	const state = createImportRefs()
	const {
		selectedBackup,
		decryptionPassword,
		restoreStatus,
		restoreStage,
		restoreErrorLog,
		importedProfile,
		parsedBackupName,
		restoredNetworks,
		retryFailedAgain,
		accountStateRetry,
		retryingAccountState,
	} = state

	const isRestoreHasErrors = computed(() => Object.keys(restoreErrorLog.value).length > 0)
	const canRetryAccountState = computed(() => restoreStatus.value === "finished" && accountStateRetry.value !== null)
	const isRetryingAccountState = computed(() => retryingAccountState.value !== null)

	const isAllowedToImportBackup = computed(() => {
		if (!selectedBackup.value?.profileType || !selectedBackup.value?.backup) return false
		if (
			selectedBackup.value?.profileType === "password" &&
			!isNewPasswordValid(opts.password.value ?? "", opts.repeatedPassword.value ?? "")
		) {
			return false
		}
		return true
	})

	const { recordRestoreErrors, replaceRestoreErrors } = errorLogWriters(restoreErrorLog)

	const { unrestoredNetworkNames, hasOtherRestoreErrors } = retryWarningRefs(state)
	const pickBackupFile = () => runPickBackupFile(state, opts)
	const decryptBackup = () => runDecryptBackup(state, opts)
	const restoreBackup = () =>
		runRestoreBackup(state, opts, {
			isAllowed: () => isAllowedToImportBackup.value,
			hasErrors: () => isRestoreHasErrors.value,
			recordRestoreErrors,
		})
	const retryAccountState = () => runRetryAccountState(state, opts, { hasErrors: () => isRestoreHasErrors.value, replaceRestoreErrors })
	async function continueImport() {
		if (!importedProfile.value) return
		dropAccountStateRetry(state)
		await opts.completeImport(importedProfile.value)
	}

	function showRestoreErrorLog() {
		if (!isRestoreHasErrors.value) return
		if (opts.showErrorLog) {
			const byNetworkId = new Map(restoredNetworks.value.map((network) => [network.id, network.name]))
			opts.showErrorLog(restoreErrorLog.value, { byNetworkId, unrestored: unrestoredNetworkNames.value })
		} else {
			console.error("Restore errors:", restoreErrorLog.value)
		}
	}

	function resetBackupState() {
		selectedBackup.value = null
		decryptionPassword.value = ""
		restoreStatus.value = ""
		restoreErrorLog.value = {}
		importedProfile.value = null
		parsedBackupName.value = null
		restoredNetworks.value = []
		dropAccountStateRetry(state)
	}

	return {
		selectedBackup,
		decryptionPassword,
		restoreStatus,
		restoreStage,
		restoreErrorLog,
		importedProfile,
		isAllowedToImportBackup,
		isRestoreHasErrors,
		parsedBackupName,
		canRetryAccountState,
		unrestoredNetworkNames,
		retryFailedAgain,
		hasOtherRestoreErrors,
		isRetryingAccountState,
		retryAccountState,
		continueImport,
		pickBackupFile,
		decryptBackup,
		restoreBackup,
		showRestoreErrorLog,
		resetBackupState,
		dispose: () => dropAccountStateRetry(state),
	}
}
