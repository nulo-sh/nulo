<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<route lang="json">
{ "meta": { "title": "Import" } }
</route>

<script setup lang="ts">
/** Composables */
import { completeImportWithRecovery } from "@/composables/completeImportWithRecovery"
import { useProfileBootstrap } from "@/composables/useProfileBootstrap"
import { useProfileImportFlow } from "@/composables/useProfileImportFlow"
import { vSnackFooter } from "@/composables/snackInset"
import { useToast } from "@/composables/toast"

/** Utils */
import { backCtaBlocked, restoreCtaBlocked, showsDecryptCta, showsRestoreCta, showsRestoreErrorCtas } from "@/utils/full-backup-ctas"
import { setLastActiveProfileId } from "@/utils/lastActiveProfile"
import { clearFlowPath, doneRoute, markFlowPath } from "../steps"
import { restoreNoticeText, retryResultText } from "@/components/composite/import/restore-warning"

/** Stores */
import { useAppStore } from "@/stores/app.store"
import { useNotificationStore } from "@/stores/notification.store"

/** Components — L3 (composite) import forms. */
import ImportFullBackupForm from "@/components/composite/import/ImportFullBackupForm.vue"
import ImportMethodPicker from "@/components/composite/import/ImportMethodPicker.vue"
import ImportSecretForm from "@/components/composite/import/ImportSecretForm.vue"
import PasskeyReuseLink from "@/components/composite/PasskeyReuseLink.vue"
import PasskeyCeremonyDialog from "@/components/passkey/PasskeyCeremonyDialog.vue"

const router = useRouter()
const appStore = useAppStore()
const notificationStore = useNotificationStore()
const { openToast } = useToast()
const { bootstrapActiveProfile, hydrateKnownProfile } = useProfileBootstrap()

// Onboarding has no popup app.vue `onActiveProfileChanged` listener, so it
// bootstraps the freshly activated profile itself — its "wait for active" IS the
// direct bootstrap. If that bootstrap doesn't activate (an MV3 worker restart
// mid-import, so the session couldn't be confirmed), the recovery re-reads the
// active profile and bootstraps again, matching the popup path. Either way onboarding
// moves on with no success snack, unlike the popup's import: no later onboarding page
// needs the session, and a profile left locked meets the popup's unlock screen.
async function completeImport(profile: unknown) {
	// Before the bootstrap: the profile exists already, so a reload during it resumes at Ready.
	markFlowPath("import")
	const p = profile as { id: string; name: string; type: "password" | "passkey" }
	await setLastActiveProfileId(p.id)
	await completeImportWithRecovery({
		waitForActive: async () => {
			if (!(await bootstrapActiveProfile(p))) throw new Error("bootstrap did not activate")
		},
		recover: async () => (await hydrateKnownProfile())?.id === p.id && appStore.isLogined,
	})
	router.push(doneRoute("import"))
}

const {
	nameFieldState,
	profileName,
	nameError,
	shakeName,
	nameInputRef,
	handleNameInput,
	selectedImportOption,
	seedPhrase,
	password,
	repeatedPassword,
	unlockMethod,
	maxPasswordLength,
	isImporting,
	error,
	isCopied,
	ceremonyRequest,
	onCeremonyResolve,
	onCeremonyReject,
	phraseVerdict,
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
	restoreBackupWithExistingPasskey,
	showRestoreErrorLog,
	handleImportSeed,
	handleImportSeedWithExistingPasskey,
	handlePasswordInput,
	handleSecretInput,
	handleCopyError,
	handleBack,
	dispose,
} = useProfileImportFlow({
	completeImport,
	// Onboarding error-log surface: notify-based, not a popup dialog.
	showErrorLog: (_errors, { unrestored }) => {
		notificationStore.create({
			type: "warning",
			payload: {
				title: "Import completed with errors",
				description: restoreNoticeText(unrestored),
				confirmText: "OK",
				onConfirm: () => {},
			},
		})
	},
	openToast,
})

const fullBackupCta = readonly({
	selectedBackup,
	restoreStatus,
	isAllowedToImportBackup,
	isRestoreHasErrors,
	isRetrying: isRetryingAccountState,
})

// The restored profile holds the session from this stage on, before Continue or the account-state
// tail ends, so a reload from here resumes at Ready.
watch(restoreStage, (stage) => {
	if (stage === "restoring:account-state") markFlowPath("import")
})

onMounted(clearFlowPath)

onBeforeUnmount(() => {
	dispose()
	notificationStore.clear()
	// Defense-in-depth: zero out secret material on unmount.
	password.value = ""
	repeatedPassword.value = ""
	seedPhrase.value = undefined
})
</script>

