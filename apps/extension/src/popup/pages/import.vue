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
import { completeImportWithRecovery } from "@/composables/completeImportWithRecovery"
import { isPopupSubmitKey, refuseRepeatEnter } from "@/composables/usePopupEntity"
import { useProfileBootstrap } from "@/composables/useProfileBootstrap"
import { useProfileImportFlow } from "@/composables/useProfileImportFlow"
import { useToast } from "@/composables/toast"
import { waitForProfileActive } from "@/composables/waitForProfileActive"

/** Utils */
import { passkeyNeedsOwnWindow } from "@/utils/browser-surface"
import { setLastActiveProfileId } from "@/utils/lastActiveProfile"
import { OWN_WINDOW_ROUTES, closeOwnWindow, moveToOwnWindow, releaseOwnWindow } from "@/utils/own-window"
import { backCtaBlocked, restoreCtaBlocked, showsDecryptCta, showsRestoreCta, showsRestoreErrorCtas } from "@/utils/full-backup-ctas"
import { redirectToOnboardingTabIfNeeded } from "@/wallet/utils/onboarding-tab"
import { resolveFullBackupEnterAction } from "./import-helpers"

/** Stores */
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { useNotificationStore } from "@/stores/notification.store"
import { usePopupStore } from "@/stores/popup.store"

/** Components */
import CollapsingHeroLayout from "@/components/composite/CollapsingHeroLayout.vue"
import ImportFullBackupForm from "@/components/composite/import/ImportFullBackupForm.vue"
import ImportMethodPicker from "@/components/composite/import/ImportMethodPicker.vue"
import ImportSecretForm from "@/components/composite/import/ImportSecretForm.vue"
import PasskeyCeremonyDialog from "@/components/passkey/PasskeyCeremonyDialog.vue"
import ProfileNameField from "@/components/composite/ProfileNameField.vue"

const appStore = useAppStore()
const notificationStore = useNotificationStore()
const { openToast } = useToast()

const route = useRoute()
const router = useRouter()

const type = computed(() => (route.query.type === "recovery" ? "recovery" : "import"))
const backTo = computed(() => String(route.query.from || "/popup/register"))

// First-time install / deep-link bypass: redirect to onboarding tab when
// no profile exists AND onboarding hasn't been completed. Shared helper at
// @/wallet/utils/onboarding-tab; same predicate as register + profile/new.
onBeforeMount(() => redirectToOnboardingTabIfNeeded(appStore))

// Popup activation is listener-based: profile activation in the SW fires
// `popup/app.vue`'s `onActiveProfileChanged`, which runs the bootstrap and flips
// `appStore.isLogined`. completeImport waits for that ONE bootstrapper (up to the
// 30s backstop — long enough for a legitimately slow bootstrap on a loaded runner).
// The wedge (P0-proven): an MV3 worker restart mid-import kills the in-process emit,
// so the listener never fires and the wait used to dead-end on a silent "Finishing…"
// screen, then blindly route to /popup/auth. The fix is recovery-on-timeout: once the
// wait times out the listener has genuinely given up (so there is no bootstrap left to
// race), and we re-run the SAME recovery a fresh popup would — `hydrateKnownProfile`
// wakes the SW via getActiveProfile() and bootstraps. A surviving session now lands on
// /popup/general instead of a forced re-auth; a genuinely-locked profile (strict mode +
// worker restart dropped the master) routes to /popup/auth to unlock. No dead-end.
// (An earlier attempt watched the SW connection to escape sub-timeout, but a transient
// reconnect is indistinguishable from the wedge at drop-time and racing the live
// listener regressed the healthy path — the timeout is the only race-free signal.)
const { hydrateKnownProfile } = useProfileBootstrap()
const completeImport = async (profile) => {
	await setLastActiveProfileId(profile.id)
	const outcome = await completeImportWithRecovery({
		waitForActive: (ms) => waitForProfileActive(appStore, profile.id, ms),
		recover: async () => (await hydrateKnownProfile())?.id === profile.id && appStore.isLogined,
		timeoutMs: 30_000,
	})
	// A finished restore in its own window shows the wallet there, as the panel would.
	releaseOwnWindow()
	if (outcome === "active") {
		openToast({ kind: "success", label: "Profile imported" })
		router.push("/popup/general")
	} else {
		openToast({ kind: "success", label: "Profile imported. Unlock to continue" })
		router.push("/popup/auth")
	}
}

