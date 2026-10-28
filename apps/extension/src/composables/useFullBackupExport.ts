// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { computed, type ComputedRef, type Ref, ref } from "vue"
import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import { managers } from "@/utils/core"
import { ACCOUNT_SERVICE_NAME, AccountServiceClient, IMPORTED_KEYS_SERVICE_NAME } from "@/wallet/services/account/client"
import { type Account, AccountType, accountScopeKey, type ImportedAccountKey } from "@/wallet/services/account/spec"
import { ACCOUNT_STATE_SERVICE_NAME, AccountStateServiceClient } from "@/wallet/services/account-state/client"
import { AUTH_REGISTRY_SERVICE_NAME, AuthRegistryServiceClient } from "@/wallet/services/auth-registry/client"
import { CONFIG_SERVICE_NAME, ConfigServiceClient } from "@/wallet/services/config/client"
import { CONTACT_SERVICE_NAME, ContactServiceClient } from "@/wallet/services/contact/client"
import { isSeedChain } from "@/wallet/services/network/seeds"
import { PROFILE_SERVICE_NAME, type ProfileInfo, ProfileServiceClient } from "@/wallet/services/profile/client"
import type { RunFence as ProfileRunFence } from "@/wallet/services/profile/spec"
import { TOKEN_SERVICE_NAME, TokenServiceClient } from "@/wallet/services/token/client"
import { TOKEN_BALANCE_SERVICE_NAME, TokenBalanceServiceClient } from "@/wallet/services/token-balance/client"
import { TRANSACTION_SERVICE_NAME, TransactionServiceClient } from "@/wallet/services/transaction/client"
import type { PasskeyRequest } from "@/wallet/services/passkey/spec"
import { BACKUP_SCHEMA_VERSION_FIELD, COMPAT_EPOCH_FIELD, CURRENT_COMPAT_EPOCH } from "@/wallet/services/backup/backup-migration-registry"
import { CURRENT_BACKUP_SCHEMA_VERSION } from "@/wallet/services/backup/backup-migrator"
import { downloadFile, profileFileNameSegment } from "@/utils"
import { logCredentialFailure } from "@/utils/credential-refusal"
import { MAX_BACKUP_FILE_BYTES, assembleFullBackup, sealFullBackupText } from "@/utils/full-backup-helpers"
import { markGetStarted } from "@/utils/get-started"
import { handleCancelOrUnconfirmed } from "@/utils/passkey-copy"
import { isNewPasswordValid } from "@/utils/password"
import { createRunFence, type RunFence } from "@/composables/runFence"
import { useToast } from "@/composables/toast.js"
import { useAppStore } from "@/stores/app.store"

type BackupStatus = "" | "progress" | "finished" | "encrypting" | "encrypted" | "downloaded"
type BackupClient = { backup(): Promise<unknown>; disconnect(): void }
type NamedClient = { name: string; client: BackupClient }
type HeldSlices = Record<string, unknown>
type AddedNetworkImports = { accounts: number; networks: number }

/** One create's currency and the clients it opened. Key material, the envelope and the passkey
 *  credential stay locals of the run, released when it settles; this record never holds them. */
interface ExportRun {
	readonly isCurrent: () => boolean
	clients: NamedClient[] | null
}

type KeyMaterial = {
	key: string
	entropyB64: string
	dekB64: string
	dekReplaced: boolean
	unopenedImportedKeys?: number
	importsOnAddedNetworks: AddedNetworkImports
	heldSlices: HeldSlices
}

export interface UseFullBackupExportOptions {
	runCeremony: (request: PasskeyRequest) => Promise<PasskeyCredentialData>
	leaveAfterPasskeyFailure: () => void
}

