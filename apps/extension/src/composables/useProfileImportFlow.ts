// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { computed, type Ref, readonly, ref, watch } from "vue"
import { DuplicateWalletError } from "@nulo/extension-messaging/errors"
import type { ToastOptions } from "@/composables/toast"
import { useConfirm } from "@/composables/useConfirm"
import { type RestoreErrorNetworks, useFullBackupImport } from "@/composables/useFullBackupImport"
import { useProfileNameDefault } from "@/composables/useProfileNameDefault"
import { useProfileNameField } from "@/composables/useProfileNameField"
import { FileTooLargeError, pickFile } from "@/utils"
import { copyWithToast } from "@/utils/clipboard"
import { MAX_BACKUP_FILE_BYTES } from "@/utils/full-backup-helpers"
import { managers } from "@/utils/core"
import { canonicalizeMnemonic, errorMessageFromUnknown, getEntropy } from "@nulo/wallet-core/utils"
import { zeroize } from "@nulo/wallet-crypto"
import { isNewPasswordValid } from "@/utils/password"
import { PHRASE_WORD_COUNT, type PhraseVerdict, readPhraseVerdict } from "@/utils/recovery-phrase"
import { usePasskeyCeremony } from "@/composables/usePasskeyCeremony"
import { type NewProfileUnlock, type UnlockMethod, useNewProfilePasskey } from "@/composables/useNewProfilePasskey"
import { handleCancelOrUnconfirmed, passkeyFailureCopy } from "@/utils/passkey-copy"
import type { NewPasskeyDisplay } from "@/wallet/services/passkey/spec"

/**
 * Shared orchestration for the profile-IMPORT flow, consumed by both the
 * popup (`popup/pages/import.vue`) and onboarding (`onboarding/pages/import.vue`)
 * shells. Owns the validation + secret-entry + full-backup wiring + error
 * routing; the two shells inject the parts that genuinely differ.
 *
 * The activation tail is INJECTED, not owned: `completeImport` runs the
 * shell's own "profile is now active" sequence. The popup relies on
 * `popup/app.vue`'s `onActiveProfileChanged` listener (it does NOT bootstrap);
 * onboarding has no such listener and bootstraps explicitly. The same
 * `completeImport` reference is threaded into `useFullBackupImport`, so every
 * import path (seed + full-backup) activates through exactly one
 * callback — which is also why the onboarding shell no longer double-bootstraps.
 *
 * C1 lifecycle: exposes `dispose()` (the parent calls it in its existing
 * `onBeforeUnmount`); never registers its own `onUnmounted`. Secret refs are
 * exposed but NOT zeroed here — zeroing is a per-shell page concern.
 */
export interface UseProfileImportFlowOptions {
	/**
	 * Per-shell activation + routing + success toast. Popup: listener-based, no
	 * bootstrap. Onboarding: `bootstrapActiveProfile` then route. Threaded into
	 * `useFullBackupImport` too.
	 */
	completeImport: (profile: unknown) => Promise<void> | void
	/** Per-shell restore-error surface (popup = data-viewer overlay; onboarding = notification). */
	showErrorLog: (errors: Record<string, unknown[]>, networks: RestoreErrorNetworks) => void
	/** The page's toast: the copy-error affordance. */
	openToast: (toast: ToastOptions) => void
}

