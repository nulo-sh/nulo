import { computed, ref } from "vue"
import type { ToastOptions } from "@/composables/toast"
import { usePasskeyCeremony } from "@/composables/usePasskeyCeremony"
import { ActivationSupersededError, BootstrapFailedError, UnlockTimeoutError } from "@/composables/unlockWait"
import { useProfileNameDefault } from "@/composables/useProfileNameDefault"
import { useProfileNameField } from "@/composables/useProfileNameField"
import { managers } from "@/utils/core"
import { passkeyNeedsOwnWindow } from "@/utils/browser-surface"
import { classifyPasskeyFailure, handleCancelOrUnconfirmed } from "@/utils/passkey-copy"
import { createPasskeyProfileWithRetry, type SavedPasskeyCredential } from "@/wallet/utils/create-passkey-profile"
import { PasskeyUnconfirmedError } from "@/wallet/utils/passkey-errors"
import { isNewPasswordValid, newPasswordHint } from "@/utils/password"

/**
 * Shared orchestration for the profile-CREATE flow, consumed by both the popup
 * (`popup/pages/profile/new.vue`) and onboarding (`onboarding/pages/create.vue`)
 * shells. Owns name + password validation, the strength hint, the passkey
 * create-with-retry ceremony, and the submit handler up to activation.
 *
 * The activation tail is INJECTED via `onCreated`: the popup runs its manual
 * post-create sequence (it relies on `popup/app.vue`'s `onActiveProfileChanged`
 * listener for the heavy bootstrap); onboarding calls `bootstrapActiveProfile`
 * itself. `onKeydown` is deliberately NOT owned here — the two shells differ
 * (popup has no `<form>`; onboarding has `<form @submit.prevent>`), so each page
 * wires its own.
 *
 * C1 lifecycle: exposes `dispose()`; never registers its own `onUnmounted`.
 * Secret refs are exposed but NOT zeroed here — zeroing is a per-shell concern.
 */
export interface UseProfileCreateFlowOptions {
	/** Per-shell activation + routing. Popup: manual sequence (listener-based). Onboarding: `bootstrapActiveProfile` then route. */
	onCreated: (profile: unknown) => Promise<void> | void
	/** Per-shell create-failure notification. `isPasskey` selects the description/note copy; the page owns `notificationStore.create`. */
	notifyCreateFailed: (isPasskey: boolean) => void
	/** The page's toast, for a passkey prompt that was dismissed or timed out. */
	openToast: (toast: ToastOptions) => void
}

/** Logged as a fixed category: a bootstrap failure's message is arbitrary text. */
function activationFailureReason(e: unknown): "timeout" | "bootstrap-failed" | "superseded" | "other" {
	if (e instanceof UnlockTimeoutError) return "timeout"
	if (e instanceof BootstrapFailedError) return "bootstrap-failed"
	if (e instanceof ActivationSupersededError) return "superseded"
	return "other"
}

async function listProfileNames(): Promise<string[]> {
	return (await managers.profile.getProfiles()).map((p) => p.name)
}

export function useProfileCreateFlow(opts: UseProfileCreateFlowOptions) {
	const nameField = useProfileNameField()
	const { profileName, nameError, shakeName, nameInputRef, handleInput: handleNameInput, dispose: disposeNameField } = nameField
	const { nameFieldState, resolveName } = useProfileNameDefault(nameField, listProfileNames)

	const { request: ceremonyRequest, runCeremony, onResolve: onCeremonyResolve, onReject: onCeremonyReject } = usePasskeyCeremony()

	const authMethod = ref<"password" | "passkey">("password")
	const password = ref("")
	const repeatedPassword = ref("")
	const isCreating = ref(false)

	const strengthHint = computed(() =>
		authMethod.value === "passkey" ? "" : newPasswordHint(password.value ?? "", repeatedPassword.value ?? ""),
	)

	// Name check is excluded on purpose — name is validated at submit time so an
	// empty name shakes the input instead of silently disabling the button.
	const isAllowedToContinue = computed(
		() => authMethod.value === "passkey" || isNewPasswordValid(password.value ?? "", repeatedPassword.value ?? ""),
	)

	// The credential the last in-page attempt minted but could not confirm, and the name it carries
	// as its label. Page memory only: never persisted or logged.
	let unconfirmed: { name: string; credential: SavedPasskeyCredential } | null = null

	// Runs the passkey-create ceremony in-page, then creates the profile via the
	// SW. Retries ONCE on ProfileIdConflictError via the shared helper. In Firefox's
	// toolbar panel the background picks the id and runs the ceremony in its own window.
	function createPasskeyProfile(name: string) {
		if (passkeyNeedsOwnWindow()) return managers.profile.createPasskeyProfile(name)
		return createPasskeyProfileWithRetry(
			name,
			{
				runCeremony,
				generateProfileId: () => managers.profile.generateProfileId(),
				createPasskeyProfile: (n, c) => managers.profile.createPasskeyProfile(n, c),
			},
			unconfirmed?.name === name ? unconfirmed.credential : undefined,
		)
	}

	/** A retry confirms the credential a failed attempt minted, as the passkey window's Try again
	 *  does, unless the name changed (the credential is labelled with the old one) or the
	 *  authenticator gave no PRF (it can never confirm; a fresh create lets the person pick another). */
	function rememberUnconfirmed(e: unknown, name: string) {
		if (!(e instanceof PasskeyUnconfirmedError)) return
		unconfirmed =
			classifyPasskeyFailure(e) === "no-prf" ? null : { name, credential: { credentialId: e.credentialId, userHandle: e.userHandle } }
	}

	function reportCreateFailure(e: unknown) {
		if (handleCancelOrUnconfirmed(e, opts.openToast)) return
		opts.notifyCreateFailed(authMethod.value === "passkey")
		console.error("Failed to create profile:", e)
	}

	const handleCreate = async () => {
		if (isCreating.value) return
		if (!isAllowedToContinue.value) return
		// Latch FIRST, before the async getProfiles() fetch, so two rapid clicks
		// can't both race past the validate check before the lock is set.
		isCreating.value = true

		let profile: unknown
		let name: string | null = null
		try {
			name = await resolveName()
			if (name === null) {
				isCreating.value = false
				return
			}
			profile =
				authMethod.value === "passkey"
					? await createPasskeyProfile(name)
					: await managers.profile.createProfile(name, password.value)
		} catch (e) {
			if (name !== null) rememberUnconfirmed(e, name)
			reportCreateFailure(e)
			isCreating.value = false
			return
		}
		unconfirmed = null

		// Activation + routing live in the shell-injected callback. isCreating
		// stays true through it (the button reads "Creating…") and resets after.
		// If it fails the latch stays set: the profile exists, so another Create
		// would make a second one.
		try {
			await opts.onCreated(profile)
		} catch (e) {
			console.warn("profile activation failed", { reason: activationFailureReason(e) })
			return
		}
		isCreating.value = false
	}

	function dispose() {
		disposeNameField()
	}

	return {
		nameFieldState,
		profileName,
		nameError,
		shakeName,
		nameInputRef,
		handleNameInput,
		ceremonyRequest,
		onCeremonyResolve,
		onCeremonyReject,
		authMethod,
		password,
		repeatedPassword,
		isCreating,
		strengthHint,
		isAllowedToContinue,
		handleCreate,
		dispose,
	}
}
