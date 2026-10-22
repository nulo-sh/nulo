import { computed, type ComputedRef, ref, type Ref, type ShallowRef, shallowRef, toRaw, watch } from "vue"
import { errorMessageFromUnknown } from "@nulo/wallet-core/utils"
import {
	RESTORE_AGAIN_OTHER_BACKUP,
	restoreAgainDoneText,
	restoreAgainFailedText,
	restoreWarningText,
	retryResultText,
} from "@/components/composite/import/restore-warning"
import type { ToastOptions } from "@/composables/toast"
import { FilePickCanceledError } from "@/utils/files"
import { type Outcome, showSnack, type Snack } from "@/utils/snack"
import { type BackupSelection, openSelection, readBackupFile } from "@/utils/full-backup-helpers"
import { admitRestoreOutcome, readRestoreOutcome, type RestoreOutcome } from "@/utils/restore-outcome"
import type { Network } from "@/wallet/services/network/spec"
import type { RunFence } from "@/wallet/services/profile/client"
import {
	type AccountStateRetryContext,
	type AccountStateTail,
	type NetworkRestoreClient,
	planRestoreAgain,
	type RestoreIo,
	type RestoreStatus,
	restoreAccountStateStage,
	retryAccountStateStage,
	runFenceLive,
} from "./full-backup-restore"
import { IMPORT_CHAIN_SYNC_TOTAL_BUDGET_MS } from "./importChainSync"
import {
	DECRYPTION_FAILED,
	errorLogWriters,
	type FullBackupEnvelope,
	hasRowsBeyondRetry,
	UNRECOGNIZED_BACKUP,
	validateAndMigrateBackup,
} from "./useFullBackupImport"

export interface RestoreAgainProfileClient {
	captureRunFence(): Promise<RunFence>
	assertRunFence(fence: RunFence): Promise<unknown>
}

export interface UseRestoreAgainOptions {
	profileService: RestoreAgainProfileClient
	networkService: NetworkRestoreClient
	/** The open profile's id. A change while the page is mounted ends it. */
	activeProfileId: () => string | undefined
	/** The open profile's network rows as the store holds them: empty, or another profile's, while
	 *  they load. */
	networks: () => readonly Network[]
	pickFile: () => Promise<File | null | undefined>
	fillError: (type: string, title: string, tooltip?: string) => void
	clearError: () => void
	openToast: (toast: ToastOptions) => void
	showErrorLog: (errors: Record<string, unknown[]>, namesById: ReadonlyMap<string, string>) => void
	/** Returns Home; a full restore passes the outcome it showed. */
	leave: (outcome?: Outcome) => void
}

interface AgainRefs {
	/** The session open on mount: the run registers under it, and settles nothing once it ends. */
	fence: ShallowRef<RunFence | null>
	/** The reminder as read on mount, narrowed by each run to what it left. */
	record: ShallowRef<RestoreOutcome | null>
	selectedBackup: Ref<BackupSelection | null>
	decryptionPassword: Ref<string>
	restoreStatus: Ref<RestoreStatus>
	restoreErrorLog: Ref<Record<string, unknown[]>>
	/** The networks the last restore set out to restore, and those it has not restored yet. */
	carried: ShallowRef<Network[]>
	unrestored: ShallowRef<Network[]>
	retry: ShallowRef<AccountStateRetryContext | null>
	retrying: ShallowRef<AccountStateRetryContext | null>
	retryFailedAgain: Ref<boolean>
	/** Set once the page leaves or unmounts: nothing that settles afterwards shows or routes. */
	ended: Ref<boolean>
}

type LogWriters = ReturnType<typeof errorLogWriters>

function createRefs(): AgainRefs {
	return {
		fence: shallowRef(null),
		record: shallowRef(null),
		selectedBackup: ref(null),
		decryptionPassword: ref(""),
		restoreStatus: ref<RestoreStatus>(""),
		restoreErrorLog: ref({}),
		carried: shallowRef([]),
		unrestored: shallowRef([]),
		retry: shallowRef(null),
		retrying: shallowRef(null),
		retryFailedAgain: ref(false),
		ended: ref(false),
	}
}