/** The flow's error banner + copy-to-clipboard affordance. */
export function useImportErrorState(openToast: UseProfileImportFlowOptions["openToast"]) {
	const error = ref({ type: "", title: "", tooltip: "" })
	function fillError(type?: string, title?: string, tooltip?: string) {
		if (!title) {
			error.value = { type: "", title: "", tooltip: "" }
			return
		}
		error.value = { type: type ?? "unknown", title, tooltip: tooltip ?? "" }
	}
	function clearError() {
		fillError()
	}

	// Unified catch-all (A1): both shells render title "Import failed" + the
	// message as tooltip. Replaces popup's prior `fillError("unknown", err)`,
	// which put the Error object in the title slot and rendered "[object Object]".
	function fillUnknownImportError(err: unknown) {
		fillError("unknown", "Import failed", errorMessageFromUnknown(err))
	}

	const isCopied = ref(false)
	function handleCopyError() {
		isCopied.value = true
		void copyWithToast(`${error.value.title}${error.value.tooltip ? `: ${error.value.tooltip}` : ""}`, openToast, "Error is copied")
		setTimeout(() => {
			isCopied.value = false
		}, 1_500)
	}

	function handlePasswordInput() {
		if (error.value.type === "password") fillError()
	}
	function handleSecretInput() {
		if (error.value.type === "secret") fillError()
	}

	return { error, isCopied, fillError, clearError, fillUnknownImportError, handleCopyError, handlePasswordInput, handleSecretInput }
}

/** The duplicate-recovery-phrase warn-and-confirm, shared by every import path. */
function useDuplicateConfirm() {
	const { askConfirm } = useConfirm()
	/** Set once the user confirms the duplicate-recovery-phrase warning; the retry passes it to
	 *  the service. Reset per attempt so a confirm never leaks into a later, unrelated import. */
	const allowDuplicate = ref(false)

	/**
	 * Warn-and-confirm for a duplicate recovery phrase (owner policy: a warned choice, never a
	 * hard block). `run` is re-invoked with `allowDuplicate` set if the user confirms; any other
	 * error propagates untouched. Shared by the seed + full-backup import paths, so the
	 * copy and the retry semantics can't drift between them.
	 */
	async function withDuplicateConfirm<T>(run: () => Promise<T>): Promise<T | undefined> {
		try {
			return await run()
		} catch (err) {
			if (!(err instanceof DuplicateWalletError)) throw err
			const existing = (err.details as { existingProfileName?: string } | undefined)?.existingProfileName
			const confirmed = await askConfirm({
				title: "You already have this wallet",
				description: existing
					? `“${existing}” already uses this recovery phrase. Both profiles will hold the same accounts and funds. Add it anyway?`
					: "Another profile already uses this recovery phrase. Both profiles will hold the same accounts and funds. Add it anyway?",
				confirm_text: "Add anyway",
			})
			if (!confirmed) return undefined
			allowDuplicate.value = true
			try {
				return await run()
			} finally {
				allowDuplicate.value = false
			}
		}
	}

	return { allowDuplicate, withDuplicateConfirm }
}

interface ImportHandlerDeps {
	isImporting: Ref<boolean>
	isAllowedToImportBySeedPhrase: Ref<boolean>
	resolveName: () => Promise<string | null>
	seedPhrase: Ref<string | undefined>
	unlockMethod: Ref<UnlockMethod>
	chooseUnlock: (display: NewPasskeyDisplay, existing: boolean) => Promise<NewProfileUnlock | null>
	allowDuplicate: Ref<boolean>
	withDuplicateConfirm: <T>(run: () => Promise<T>) => Promise<T | undefined>
	fillUnknownImportError: (err: unknown) => void
	completeImport: UseProfileImportFlowOptions["completeImport"]
}

/** The seed import handler (the full-backup path lives in `useFullBackupImport`). The body owns the
 *  in-flight latch + error routing. */
