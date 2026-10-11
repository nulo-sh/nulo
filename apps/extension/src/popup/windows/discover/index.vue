<script setup lang="ts">
/** Vendor */
import { onMounted, onUnmounted } from "vue"

/** Components */
import DappStatusStrip from "@/components/composite/DappStatusStrip.vue"
import DappIdentityBlock from "@/components/composite/DappIdentityBlock.vue"
import DappCancelledOverlay from "@/components/composite/DappCancelledOverlay.vue"
import DappApprovalFooter from "@/components/composite/DappApprovalFooter.vue"
import ConnectStepBar from "../ConnectStepBar.vue"

/** Utils */
import { getErrorData } from "@nulo/wallet-core/utils"
import { JobCancelledError } from "@nulo/extension-messaging/errors"
import { resolveDappChain } from "../capabilities/chain-mismatch"

/** Services */
import { type ProfileInfo, ProfileServiceClient } from "@/wallet/services/profile/client"
import { type DiscoveryPayload, DappInteractionServiceClient } from "@/wallet/services/dapp-interaction/client"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

/** Composables */
import { useDappInteractionPayload } from "@/composables/useDappInteractionPayload"
import { useDappHostname } from "@/composables/useDappHostname"
import { useDappApprovalWindow } from "@/composables/useDappApprovalWindow"

const router = useRouter()

const EXPIRED_CLOSE_MS = 30_000

const profile = ref<ProfileInfo>()
const isLoading = ref(false)

// Allow opens only once init has committed the payload, the dApp's identity and the active profile,
// so no one approves a session whose hostname, logo and name they have not seen. Deny needs only the
// request id: an early reject is harmless.
const isReady = ref(false)
const isApproved = ref(false)
// The worker sends this window to its own page marked expired when the connection never
// established: the request is gone, so there is nothing left to load or answer.
const isExpired = computed(() => router.currentRoute.value.query.expired === "1")
let expiredClose: ReturnType<typeof setTimeout> | undefined

const interactionService = new DappInteractionServiceClient()

const {
	requestId,
	payload,
	dapp,
	isCancelled: isInteractionCancelled,
	load: loadInteractionPayload,
	reject: rejectViaInteractionService,
} = useDappInteractionPayload<DiscoveryPayload>({
	interactionService,
	getRequestId: () => router.currentRoute.value.query.requestId?.toString(),
	dappOf: (p) => p.params.dappMetadata,
})

const { hostname: dappHostname, isSuspicious: hostnameHasNonAscii } = useDappHostname(dapp)

// The app's chain, not the wallet's: the strip above names the wallet's network, and an approval
// connects the app on the chain it asked for, whatever the wallet shows.
const chainName = computed(() =>
	payload.value ? resolveDappChain(payload.value.params.chainId, appStore.networks, appStore.network?.chainId).name : "this network",
)
const actionLabel = computed(() => (isApproved.value ? `Connecting on ${chainName.value}` : `wants to connect on ${chainName.value}`))

// init/reject/services are referenced lazily (thunks): they are declared below
// and only invoked by start()/dispose()/the guard at runtime.
const {
	start: startWindow,
	dispose: disposeWindow,
	closeWindow,
	completeInteraction,
	onActiveProfileChanged,
	stripStatus,
	processingError,
	setError,
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
	reject: () => reject(),
})

const init = async () => {
	try {
		profile.value = await profileService.getActiveProfile()
		await loadInteractionPayload()
		// Every value `approve()` reads must be committed; an error path leaves Allow closed.
		if (profile.value && requestId.value && dapp.value) isReady.value = true
	} catch (error) {
		console.error(getErrorData(error))
		setError("Something went wrong")
	}
}

const approve = async () => {
	// Allow is disabled until init completes: a call that slips past that gate throws, so a broken
	// gate is loud instead of silently doing nothing.
	if (!isReady.value) {
		throw new Error("discover approve() called before init() completed — :disabled gate must include !isReady")
	}
	if (isInteractionCancelled.value || isLoading.value || !requestId.value) return
	try {
		isLoading.value = true
		await interactionService.resolveInteraction(requestId.value, { approved: true })
		isApproved.value = true
		// The window waits here for this connection's emoji check, still loading. Its id comes only
		// from the service's handle, and nothing this page does on unmount touches the reservation
		// that now holds it.
		completeInteraction()
	} catch (error) {
		isLoading.value = false
		if (error instanceof JobCancelledError) {
			// A raced approve refused service-side (the dApp cancelled first):
			// the refusal IS the cancelled state — overlay, not an error banner.
			isInteractionCancelled.value = true
		} else {
			console.error(getErrorData(error))
			setError("Something went wrong")
		}
	}
}

const reject = async () => {
	if (isInteractionCancelled.value || !requestId.value) return
	rejectViaInteractionService("User rejected")
	closeWindow(true)
}

const profileService = new ProfileServiceClient()
profileService.onActiveProfileChanged.add(onActiveProfileChanged)

// The window holds a verification slot until it closes, so leaving the expired page (a lock routes
// the window to the auth screen) ends the window, not just its timer.
const leaveExpired = () => {
	if (expiredClose === undefined) return
	clearTimeout(expiredClose)
	expiredClose = undefined
	closeWindow()
}

// Immediate, not on mount alone: the flag usually arrives by a hash change on a mounted page.
watch(
	isExpired,
	(expired) => {
		if (!expired) return leaveExpired()
		clearTimeout(expiredClose)
		expiredClose = setTimeout(() => closeWindow(), EXPIRED_CLOSE_MS)
	},
	{ immediate: true },
)

// A page loaded already expired has no request left to load, and starting it would send a locked
// wallet's window to the auth screen instead of the overlay.
onMounted(() => {
	if (!isExpired.value) void startWindow()
})

onUnmounted(() => {
	disposeWindow()
	leaveExpired()
})
</script>

<template>
	<Flex v-if="appStore.isLogined" direction="column" :class="$style.wrapper">
		<DappStatusStrip
			:accountName="appStore.account?.name"
			:networkName="appStore.network?.name"
			:status="stripStatus"
		/>
		<ConnectStepBar :step="1" />

		<Flex direction="column" :class="$style.scroll_area">
			<DappIdentityBlock
				:dapp="dapp"
				:hostname="dappHostname"
				:hostnameSuspicious="hostnameHasNonAscii"
				:actionLabel="actionLabel"
				hostnameTestId="discover-hostname"
				nameTestId="discover-dapp-name"
				actionTestId="discover-action"
			/>

			<Flex direction="column" gap="8" :class="$style.body">
				<Text size="12" color="tertiary" :style="{ lineHeight: '1.5' }">
					Make sure you trust the site you're connecting to. You can revoke this connection any time from Settings → Connected Apps.
				</Text>
			</Flex>
		</Flex>

		<DappApprovalFooter
			:processing-error="processingError"
			wide-tooltip
			reject-testid="discover-deny-btn"
			reject-label="Deny"
			:reject-disabled="isLoading || !requestId"
			confirm-testid="discover-allow-btn"
			confirm-label="Allow"
			:confirm-loading="isLoading"
			:confirm-disabled="processingError?.type === 'error' || !isReady || isLoading"
			@reject="reject"
			@approve="approve"
		/>

		<DappCancelledOverlay v-if="isInteractionCancelled && !isExpired" @dismiss="closeWindow()" />
	</Flex>
	<DappCancelledOverlay v-if="isExpired" message="Connection request expired" @dismiss="closeWindow()" />
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
</style>