interface ExportState {
	password: Ref<string | null | undefined>
	repeatedPassword: Ref<string | null | undefined>
	isAgreed: Ref<boolean>
	backupStatus: Ref<BackupStatus>
	isBusy: Ref<boolean>
	isDownloading: Ref<boolean>
	showRecommendation: Ref<boolean>
	isWrongPassword: Ref<boolean>
	// Two distinct losses the user must know about before trusting the download. `dekReplaced`: the
	// stored imported-keys key no longer opens, so the file carries a FRESH one and every imported
	// account must be re-imported. `chainStateOmitted`: the profile is in recovery mode, so the PXE
	// contract/sender state was left out — the imported-key ciphertext itself may still be intact
	// (a corrupt envelope MAC alone lands here) and travels in the file.
	dekReplaced: Ref<boolean>
	chainStateOmitted: Ref<boolean>
	/** Imported-key rows that did not open, so travel as stored and will not restore. A replaced DEK
	 *  has its own warning, which covers them. */
	unopenedImportedKeys: Ref<number>
	/** The file's imported accounts with a key in it, on chains a restore does not re-create; a key
	 *  that did not open counts too. None when a replaced DEK has its own warning. */
	importsOnAddedNetworks: Ref<AddedNetworkImports>
}

interface ExportCtx {
	state: ExportState
	// Sealed artifact strings, published only by a completed run — never a mutable draft object.
	// `compact` is the encryption input (the snapshot `assembleFullBackup` checksummed, so the
	// embedded checksum covers exactly these bytes), `sealed` the encrypted file.
	artifacts: { compact: string | null; sealed: string | null }
	// The one fence: `discardRun` invalidates it and runs only snapshot it, so a superseded run can
	// neither publish state nor resurrect scrubbed secrets.
	runs: RunFence
	// The in-flight create, for the scrub's client teardown.
	activeRun: ExportRun | null
	// The session the published backup was made in. A password profile's file is sealed under the
	// password that opened its keys there, which stays the profile's while that session stands: a
	// password change reopens the session under the same lock as its commit.
	madeIn: ProfileRunFence | null
	// Counts the page's start-overs: a reset or a switch ends what a late answer may still say, a
	// completed download does not.
	resets: number
	disposed: boolean
	appStore: ReturnType<typeof useAppStore>
	/** The page requires a session, so a profile is always active; read live, never cached. */
	profile: () => ProfileInfo
	isPasskeyProfile: ComputedRef<boolean>
	openToast: ReturnType<typeof useToast>["openToast"]
	opts: UseFullBackupExportOptions
}

// One bad disconnect must not block the remaining disconnects or the secret
// scrub that follows — teardown is best-effort per client, never throwing.
function disconnectAll(clients: NamedClient[]) {
	for (const { client } of clients) {
		try {
			client.disconnect()
		} catch (err) {
			console.error("[export/full] client disconnect failed:", err)
		}
	}
}

const noAddedNetworkImports = (): AddedNetworkImports => ({ accounts: 0, networks: 0 })

function importsOnAddedNetworks(accounts: readonly Account[], rows: readonly ImportedAccountKey[]): AddedNetworkImports {
	const imported = new Set(accounts.filter((a) => a.type === AccountType.Imported).map((a) => accountScopeKey(a.chainId, a.address)))
	const chains = rows
		.filter((row) => !isSeedChain(row.chainId) && imported.has(accountScopeKey(row.chainId, row.address)))
		.map((row) => row.chainId)
	return { accounts: chains.length, networks: new Set(chains).size }
}

