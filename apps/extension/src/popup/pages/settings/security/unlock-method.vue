<route lang="json">
{
	"meta": {
		"isAuthRequired": true,
		"hideHeader": true,
		"showBottomNav": false
	}
}
</route>

<script setup>
/** Components */
import CollapsingHeroLayout from "@/components/composite/CollapsingHeroLayout.vue"
import PasswordVisibilityToggle from "@/components/composite/PasswordVisibilityToggle.vue"
import PasskeyCeremonyDialog from "@/components/passkey/PasskeyCeremonyDialog.vue"

/** Services */
import { managers } from "@/utils/core"
import { InvalidPasswordError, StaleUnlockCredentialError, UnlockMethodChangedError } from "@nulo/extension-messaging/errors"

/** Composables */
import { useToast } from "@/composables/toast.js"
import { isPopupSubmitKey, refuseRepeatEnter } from "@/composables/usePopupEntity"
import { createRunFence } from "@/composables/runFence"
import { useNewProfilePasskey } from "@/composables/useNewProfilePasskey"
import { usePasskeyCeremony } from "@/composables/usePasskeyCeremony"
const { openToast } = useToast()

/** Utils */
import { closesOnFocusLoss } from "@/utils/browser-surface"
import { logCredentialFailure } from "@/utils/credential-refusal"
import { OWN_WINDOW_ROUTES, moveToOwnWindow } from "@/utils/own-window"
import { leaveFor } from "@/utils/page-back"
import { handleCancelOrUnconfirmed, passkeyFailureCopy } from "@/utils/passkey-copy"
import { isNewPasswordValid, newPasswordHint } from "@/utils/password"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

const router = useRouter()

const maxPasswordLength = 128

const isPasskey = computed(() => appStore.profile?.type === "passkey")
/** A profile open in recovery mode has no imported-keys key, which every reseal needs: the page says
 *  so before any prompt and offers no change, since a retry cannot succeed. */
const cannotChange = computed(() => !!appStore.profile?.recoveryMode)
/** "" | "enterPassword": a password profile's check before its passkey. */
const step = ref("")
const password = ref("")
const isPasswordHidden = ref(true)
const isWrongPassword = ref(false)
const newPassword = ref("")
const repeatedNewPassword = ref("")
const isNewPasswordHidden = ref(true)
const isBusy = ref(false)
const newPasswordHintText = computed(() => newPasswordHint(newPassword.value ?? "", repeatedNewPassword.value ?? ""))
const canSaveNewPassword = computed(() => isNewPasswordValid(newPassword.value ?? "", repeatedNewPassword.value ?? ""))

const { request: ceremonyRequest, runCeremony, onResolve: onCeremonyResolve, onReject: onCeremonyReject } = usePasskeyCeremony()
const newPasskey = useNewProfilePasskey(runCeremony)
/** Fences every step to the profile it started for: a switch or a reset drops what it returns. */
const runs = createRunFence()
/** The current passkey's answer, held from its card to Save; while held, the page is a passkey
 *  profile's new-password step. Shallow: the answer itself is never made reactive. */
const heldAnswer = shallowRef(null)
const isNewPasswordStep = computed(() => heldAnswer.value !== null)
/** The current run's own change still with the service. The update and the reopened session it
 *  causes arrive before its answer, and only that answer says whether the change was made; `updated`
 *  marks an update for this profile meanwhile, which after a failure was another window's. */
let commit = null
const currentLine = computed(() => {
	if (isNewPasswordStep.value)
		return "This profile currently unlocks with a passkey. After the change, it unlocks with the password you set here."
	if (step.value === "enterPassword")
		return "This profile currently unlocks with a password. After the change, it unlocks with your passkey."
	return isPasskey.value ? "This profile unlocks with a passkey." : "This profile unlocks with a password."
})

/** The profile's name as this page last heard it. No write renames a profile and changes its unlock,
 *  so an update that renames it changes nothing the page holds. */
let heardName = appStore.profile?.name
managers.profile.onProfileUpdated.add(onProfileUpdated)
function onProfileUpdated(profile) {
	if (profile?.id !== appStore.profile?.id) return
	const renamed = profile.name !== heardName
	heardName = profile.name
	if (!renamed) onChangedElsewhere()
}

function clearStep() {
	step.value = ""
	password.value = ""
	isWrongPassword.value = false
	newPassword.value = ""
	repeatedNewPassword.value = ""
	heldAnswer.value = null
}

function reset() {
	commit = null
	runs.invalidate()
	clearStep()
	isBusy.value = false
	onCeremonyReject(new Error("The unlock method page started over"))
}

/** Another window changed this profile's unlock or password: the step, and what it holds, were
 *  asked of an unlock the profile no longer has. */
function onChangedElsewhere() {
	if (commit) commit.updated = true
	else reset()
}

/** A lock or an ended session: nothing asked under it outlives it. A change still with the service
 *  keeps its run, to report what the service answers. */
