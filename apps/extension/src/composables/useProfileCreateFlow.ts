import { computed, ref } from "vue"
import type { PasskeyCredentialData } from "@nulo/wallet-crypto"
import type { ToastOptions } from "@/composables/toast"
import type { AdmittedUnlock } from "@/composables/useNewProfilePasskey"
import { usePasskeyCeremony } from "@/composables/usePasskeyCeremony"
import { useProfileNameDefault } from "@/composables/useProfileNameDefault"
import { useProfileNameField } from "@/composables/useProfileNameField"
import { managers } from "@/utils/core"
import { closesOnFocusLoss } from "@/utils/browser-surface"
import { logCredentialFailure } from "@/utils/credential-refusal"
import { classifyPasskeyFailure, handleCancelOrUnconfirmed, PASSKEY_COPY } from "@/utils/passkey-copy"
import {
	type CreatePasskeyProfileDeps,
	createPasskeyProfileInPage,
	type SavedPasskeyCredential,
} from "@/wallet/utils/create-passkey-profile"
import type { ProfileInfo } from "@/wallet/services/profile/client"
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
	/** Per-shell activation + routing. Popup: manual sequence (listener-based). Onboarding: `bootstrapActiveProfile` then route.
	 *  An in-page passkey create also hands over the answer it was made from, and a password create the
	 *  password it sealed under, either of which opens the new profile's recovery phrase once; the
	 *  shell drops it after. */
	onCreated: (profile: ProfileInfo, credentialData?: PasskeyCredentialData, password?: string) => Promise<void> | void
	/** Per-shell create-failure notification. `isPasskey` selects the description/note copy; the page owns `notificationStore.create`. */
	notifyCreateFailed: (isPasskey: boolean) => void
	/** The page's toast, for a passkey prompt that was dismissed or timed out. */
	openToast: (toast: ToastOptions) => void
}

async function listProfileNames(): Promise<string[]> {
	return (await managers.profile.getProfiles()).map((p) => p.name)
}

/**
 * A passkey profile's create, with the memory of the credential the last in-page attempt minted but
 * could not confirm, and the profile name that attempt was for. Page memory only: never persisted
 * or logged.
 */
function passkeyProfileCreator(runCeremony: CreatePasskeyProfileDeps["runCeremony"]) {
	let unconfirmed: { name: string; credential: SavedPasskeyCredential } | null = null

	// Runs the passkey create (or, with `existing`, the discovery get of a passkey the person already
	// has) in-page, then creates the profile via the SW. In Firefox's toolbar panel the background
	// mints the input and runs the prompt in its own window.
	async function create(name: string, existing: boolean): Promise<{ profile: ProfileInfo; credentialData?: PasskeyCredentialData }> {
		if (closesOnFocusLoss()) return { profile: await managers.profile.createPasskeyProfile(name, undefined, existing) }
		return createPasskeyProfileInPage(
			name,
			{ runCeremony, createPasskeyProfile: (n, c) => managers.profile.createPasskeyProfile(n, c) },
			!existing && unconfirmed?.name === name ? unconfirmed.credential : undefined,
			existing,
		)
	}

	/** A retry confirms the credential a failed attempt minted, at the input that attempt asked for,
	 *  as the passkey window's Try again does, unless the name changed (the retry belongs to that
	 *  attempt) or the authenticator gave no PRF (it can never confirm; a fresh create lets the
	 *  person pick another). */
	function remember(e: unknown, name: string) {
		if (!(e instanceof PasskeyUnconfirmedError)) return
		unconfirmed =
			classifyPasskeyFailure(e) === "no-prf" ? null : { name, credential: { credentialId: e.credentialId, prfSalt: e.prfSalt } }
	}

	return {
		create,
		remember,
		forget: () => {
			unconfirmed = null
		},
	}
}

export function useProfileCreateFlow(opts: UseProfileCreateFlowOptions) {
	const nameField = useProfileNameField()
	const { profileName, nameError, shakeName, nameInputRef, handleInput: handleNameInput, dispose: disposeNameField } = nameField
	const { nameFieldState, resolveName } = useProfileNameDefault(nameField, listProfileNames)

	const { request: ceremonyRequest, runCeremony, onResolve: onCeremonyResolve, onReject: onCeremonyReject } = usePasskeyCeremony()

	const authMethod = ref<"password" | "passkey">("passkey")
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

	const passkeyCreate = passkeyProfileCreator(runCeremony)
	let disposed = false

	function reportCreateFailure(e: unknown, method: AdmittedUnlock["method"]) {
		// A create that fails after its page left reports to nobody: the step ended with the page.
		if (disposed) return
		if (handleCancelOrUnconfirmed(e, opts.openToast)) return
		// A passkey without PRF can never unlock Nulo, so the create says so as unlock does.
		if (classifyPasskeyFailure(e) === "no-prf") {
			opts.openToast({ kind: "error", label: PASSKEY_COPY.noPrf })
			return
		}
		opts.notifyCreateFailed(method === "passkey")
		logCredentialFailure("Failed to create profile:", e)
	}

	/** `existing`: the profile takes a passkey the person already has. */
	async function submit(existing: boolean) {
		if (isCreating.value) return
		if (!isAllowedToContinue.value) return
		// The run seals what its gate judged, whatever the form does while it waits.
		const admitted: AdmittedUnlock = { method: authMethod.value, password: password.value }
		// Latch FIRST, before the async getProfiles() fetch, so two rapid clicks
		// can't both race past the validate check before the lock is set.
		isCreating.value = true

		let created: { profile: ProfileInfo; credentialData?: PasskeyCredentialData; password?: string }
		let name: string | null = null
		try {
			name = await resolveName()
			if (name === null) {
				isCreating.value = false
				return
			}
			created =
				admitted.method === "passkey"
					? await passkeyCreate.create(name, existing)
					: { profile: await managers.profile.createProfile(name, admitted.password), password: admitted.password }
		} catch (e) {
			if (name !== null) passkeyCreate.remember(e, name)
			reportCreateFailure(e, admitted.method)
			isCreating.value = false
			return
		}
		passkeyCreate.forget()

		// Activation + routing live in the shell-injected callback. isCreating
		// stays true through it (the button reads "Creating…") and resets after.
		// If it fails the latch stays set: the profile exists, so another Create
		// would make a second one.
		try {
			await opts.onCreated(created.profile, created.credentialData, created.password)
		} catch {
			console.warn("profile activation failed")
			return
		}
		isCreating.value = false
	}

	// Two handlers rather than a flag: a click handler receives the click event as its argument.
	const handleCreate = () => submit(false)
	const handleCreateWithExistingPasskey = () => {
		if (authMethod.value === "passkey") return submit(true)
	}

	function dispose() {
		disposed = true
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
		handleCreateWithExistingPasskey,
		dispose,
	}
}