function createImportHandlers(deps: ImportHandlerDeps) {
	// In-flight latch is set BEFORE the async `getProfiles()` fetch so two rapid
	// clicks can't both pass the pre-check before the lock is set.
	// `existing`: the profile takes a passkey the person already has.
	const importSeed = async (existing: boolean) => {
		if (!deps.isAllowedToImportBySeedPhrase.value || deps.isImporting.value) return
		if (existing && deps.unlockMethod.value !== "passkey") return
		deps.isImporting.value = true
		try {
			const name = await deps.resolveName()
			if (name === null) return
			const profile = await importNamed(name, existing)
			// `undefined` = the passkey card was cancelled or the duplicate warning declined; stay on
			// the form.
			if (!profile) return
			await deps.completeImport(profile)
		} catch (err) {
			deps.fillUnknownImportError(err)
		} finally {
			deps.isImporting.value = false
		}
	}

	async function importNamed(name: string, existing: boolean) {
		// The import's own phrase checks run before the passkey card, so a phrase it refuses leaves no
		// new passkey behind.
		const words = canonicalizeMnemonic(deps.seedPhrase.value ?? "")
		if (words.length !== PHRASE_WORD_COUNT) throw new Error("Invalid mnemonic length")
		zeroize(await getEntropy(words))
		const unlock = await deps.chooseUnlock({ step: "import", profileName: name }, existing)
		if (unlock === null) return undefined
		// A passkey answer is held across the duplicate confirm only: the next Import asks again.
		return deps.withDuplicateConfirm(() =>
			managers.profile.importMnemonic(name, words, unlock.password, deps.allowDuplicate.value, unlock.credentialData),
		)
	}

	// Two handlers rather than a flag: a click handler receives the click event as its argument.
	return { handleImportSeed: () => importSeed(false), handleImportSeedWithExistingPasskey: () => importSeed(true) }
}

/** Capped pick: the byte gate must run inside pickFile (compressed files
 *  inflate in there, before any caller-side .size check could). The cap
 *  error maps to the flow's error banner and the flow exits through its
 *  existing no-file path. */
export function cappedBackupPick(fillError: (type?: string, title?: string, tooltip?: string) => void) {
	return async () => {
		try {
			return await pickFile(undefined, false, true, MAX_BACKUP_FILE_BYTES)
		} catch (err) {
			if (err instanceof FileTooLargeError) {
				fillError(
					"full_backup",
					"Backup File Too Large",
					"The backup file is too large to import. Please select a correct backup file.",
				)
				return undefined
			}
			throw err
		}
	}
}

/** What a new profile is sealed under, by the tab picked, and the page's passkey card that asks it.
 *  `completeImport` wraps the page's, dropping what the card remembered once an import succeeded. */
function useImportUnlock(unlockMethod: Ref<UnlockMethod>, password: Ref<string>, opts: UseProfileImportFlowOptions) {
	const { request: ceremonyRequest, runCeremony, onResolve: onCeremonyResolve, onReject: onCeremonyReject } = usePasskeyCeremony()
	const newPasskey = useNewProfilePasskey(runCeremony)

	/** The new password, or the passkey answer the page's card returns; `null` when the card was
	 *  cancelled, which leaves the form as it was. */
	async function chooseUnlock(display: NewPasskeyDisplay, existing: boolean): Promise<NewProfileUnlock | null> {
		if (unlockMethod.value === "password") return { password: password.value }
		try {
			return { credentialData: await newPasskey.ask(display, existing) }
		} catch (err) {
			if (handleCancelOrUnconfirmed(err, opts.openToast)) return null
			throw new Error(passkeyFailureCopy(err, errorMessageFromUnknown(err)))
		}
	}

	const completeImport: UseProfileImportFlowOptions["completeImport"] = (profile) => {
		newPasskey.forget()
		return opts.completeImport(profile)
	}

	return { ceremonyRequest, onCeremonyResolve, onCeremonyReject, chooseUnlock, completeImport }
}

async function listProfileNames(): Promise<string[]> {
	return (await managers.profile.getProfiles()).map((p) => p.name)
}

/** The name field's surface, key names verbatim: both shells destructure them. */
function nameFieldSurface(nameField: ReturnType<typeof useProfileNameField>, nameDefault: ReturnType<typeof useProfileNameDefault>) {
	return {
		nameFieldState: nameDefault.nameFieldState,
		profileName: nameField.profileName,
		trimmedName: nameField.trimmedName,
		holdsOwnName: nameDefault.holdsOwnName,
		nameError: nameField.nameError,
		shakeName: nameField.shakeName,
		nameInputRef: nameField.nameInputRef,
		handleNameInput: nameField.handleInput,
	}
}