const {
	nameFieldState,
	profileName,
	holdsOwnName,
	nameError,
	shakeName,
	nameInputRef,
	handleNameInput,
	ceremonyRequest,
	onCeremonyResolve,
	onCeremonyReject,
	selectedImportOption,
	seedPhrase,
	password,
	repeatedPassword,
	maxPasswordLength,
	error,
	isCopied,
	isAllowedToImportBySeedPhrase,
	selectedBackup,
	decryptionPassword,
	restoreStatus,
	restoreStage,
	isAllowedToImportBackup,
	isRestoreHasErrors,
	canRetryAccountState,
	unrestoredNetworkNames,
	hasOtherRestoreErrors,
	isRetryingAccountState,
	retryAccountState,
	continueImport,
	pickBackupFile,
	decryptBackup,
	restoreBackup,
	showRestoreErrorLog,
	handleImportSeed,
	handleImportPasskey,
	handlePasswordInput,
	handleSecretInput,
	handleCopyError,
	handleBack,
	dispose,
} = useProfileImportFlow({
	completeImport,
	// Popup error-log surface: open the data-viewer overlay.
	showErrorLog: (errors) => {
		const cacheStore = useCacheStore()
		const popupStore = usePopupStore()
		cacheStore.viewerData = errors
		popupStore.open("data_viewer")
	},
	notifyImportFailed: () => {
		notificationStore.create({
			type: "warning",
			payload: {
				title: "Profile import failed",
				description:
					"An error occurred while importing the profile. This authenticator may not be supported or encountered an issue. Try again or use another one.",
				note: "Windows Hello may not work correctly with some versions of Windows.",
				confirmText: "OK",
				onConfirm: () => {},
			},
		})
	},
	openToast,
})

// An own window opens with Full Backup chosen and the name typed in the panel. Set before the
// profile list lands, the name stays the user's: neither the default nor a backup's name replaces it.
if (route.query.option === "full_backup") selectedImportOption.value = "full_backup"
if (typeof route.query.name === "string") profileName.value = route.query.name

/** Firefox's toolbar panel closes under a passkey prompt, and a backup's kind is unknown until its
 *  file is read, so a Full Backup restore there moves to its own window. A failed move stays here. */
const selectImportOption = async (option) => {
	if (option === "full_backup" && passkeyNeedsOwnWindow() && (await moveToOwnWindow(ownWindowRestoreRoute()))) return
	selectedImportOption.value = option
}

/** A name Nulo filled in is left behind, so the backup's own name can still replace it there. */
const ownWindowRestoreRoute = () => {
	const query = new URLSearchParams({ option: "full_backup", type: type.value, from: backTo.value })
	if (holdsOwnName() && profileName.value?.trim()) query.set("name", profileName.value)
	return `${OWN_WINDOW_ROUTES.import}?${query}`
}

/** In an own window the form's Back closes it: there is no method picker behind it. */
const handleFormBack = async () => {
	if (await closeOwnWindow()) return
	handleBack()
}

const fullBackupCta = readonly({
	selectedBackup,
	restoreStatus,
	isAllowedToImportBackup,
	isRestoreHasErrors,
	isRetrying: isRetryingAccountState,
})

/** Listeners — popup-only full-backup Enter shortcut. */
const onKeydown = (e) => {
	if (e.defaultPrevented || !isPopupSubmitKey(e)) return
	const action = resolveFullBackupEnterAction(fullBackupCta)
	if (action === "decrypt") decryptBackup()
	else if (action === "restore") restoreBackup()
	else if (action === "continue") continueImport()
}

/** Lifecycle */
onBeforeUnmount(() => {
	dispose()
})
</script>