function onSessionEnded() {
	if (commit) clearStep()
	else reset()
}

const changeUnlockMethod = async (isCurrent, id, current, next) => {
	const mine = { updated: false }
	commit = mine
	try {
		await managers.profile.changeUnlockMethod(id, current, next)
	} catch (error) {
		if (mine.updated && isCurrent()) clearStep()
		throw error
	} finally {
		if (commit === mine) commit = null
	}
}

/** The current passkey's card, asked at the profile's own input, and never once the run is stale. */
async function currentPasskey(isCurrent) {
	const { id, name } = appStore.profile
	const { credentialId, prfSalt } = await managers.profile.getPasskeyUnlockParams(id)
	if (!isCurrent()) return undefined
	return runCeremony({ mode: "get", credentialId, prfSalt, step: "unlockMethod", profileName: name })
}

/** A new passkey's card, at an input minted for this profile. */
const nextPasskey = () => newPasskey.ask({ step: "unlockMethod", profileName: appStore.profile.name })

/** Runs one change; the page stays on a cancel, and reports a failure before the save as nothing
 *  changed. A change made leaves for Settings, and one saved but not reopened ends at the lock screen. */
async function attempt(run) {
	if (isBusy.value) return
	isBusy.value = true
	const isCurrent = runs.snapshot()
	try {
		const done = await run(isCurrent)
		if (!isCurrent() || !done) return
		newPasskey.forget()
		reset()
		openToast({ kind: "success", label: done })
		leaveFor(router, "/popup/settings")
	} catch (error) {
		if (!isCurrent()) return
		if (error instanceof UnlockMethodChangedError) {
			reset()
			openToast({ kind: "info", label: "Unlock method changed. Unlock Nulo again to continue." })
			router.replace("/popup/auth")
			return
		}
		if (error instanceof StaleUnlockCredentialError) {
			reset()
			openToast({ kind: "info", label: "Unlock method changed in another window." })
			return
		}
		if (handleCancelOrUnconfirmed(error, openToast)) return
		logCredentialFailure("[unlock-method] change failed", error)
		openToast({ kind: "error", label: passkeyFailureCopy(error, "Couldn't change the unlock method. Try again.") })
	} finally {
		if (isCurrent()) isBusy.value = false
	}
}

/** Password profile, Continue: the password must open the profile, as the change needs it, before
 *  any passkey is made; the change then uses the password that was checked. */
const handleContinue = () =>
	attempt(async (isCurrent) => {
		const typed = password.value
		if (!typed) return undefined
		const id = appStore.profile.id
		try {
			await managers.profile.verifyUnlockCredential(id, { password: typed })
		} catch (error) {
			if (!(error instanceof InvalidPasswordError)) throw error
			if (isCurrent()) isWrongPassword.value = true
			return undefined
		}
		if (!isCurrent()) return undefined
		const next = await nextPasskey()
		if (!isCurrent()) return undefined
		await changeUnlockMethod(isCurrent, id, { password: typed }, { passkey: next })
		return "Now unlocks with your passkey"
	})

/** The current passkey must open the profile, as the change needs it, before a new one is made. */
const handleNewPasskey = () =>
	attempt(async (isCurrent) => {
		const id = appStore.profile.id
		const current = await currentPasskey(isCurrent)
		if (!isCurrent()) return undefined
		await managers.profile.verifyUnlockCredential(id, { passkey: current })
		if (!isCurrent()) return undefined
		const next = await nextPasskey()
		if (!isCurrent()) return undefined
		await changeUnlockMethod(isCurrent, id, { passkey: current }, { passkey: next })
		return "Now unlocks with your new passkey"
	})

const handleUsePassword = () =>
	attempt(async (isCurrent) => {
		const answer = await currentPasskey(isCurrent)
		if (!isCurrent()) return undefined
		await managers.profile.verifyUnlockCredential(appStore.profile.id, { passkey: answer })
		if (!isCurrent()) return undefined
		heldAnswer.value = answer
		return undefined
	})

const handleSavePassword = () =>
	attempt(async (isCurrent) => {
		if (!canSaveNewPassword.value || !heldAnswer.value) return undefined
		await changeUnlockMethod(isCurrent, appStore.profile.id, { passkey: heldAnswer.value }, { password: newPassword.value })
		return isCurrent() ? "Now unlocks with your password" : undefined
	})

const onKeydown = (e) => {
	if (e.defaultPrevented || !isPopupSubmitKey(e)) return
	if (step.value === "enterPassword") handleContinue()
	else if (isNewPasswordStep.value) handleSavePassword()
}

watch(
	() => appStore.profile?.id,
	() => {
		heardName = appStore.profile?.name
		reset()
	},
)
watch(() => appStore.profile?.type, onChangedElsewhere)
watch(
	() => appStore.isLogined,
	(logged) => {
		if (!logged) onSessionEnded()
	},
)