/** The typed phrase and its one verdict, read by its hint and by Import alike: `pending` from the
 *  edit itself (a synchronous watcher, so no press in between reads the last edit's verdict) until
 *  that edit's own verdict lands, and kept there when the read fails. */
function usePhraseVerdict() {
	const seedPhrase = ref<string | undefined>(undefined)
	const verdict = ref<PhraseVerdict>({ kind: "empty" })
	watch(
		seedPhrase,
		(value) => {
			verdict.value = { kind: "pending" }
			readPhraseVerdict(value).then(
				(read) => {
					if (seedPhrase.value === value) verdict.value = read
				},
				() => {},
			)
		},
		{ immediate: true, flush: "sync" },
	)
	return { seedPhrase, phraseVerdict: verdict }
}

export function useProfileImportFlow(opts: UseProfileImportFlowOptions) {
	const nameField = useProfileNameField()
	const nameDefault = useProfileNameDefault(nameField, listProfileNames)

	const { allowDuplicate, withDuplicateConfirm } = useDuplicateConfirm()
	const { error, isCopied, fillError, clearError, fillUnknownImportError, handleCopyError, handlePasswordInput, handleSecretInput } =
		useImportErrorState(opts.openToast)

	const selectedImportOption = ref<string | null>(null)
	const { seedPhrase, phraseVerdict } = usePhraseVerdict()
	const password = ref("")
	const repeatedPassword = ref("")
	const maxPasswordLength = 128
	const isImporting = ref(false)
	// A phrase opens on Passkey, as Create does; a backup opens on the unlock it was made with.
	const unlockMethod = ref<UnlockMethod>("passkey")

	const { ceremonyRequest, onCeremonyResolve, onCeremonyReject, chooseUnlock, completeImport } = useImportUnlock(
		unlockMethod,
		password,
		opts,
	)

	// Name check is excluded on purpose — name is validated at submit time so
	// an empty name shakes the input instead of silently disabling the buttons.
	const isAllowedToContinue = computed(
		() => unlockMethod.value === "passkey" || isNewPasswordValid(password.value ?? "", repeatedPassword.value ?? ""),
	)
	const isAllowedToImportBySeedPhrase = computed(() => isAllowedToContinue.value && phraseVerdict.value.kind === "valid")

	const { handleImportSeed, handleImportSeedWithExistingPasskey } = createImportHandlers({
		isImporting,
		isAllowedToImportBySeedPhrase,
		resolveName: () => nameDefault.resolveName(),
		seedPhrase,
		unlockMethod,
		chooseUnlock,
		allowDuplicate,
		withDuplicateConfirm,
		fillUnknownImportError,
		completeImport,
	})

	const backup = wireBackupImport({
		unlockMethod,
		chooseUnlock,
		password,
		repeatedPassword,
		fillError,
		clearError,
		completeImport,
		nameDefault,
		showErrorLog: opts.showErrorLog,
		allowDuplicate,
		withDuplicateConfirm,
	})

	// Keep `profileName` across import-method switches so the user doesn't have
	// to retype it after hitting Back.
	function clearFormState() {
		selectedImportOption.value = null
		seedPhrase.value = undefined
		password.value = ""
		repeatedPassword.value = ""
		unlockMethod.value = "passkey"
		backup.resetBackupState()
		clearError()
	}
	function dispose() {
		nameField.dispose()
		backup.dispose()
	}

	return {
		...nameFieldSurface(nameField, nameDefault),
		// import state
		selectedImportOption,
		seedPhrase,
		password,
		repeatedPassword,
		unlockMethod,
		maxPasswordLength,
		isImporting,
		error,
		isCopied,
		// the page's passkey card
		ceremonyRequest,
		onCeremonyResolve,
		onCeremonyReject,
		// per-method gates
		phraseVerdict: readonly(phraseVerdict),
		isAllowedToImportBySeedPhrase,
		// full backup (surface from the wiring sub-composable, verbatim keys)
		...backup.surface,
		// handlers
		handleImportSeed,
		handleImportSeedWithExistingPasskey,
		handlePasswordInput,
		handleSecretInput,
		handleCopyError,
		clearError,
		handleBack: clearFormState,
		// lifecycle
		dispose,
	}
}