<template>
	<CollapsingHeroLayout
		:heroMain="type === 'recovery' ? 'Recover' : 'Import'"
		heroSub="Profile"
		:collapsingLabel="type === 'recovery' ? 'Recover Profile' : 'Import Profile'"
		:backTo="backTo"
		data-testid="import-page"
		:data-name-field="nameFieldState"
		:data-restore-stage="restoreStage"
		@keydown="onKeydown"
	>
		<div v-if="nameFieldState === 'shown'" :class="$style.name_section">
			<span :class="$style.section_label">Profile name</span>
			<ProfileNameField
				ref="nameInputRef"
				v-model="profileName"
				:error="nameError"
				:shake="shakeName"
				testid="import-name-input"
				@input="handleNameInput"
			/>
		</div>

		<ImportMethodPicker
			v-if="!selectedImportOption"
			:type="type"
			@select="selectImportOption"
			@passkey="handleImportPasskey"
		/>

		<ImportFullBackupForm
			v-if="selectedImportOption === 'full_backup'"
			v-model:decryptionPassword="decryptionPassword"
			v-model:password="password"
			v-model:repeatedPassword="repeatedPassword"
			:selectedBackup="selectedBackup"
			:restoreStatus="restoreStatus"
			:isRestoreHasErrors="isRestoreHasErrors"
			:unrestoredNetworks="unrestoredNetworkNames"
			:hasOtherErrors="hasOtherRestoreErrors"
			:error="error"
			:isCopied="isCopied"
			:maxPasswordLength="maxPasswordLength"
			@pickFile="pickBackupFile"
			@copyError="handleCopyError"
			@passwordInput="handlePasswordInput"
		/>

		<ImportSecretForm
			v-if="selectedImportOption === 'seed'"
			v-model:seedPhrase="seedPhrase"
			v-model:password="password"
			v-model:repeatedPassword="repeatedPassword"
			:method="selectedImportOption"
			:error="error"
			:maxPasswordLength="maxPasswordLength"
			@secretInput="handleSecretInput"
			@passwordInput="handlePasswordInput"
		/>

		<template v-if="selectedImportOption" #bottom>
			<Flex direction="column" gap="8">
				<!-- Full backup CTAs -->
				<template v-if="selectedImportOption === 'full_backup'">
					<Button
						v-if="showsDecryptCta(fullBackupCta)"
						@click="decryptBackup"
						@keydown.enter="refuseRepeatEnter"
						:disabled="!decryptionPassword"
						data-testid="import-full-backup-decrypt-btn"
						variant="cta"
					>
						Decrypt Backup
					</Button>
					<Button
						v-if="showsRestoreCta(fullBackupCta)"
						@click="restoreBackup"
						@keydown.enter="refuseRepeatEnter"
						:disabled="restoreCtaBlocked(fullBackupCta)"
						data-testid="import-full-backup-submit-btn"
						variant="cta"
					>
						{{ restoreStatus === "progress" ? "Importing…" : `Import ${selectedBackup?.backup?.data?.profile?.name ?? "Profile"}` }}
					</Button>
					<!--
					Finishing window: restore finished cleanly but `completeImport` is
					awaiting the SW handshake (`waitForProfileActive`). Without this
					branch the user would see a button-less form for ~1s.
					-->
					<Button
						v-if="restoreStatus === 'finished' && !isRestoreHasErrors"
						:loading="true"
						:disabled="true"
						variant="cta"
					>
						Finishing import…
					</Button>
					<Button
						v-if="canRetryAccountState"
						@click="retryAccountState"
						:disabled="isRetryingAccountState"
						data-testid="import-full-backup-retry-btn"
						variant="cta_outline"
					>
						{{ isRetryingAccountState ? "Retrying…" : "Retry" }}
					</Button>
					<Button
						v-if="showsRestoreErrorCtas(fullBackupCta)"
						@click="continueImport"
						@keydown.enter="refuseRepeatEnter"
						:disabled="isRetryingAccountState"
						data-testid="import-full-backup-continue-btn"
						variant="cta"
					>
						Continue
					</Button>
					<Button
						v-if="showsRestoreErrorCtas(fullBackupCta)"
						@click="showRestoreErrorLog"
						:disabled="isRetryingAccountState"
						data-testid="import-full-backup-view-errors-btn"
						variant="cta_outline"
					>
						View Errors
					</Button>
				</template>

				<!-- Seed / key CTAs -->
				<Button
					v-if="selectedImportOption === 'seed'"
					@click="handleImportSeed"
					data-testid="import-seed-submit-btn"
					:disabled="!isAllowedToImportBySeedPhrase"
					variant="cta"
				>
					Use Recovery Phrase
				</Button>

				<Button @click="handleFormBack" :disabled="backCtaBlocked(fullBackupCta)" variant="cta_outline">Back</Button>
			</Flex>
		</template>

		<template #overlay>
			<!-- Path A: in-page passkey ceremony for import flow. -->
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

.name_section {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-bottom: 12px;
}

.section_label {
	font-family: var(--font-headline);
	font-size: 11px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.18em;
	color: var(--nulo-secondary);
}
</style>