// Slice keys are the services' OWN name constants — the import path's slice
// registry rejects anything else. Constructed PER RUN so two runs can never share a client and an
// aborted run's teardown cannot touch a later run's connections.
function buildBackupServices(): NamedClient[] {
	const importedKeysBackupClient = new AccountServiceClient()
	return [
		{ name: PROFILE_SERVICE_NAME, client: new ProfileServiceClient() },
		{ name: ACCOUNT_SERVICE_NAME, client: new AccountServiceClient() },
		// The imported-keys slice shares AccountService but has its OWN backup name/root — a thin
		// adapter routes `.backup()` to `backupImportedKeys()`.
		{
			name: IMPORTED_KEYS_SERVICE_NAME,
			client: {
				backup: () => importedKeysBackupClient.backupImportedKeys(),
				disconnect: () => importedKeysBackupClient.disconnect(),
			},
		},
		{ name: TRANSACTION_SERVICE_NAME, client: new TransactionServiceClient() },
		{ name: TOKEN_SERVICE_NAME, client: new TokenServiceClient() },
		{ name: TOKEN_BALANCE_SERVICE_NAME, client: new TokenBalanceServiceClient() },
		{ name: ACCOUNT_STATE_SERVICE_NAME, client: new AccountStateServiceClient() },
		{ name: AUTH_REGISTRY_SERVICE_NAME, client: new AuthRegistryServiceClient() },
		{ name: CONTACT_SERVICE_NAME, client: new ContactServiceClient() },
		{ name: CONFIG_SERVICE_NAME, client: new ConfigServiceClient() },
	] as NamedClient[]
}

/** Runs the profile's passkey in the in-page card BEFORE the service is called, bound to the
 *  profile's credential and PRF input. Returns "handled" when the flow already resolved the
 *  failure UI (or was superseded). */
async function acquirePasskeyCredential(ctx: ExportCtx, isCurrent: () => boolean) {
	const { state } = ctx
	try {
		const { credentialId, prfSalt } = await managers.profile.getPasskeyUnlockParams(ctx.profile().id)
		if (!isCurrent()) return "handled"
		const credentialData = await ctx.opts.runCeremony({
			mode: "get",
			credentialId,
			prfSalt,
			step: "export",
			profileName: ctx.profile().name,
		})
		return { credentialData }
	} catch (err) {
		if (!isCurrent()) return "handled"
		state.backupStatus.value = ""
		// A cancel or an unconfirmed prompt resets the agreement gate so the user can re-confirm or
		// back out without bouncing off the page — passkey export auto-fires on agree (no "Create
		// Backup" CTA), so without this reset they'd be stuck on a dead form.
		if (handleCancelOrUnconfirmed(err, ctx.openToast)) {
			state.isAgreed.value = false
			return "handled"
		}
		// User-facing copy stays generic; the underlying error goes to the console so a failed
		// export is diagnosable (this catch and the key-export one below are otherwise
		// indistinguishable — same toast, same navigation).
		logCredentialFailure("[export/full] passkey credential acquisition failed:", err)
		ctx.openToast({ kind: "error", label: "Failed to authenticate by passkey" })
		ctx.opts.leaveAfterPasskeyFailure()
		return "handled"
	}
}

/** Stage 2: the authenticated key-material export, the same body for both unlock methods. Returns
 *  "handled" when the failure UI already resolved (wrong password / passkey failure / superseded
 *  run). */
async function exportKeyMaterial(
	ctx: ExportCtx,
	isCurrent: () => boolean,
	fence: ProfileRunFence,
	credentialData: PasskeyCredentialData | undefined,
	accountClient: AccountServiceClient,
): Promise<KeyMaterial | "handled"> {
	const { state } = ctx
	try {
		// The file carries a key made for this backup alone, never the profile's imported-keys DEK. A
		// passkey profile's password field holds the file password, which opens nothing here.
		const material = credentialData
			? await accountClient.exportFullBackupKeys(fence, undefined, credentialData)
			: await accountClient.exportFullBackupKeys(fence, state.password.value as string)
		if (!isCurrent()) return "handled"
		return {
			key: material.masterKey,
			entropyB64: material.entropy,
			dekB64: material.importedKeysKey,
			dekReplaced: material.dekReplaced,
			unopenedImportedKeys: material.unopenedImportedKeys,
			importsOnAddedNetworks: importsOnAddedNetworks(material.accounts, material.importedKeyRows),
			heldSlices: { [ACCOUNT_SERVICE_NAME]: material.accounts, [IMPORTED_KEYS_SERVICE_NAME]: material.importedKeyRows },
		}
	} catch (error) {
		if (!isCurrent()) return "handled"
		state.backupStatus.value = ""
		if (!ctx.isPasskeyProfile.value) {
			state.isWrongPassword.value = true
		} else {
			// See the acquisition catch above — stage-tagged so the two failure points are
			// distinguishable in the console while the user-facing copy stays generic.
			logCredentialFailure("[export/full] passkey export failed:", error)
			ctx.openToast({ kind: "error", label: "Failed to authenticate by passkey" })
			ctx.opts.leaveAfterPasskeyFailure()
		}
		return "handled"
	}
}

