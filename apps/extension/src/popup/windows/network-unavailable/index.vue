<script setup lang="ts">
/**
 * The notice for a dApp that asked to connect on a chain the wallet has no network for. It only
 * informs: Close and Escape dismiss it, and the background has already refused the connection, so
 * no answer from this window can approve one.
 */

/** Vendor */
import { onMounted, onUnmounted } from "vue"

/** Components */
import DappStatusStrip from "@/components/composite/DappStatusStrip.vue"
import DappIdentityBlock from "@/components/composite/DappIdentityBlock.vue"

/** Services */
import { type ProfileInfo, ProfileServiceClient } from "@/wallet/services/profile/client"
import { type NetworkUnavailablePayload, DappInteractionServiceClient } from "@/wallet/services/dapp-interaction/client"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

/** Composables */
import { vSnackFooter } from "@/composables/snackInset"
import { refuseRepeatEnter } from "@/composables/usePopupEntity"
import { useDappInteractionPayload } from "@/composables/useDappInteractionPayload"
import { useDappApprovalWindow } from "@/composables/useDappApprovalWindow"

const router = useRouter()

const profile = ref<ProfileInfo>()
const isLoading = ref(false)

const interactionService = new DappInteractionServiceClient()

const {
	dapp,
	isCancelled: isInteractionCancelled,
	load: loadInteractionPayload,
	reject: rejectViaInteractionService,
} = useDappInteractionPayload<NetworkUnavailablePayload>({
	interactionService,
	getRequestId: () => router.currentRoute.value.query.requestId?.toString(),
	dappOf: (p) => p.params.dappMetadata,
})

// init/dismiss are referenced lazily (thunks): they are declared below and only run from
// start()/dispose()/the guard at runtime.
const {
	start: startWindow,
	dispose: disposeWindow,
	closeWindow,
	onActiveProfileChanged,
	stripStatus,
} = useDappApprovalWindow({
	profile,
	isInteractionCancelled,
	isLoading,
	connectServices: () => {
		profileService.connect()
		interactionService.connect()
	},
	disconnectServices: () => {
		profileService.disconnect()
		interactionService.disconnect()
	},
	init: () => init(),
	reject: () => dismiss(),
})

const init = async () => {
	try {
		profile.value = await profileService.getActiveProfile()
		await loadInteractionPayload()
	} catch (error) {
		console.error("Network-unavailable window init failed", { error })
	}
}

const dismiss = () => {
	rejectViaInteractionService("Closed")
	closeWindow(true)
}

/** The keyboard twin of Close. Handled, so the browser does not act on it as well. */
const onKeydown = (event: KeyboardEvent) => {
	if (event.key !== "Escape" || event.defaultPrevented) return
	event.preventDefault()
	dismiss()
}

const profileService = new ProfileServiceClient()
profileService.onActiveProfileChanged.add(onActiveProfileChanged)

onMounted(async () => {
	window.addEventListener("keydown", onKeydown)
	await startWindow()
})

onUnmounted(() => {
	disposeWindow()
	window.removeEventListener("keydown", onKeydown)
})
</script>

<template>
	<Flex v-if="appStore.isLogined" direction="column" data-testid="network-unavailable-window" :class="$style.wrapper">
		<DappStatusStrip
			:accountName="appStore.account?.name"
			:networkName="appStore.network?.name"
			:status="stripStatus"
		/>

		<Flex direction="column" :class="$style.scroll_area">
			<DappIdentityBlock
				:dapp="dapp"
				actionLabel="wants to connect to your wallet"
				hostnameTestId="network-unavailable-hostname"
				nameTestId="network-unavailable-dapp-name"
			/>

			<Flex direction="column" gap="8" :class="$style.body">
				<Text data-testid="network-unavailable-title" variant="row-title" color="primary" :class="$style.title_size">Network not available</Text>
				<Text data-testid="network-unavailable-body" variant="body" color="secondary" :style="{ lineHeight: '1.5' }">
					This app asks for a network your wallet doesn't have. The app and your wallet need to be on the same network.
				</Text>
			</Flex>
		</Flex>

		<Flex v-snack-footer direction="column" gap="12" :class="$style.footer">
			<Button
				data-testid="network-unavailable-close-btn"
				@click="dismiss"
				@keydown.enter="refuseRepeatEnter"
				wide
				variant="primary"
				size="medium"
			>
				<Text color="inverse">Close</Text>
			</Button>
		</Flex>
	</Flex>
</template>

<style module>
.wrapper {
	composes: approval_wrapper from "../window-shell.module.css";
}

.scroll_area {
	composes: scroll_area from "../window-shell.module.css";
}

.body {
	padding: 16px;
}

.title_size {
	font-size: 13px;
}

.footer {
	composes: footer from "../window-shell.module.css";
}
</style>
