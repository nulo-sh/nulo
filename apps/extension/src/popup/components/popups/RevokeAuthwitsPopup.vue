<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Components */
import FeeSettingsCard from "@/popup/components/modules/send/FeeSettingsCard.vue"

/** Utils */
import { AuthRegistryServiceClient, MAX_REVOKES_PER_TX } from "@/wallet/services/auth-registry/client"
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
import { useCacheStore } from "@/stores/cache.store"
import { usePopupStore } from "@/stores/popup.store"
const appStore = useAppStore()
const cacheStore = useCacheStore()
const popupStore = usePopupStore()
const { order, depth } = usePopupStack("revoke_authwits")

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

const authwits = ref([])
const chunkedAuthwits = ref([])
const chunksCount = computed(() => chunkedAuthwits.value.length)
const isErrorOccurred = computed(() => !!error.value)

const estimates = useWalletTxEstimates({
	estimate: (p, token, flowKey) => authwitsService.estimateRevokeFee(p.networkId, p.account, p.ids, p.feeSettings, token, flowKey),
	cancel: (token) => authwitsService.cancelFeeEstimate(token),
	paramsOf: (i) => {
		const ch = chunkedAuthwits.value[i]
		if (!props.show || !ch?.feeSettings || !appStore.network || !appStore.account) return undefined
		return { networkId: appStore.network.id, account: appStore.account.address, ids: ch.ids, feeSettings: ch.feeSettings }
	},
	keys: () => chunkedAuthwits.value.map((_, i) => i),
	scope: () => appStore.scopeEpoch,
	onError: (err) => {
		console.error("Revoke fee estimate failed", { error: err })
		openToast({ kind: "error", label: "Couldn't estimate fee. Try again." })
	},
})
const { results: feeEstimates, estimating: estimatingFees } = estimates

/** Synchronous with the input: Confirm never reads an estimate made for the settings just replaced. */
function setChunkFee(i, settings) {
	chunkedAuthwits.value[i].feeSettings = settings
	estimates.refresh(i)
}

function chunkAuthwits() {
	chunkedAuthwits.value = authwits.value
		.reduce((acc, _, i) => {
			if (i % MAX_REVOKES_PER_TX === 0) {
				acc.push(authwits.value.slice(i, i + MAX_REVOKES_PER_TX))
			}
			return acc
		}, [])
		.map((ch) => ({
			ids: ch.map((c) => c.id),
			content: ch.map((c) => c.content),
			count: ch.length,
			feeSetting: null,
			status: "prepare",
		}))
}

const isAllowedToExecute = computed(() => chunkedAuthwits.value.every((ch) => ch.feeSettings) && estimates.landed() && !estimates.short())

async function handleRevokeAuthwits() {
	// Full-lifetime submit latch, handler-owned: every route (click, any future caller) self-checks
	// here; the button's :disabled is defense-in-depth, not the guard.
	if (isLoading.value) return
	if (!isAllowedToExecute.value) return

	isLoading.value = true
	try {
		await revokeChunks()
	} finally {
		stage.stop()
		isLoading.value = false
	}

	const errors = chunkedAuthwits.value.filter((ch) => ch.status === "error").map((ch) => ch.error)
	const cancelled = chunkedAuthwits.value.some((ch) => ch.status === "cancelled")
	if (cancelled) {
		// User cancelled at least one chunk — suppress both success and
		// failure summary toasts. The terminal card communicates the state.
		emit("onClose")
	} else if (errors.length) {
		openToast({ kind: "error", label: `Failed to revoke ${errors.length === chunksCount.value ? "" : "some "}authwit(s)` })
		error.value = errors.join(", ")
	} else {
		openToast({ kind: "success", label: "Authwit(s) successfully revoked" })
		emit("onClose")
	}
}

async function revokeChunks() {
	for (const ch of chunkedAuthwits.value) {
		try {
			ch.status = "progress"
			const correlation = getRandomHex(16)
			stage.follow(correlation)
			await authwitsService.revokeAuthwits(appStore.network.id, appStore.account.address, ch.ids, ch.feeSettings, correlation)
			ch.status = "success"
		} catch (err) {
			if (classifyCancellableRejection(err) === "silent") {
				// User cancelled this chunk's tx mid-prove. Mark cancelled so
				// the summary branch below doesn't read it as a success or a
				// failure. The terminal card in RecentActivityView shows the
				// per-chunk cancellation already.
				ch.status = "cancelled"
			} else {
				ch.status = "error"
				ch.error = err
			}
		}
	}
}

function showChunkContent(chunk) {
	cacheStore.viewerData = chunk.content
	popupStore.open("data_viewer")
}

