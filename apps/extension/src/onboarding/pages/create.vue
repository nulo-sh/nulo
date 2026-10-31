<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<route lang="json">
{ "meta": { "title": "Create" } }
</route>

<script setup lang="ts">
/** Composables */
import { createRunFence } from "@/composables/runFence"
import { vSnackFooter } from "@/composables/snackInset"
import { useToast } from "@/composables/toast"
import { refuseRepeatEnter } from "@/composables/usePopupEntity"
import { useProfileBootstrap } from "@/composables/useProfileBootstrap"
import { useProfileCreateFlow } from "@/composables/useProfileCreateFlow"

/** Services */
import { managers } from "@/utils/core"
import type { ProfileInfo } from "@/wallet/services/profile/spec"
import type { PasskeyCredentialData } from "@nulo/wallet-crypto"

/** Utils */
import { markGetStarted } from "@/utils/get-started"
import { setLastActiveProfileId } from "@/utils/lastActiveProfile"
import { createFailedNotice } from "@/utils/profile-flow-notices"
import { clearFlowPath, doneRoute, markFlowPath } from "../steps"

/** Stores */
import { useNotificationStore } from "@/stores/notification.store"

/** Components — the passkey ceremony dialog teleports to #popup, which the onboarding
	shell declares too. */
import AuthMethodTabs from "@/components/composite/AuthMethodTabs.vue"
import PasskeyCeremonyDialog from "@/components/passkey/PasskeyCeremonyDialog.vue"
import PasskeyReuseLink from "@/components/composite/PasskeyReuseLink.vue"
import OnboardingPhraseStep from "../components/OnboardingPhraseStep.vue"

const router = useRouter()
const notificationStore = useNotificationStore()
const { openToast } = useToast()
const { bootstrapActiveProfile } = useProfileBootstrap()

const maxPasswordLength = 128

// The words live only in this ref, for this page's life. `closed` renders nothing while the route
// to Ready settles, so neither the words nor a second Create stand meanwhile.
const stage = ref<"form" | "phrase" | "closed">("form")
const words = ref<string[]>([])
let createdId = ""
// One generation for the page's life: a Create that settles after the person left publishes
// nothing, since bootstrap writes shared stores and the tab may already show another page.
const lifetime = createRunFence()
const isMounted = lifetime.snapshot()

const path = ref<"password" | "passkey">("password")

// The words stand only while the new profile holds the session. A worker restart may come back
// without one and emits no lock, so a dropped connection ends them too.
let sessionLost = false
let stopSessionWatch: (() => void) | undefined

function loseSession() {
	if (sessionLost || !isMounted()) return
	sessionLost = true
	if (stage.value === "phrase") leavePhrase()
}

function leavePhrase() {
	words.value = []
	stage.value = "closed"
	router.push(doneRoute(path.value))
}

async function watchSession(profileId: string) {
	managers.profile.onDisconnected.add(loseSession)
	const stop = await managers.profile.subscribeActiveProfile((active) => {
		if (active?.id !== profileId) loseSession()
	})
	if (isMounted()) stopSessionWatch = stop
	else stop()
}

async function readPhrase(
	profile: ProfileInfo,
	typed: string | undefined,
	credentialData: PasskeyCredentialData | undefined,
): Promise<string[] | undefined> {
	if (profile.type === "passkey" && !credentialData) return undefined
	try {
		return profile.type === "password"
			? await managers.profile.exportMnemonic(profile.id, typed)
			: await managers.profile.exportMnemonic(profile.id, undefined, credentialData)
	} catch (error) {
		console.debug("onboarding phrase read failed", { error })
		return undefined
	}
}

const {
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
	repeatedPassword: confirm,
	isCreating,
	strengthHint: passwordStrengthHint,
	isAllowedToContinue,
	handleCreate: handleSubmit,
	handleCreateWithExistingPasskey,
	dispose,
} = useProfileCreateFlow({
	// Onboarding has no popup app.vue listener, so it bootstraps the freshly created profile itself.
	// The words open with the password the profile was created under, or with the passkey answer it
	// was made from; a failed read still reaches Ready, where Home's reminder stays until the phrase
	// is saved.
	onCreated: async (profile, credentialData, typed) => {
		if (!isMounted()) return
		// The profile exists from here on, so a reload resumes at Ready: Create would make a second one.
		markFlowPath(profile.type)
		await watchSession(profile.id)
		if (!isMounted()) return
		const phrase = await readPhrase(profile, typed, credentialData)
		password.value = ""
		confirm.value = ""
		if (!isMounted()) return
		const active = await bootstrapActiveProfile(profile)
		if (!isMounted()) return
		if (active) await setLastActiveProfileId(profile.id)
		if (!isMounted()) return
		// The lock wins: a session locked or superseded at any point since the create shows no words,
		// nor the form, whose Create would make a second profile while the route settles.
		const lost = !active || sessionLost
		if (lost) stage.value = "closed"
		if (!phrase || lost) {
			router.push(doneRoute(profile.type === "password" ? "password" : "passkey"))
			return
		}
		createdId = profile.id
		path.value = profile.type
		words.value = phrase
		stage.value = "phrase"
	},
	openToast,
	notifyCreateFailed: (isPasskey) => notificationStore.create(createFailedNotice(isPasskey)),
})