/** Two orthogonal version fields replace the legacy conflated
 *  `schema-version: 2`: the NON-migratable account-contract epoch and the
 *  MIGRATABLE storage schema version the import path migrates forward from.
 *  Constants are single-sourced with the import gates. `data` and
 *  `checksum` are the assembler's to add — in that order, so the sealed
 *  key order matches what the import side re-serializes. */
function buildBackupEnvelope(ctx: ExportCtx, { key, entropyB64, dekB64 }: KeyMaterial) {
	return {
		"wallet-version": __VERSION__,
		"aztec-version": __AZTEC_VERSION__,
		[COMPAT_EPOCH_FIELD]: CURRENT_COMPAT_EPOCH,
		[BACKUP_SCHEMA_VERSION_FIELD]: CURRENT_BACKUP_SCHEMA_VERSION,
		"master-key": key,
		// Restore verifies PBKDF2(words(entropy)) == master-key before sealing.
		entropy: entropyB64,
		// Plaintext beside the plaintext master: the key made for this backup alone that its
		// imported-key rows open under. Restore feeds it ONLY into the rewrap context (the restored
		// row mints a FRESH dek — clone divergence).
		"imported-keys-dek": dekB64,
		// The active-network preference names a CHAIN (row ids are per install and the backup
		// carries no network rows); restore honours it only for a seeded chain, else the primary
		// seed stays active. `undefined` is dropped by JSON.stringify when there is no active network.
		"active-chain-id": ctx.appStore.network?.chainId,
	}
}

/** Export-side half of the shared size invariant: never ship a file the
 *  import gate would reject — fail loud here instead of silently at
 *  restore time. Measured in UTF-8 BYTES to match the import side's
 *  `file.size` (string .length counts UTF-16 code units and undercounts
 *  multi-byte content like emoji in profile/contact names).
 *  Deliberately synchronous — runs inside the post-assembly fenced span. */
function rejectOversizedBackup(ctx: ExportCtx, pretty: string) {
	if (new TextEncoder().encode(pretty).length <= MAX_BACKUP_FILE_BYTES) return false
	ctx.state.backupStatus.value = ""
	if (ctx.isPasskeyProfile.value) ctx.state.isAgreed.value = false
	ctx.openToast({ kind: "error", label: "Backup is too large to create" })
	return true
}

/** The assembly-failure UI (deliberately synchronous — runs inside the catch's
 *  span; owns the currency fence: a superseded run stays silent — the page
 *  that could show the error is gone). */
function reportAssemblyFailure(ctx: ExportCtx, isCurrent: () => boolean, err: unknown) {
	if (!isCurrent()) return
	ctx.state.backupStatus.value = ""
	if (ctx.isPasskeyProfile.value) ctx.state.isAgreed.value = false
	console.error("[export/full] backup assembly failed:", err)
	ctx.openToast({ kind: "error", label: "Failed to create the backup" })
}

function backupSources(runClients: NamedClient[], heldSlices: HeldSlices = {}) {
	return runClients.map(({ name, client }) => ({
		name,
		backup: name in heldSlices ? async () => heldSlices[name] : () => client.backup(),
	}))
}

/** Stage 1: the run's fence, then a passkey profile's credential. Slices resolve the active
 *  profile on their own and a profile switch updates the page in place, so the run is bound to
 *  one session of one profile in one worker: a lock, a switch (even away and back) or a worker
 *  restart before publication fails it. Returns "handled" when the run already ended. */