<template>
	<OnboardingPage :gap="24" data-testid="onboarding-import-page" :data-name-field="nameFieldState" :data-restore-stage="restoreStage">
		<OnboardingStepHeader current="wallet" path="import" back="onboarding-import-back" main="Import" sub="Wallet" :class="$style.hero">
			<Text variant="body" color="secondary" height="150">Restore from a recovery phrase or a full backup.</Text>
		</OnboardingStepHeader>

		<OnboardingProfileNameField
			v-if="nameFieldState === 'shown'"
			ref="nameInputRef"
			v-model="profileName"
			:error="nameError"
			:shake="shakeName"
			@input="handleNameInput"
		/>

		<ImportMethodPicker
			v-if="!selectedImportOption"
			type="import"
			@select="selectedImportOption = $event"
		/>

		<ImportFullBackupForm
			v-if="selectedImportOption === 'full_backup'"
			v-model:decryptionPassword="decryptionPassword"
			v-model:password="password"
			v-model:repeatedPassword="repeatedPassword"
			v-model:unlockMethod="unlockMethod"
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
			v-model:unlockMethod="unlockMethod"
			:method="selectedImportOption"
			:error="error"
			:phraseVerdict="phraseVerdict"
			:maxPasswordLength="maxPasswordLength"
			:importing="isImporting"
			@secretInput="handleSecretInput"
			@passwordInput="handlePasswordInput"
		/>

		<Flex v-if="selectedImportOption" v-snack-footer direction="column" gap="10" :class="$style.ctas">
			<template v-if="selectedImportOption === 'full_backup'">
				<Button
					v-if="showsDecryptCta(fullBackupCta)"
					variant="cta"
					size="large"
					:disabled="!decryptionPassword"
					data-testid="onboarding-submit-import"
					@click="decryptBackup"
				>
					Decrypt backup
				</Button>
				<template v-if="showsRestoreCta(fullBackupCta)">
					<Button
						variant="cta"
						size="large"
						:disabled="restoreCtaBlocked(fullBackupCta)"
						:loading="restoreStatus === 'progress'"
						data-testid="onboarding-submit-import"
						@click="restoreBackup"
					>
						{{ restoreStatus === "progress" ? "Importing..." : "Import profile" }}
					</Button>
					<PasskeyReuseLink
						v-if="unlockMethod === 'passkey'"
						testid="onboarding-import-backup-passkey-reuse"
						:disabled="restoreCtaBlocked(fullBackupCta)"
						@click="restoreBackupWithExistingPasskey"
					/>
				</template>
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
					variant="cta_outline"
					size="large"
					:disabled="isRetryingAccountState"
					:loading="isRetryingAccountState"
					data-testid="import-full-backup-retry-btn"
					@click="retryAccountState"
				>
					{{ isRetryingAccountState ? "Retrying..." : "Retry" }}
				</Button>
				<Button
					v-if="showsRestoreErrorCtas(fullBackupCta)"
					variant="cta"
					size="large"
					:disabled="isRetryingAccountState"
					data-testid="import-full-backup-continue-btn"
					@click="continueImport"
				>
					Continue
				</Button>
				<Button
					v-if="showsRestoreErrorCtas(fullBackupCta)"
					variant="cta_outline"
					size="large"
					:disabled="isRetryingAccountState"
					data-testid="import-full-backup-view-errors-btn"
					@click="showRestoreErrorLog"
				>
					View errors
				</Button>
			</template>

			<Button
				v-if="selectedImportOption === 'seed'"
				variant="cta"
				size="large"
				:disabled="!isAllowedToImportBySeedPhrase || isImporting"
				:loading="isImporting"
				data-testid="onboarding-submit-import"
				@click="handleImportSeed"
			>
				Import profile
			</Button>
			<PasskeyReuseLink
				v-if="selectedImportOption === 'seed' && unlockMethod === 'passkey'"
				testid="onboarding-import-passkey-reuse"
				:disabled="!isAllowedToImportBySeedPhrase || isImporting"
				@click="handleImportSeedWithExistingPasskey"
			/>
			<Button
				variant="cta_outline"
				size="large"
				:disabled="backCtaBlocked(fullBackupCta)"
				@click="handleBack"
			>
				Back to methods
			</Button>
		</Flex>

		<PasskeyCeremonyDialog v-if="ceremonyRequest" :request="ceremonyRequest" @resolve="onCeremonyResolve" @reject="onCeremonyReject" />
	</OnboardingPage>
</template>

<style module>
.hero {
	padding-bottom: 16px;
}

.ctas {
	margin-top: 8px;
}

</style>
