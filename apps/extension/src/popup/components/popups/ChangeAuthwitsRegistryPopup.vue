<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Components */
import FeeSettingsCard from "@/popup/components/modules/send/FeeSettingsCard.vue"

/** Utils */
import { AuthRegistryServiceClient } from "@/wallet/services/auth-registry/client"
import { OperationJournalServiceClient } from "@/wallet/services/operation-journal/client"
import { getRandomHex } from "@/wallet/utils"
import { classifyCancellableRejection } from "@/popup/utils/cancellable-rejection"

/** Composables */
import { vSnackFooter } from "@/composables/snackInset"
import { useToast } from "@/composables/toast"
import { useAuthRegistryStatus } from "@/composables/useAuthRegistryStatus"
import { refuseRepeatEnter, usePopupEntity } from "@/composables/usePopupEntity"
import { usePopupStack } from "@/composables/usePopupStack"
import { useSendStageLine } from "@/composables/useSendStageLine"
import { useWalletTxEstimates } from "@/composables/useWalletTxEstimates"
const { openToast } = useToast()

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()
const { order, depth } = usePopupStack("change_authwits_registry")

const emit = defineEmits(["onClose"])
const props = defineProps({
	show: Boolean,
})

const authwitsService = new AuthRegistryServiceClient()
const registry = useAuthRegistryStatus(authwitsService, () =>
	appStore.profile && appStore.network && appStore.account
		? { profileId: appStore.profile.id, chainId: appStore.network.chainId, account: appStore.account.address }
		: undefined,
)
const { isRegistryEnabled, isLoading, error } = registry
const journalService = new OperationJournalServiceClient()
const stage = useSendStageLine({ sendStarted: authwitsService.onSendStarted, journal: journalService })
const stageLine = stage.line

const feeSettings = ref()
const isErrorOccurred = computed(() => !!error.value)

const estimates = useWalletTxEstimates({
	estimate: (p, token, flowKey) =>
		authwitsService.estimateRegistryToggleFee(p.networkId, p.account, p.enabled, p.feeSettings, token, flowKey),
	cancel: (token) => authwitsService.cancelFeeEstimate(token),
	paramsOf: () =>
		props.show && feeSettings.value && isRegistryEnabled.value !== undefined && appStore.network && appStore.account
			? {
					networkId: appStore.network.id,
					account: appStore.account.address,
					enabled: !isRegistryEnabled.value,
					feeSettings: feeSettings.value,
				}
			: undefined,
	keys: () => [0],
	scope: () => appStore.scopeEpoch,
	onError: (err) => {
		console.error("Registry toggle fee estimate failed", { error: err })
		openToast({ kind: "error", label: "Couldn't estimate fee. Try again." })
	},
})
const { results: feeEstimates, estimating: estimatingFees } = estimates

const isAllowedToExecute = computed(() => Boolean(feeSettings.value) && estimates.landed() && !estimates.short())

async function handleChangeRegistry() {
	// Full-lifetime submit latch, handler-owned: every route (click, any future caller) self-checks
	// here; the button's :disabled is defense-in-depth, not the guard.
	if (isLoading.value) return
	if (!isAllowedToExecute.value) return

	try {
		isLoading.value = true

		const correlation = getRandomHex(16)
		stage.follow(correlation)
		await authwitsService.setRegistryEnabled(
			appStore.network.id,
			appStore.account.address,
			!isRegistryEnabled.value,
			feeSettings.value,
			correlation,
		)

		openToast({ kind: "success", label: "Account authwit registry is changed" })
	} catch (err) {
		// User-initiated cancel: terminal card in RecentActivityView says
		// "Cancelled" — suppress the failure toast + error.value.
		if (classifyCancellableRejection(err) !== "silent") {
			error.value = err
			openToast({ kind: "error", label: "Failed to change registry status" })
		}
	} finally {
		// Handler-owned latch release — closure via the hide watcher still
		// happens, but the latch must not depend on it.
		stage.stop()
		isLoading.value = false
		emit("onClose")
	}
}

usePopupEntity(() => props.show, {
	onShow: registry.fetch,
	onHide: () => {
		registry.reset()
		stage.stop()
		estimates.cancelAll()
		authwitsService.disconnect()
		journalService.disconnect()
	},
})

// Synchronous: Confirm never reads an estimate made for the inputs just replaced.
watch([feeSettings, isRegistryEnabled], () => estimates.refresh(0), { flush: "sync" })
onBeforeUnmount(() => {
	registry.dispose()
	stage.dispose()
	estimates.dispose()
	journalService.disconnect()
})
</script>

<template>
	<Popup :show @onClose="emit('onClose')" :displaceIdx="order">
		<PopupCard :displaceIdx="depth">
			<PopupHeader @onClose="emit('onClose')" closable>
				<template #title>
					<Text variant="title-page" color="primary">Change account authwits registry</Text>
				</template>
			</PopupHeader>

			<Flex wide direction="column" gap="20" :class="$style.wrapper">
				<Banner v-if="isRegistryEnabled" direction="vertical">
					<template #title>Disable Authwits Registry</template>
					<template #description>
						Disabling prevents contracts from consuming authwits for current account. 
						All previously issued authwits will be suspended and cannot be executed until you re-enable the registry.
					</template>
				</Banner>
				<Banner v-else-if="!isRegistryEnabled && isRegistryEnabled !== undefined" direction="vertical">
					<template #title>Enable Authwits Registry</template>
					<template #description>
						Enabling allows contracts to consume authwits for current account. 
						Any previously issued authwits will become executable again.
					</template>
				</Banner>

				<FeeSettingsCard
					:profile="appStore.profile"
					:network="appStore.network"
					:account="appStore.account"
					:feeEstimate="feeEstimates[0] ?? null"
					:isEstimating="!!estimatingFees[0]"
					fallsBack
					v-model="feeSettings"
				/>

				<Flex v-snack-footer align="center" direction="column" gap="12">
					<!-- A held or composing Enter that first reaches this button idle must not send. -->
					<Button
						data-testid="registry-toggle-submit"
						@click="handleChangeRegistry"
						@keydown.enter="refuseRepeatEnter"
						variant="primary"
						size="medium"
						wide
						:loading="isLoading"
						:disabled="!isAllowedToExecute || isLoading"
					>
						Send
					</Button>

					<div role="status" aria-live="polite" data-testid="authwit-stage-line">
						<Text v-if="stageLine" variant="body" color="secondary">{{ stageLine }}</Text>
					</div>

					<Tooltip v-if="isErrorOccurred" side="top">
						<Flex align="center" gap="6">
							<Icon name="info" size="12" color="red" />
							<Text variant="body" color="secondary">
								An error occurred while executing the transaction
							</Text>
						</Flex>

						<template #content> {{ error }} </template>
					</Tooltip>
				</Flex>
			</Flex>
		</PopupCard>
	</Popup>
</template>

<style module>
.wrapper {
	composes: body from "@/components/Popup/popup-shared.module.css";
}
</style>
