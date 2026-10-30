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
/** Services */
import { NetworkServiceClient } from "@/wallet/services/network/client"
import { ProfileServiceClient } from "@/wallet/services/profile/client"

/** Components */
import CollapsingHeroLayout from "@/components/composite/CollapsingHeroLayout.vue"
import HandoffCard from "@/components/composite/HandoffCard.vue"
import ImportFullBackupForm from "@/components/composite/import/ImportFullBackupForm.vue"

/** Composables */
import { useToast } from "@/composables/toast"
import { isPopupSubmitKey, refuseRepeatEnter } from "@/composables/usePopupEntity"
import { cappedBackupPick, useImportErrorState } from "@/composables/useProfileImportFlow"
import { useRestoreAgain } from "@/composables/useRestoreAgain"

/** Utils */
import { restoreAgainIntroText, withNetworkNames } from "@/components/composite/import/restore-warning"
import { restoreCtaBlocked, showsDecryptCta, showsRestoreCta } from "@/utils/full-backup-ctas"
import { OWN_WINDOW_ROUTES, closeOwnWindow, isCardWindow, leavePanelFor, returnToPanel } from "@/utils/own-window"

/** Stores */
import { useAppStore } from "@/stores/app.store"
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"

const appStore = useAppStore()
const cacheStore = useCacheStore()
const popupStore = usePopupStore()

const { openToast } = useToast()
const { error, isCopied, fillError, clearError, handleCopyError } = useImportErrorState(openToast)

const router = useRouter()

const profileService = new ProfileServiceClient()
const networkService = new NetworkServiceClient()

const {
	selectedBackup,
	decryptionPassword,
	restoreStatus,
	networkNames,
	isAllowedToRestore,
	isRestoreHasErrors,
	canRetry,
	isRetrying,
	retryFailedAgain,
	warningText,
	retryResult,
	start,
	pickBackupFile,
	decryptBackup,
	restoreBackup,
	retryRestore,
	continueHome,
	showRestoreErrorLog,
	dispose,
} = useRestoreAgain({
	profileService,
	networkService,
	activeProfileId: () => appStore.profile?.id,
	networks: () => appStore.networks,
	pickFile: cappedBackupPick(fillError),
	fillError,
	clearError,
	openToast,
	showErrorLog: (errors, namesById) => {
		cacheStore.viewerData = withNetworkNames(errors, namesById)
		popupStore.open("data_viewer")
	},
	leave: (outcome) => void leaveToHome(outcome),
})

/** The hand-off window shows only the card until a backup is picked or refused. */
const cardWindow = isCardWindow()
const showCard = computed(() => cardWindow && !selectedBackup.value && !error.value.title)

const cta = readonly({
	selectedBackup,
	restoreStatus,
	isAllowedToImportBackup: isAllowedToRestore,
})

/** A hand-off window hands every end back to the panel, which opens on Home. */
async function leaveToHome(outcome) {
	if (await returnToPanel("/popup/general", outcome)) return
	await router.replace("/popup/general")
}

/** From Firefox's toolbar panel the pick moves to this page's own window, where a second press picks. */
const handlePickFile = async () => {
	if (await leavePanelFor(OWN_WINDOW_ROUTES.restoreAgain)) return
	await pickBackupFile()
}

/** The decryption field's Enter decrypts; Restore, Retry and Continue answer only their buttons. */
const onKeydown = (e) => {
	if (e.defaultPrevented || !isPopupSubmitKey(e)) return
	if (showsDecryptCta(cta)) decryptBackup()
}

onMounted(() => void start())
onBeforeUnmount(() => {
	profileService.disconnect()
	networkService.disconnect()
	dispose()
})
</script>

<template>
	<HandoffCard v-if="showCard" title="Pick the backup file" @choose="pickBackupFile" @cancel="closeOwnWindow" />
	<CollapsingHeroLayout
		v-else
		heroMain="Restore"
		heroSub="Again"
		collapsingLabel="Restore again"
		backTo="/popup/general"
		data-testid="restore-again-page"
		@keydown="onKeydown"
	>
		<div v-if="networkNames.length" :class="$style.intro">
			<Text variant="body" height="150" color="secondary" :class="$style.names" data-testid="restore-again-intro">
				{{ restoreAgainIntroText(networkNames) }}
			</Text>
		</div>

		<ImportFullBackupForm
			v-model:decryptionPassword="decryptionPassword"
			:askNewPassword="false"
			:selectedBackup="selectedBackup"
			:restoreStatus="restoreStatus"
			:isRestoreHasErrors="restoreStatus === 'finished'"
			:warningText="warningText"
			:retryFailedAgain="retryFailedAgain"
			:error="error"
			:isCopied="isCopied"
			@pickFile="handlePickFile"
			@copyError="handleCopyError"
		/>

		<template #bottom>
			<Flex direction="column" gap="8">
				<Button
					v-if="showsDecryptCta(cta)"
					@click="decryptBackup"
					@keydown.enter="refuseRepeatEnter"
					:disabled="!decryptionPassword"
					data-testid="restore-again-decrypt-btn"
					variant="cta"
				>
					Decrypt Backup
				</Button>
				<Button
					v-if="showsRestoreCta(cta)"
					@click="restoreBackup"
					@keydown.enter="refuseRepeatEnter"
					:disabled="restoreCtaBlocked(cta)"
					data-testid="restore-again-submit-btn"
					variant="cta"
				>
					{{ restoreStatus === "progress" ? "Restoring…" : "Restore" }}
				</Button>
				<Text
					v-if="retryFailedAgain"
					variant="body"
					height="120"
					color="txt-warning"
					:class="$style.names"
					data-testid="restore-again-retry-result"
				>
					{{ retryResult }}
				</Text>
				<Button
					v-if="canRetry"
					@click="retryRestore"
					:disabled="isRetrying"
					data-testid="restore-again-retry-btn"
					variant="cta_outline"
				>
					{{ isRetrying ? "Retrying…" : "Retry" }}
				</Button>
				<Button
					v-if="restoreStatus === 'finished'"
					@click="continueHome"
					@keydown.enter="refuseRepeatEnter"
					:disabled="isRetrying"
					data-testid="restore-again-continue-btn"
					variant="cta"
				>
					Continue
				</Button>
				<Button
					v-if="restoreStatus === 'finished' && isRestoreHasErrors"
					@click="showRestoreErrorLog"
					:disabled="isRetrying"
					data-testid="restore-again-view-errors-btn"
					variant="cta_outline"
				>
					View Errors
				</Button>
			</Flex>
		</template>
	</CollapsingHeroLayout>
</template>

<style module>
.intro {
	padding-bottom: 12px;
}

.names {
	overflow-wrap: anywhere;
}
</style>
