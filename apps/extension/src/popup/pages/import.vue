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
import { awaitProfileActivation } from "@/composables/unlockWait"

/** Utils */
import { passkeyNeedsOwnWindow } from "@/utils/browser-surface"
import { setLastActiveProfileId } from "@/utils/lastActiveProfile"
import { OWN_WINDOW_ROUTES, closeOwnWindow, moveToOwnWindow, releaseOwnWindow } from "@/utils/own-window"
import { importFailedNotice } from "@/utils/profile-flow-notices"
import { backCtaBlocked, restoreCtaBlocked, showsDecryptCta, showsRestoreCta, showsRestoreErrorCtas } from "@/utils/full-backup-ctas"
import { redirectToOnboardingTabIfNeeded } from "@/wallet/utils/onboarding-tab"
import { resolveFullBackupEnterAction } from "./import-helpers"
import { retryResultText, withNetworkNames } from "@/components/composite/import/restore-warning"

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

// Popup activation is listener-based: the SW's activation fires `popup/app.vue`'s
// `onActiveProfileChanged`, which bootstraps and flips `appStore.isLogined`. completeImport waits
// until it activates, the shell records its failure, or the 30 s backstop passes (a slow bootstrap
// on a loaded runner); the last two run `hydrateKnownProfile`, as a fresh popup would, which joins
// a same-profile bootstrap still in flight and recovers the wedge where an MV3 worker restart
// mid-import lost the emit. Watching the SW connection instead regressed the healthy path: a
// transient reconnect is indistinguishable from the wedge when it drops.
const { hydrateKnownProfile } = useProfileBootstrap()
const completeImport = async (profile) => {
	await setLastActiveProfileId(profile.id)
	const outcome = await completeImportWithRecovery({
		waitForActive: (ms) => awaitProfileActivation(appStore, profile.id, ms),
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
	retryFailedAgain,
	hasOtherRestoreErrors,
	heldAccounts,
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
	showErrorLog: (errors, { byNetworkId }) => {
		const cacheStore = useCacheStore()
		const popupStore = usePopupStore()
		cacheStore.viewerData = withNetworkNames(errors, byNetworkId)
		popupStore.open("data_viewer")
	},
	notifyImportFailed: () => notificationStore.create(importFailedNotice()),
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
			:heldAccounts="heldAccounts"
			:retryFailedAgain="retryFailedAgain"
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
					awaiting the activation (`awaitProfileActivation`). Without this
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
					<Text
						v-if="retryFailedAgain"
						variant="body"
						height="120"
						color="txt-warning"
						data-testid="import-full-backup-retry-result"
					>
						{{ retryResultText(unrestoredNetworkNames) }}
					</Text>
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
	composes: type--label-section from global;
	color: var(--nulo-secondary);
}
</style>