async function openRun(ctx: ExportCtx, isCurrent: () => boolean) {
	const fence = await managers.profile.captureRunFence()
	if (!isCurrent()) return "handled"
	if (fence.profileId !== ctx.profile().id) throw new Error("The active profile is not the one being backed up")
	if (!ctx.isPasskeyProfile.value) return { fence, credentialData: undefined }
	const acquired = await acquirePasskeyCredential(ctx, isCurrent)
	if (acquired === "handled" || !isCurrent()) return "handled"
	return { fence, credentialData: acquired.credentialData }
}

function showFileWarnings(ctx: ExportCtx, material: KeyMaterial) {
	const { state } = ctx
	state.dekReplaced.value = !!material.dekReplaced
	state.unopenedImportedKeys.value = material.dekReplaced ? 0 : (material.unopenedImportedKeys ?? 0)
	state.importsOnAddedNetworks.value = material.dekReplaced ? noAddedNetworkImports() : material.importsOnAddedNetworks
	state.chainStateOmitted.value = !!ctx.profile().recoveryMode
}

async function runBackup(ctx: ExportCtx) {
	const { state } = ctx
	// Re-entry latch: closes synchronously, before the first await, so a double click or Enter cannot
	// start a second run.
	if (ctx.disposed || state.isBusy.value) return
	state.isBusy.value = true
	const run: ExportRun = { isCurrent: ctx.runs.snapshot(), clients: null }
	const { isCurrent } = run
	state.backupStatus.value = "progress"
	try {
		const opened = await openRun(ctx, isCurrent)
		if (opened === "handled" || !isCurrent()) return

		run.clients = buildBackupServices()
		ctx.activeRun = run
		const accountClient = run.clients.find(({ name }) => name === ACCOUNT_SERVICE_NAME)!.client as unknown as AccountServiceClient
		const { fence, credentialData } = opened
		const material = await exportKeyMaterial(ctx, isCurrent, fence, credentialData, accountClient)
		if (material === "handled" || !isCurrent()) return
		showFileWarnings(ctx, material)
		const envelope = buildBackupEnvelope(ctx, material)

		const sources = backupSources(run.clients, material.heldSlices)
		const result = await assembleFullBackup(envelope, sources, isCurrent)
		await managers.profile.assertRunFence(fence)
		// Fence first: a superseded run must not run the oversize UI writes.
		if (!isCurrent() || rejectOversizedBackup(ctx, result.pretty)) return

		ctx.artifacts.compact = result.compact
		ctx.madeIn = fence
		state.backupStatus.value = "finished"
		state.showRecommendation.value = true
	} catch (err) {
		reportAssemblyFailure(ctx, isCurrent, err)
	} finally {
		if (run.clients) disconnectAll(run.clients)
		if (ctx.activeRun === run) ctx.activeRun = null
		if (isCurrent()) state.isBusy.value = false
	}
}

/** A passkey profile's file gets a password of its own, typed on this page; it meets the new-password
 *  rule, since the file holds the recovery phrase. Returns true when encryption must not start. */
function filePasswordBlocked(ctx: ExportCtx) {
	const { state } = ctx
	return ctx.isPasskeyProfile.value && !isNewPasswordValid(state.password.value ?? "", state.repeatedPassword.value ?? "")
}

/** Whether a password profile's backup was made in the session still open, so the password it is
 *  sealed under still opens the profile. The service answers under the lock a password change holds
 *  from its commit through its reopen. A passkey profile's file takes a password of its own and never
 *  asks. */
async function madeInSessionStands(ctx: ExportCtx, madeIn: ProfileRunFence | null): Promise<boolean> {
	if (ctx.isPasskeyProfile.value) return true
	try {
		await managers.profile.assertRunFence(madeIn as ProfileRunFence)
		return true
	} catch {
		return false
	}
}