const busy = (state: AgainRefs) => state.restoreStatus.value === "progress" || state.retrying.value !== null

function dropRun(state: AgainRefs) {
	state.restoreErrorLog.value = {}
	state.carried.value = []
	state.unrestored.value = []
	state.retry.value = null
	state.retrying.value = null
	state.retryFailedAgain.value = false
}

function end(state: AgainRefs, opts: UseRestoreAgainOptions, outcome?: Outcome) {
	if (state.ended.value) return
	state.ended.value = true
	state.retry.value = null
	opts.leave(outcome)
}

/** The reminder's networks among the open profile's rows; undefined until both are read. A row is
 *  passed raw: a reactive proxy cannot cross Firefox's structured-clone port. */
function namedNetworks(state: AgainRefs, opts: UseRestoreAgainOptions): Network[] | undefined {
	const fence = state.fence.value
	const record = state.record.value
	const rows = opts.networks()
	if (!fence || !record || rows.length === 0 || rows.some((network) => network.profileId !== fence.profileId)) return undefined
	const named = new Set(record.networkIds)
	return rows.filter((network) => named.has(network.id)).map((network) => toRaw(network))
}

async function runStart(state: AgainRefs, opts: UseRestoreAgainOptions) {
	let fence: RunFence | undefined
	let record: RestoreOutcome | undefined
	try {
		fence = await opts.profileService.captureRunFence()
		record = await readRestoreOutcome(fence.profileId)
	} catch (error) {
		console.warn("[restore-again] the reminder could not be read", { error })
	}
	if (state.ended.value) return
	if (!fence || !record || fence.profileId !== opts.activeProfileId()) return end(state, opts)
	state.fence.value = fence
	state.record.value = record
}

async function runPick(state: AgainRefs, opts: UseRestoreAgainOptions) {
	if (busy(state) || state.ended.value) return
	try {
		const file = await opts.pickFile()
		dropRun(state)
		state.restoreStatus.value = null
		state.decryptionPassword.value = ""
		// The capped pick already showed why it yielded no file.
		if (!file) {
			state.selectedBackup.value = null
			return
		}
		const { selection, parseError } = await readBackupFile(file)
		state.selectedBackup.value = selection
		if (parseError) return opts.fillError("full_backup", parseError.title, parseError.tooltip)
		if (selection.kind === "unreadable" || (selection.kind === "plain" && !selection.profileType)) {
			return opts.fillError("full_backup", UNRECOGNIZED_BACKUP.title, UNRECOGNIZED_BACKUP.message)
		}
		opts.clearError()
	} catch (error) {
		if (error instanceof FilePickCanceledError) return
		opts.fillError("full_backup", "Failed to read the backup file")
		console.warn("[restore-again] the backup file could not be read", { error })
	}
}

async function runDecrypt(state: AgainRefs, opts: UseRestoreAgainOptions) {
	const target = state.selectedBackup.value
	if (!state.decryptionPassword.value || !target) return
	const stale = () => state.selectedBackup.value !== target
	try {
		const opened = await openSelection(target, state.decryptionPassword.value, stale)
		if (opened.kind === "stale" || stale()) return
		state.selectedBackup.value = opened.selection
		opts.clearError()
	} catch {
		if (stale()) return
		opts.fillError("full_backup", DECRYPTION_FAILED.title, DECRYPTION_FAILED.message)
	}
}

/** Renews the reminder's lease for this page's run and returns the named networks it still holds;
 *  none once it was dismissed, finished or replaced since the page read it. */
async function admitCarried(state: AgainRefs, opts: UseRestoreAgainOptions, fence: RunFence, record: RestoreOutcome) {
	let admitted: RestoreOutcome | undefined
	try {
		admitted = await admitRestoreOutcome(fence.profileId, record.run)
	} catch (error) {
		console.warn("[restore-again] the reminder could not be renewed", { error })
	}
	if (!admitted) return []
	const held = new Set(admitted.networkIds)
	return (namedNetworks(state, opts) ?? []).filter((network) => held.has(network.id))
}

