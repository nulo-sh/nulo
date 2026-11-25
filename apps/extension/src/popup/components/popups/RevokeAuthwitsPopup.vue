<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Components */
import FeeSettingsCard from "@/popup/components/modules/send/FeeSettingsCard.vue"

/** Utils */
import { AuthRegistryServiceClient, MAX_REVOKES_PER_TX } from "@/wallet/services/auth-registry/client"

/** Composables */
import { vSnackFooter } from "@/composables/snackInset"
import { useAuthRegistryStatus } from "@/composables/useAuthRegistryStatus"
import { refuseRepeatEnter, usePopupEntity } from "@/composables/usePopupEntity"
import { usePopupStack } from "@/composables/usePopupStack"
import { useWalletTxEstimates } from "@/composables/useWalletTxEstimates"

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

const authwits = ref([])
const chunkedAuthwits = ref([])
const chunksCount = computed(() => chunkedAuthwits.value.length)
const isErrorOccurred = computed(() => !!error.value)
/** Set by Revoke until the next show: the popup hands one revoke to the worker. */
const handedOff = ref(false)
/** A request on a connected client is on the port before its call returns; one made while the port
 *  reopens (after a worker restart) waits for Ready, and a window closed meanwhile loses it. */
const connected = ref(authwitsService.isConnected)
const readConnection = () => (connected.value = authwitsService.isConnected)
authwitsService.onConnected.add(readConnection)
authwitsService.onDisconnected.add(readConnection)

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
	onError: (err) => console.error("Revoke fee estimate failed", { error: err }),
})
const { results: feeEstimates, estimating: estimatingFees, failed: failedFees } = estimates

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
		}))
}

const isAllowedToExecute = computed(() => chunkedAuthwits.value.every((ch) => ch.feeSettings) && estimates.landed() && !estimates.short())
/** Revoke requests not yet settled: until the last one settles, a hide leaves the client connected. */
let outstanding = 0

/**
 * Posts every chunk at once, on a connected client, and closes: each request is on the port before
 * the close, and the worker runs it to its end whatever the person closes next. Its revoke task and
 * Activity report it, so the popup reports nothing.
 */
function handleRevokeAuthwits() {
	// Handler-owned latch: every route self-checks here; the button's :disabled is defense-in-depth.
	if (isLoading.value || handedOff.value || !authwitsService.isConnected) return
	if (!isAllowedToExecute.value) return

	handedOff.value = true
	const networkId = appStore.network.id
	const account = appStore.account.address
	for (const ch of chunkedAuthwits.value) {
		outstanding++
		authwitsService
			.revokeAuthwits(networkId, account, ch.ids, ch.feeSettings)
			.catch((error) => console.debug("[revoke] a chunk ended unrevoked", { error }))
			.finally(onRevokeSettled)
	}
	emit("onClose")
}

function onRevokeSettled() {
	outstanding--
	if (outstanding === 0 && !props.show) authwitsService.disconnect()
}

function showChunkContent(chunk) {
	cacheStore.viewerData = chunk.content
	popupStore.open("data_viewer")
}

usePopupEntity(() => props.show, {
	onShow: async () => {
		handedOff.value = false
		await registry.fetch()
		readConnection()

		authwits.value = cacheStore.preselectedAuthwits
		chunkAuthwits()
	},
	onHide: () => {
		estimates.cancelAll()
		authwits.value = []
		chunkedAuthwits.value = []
		registry.reset()

		// A disconnect would reject a revoke request still waiting for the port, unsent.
		if (outstanding === 0) authwitsService.disconnect()
	},
})

onBeforeUnmount(() => {
	authwitsService.onConnected.remove(readConnection)
	authwitsService.onDisconnected.remove(readConnection)
	registry.dispose()
	estimates.dispose()
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
							:estimateFailed="!!failedFees[i]"
							fallsBack
							:modelValue="ch.feeSettings"
							@update:modelValue="($event) => setChunkFee(i, $event)"
							@retryEstimate="estimates.refresh(i)"
							@reread="estimates.pauseThisTask"
						/>

						<div :class="$style.status_line" />
					</Flex>
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
						:disabled="!isAllowedToExecute || isErrorOccurred || isLoading || handedOff || !connected"
					>
						Revoke
					</Button>

					<div data-testid="revoke-authwits-continues">
						<Text variant="body" color="secondary">Revoking continues if you close this. Its progress shows in Activity.</Text>
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

	background: linear-gradient(90deg, rgba(10, 222, 113, 0%) 0%, var(--txt-support), rgba(10, 222, 113, 0%) 100%);
}
</style>