async function runEncrypt(ctx: ExportCtx) {
	const { state } = ctx
	// Never mid-download: the plaintext file would land on disk while the page says it is encrypted.
	if (ctx.disposed || state.isBusy.value || state.isDownloading.value) return
	if (filePasswordBlocked(ctx)) return
	state.isBusy.value = true
	const isCurrent = ctx.runs.snapshot()
	const plaintext = ctx.artifacts.compact
	const madeIn = ctx.madeIn

	state.backupStatus.value = "encrypting"
	state.showRecommendation.value = false

	try {
		const sealed = await sealFullBackupText(plaintext as string, state.password.value as string)
		if (!isCurrent()) return
		// After the seal, so a change committed while the seal ran is caught too.
		const stands = await madeInSessionStands(ctx, madeIn)
		if (!isCurrent()) return
		if (!stands) {
			resetFlow(ctx)
			ctx.openToast({ kind: "error", label: "Failed to encrypt the backup" })
			return
		}
		// Encrypted-side half of the shared size invariant (the tag, base64 and AES-GCM
		// overhead could in principle cross the line a plain file sits under).
		// The text is pure ASCII, so string length IS the byte count here.
		if (sealed.length > MAX_BACKUP_FILE_BYTES) {
			state.backupStatus.value = "finished"
			ctx.openToast({ kind: "error", label: "Backup is too large to create" })
			return
		}
		ctx.artifacts.sealed = sealed
		state.backupStatus.value = "encrypted"
	} catch (error) {
		if (!isCurrent()) return
		console.error("Failed to encrypt the backup", error)
		ctx.openToast({ kind: "error", label: "Failed to encrypt the backup" })
		state.backupStatus.value = "finished"
	} finally {
		if (isCurrent()) state.isBusy.value = false
	}
}

/** The file holds the master secret, the recovery phrase and every key, so only its encrypted form
 *  leaves the page. */
async function runDownload(ctx: ExportCtx) {
	const { state } = ctx
	if (ctx.disposed || state.isDownloading.value || state.isBusy.value) return
	const fileContent = ctx.artifacts.sealed
	if (!fileContent || state.backupStatus.value !== "encrypted") return
	state.isDownloading.value = true
	const isCurrent = ctx.runs.snapshot()
	// A profile switch discards the run, so the active profile is the one this file backs up.
	const profileId = ctx.profile().id
	const filename = `NuloEncryptedBackup_${profileFileNameSegment(ctx.profile().name)}_${Math.floor(Date.now() / 1000)}.txt`

	try {
		// A change of password whose update this page never heard still leaves no file behind.
		const stands = await madeInSessionStands(ctx, ctx.madeIn)
		if (!isCurrent()) return
		if (!stands) {
			resetFlow(ctx)
			ctx.openToast({ kind: "error", label: "Failed to download backup" })
			return
		}
		// A file already requested still lands after a scrub; its toast and Home's flag are fenced.
		await downloadFile({ data: fileContent, filename, compressionFormat: "gzip" })
		if (!isCurrent()) return
		void markGetStarted(profileId, "backupSaved")
		ctx.openToast({ kind: "success", label: "Backup downloaded successfully" })
		// A saved file is the run's last step, so its plaintext and passwords go now. The latch clears
		// first: the discard invalidates the fence the `finally` below checks.
		state.backupStatus.value = "downloaded"
		state.showRecommendation.value = false
		state.isDownloading.value = false
		discardRun(ctx)
	} catch (err) {
		if (!isCurrent()) return
		console.error("Download failed:", { error: err })
		ctx.openToast({ kind: "error", label: "Failed to download backup" })
	} finally {
		if (isCurrent()) state.isDownloading.value = false
	}
}

/** Ends the run and drops what it made. Fence first so no in-flight continuation can publish or
 *  resurrect state; then services (cleanup-order rule), then the secret scrub: the artifact strings
 *  hold the plaintext master, entropy and imported-keys key (best-effort: references cleared;
 *  pending operations keep what they captured until they settle). */