// Firefox's toolbar panel closes under the passkey prompt every change runs, so the page moves to its
// own window first. A failed move keeps the page where it is.
onBeforeMount(() => {
	if (closesOnFocusLoss() && !cannotChange.value) void moveToOwnWindow(OWN_WINDOW_ROUTES.unlockMethod)
})

onBeforeUnmount(() => {
	managers.profile.onProfileUpdated.remove(onProfileUpdated)
	reset()
})
</script>

<template>
	<CollapsingHeroLayout heroMain="Unlock" heroSub="Method" collapsingLabel="Unlock Method" backTo="/popup/settings" @keydown="onKeydown">
		<div :class="step || isNewPasswordStep ? 'export_section' : 'export_section_last'">
			<Text variant="body" height="150" color="body" data-testid="unlock-method-current">
				{{ currentLine }}
			</Text>
			<Text v-if="cannotChange" variant="body" height="150" color="body" data-testid="unlock-method-unavailable">
				This profile can't change its unlock method.
			</Text>
		</div>

		<div v-if="step === 'enterPassword'" class="export_section_last">
			<div :class="[isWrongPassword && $style.shake]">
				<Input
					v-model="password"
					:type="isPasswordHidden ? 'password' : 'text'"
					:error="isWrongPassword"
					:ariaInvalid="isWrongPassword"
					placeholder="Enter password"
					autocomplete="current-password"
					autofocus
					data-testid="unlock-method-password-input"
					@input="isWrongPassword = false"
				>
					<template #suffix>
						<PasswordVisibilityToggle
							:hidden="isPasswordHidden"
							data-testid="unlock-method-password-input-visibility-toggle"
							@toggle="isPasswordHidden = !isPasswordHidden"
						/>
					</template>
				</Input>
			</div>
			<Transition name="fade">
				<span v-if="isWrongPassword" :class="$style.error_text" role="alert" data-testid="unlock-method-error-text">
					Wrong password
				</span>
			</Transition>
		</div>

		<div v-if="isNewPasswordStep" class="export_section_last">
			<span class="export_section_label type--label-section">New Password</span>
			<Flex direction="column" gap="12">
				<Input
					v-model="newPassword"
					:type="isNewPasswordHidden ? 'password' : 'text'"
					:maxLength="maxPasswordLength"
					placeholder="Enter new password"
					autocomplete="new-password"
					autofocus
					data-testid="unlock-method-new-password-input"
				>
					<template #suffix>
						<PasswordVisibilityToggle
							:hidden="isNewPasswordHidden"
							data-testid="unlock-method-new-password-input-visibility-toggle"
							@toggle="isNewPasswordHidden = !isNewPasswordHidden"
						/>
					</template>
					<template #bottom>
						<Flex align="center" gap="6" :class="$style.hint_row">
							<Icon name="lock" :size="12" color="tertiary" />
							<Text variant="body" color="tertiary">{{ newPasswordHintText }}</Text>
						</Flex>
					</template>
				</Input>
				<Input
					v-model="repeatedNewPassword"
					:type="isNewPasswordHidden ? 'password' : 'text'"
					:maxLength="maxPasswordLength"
					placeholder="Repeat password"
					autocomplete="new-password"
					data-testid="unlock-method-new-password-confirm-input"
				/>
			</Flex>
		</div>

		<template v-if="!cannotChange" #bottom>
			<Button
				v-if="isNewPasswordStep"
				variant="cta"
				:disabled="!canSaveNewPassword || isBusy"
				data-testid="unlock-method-save"
				@click="handleSavePassword"
				@keydown.enter="refuseRepeatEnter"
			>
				Save
			</Button>
			<Flex v-else-if="isPasskey" direction="column" gap="8" wide>
				<Button variant="cta" :disabled="isBusy" data-testid="unlock-method-new-passkey" @click="handleNewPasskey">
					Use a new passkey
				</Button>
				<Button variant="cta_outline" :disabled="isBusy" data-testid="unlock-method-use-password" @click="handleUsePassword">
					Use a password instead
				</Button>
			</Flex>
			<Button
				v-else-if="step === 'enterPassword'"
				variant="cta"
				:disabled="!password || isBusy"
				data-testid="unlock-method-continue"
				@click="handleContinue"
				@keydown.enter="refuseRepeatEnter"
			>
				Continue
			</Button>
			<Button v-else variant="cta" data-testid="unlock-method-use-passkey" @click="step = 'enterPassword'">
				Use a passkey instead
			</Button>
		</template>
	</CollapsingHeroLayout>

	<PasskeyCeremonyDialog v-if="ceremonyRequest" :request="ceremonyRequest" @resolve="onCeremonyResolve" @reject="onCeremonyReject" />
</template>

<style module>
.hint_row {
	margin-top: 4px;
}

.error_text {
	composes: type--body from global;
	color: var(--txt-danger);
	margin-top: 4px;
	display: block;
}

.shake {
	composes: shake_password from "@/components/composite/shake.module.css";
}
</style>