usePopupEntity(() => props.show, {
	onShow: async () => {
		await registry.fetch()

		authwits.value = cacheStore.preselectedAuthwits
		chunkAuthwits()
	},
	onHide: () => {
		estimates.cancelAll()
		authwits.value = []
		chunkedAuthwits.value = []
		registry.reset()
		stage.stop()

		authwitsService.disconnect()
		journalService.disconnect()
	},
})

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
					<Text variant="title-page" color="primary">Revoke authwits</Text>
				</template>
			</PopupHeader>

			<Flex direction="column" gap="20" wide :class="$style.wrapper">
				<Banner v-if="!isRegistryEnabled" direction="vertical">
					<template #title>No need to revoke authwits</template>
					<template #description>
						Since Authwits Registry is currently disabled for this account, all issued authwits are already blocked and cannot be executed. 
						You don’t need to spend gas or send a transaction to revoke them, but you can still do it if you want.
					</template>
				</Banner>
				<Banner v-else-if="chunksCount > 1" direction="vertical">
					<template #title>Multiple transactions required</template>
					<template #description>
						{{ `Due to Aztec protocol limits, only ${MAX_REVOKES_PER_TX} authwits can be revoked in a single transaction. 
						Your authwits have been split into the minimum number of required transactions. 
						Alternatively, you may disable Authwits Registry instead. This will block execution 
						of all current authwits until the registry is enabled again. 
						You can still proceed with revocation if you prefer.` }}
					</template>
				</Banner>
				<Banner v-else-if="chunksCount === 1" direction="vertical">
					<template #title>Revoke authwits</template>
					<template #description>
						This transaction will revoke the selected authwit(s). Once revoked, authwit(s) cannot be executed anymore.
					</template>
				</Banner>

				<template
					v-if="chunksCount"
					v-for="(ch, i) in chunkedAuthwits"
				>
					<Flex
						direction="column"
						wide
						:class="$style.chunk_card"
					>
						<Flex align="center" justify="between" wide :class="$style.header">
							<Flex align="end" gap="4">
								<Text v-if="chunksCount > 1" variant="row-title" color="primary" :class="$style.chunk_title_size"> {{ `#${i + 1}` }} </Text>
								<Text variant="row-title" color="primary" :class="$style.chunk_title_size">Revoke authwits</Text>
								<Text v-if="ch.count > 1" variant="meta" color="tertiary"> {{ `(${ch.count})` }} </Text>
							</Flex>
							<Tooltip position="end">
								<RowAction
									label="View authwits content"
									data-testid="revoke-authwits-view-content"
									@click="showChunkContent(ch)"
								>
									<Icon name="expand" size="16" color="tertiary" />
								</RowAction>

								<template #content>
									<Text color="secondary">View authwits content</Text>
								</template>
							</Tooltip>
							
						</Flex>

						<FeeSettingsCard
							:profile="appStore.profile"
							:network="appStore.network"
							:account="appStore.account"
							:feeEstimate="feeEstimates[i] ?? null"
							:isEstimating="!!estimatingFees[i]"
							fallsBack
							:modelValue="ch.feeSettings"
							@update:modelValue="($event) => setChunkFee(i, $event)"
						/>

						<div v-if="ch.status === 'progress'" :class="[$style.status_line, $style.runner]" />
						<div
							v-else
							:class="[
								$style.status_line,
								(!ch?.status || ch.status === 'prepare') && $style.waiting,
								ch.status === 'success' && $style.success,
								ch.status === 'error' && $style.error,
								ch.status === 'cancelled' && $style.cancelled,
							]"
						/>
					</Flex>

					<Tooltip v-if="ch.error && chunksCount > 1" side="top">
						<Flex align="center" gap="6" style="margin-top: -8px;">
							<Icon name="info" size="12" color="red" />
							<Text variant="body" color="secondary">
								Finished with an error
							</Text>
						</Flex>

						<template #content> {{ ch.error }} </template>
					</Tooltip>

				</template>

				<Flex v-snack-footer align="center" direction="column" gap="12">
					<!-- A held or composing Enter that first reaches this button idle must not revoke. -->
					<Button
						data-testid="revoke-authwits-submit"
						@click="handleRevokeAuthwits"
						@keydown.enter="refuseRepeatEnter"
						variant="primary"
						size="medium"
						wide
						:loading="isLoading"
						:disabled="!isAllowedToExecute || isErrorOccurred || isLoading"
					>
						Revoke
					</Button>

					<div role="status" aria-live="polite" data-testid="authwit-stage-line">
						<Text v-if="stageLine" variant="body" color="secondary">{{ stageLine }}</Text>
					</div>

					<Tooltip v-if="isErrorOccurred" side="top" wide>
						<Flex align="center" justify="start" gap="6" wide>
							<Icon name="info" size="12" color="red" />
							<Text variant="body" color="secondary">
								An error occurred
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

.chunk_card {
	position: relative;

	border-radius: 0;
	overflow: hidden;
	border: 1px solid var(--nulo-border);

	.header {
		padding: 12px;
	}
}

.chunk_title_size {
	font-size: 13px;
}

.status_line {
	position: absolute;
	bottom: 0px;
	width: 100%;

	opacity: 1;
	height: 1px;
}

.waiting {
	background: linear-gradient(90deg, rgba(10, 222, 113, 0%) 0%, var(--txt-support), rgba(10, 222, 113, 0%) 100%);
}

.success {
	background: linear-gradient(90deg, rgba(10, 222, 113, 0%) 0%, var(--green), rgba(10, 222, 113, 0%) 100%);
}

.error {
	background: linear-gradient(90deg, rgba(10, 222, 113, 0%) 0%, var(--red), rgba(10, 222, 113, 0%) 100%);
}

/* User cancelled this chunk's tx mid-prove. Neutral gray — same tone as
 * the cancelled terminal card in RecentActivityView. Visually distinct
 * from `error` (red) and `success` (green). */
.cancelled {
	background: linear-gradient(90deg, rgba(10, 222, 113, 0%) 0%, var(--nulo-secondary), rgba(10, 222, 113, 0%) 100%);
}

.runner {
	width: 100%;
	height: 2px;

	background: linear-gradient(90deg, rgba(7, 106, 205, 0%), var(--blue), rgba(7, 106, 205, 0%));

	animation: runner 2s ease infinite;
	filter: blur(1px);
}

@keyframes runner {
	0% {
		transform: translateX(-200px);
	}

	50% {
		transform: translateX(200px);
	}

	100% {
		transform: translateX(-200px);
	}
}
</style>