function discardRun(ctx: ExportCtx) {
	ctx.runs.invalidate()
	const active = ctx.activeRun
	if (active) {
		disconnectAll(active.clients ?? [])
		ctx.activeRun = null
	}
	ctx.artifacts.compact = null
	ctx.artifacts.sealed = null
	ctx.madeIn = null
	ctx.state.password.value = null
	ctx.state.repeatedPassword.value = null
}

function resetFlow(ctx: ExportCtx) {
	ctx.resets++
	discardRun(ctx)
	const { state } = ctx
	state.isBusy.value = false
	state.isDownloading.value = false
	state.isAgreed.value = false
	state.backupStatus.value = ""
	state.showRecommendation.value = false
	state.isWrongPassword.value = false
	state.dekReplaced.value = false
	state.unopenedImportedKeys.value = 0
	state.importsOnAddedNetworks.value = noAddedNetworkImports()
	state.chainStateOmitted.value = false
}

/** An update of the password profile while the page holds its backup: a password change made elsewhere
 *  reopens the session the backup was made in, a rename leaves it standing. Before a backup the prompt
 *  refuses a replaced password itself, and a downloaded file left while its session stood. */
async function followProfileUpdate(ctx: ExportCtx) {
	const madeIn = ctx.madeIn
	if (!madeIn) return
	// A download that completes meanwhile ends the run, but the person must still hear that the file
	// it saved opens with the replaced password.
	const resets = ctx.resets
	if ((await madeInSessionStands(ctx, madeIn)) || ctx.disposed || ctx.resets !== resets) return
	resetFlow(ctx)
	ctx.openToast({ kind: "info", label: "Profile password changed in another window." })
}

function createExportState(): ExportState {
	return {
		password: ref<string | null>(),
		repeatedPassword: ref<string | null>(),
		isAgreed: ref(false),
		backupStatus: ref<BackupStatus>(""),
		isBusy: ref(false),
		isDownloading: ref(false),
		showRecommendation: ref(false),
		isWrongPassword: ref(false),
		dekReplaced: ref(false),
		chainStateOmitted: ref(false),
		unopenedImportedKeys: ref(0),
		importsOnAddedNetworks: ref(noAddedNetworkImports()),
	}
}

/**
 * The full-backup export run: one fence, one scrub. The plaintext artifacts live only here, a
 * superseded run publishes nothing, and `dispose()` is terminal. Each create owns the service
 * clients it opens (built when the run opens, disconnected in its `finally` and by the scrub),
 * like the import side's runs; the page owns none of them.
 */
export function useFullBackupExport(opts: UseFullBackupExportOptions) {
	const appStore = useAppStore()
	const { openToast } = useToast()
	const state = createExportState()
	const profile = () => appStore.profile as ProfileInfo
	const isPasskeyProfile = computed(() => profile().type === "passkey")
	const ctx: ExportCtx = {
		state,
		artifacts: { compact: null, sealed: null },
		runs: createRunFence(),
		activeRun: null,
		madeIn: null,
		resets: 0,
		disposed: false,
		appStore,
		profile,
		isPasskeyProfile,
		openToast,
		opts,
	}
	const canDownload = computed(() => state.backupStatus.value === "encrypted")
	/** A passkey profile's file password meets the new-password rule; a password profile's file
	 *  takes the profile password it was unlocked with. */
	const canEncrypt = computed(
		() => !isPasskeyProfile.value || isNewPasswordValid(state.password.value ?? "", state.repeatedPassword.value ?? ""),
	)

	return {
		...state,
		isPasskeyProfile,
		canDownload,
		canEncrypt,
		handleBackup: () => runBackup(ctx),
		handleEncrypt: () => runEncrypt(ctx),
		downloadBackup: () => runDownload(ctx),
		/** The scrub, then every flow ref back to its initial value. */
		reset: () => resetFlow(ctx),
		followProfileUpdate: () => followProfileUpdate(ctx),
		dispose: () => {
			ctx.disposed = true
			discardRun(ctx)
		},
	}
}