function stageIo(state: AgainRefs, opts: UseRestoreAgainOptions, writers: LogWriters): RestoreIo {
	return {
		fillError: opts.fillError,
		setStatus: (status) => {
			state.restoreStatus.value = status
		},
		setStage: () => {},
		recordRestoreErrors: writers.recordRestoreErrors,
		appendErrors: (serviceName, records) => {
			state.restoreErrorLog.value[serviceName] = [...(state.restoreErrorLog.value[serviceName] ?? []), ...records]
		},
	}
}

/** Narrows the page to what a run left: all restored goes Home with the toast. */
function settleRun(state: AgainRefs, opts: UseRestoreAgainOptions, tail: AccountStateTail) {
	if (state.ended.value) return
	const restored = new Set(tail.restored)
	const record = state.record.value
	if (record) state.record.value = { ...record, networkIds: record.networkIds.filter((id) => !restored.has(id)) }
	state.unrestored.value = state.unrestored.value.filter((network) => !restored.has(network.id))
	state.retry.value = tail.retry ?? null
	if (state.unrestored.value.length > 0) {
		state.restoreStatus.value = "finished"
		return
	}
	const snack: Snack = { kind: "success", label: restoreAgainDoneText(state.carried.value.map((network) => network.name)) }
	showSnack(opts.openToast, snack)
	const fence = state.fence.value
	end(state, opts, fence ? { snack, profileId: fence.profileId } : undefined)
}

async function runRestore(state: AgainRefs, opts: UseRestoreAgainOptions, writers: LogWriters) {
	const fence = state.fence.value
	const record = state.record.value
	const selection = state.selectedBackup.value
	if (busy(state) || state.ended.value || !fence || !record || !selection?.profileType) return
	opts.clearError()
	dropRun(state)
	state.restoreStatus.value = "progress"
	try {
		const validated = await validateAndMigrateBackup(selection.backup as FullBackupEnvelope)
		if (state.ended.value) return
		// Only the body this profile was restored from passes, and its import already checked it, so no
		// passkey prompt runs again here.
		if (validated.kind === "rejected" || validated.checksum !== record.backup) {
			const refusal = validated.kind === "rejected" ? validated : RESTORE_AGAIN_OTHER_BACKUP
			state.restoreStatus.value = "failed"
			return opts.fillError("full_backup", refusal.title, refusal.message)
		}
		// A run whose session ended could register nothing; Home offers Restore again afresh.
		if (!(await runFenceLive(opts.profileService, fence))) return end(state, opts)
		const carried = await admitCarried(state, opts, fence, record)
		if (state.ended.value) return
		if (carried.length === 0) return end(state, opts)
		state.carried.value = carried
		state.unrestored.value = carried
		const planned = planRestoreAgain(validated.data, carried)
		const io = stageIo(state, opts, writers)
		const tail = await restoreAccountStateStage(
			planned,
			carried,
			opts.networkService,
			io,
			{ fence, run: record.run },
			opts.profileService,
			Date.now() + IMPORT_CHAIN_SYNC_TOTAL_BUDGET_MS,
		)
		settleRun(state, opts, tail)
	} catch (error) {
		if (state.ended.value) return
		state.restoreStatus.value = "failed"
		opts.fillError("full_backup", "Import failed", errorMessageFromUnknown(error))
	}
}

/** One Retry of the networks the last run left retryable, fenced to the context it started from. */
async function runRetry(state: AgainRefs, opts: UseRestoreAgainOptions, writers: LogWriters) {
	const ctx = state.retry.value
	if (!ctx || state.retrying.value || state.ended.value) return
	state.retrying.value = ctx
	const live = () => state.retry.value === ctx
	let tail: AccountStateTail
	try {
		tail = await retryAccountStateStage(ctx, (serviceName, stale, data) =>
			live() ? writers.replaceRestoreErrors(serviceName, stale, data) : [],
		)
		// Checked after the stage, which refuses an ended run before it starts and may see it end.
		if (!(await runFenceLive(opts.profileService, ctx.restoreRun.fence))) return end(state, opts)
	} finally {
		if (state.retrying.value === ctx) state.retrying.value = null
	}
	if (!live()) return
	state.retryFailedAgain.value = tail.retry !== undefined
	settleRun(state, opts, tail)
}