const submitLabel = computed(() => {
	if (isCreating.value) return "Creating..."
	return authMethod.value === "passkey" ? "Create with passkey" : "Create wallet"
})

async function onPhraseSaved() {
	await markGetStarted(createdId, "phraseSaved")
	if (isMounted()) leavePhrase()
}

onMounted(clearFlowPath)

onBeforeUnmount(() => {
	lifetime.invalidate()
	stopSessionWatch?.()
	managers.profile.onDisconnected.remove(loseSession)
	dispose()
	notificationStore.clear()
	// Defense-in-depth: zero out secret material on unmount.
	password.value = ""
	confirm.value = ""
	words.value = []
})
</script>

<template>
	<OnboardingPhraseStep v-if="stage === 'phrase'" :words="words" :path="path" @saved="onPhraseSaved" @later="leavePhrase" />
	<OnboardingPage v-else-if="stage === 'form'" data-testid="onboarding-create-page" :data-name-field="nameFieldState">
		<OnboardingStepHeader
			current="wallet"
			:path="authMethod"
			back="onboarding-create-back"
			main="Create"
			sub="Wallet"
			:class="$style.hero"
		/>

		<form :class="$style.form" @submit.prevent="handleSubmit" @keydown.enter="refuseRepeatEnter">
			<OnboardingProfileNameField
				v-if="nameFieldState === 'shown'"
				ref="nameInputRef"
				v-model="profileName"
				:error="nameError"
				:shake="shakeName"
				@input="handleNameInput"
			/>

			<Flex direction="column" gap="12">
				<Text variant="label-section" color="secondary">How you'll unlock Nulo</Text>
				<AuthMethodTabs
					v-model="authMethod"
					:class="$style.tabs"
					ariaLabel="How you'll unlock Nulo"
					:tabClass="$style.tab"
					:activeClass="$style.tabActive"
					passwordTestid="onboarding-method-password"
					passkeyTestid="onboarding-method-passkey"
					:disabled="isCreating"
				/>
			</Flex>

			<Flex v-if="authMethod === 'password'" direction="column" gap="12">
				<Flex direction="column" gap="8">
					<Text variant="label-section" color="secondary">Password</Text>
					<Input
						v-model="password"
						type="password"
						placeholder="Strong password"
						autocomplete="new-password"
						:maxLength="maxPasswordLength"
						autofocus
						data-testid="onboarding-password-input"
					/>
				</Flex>
				<Flex direction="column" gap="8">
					<Text variant="label-section" color="secondary">Confirm password</Text>
					<Input
						v-model="confirm"
						type="password"
						placeholder="Repeat password"
						autocomplete="new-password"
						:maxLength="maxPasswordLength"
						data-testid="onboarding-password-confirm"
						inputTestid="onboarding-password-confirm-input"
					/>
				</Flex>
				<Text v-if="passwordStrengthHint && !isCreating" variant="body" color="secondary" height="150">
					{{ passwordStrengthHint }}
				</Text>
			</Flex>

			<div v-else :class="$style.passkeyInfo">
				<Text variant="body" color="secondary" height="150">
					Your passkey replaces a password. Touch ID, Windows Hello, or
					a hardware key, whichever your device supports.
				</Text>
			</div>

			<Button
				v-snack-footer
				variant="cta"
				size="large"
				:disabled="!isAllowedToContinue || isCreating"
				:loading="isCreating"
				data-testid="onboarding-submit-create"
				@click="handleSubmit"
			>
				{{ submitLabel }}
			</Button>
			<PasskeyReuseLink
				v-if="authMethod === 'passkey'"
				testid="onboarding-passkey-reuse"
				:disabled="isCreating"
				:class="$style.reuse"
				@click="handleCreateWithExistingPasskey"
			/>
		</form>

		<PasskeyCeremonyDialog
			v-if="ceremonyRequest"
			:request="ceremonyRequest"
			@resolve="onCeremonyResolve"
			@reject="onCeremonyReject"
		/>
	</OnboardingPage>
</template>

<style module>
.hero {
	padding-bottom: 16px;
}

.form {
	display: flex;
	flex-direction: column;
	gap: 24px;
}

.tabs {
	display: flex;
	border: 1px solid var(--nulo-outline);
	background: var(--nulo-surface);
	width: fit-content;
}

.tab {
	composes: type--segment from global;
	background: transparent;
	border: none;
	color: var(--txt-secondary);
	padding: 10px 20px;
	cursor: pointer;
	transition: background 0.15s var(--bezier), color 0.15s var(--bezier);
}

.tab:hover {
	color: var(--txt-primary);
}

.tab:focus-visible {
	outline: 2px solid var(--nulo-accent);
	outline-offset: -2px;
}

.tabActive {
	background: var(--nulo-accent);
	color: var(--app-bg);
}

.tab.tabActive {
	font-weight: 700;
}

.tabActive:hover {
	color: var(--app-bg);
}

/* The focused tab is always the filled one, where an accent ring would vanish into the fill. */
.tabActive:focus-visible {
	outline: 2px solid var(--app-bg);
	outline-offset: -5px;
}

.reuse {
	margin-top: -12px;
}

.passkeyInfo {
	padding: 16px;
	background: var(--nulo-surface);
	border: 1px solid var(--nulo-border);
}

</style>
