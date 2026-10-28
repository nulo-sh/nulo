<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
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
import RecoveryPhraseGrid from "@/components/composite/RecoveryPhraseGrid.vue"
import SecretCountdownClose from "@/components/composite/SecretCountdownClose.vue"
import SecretUnlockSection from "@/components/composite/SecretUnlockSection.vue"
import PasskeyCeremonyDialog from "@/components/passkey/PasskeyCeremonyDialog.vue"

/** Services */
import { managers } from "@/utils/core"

/** Composables */
import { useToast } from "@/composables/toast.js"
import { isPopupSubmitKey, refuseRepeatEnter } from "@/composables/usePopupEntity"
import { createRunFence } from "@/composables/runFence"
import { useSecretClipboardCopy } from "@/composables/useSecretClipboardCopy"
import { useSecretCountdown } from "@/composables/useSecretCountdown"
import { usePasskeyCeremony } from "@/composables/usePasskeyCeremony"
const { openToast } = useToast()

/** Utils */
import { markGetStarted } from "@/utils/get-started"
import { RECOVERY_PHRASE_AUTO_CLOSE_MS, RECOVERY_PHRASE_WARNINGS } from "@/utils/recovery-phrase-warnings"
import { closesOnFocusLoss } from "@/utils/browser-surface"
import { OWN_WINDOW_ROUTES, closeOwnWindow, moveToOwnWindow } from "@/utils/own-window"
import { leaveFor } from "@/utils/page-back"
import { handleCancelOrUnconfirmed, PASSKEY_COPY, passkeyFailureCopy } from "@/utils/passkey-copy"
import { watchLockStart } from "@/popup/locked-state"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

const router = useRouter()

const BACKUP_MENU = "/popup/settings/security/export"

const isStarted = ref(false)
const isUnlocked = ref(false)
const password = ref()
const isWrongPassword = ref(false)
const words = ref([])
const isPasskeyProfile = computed(() => appStore.profile?.type === "passkey")
// Not template state: a pointer double-click must decrypt the phrase once, with nothing re-rendered.
let isRevealing = false
const revealFence = createRunFence()

const { request: ceremonyRequest, runCeremony, onResolve: onCeremonyResolve, onReject: onCeremonyReject } = usePasskeyCeremony()

const handleClose = async () => {
	words.value = []
	if (await closeOwnWindow()) return
	leaveFor(router, BACKUP_MENU)
}

const countdown = useSecretCountdown({ autoCloseMs: RECOVERY_PHRASE_AUTO_CLOSE_MS, onTimeout: handleClose })

const handleStart = () => {
	isStarted.value = true
}

/** A lock or a profile switch can leave this page mounted: what was typed or revealed belongs to the
 *  session and profile that ended. A reveal still in flight is discarded, its passkey prompt closed,
 *  and the next press is not held behind it. */
const resetReveal = () => {
	revealFence.invalidate()
	isRevealing = false
	onCeremonyReject(new Error("The recovery phrase page started over"))
	countdown.clear()
	words.value = []
	password.value = null
	isWrongPassword.value = false
	isUnlocked.value = false
	isStarted.value = false
}

const showWords = (profileId, mnemonic) => {
	words.value = mnemonic
	password.value = null
	isUnlocked.value = true
	countdown.start()
	void markGetStarted(profileId, "phraseSaved")
}

const handleUnlock = async () => {
	if (!password.value || isRevealing) return

	isRevealing = true
	const isCurrent = revealFence.begin()
	// The read asks for the profile the reveal began under; a switch during it discards the answer.
	const profileId = appStore.profile.id
	try {
		const mnemonic = await managers.profile.exportMnemonic(profileId, password.value)
		if (isCurrent()) showWords(profileId, mnemonic)
	} catch (error) {
		if (isCurrent()) isWrongPassword.value = true
	} finally {
		if (isCurrent()) isRevealing = false
	}
}

/** The passkey takes the password's place: its answer opens the words once and is dropped. A cancel
 *  leaves the button where it was. */
const handlePasskeyReveal = async () => {
	if (isRevealing) return

	isRevealing = true
	const isCurrent = revealFence.begin()
	const { id: profileId, name } = appStore.profile
	try {
		const { credentialId, prfSalt } = await managers.profile.getPasskeyUnlockParams(profileId)
		if (!isCurrent()) return
		const credentialData = await runCeremony({ mode: "get", credentialId, prfSalt, step: "reveal", profileName: name })
		if (!isCurrent()) return
		const mnemonic = await managers.profile.exportMnemonic(profileId, undefined, credentialData)
		if (isCurrent()) showWords(profileId, mnemonic)
	} catch (error) {
		if (!isCurrent() || handleCancelOrUnconfirmed(error, openToast)) return
		openToast({ kind: "error", label: passkeyFailureCopy(error, PASSKEY_COPY.revealFailed) })
	} finally {
		if (isCurrent()) isRevealing = false
	}
}