function outcomeText(state: AgainRefs) {
	const retryNames = computed(() => {
		const retried = new Set(state.retry.value?.retryable.map((item) => item.networkId))
		return state.unrestored.value.filter((network) => retried.has(network.id)).map((network) => network.name)
	})
	const warningText = computed(() => {
		const ctx = state.retry.value
		if (ctx) return restoreWarningText(retryNames.value, hasRowsBeyondRetry(state.restoreErrorLog.value, ctx))
		return restoreAgainFailedText(state.unrestored.value.map((network) => network.name))
	})
	const retryResult = computed(() => retryResultText(retryNames.value))
	return { warningText, retryResult }
}

export interface UseRestoreAgainResult {
	selectedBackup: Ref<BackupSelection | null>
	decryptionPassword: Ref<string>
	restoreStatus: Ref<RestoreStatus>
	restoreErrorLog: Ref<Record<string, unknown[]>>
	/** The reminder's networks by their current names; empty until the page has read them. */
	networkNames: ComputedRef<string[]>
	isAllowedToRestore: ComputedRef<boolean>
	isRestoreHasErrors: ComputedRef<boolean>
	canRetry: ComputedRef<boolean>
	isRetrying: ComputedRef<boolean>
	/** The last Retry left a network a Retry would replay again. */
	retryFailedAgain: Ref<boolean>
	/** The warning of a run that left networks unrestored, and the line of a Retry that failed again. */
	warningText: ComputedRef<string>
	retryResult: ComputedRef<string>
	/** Captures the open session and reads its reminder; with none, returns Home. */
	start: () => Promise<void>
	pickBackupFile: () => Promise<void>
	decryptBackup: () => Promise<void>
	restoreBackup: () => Promise<void>
	retryRestore: () => Promise<void>
	continueHome: () => void
	showRestoreErrorLog: () => void
	/** Drops the page's run, so nothing that settles after an unmount shows or routes. */
	dispose: () => void
}

/**
 * Restores, into the open profile, the account state of the networks a full-backup restore left
 * unrestored, from the very backup that restore used: another file, valid or not, changes nothing.
 */
export function useRestoreAgain(opts: UseRestoreAgainOptions): UseRestoreAgainResult {
	const state = createRefs()
	const writers = errorLogWriters(state.restoreErrorLog)
	const named = computed(() => namedNetworks(state, opts))
	const networkNames = computed(() => (named.value ?? []).map((network) => network.name))

	// A profile switch ends the page; the run's own writes are fenced to the session it started in.
	watch(opts.activeProfileId, (id) => {
		if (state.fence.value && id !== state.fence.value.profileId) end(state, opts)
	})
	// Nothing left to restore, before a run starts: every named network was deleted.
	watch(named, (list) => {
		if (list?.length === 0 && state.restoreStatus.value !== "progress" && state.restoreStatus.value !== "finished") end(state, opts)
	})

	return {
		selectedBackup: state.selectedBackup,
		decryptionPassword: state.decryptionPassword,
		restoreStatus: state.restoreStatus,
		restoreErrorLog: state.restoreErrorLog,
		networkNames,
		isAllowedToRestore: computed(() => Boolean(state.selectedBackup.value?.profileType) && networkNames.value.length > 0),
		isRestoreHasErrors: computed(() => Object.keys(state.restoreErrorLog.value).length > 0),
		canRetry: computed(() => state.restoreStatus.value === "finished" && state.retry.value !== null),
		isRetrying: computed(() => state.retrying.value !== null),
		retryFailedAgain: state.retryFailedAgain,
		...outcomeText(state),
		start: () => runStart(state, opts),
		pickBackupFile: () => runPick(state, opts),
		decryptBackup: () => runDecrypt(state, opts),
		restoreBackup: () => runRestore(state, opts, writers),
		retryRestore: () => runRetry(state, opts, writers),
		continueHome: () => end(state, opts),
		showRestoreErrorLog: () =>
			opts.showErrorLog(state.restoreErrorLog.value, new Map(state.carried.value.map((network) => [network.id, network.name]))),
		dispose: () => {
			state.ended.value = true
			state.retry.value = null
		},
	}
}
