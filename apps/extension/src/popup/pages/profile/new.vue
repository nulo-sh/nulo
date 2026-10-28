<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<route lang="json">
{
	"meta": {
		"isAuthRequired": false,
		"hideHeader": true,
		"showBottomNav": false
	}
}
</route>

<script setup>
/** Composables */
import { useToast } from "@/composables/toast"
import { useProfileCreateFlow } from "@/composables/useProfileCreateFlow"

/** Utils */
import { createFailedNotice } from "@/utils/profile-flow-notices"
import { capitalize } from "@/utils/string"
import { redirectToOnboardingTabIfNeeded } from "@/wallet/utils/onboarding-tab"
import { activateCreatedProfile, makeCreateKeydownHandler } from "./new-profile-helpers"
import { openingFlowLive } from "@/popup/opening-flow"

/** Store */
import { useAppStore } from "@/stores/app.store"
import { useNotificationStore } from "@/stores/notification.store"

/** Components */
import CollapsingHeroLayout from "@/components/composite/CollapsingHeroLayout.vue"
import NewProfileCredentials from "@/popup/components/modules/settings/new-profile/NewProfileCredentials.vue"
import NewProfileMethodTabs from "@/popup/components/modules/settings/new-profile/NewProfileMethodTabs.vue"
import PasskeyCeremonyDialog from "@/components/passkey/PasskeyCeremonyDialog.vue"
import PasskeyReuseLink from "@/components/composite/PasskeyReuseLink.vue"
import ProfileNameField from "@/components/composite/ProfileNameField.vue"

const appStore = useAppStore()
const notificationStore = useNotificationStore()

const { openToast } = useToast()

const route = useRoute()
const router = useRouter()

// Deep-link bypass: redirect to onboarding tab when no profile exists AND
// onboarding hasn't been completed. Same predicate as register + import.
onBeforeMount(() => redirectToOnboardingTabIfNeeded(appStore))

const backTo = computed(() => String(route.query.from || "/popup/register"))
const selectedOnEntry = appStore.profile?.id
const flowLive = openingFlowLive()

const maxPasswordLength = 128

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
	authMethod: type,
	password,
	repeatedPassword,
	isCreating,
	strengthHint,
	isAllowedToContinue,
	handleCreate,
	handleCreateWithExistingPasskey,
	dispose,
} = useProfileCreateFlow({
	// Popup activation is listener-based (app.vue's onActiveProfileChanged runs
	// the bootstrap); this manual tail waits for it, loads accounts, persists
	// the active account, and routes. Extracted to a testable page helper.
	onCreated: (profile) => activateCreatedProfile(profile, { appStore, router, openToast, selectedOnEntry, flowLive }),
	openToast,
	notifyCreateFailed: (isPasskey) => notificationStore.create(createFailedNotice(isPasskey)),
})

const onKeydown = makeCreateKeydownHandler(handleCreate)

onBeforeUnmount(() => {
	dispose()
	notificationStore.clear()
})
</script>

<template>
	<CollapsingHeroLayout
		heroMain="Create"
		heroSub="Profile"
		collapsingLabel="Create Profile"
		:backTo="backTo"
		data-testid="register-page"
		:data-name-field="nameFieldState"
		@keydown="onKeydown"
	>
		<div v-if="nameFieldState === 'shown'" :class="$style.section_last">
			<span :class="$style.section_label">Profile name</span>
			<ProfileNameField
				ref="nameInputRef"
				v-model="profileName"
				:error="nameError"
				:shake="shakeName"
				testid="register-name-input"
				@input="handleNameInput"
			/>
		</div>

		<NewProfileMethodTabs v-model:type="type" />

		<NewProfileCredentials
			v-if="type === 'password'"
			v-model:password="password"
			v-model:repeatedPassword="repeatedPassword"
			:maxPasswordLength="maxPasswordLength"
			:strengthHint="strengthHint"
		/>

		<!-- Passkey info -->
		<div v-else :class="$style.section_last">
			<span :class="$style.section_label">Passkey</span>
			<Text variant="body" height="150" color="body">
				No password required. Your new profile will be linked to your passkey, so you can sign in securely and effortlessly. No memorizing, no typing, just one tap.
			</Text>
		</div>

		<template #bottom>
			<Button
				@click="handleCreate"
				:disabled="!isAllowedToContinue || isCreating"
				variant="cta"
				data-testid="register-submit-btn"
			>
				{{ isCreating ? "Creating…" : `Create with ${capitalize(type)}` }}
			</Button>
			<PasskeyReuseLink
				v-if="type === 'passkey'"
				testid="register-passkey-reuse"
				compact
				:disabled="isCreating"
				:class="$style.reuse"
				@click="handleCreateWithExistingPasskey"
			/>
		</template>

		<template #overlay>
			<!-- Path A: in-page passkey ceremony for create flow. -->
			<PasskeyCeremonyDialog
				v-if="ceremonyRequest"
				:request="ceremonyRequest"
				@resolve="onCeremonyResolve"
				@reject="onCeremonyReject"
			/>
		</template>
	</CollapsingHeroLayout>
</template>

<style module>

.section_last {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 20px 0;
}

.section_label {
	composes: type--label-section from global;
	color: var(--nulo-secondary);
}

.reuse {
	display: block;
	margin: 8px auto 0;
}
</style>