const { isCopied, copySecret } = useSecretClipboardCopy({ toastLabel: "Recovery phrase copied", openToast })
const handleCopy = () => {
	copySecret(words.value.join(" "))
}

const onKeydown = (e) => {
	if (e.defaultPrevented || !isPopupSubmitKey(e) || isPasskeyProfile.value) return
	handleUnlock()
}

watch(() => appStore.profile?.id, resetReveal)
watchLockStart(() => appStore.isLogined, resetReveal)

// Firefox's toolbar panel closes under the passkey prompt this page runs, so a passkey profile's
// reveal moves to its own window first. A failed move keeps the page where it is.
onBeforeMount(() => {
	if (isPasskeyProfile.value && closesOnFocusLoss()) void moveToOwnWindow(OWN_WINDOW_ROUTES.reveal)
})

onBeforeUnmount(() => {
	revealFence.invalidate()
	// The clipboard scrub timer deliberately outlives the page (useSecretClipboardCopy says why).
	words.value = []
})
</script>

<template>
	<CollapsingHeroLayout
		heroMain="Recovery"
		heroSub="Phrase"
		collapsingLabel="Recovery Phrase"
		:backTo="BACKUP_MENU"
		@keydown="onKeydown"
	>
		<!-- Agreement gate -->
		<template v-if="!isStarted">
			<div class="export_section">
				<span class="export_section_label type--label-section">Before you continue</span>
				<Flex direction="column" gap="8">
					<Text variant="body" height="150" color="body">
						Your recovery phrase is direct and full access to your entire profile, once you lose it you will not
						be able to regain access to your profile.
					</Text>
					<Text variant="body" height="150" color="body">
						Ensure that your recovery phrase is securely stored.
					</Text>
					<Text variant="body" height="150" color="body">
						By continuing you agree to all risks and responsibilities.
					</Text>
				</Flex>
			</div>
		</template>

		<!-- Password gate; a passkey profile's gate is its button, under one sentence -->
		<div v-else-if="isStarted && !isUnlocked && isPasskeyProfile" class="export_section_last">
			<Text variant="body" height="150" color="body" data-testid="reveal-passkey-note">
				Your passkey confirms it's you before the phrase shows.
			</Text>
		</div>
		<SecretUnlockSection
			v-else-if="isStarted && !isUnlocked"
			v-model="password"
			:error="isWrongPassword"
			@clearError="isWrongPassword = false"
		/>

		<!-- Revealed phrase -->
		<template v-else>
			<div class="export_section">
				<span class="export_section_label type--label-section">Your recovery phrase</span>
				<RecoveryPhraseGrid :words="words" :columns="3" testId="reveal-content">
					<Button variant="primary_outline" wide data-testid="reveal-content-copy" @click="handleCopy">
						{{ isCopied ? "Copied" : "Copy" }}
					</Button>
				</RecoveryPhraseGrid>
			</div>

			<div class="export_section_last">
				<span class="export_section_label type--label-section">Keep in mind</span>
				<Flex direction="column" gap="10">
					<Flex v-for="warning in RECOVERY_PHRASE_WARNINGS" :key="warning" gap="8">
						<Icon name="warning" size="12" color="tertiary" style="height: 18px; flex-shrink: 0" />
						<Text variant="body" height="150" color="tertiary">{{ warning }}</Text>
					</Flex>
				</Flex>
			</div>
		</template>

		<!-- Bottom CTA -->
		<template #bottom>
			<Button v-if="!isStarted" @click="handleStart" variant="cta" data-testid="agree-continue-btn">
				Agree &amp; Continue
			</Button>

			<Button
				v-else-if="isStarted && !isUnlocked && isPasskeyProfile"
				@click="handlePasskeyReveal"
				@keydown.enter="refuseRepeatEnter"
				variant="cta"
				data-testid="reveal-passkey-btn"
			>
				Reveal with passkey
			</Button>

			<Button
				v-else-if="isStarted && !isUnlocked"
				@click="handleUnlock"
				@keydown.enter="refuseRepeatEnter"
				:disabled="!password"
				variant="cta"
				data-testid="unlock-submit-btn"
			>
				Reveal Recovery Phrase
			</Button>

			<SecretCountdownClose
				v-else
				:countdownLabel="countdown.countdownLabel.value"
				:autoCloseDisabled="countdown.isAutoCloseDisabled.value"
				:progressDurationMs="RECOVERY_PHRASE_AUTO_CLOSE_MS"
				@close="handleClose"
				@disableAutoClose="countdown.disable"
			/>
		</template>
	</CollapsingHeroLayout>

	<PasskeyCeremonyDialog
		v-if="ceremonyRequest"
		:request="ceremonyRequest"
		@resolve="onCeremonyResolve"
		@reject="onCeremonyReject"
	/>
</template>