interface WireBackupImportDeps {
	unlockMethod: Ref<UnlockMethod>
	chooseUnlock: (display: NewPasskeyDisplay, existing: boolean) => Promise<NewProfileUnlock | null>
	password: Ref<string>
	repeatedPassword: Ref<string>
	fillError: (type?: string, title?: string, tooltip?: string) => void
	clearError: () => void
	completeImport: UseProfileImportFlowOptions["completeImport"]
	nameDefault: ReturnType<typeof useProfileNameDefault>
	showErrorLog: UseProfileImportFlowOptions["showErrorLog"]
	allowDuplicate: Ref<boolean>
	withDuplicateConfirm: <T>(run: () => Promise<T>) => Promise<T | undefined>
}

/** Wires the full-backup sub-flow (capped pick, name prefill) and shapes its
 *  exported surface — key names verbatim, both shells destructure them. */
function wireBackupImport(deps: WireBackupImportDeps) {
	const {
		selectedBackup,
		decryptionPassword,
		restoreStatus,
		restoreStage,
		importedProfile,
		isAllowedToImportBackup,
		isRestoreHasErrors,
		parsedBackupName,
		canRetryAccountState,
		unrestoredNetworkNames,
		retryFailedAgain,
		hasOtherRestoreErrors,
		heldAccounts,
		isRetryingAccountState,
		retryAccountState,
		continueImport,
		pickBackupFile,
		decryptBackup,
		restoreBackup,
		restoreBackupWithExistingPasskey,
		showRestoreErrorLog,
		resetBackupState,
		dispose,
	} = useFullBackupImport({
		unlockMethod: deps.unlockMethod,
		chooseUnlock: deps.chooseUnlock,
		password: deps.password,
		repeatedPassword: deps.repeatedPassword,
		fillError: deps.fillError,
		clearError: deps.clearError,
		pickFile: cappedBackupPick(deps.fillError),
		completeImport: deps.completeImport,
		resolveProfileName: (backupName) => deps.nameDefault.resolveName(backupName),
		showErrorLog: deps.showErrorLog,
		allowDuplicate: deps.allowDuplicate,
		confirmDuplicate: deps.withDuplicateConfirm,
	})

	// The selected backup's own name prefills an untouched field; a nameless one restores the
	// default. A name the user typed is never replaced.
	watch(parsedBackupName, (name) => deps.nameDefault.offer(name))
	// A backup opens the unlock choice on the method it was made with, still switchable.
	// Watched by selection, not by type: a second backup of the same type must reopen on its method.
	watch(selectedBackup, (backup) => {
		const made = backup?.profileType
		if (made === "password" || made === "passkey") deps.unlockMethod.value = made
	})

	return {
		resetBackupState,
		dispose,
		surface: {
			selectedBackup,
			decryptionPassword,
			restoreStatus,
			restoreStage,
			importedProfile,
			isAllowedToImportBackup,
			isRestoreHasErrors,
			canRetryAccountState,
			unrestoredNetworkNames,
			retryFailedAgain,
			hasOtherRestoreErrors,
			heldAccounts,
			isRetryingAccountState,
			retryAccountState,
			continueImport,
			pickBackupFile,
			decryptBackup,
			restoreBackup,
			restoreBackupWithExistingPasskey,
			showRestoreErrorLog,
		},
	}
}
