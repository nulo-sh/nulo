<script setup lang="ts">
/** Vendor */
import { onMounted, onUnmounted } from "vue"

/** Components */
import IdentityStrip from "@/components/composite/IdentityStrip.vue"
import DappIdentityBlock from "@/components/composite/DappIdentityBlock.vue"
import ContractChip from "@/components/composite/ContractChip.vue"
import { appChipOf } from "@/components/composite/contract-chip"
import { useDappOrigin } from "@/composables/useDappOrigin"
import DappCancelledOverlay from "@/components/composite/DappCancelledOverlay.vue"
import DappApprovalFooter from "@/components/composite/DappApprovalFooter.vue"
import DottedTerm from "@/components/composite/DottedTerm.vue"
import PermissionRow from "@/components/composite/capabilities/PermissionRow.vue"

/** Utils */
import { JobCancelledError } from "@nulo/extension-messaging/errors"
import { resolveDappChain } from "../capabilities/chain-mismatch"
import { EVERY_SITE_CONFIRM } from "@/utils/every-site"

/** Services */
import { type ProfileInfo, ProfileServiceClient } from "@/wallet/services/profile/client"
import { type DiscoveryPayload, DappInteractionServiceClient, type WindowEnd } from "@/wallet/services/dapp-interaction/client"
import { DappSessionServiceClient } from "@/wallet/services/dapp-session/client"
import { DAPP_SESSION_DAYS } from "@/wallet/services/dapp-session/spec"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

/** Composables */
import { useDappInteractionPayload } from "@/composables/useDappInteractionPayload"
import { useDappApprovalWindow } from "@/composables/useDappApprovalWindow"
import { useConfirm } from "@/composables/useConfirm"
const { askConfirm } = useConfirm()

const router = useRouter()

const profile = ref<ProfileInfo>()
const isLoading = ref(false)

// Allow opens only once init has committed the payload, the dApp's identity and the active profile,
// so no one approves a session whose hostname, logo and name they have not seen. Deny needs only the
// request id: an early reject is harmless.
const isReady = ref(false)

const interactionService = new DappInteractionServiceClient()
const sessionService = new DappSessionServiceClient()

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

/** No list vouches for an app yet, so its own chip always reads unverified. */
const { origin: dappOrigin } = useDappOrigin(dapp)
const appChip = computed(() => appChipOf(dapp.value?.name, dappOrigin.value))

// The app's chain, not the wallet's: the strip above names the wallet's network, and an approval
// connects the app on the chain it asked for, whatever the wallet shows.
const chainName = computed(() =>
	payload.value ? resolveDappChain(payload.value.params.chainId, appStore.networks, appStore.network?.chainId).name : "this network",
)
const actionLabel = computed(() => `wants to connect on ${chainName.value}`)
const rememberLine = computed(
	() => `Nulo remembers this site on ${chainName.value} for ${DAPP_SESSION_DAYS} days. Revoke it in Settings → Connected Apps.`,
)

// init/reject/services are referenced lazily (thunks): they are declared below
// and only invoked by start()/dispose()/the guard at runtime.
const {
	start: startWindow,
	dispose: disposeWindow,
	closeWindow,
	endAndClose,
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
		sessionService.connect()
	},
	disconnectServices: () => {
		profileService.disconnect()
		interactionService.disconnect()
		sessionService.disconnect()
	},
	init: () => init(),
	reject: (end) => reject(end),
})

const init = async () => {
	try {
		profile.value = await profileService.getActiveProfile()
		await loadInteractionPayload()
		// Every value `approve()` reads must be committed; an error path leaves Allow closed.
		if (profile.value && requestId.value && dapp.value) isReady.value = true
	} catch (error) {
		console.error("Discover window init failed", { error })
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
	isLoading.value = true
	await resolveAllow()
}

const allowDisabled = computed(() => processingError.value?.type === "error" || !isReady.value || isLoading.value)

/** Nothing is written until the person presses Turn on. Then the switch is written first, even if the
 *  app cancelled meanwhile, since the person agreed to every site, and this site is answered as an
 *  Allow would answer it. */
const allowEverySite = async () => {
	if (allowDisabled.value || isInteractionCancelled.value || !requestId.value || !profile.value) return
	if (!(await askConfirm(EVERY_SITE_CONFIRM))) return
	try {
		isLoading.value = true
		await sessionService.setEverySite(profile.value.id, true)
	} catch (error) {
		isLoading.value = false
		console.error("Discover every-site write failed", { error })
		setError("Something went wrong")
		return
	}
	if (isInteractionCancelled.value) {
		isLoading.value = false
		return
	}
	await resolveAllow()
}

/** Answers the app as Allow; `isLoading` is set by the caller. */
const resolveAllow = async () => {
	try {
		await interactionService.resolveInteraction(requestId.value as string, { approved: true })
		closeWindow(true)
	} catch (error) {
		isLoading.value = false
		if (error instanceof JobCancelledError) {
			// A raced approve refused service-side (the dApp cancelled first):
			// the refusal IS the cancelled state — overlay, not an error banner.
			isInteractionCancelled.value = true
		} else {
			console.error("Discover approve failed", { error })
			setError("Something went wrong")
		}
	}
}

const reject = async (end: WindowEnd) => {
	if (isInteractionCancelled.value || !requestId.value) return
	await endAndClose(() => rejectViaInteractionService("User rejected", end))
}

const profileService = new ProfileServiceClient()
profileService.onActiveProfileChanged.add(onActiveProfileChanged)

onMounted(startWindow)

onUnmounted(disposeWindow)
</script>

<template>
	<Flex v-if="appStore.isLogined" direction="column" :class="$style.wrapper">
		<IdentityStrip :accountLabel="appStore.network?.name ?? ''" :status="stripStatus" />

		<Flex direction="column" :class="$style.scroll_area">
			<DappIdentityBlock
				:dapp="dapp"
				:actionLabel="actionLabel"
				hostnameTestId="discover-hostname"
				nameTestId="discover-dapp-name"
				actionTestId="discover-action"
			>
				<template v-if="appChip" #name><ContractChip :model="appChip" /></template>
			</DappIdentityBlock>

			<Flex direction="column" gap="16" :class="$style.body">
				<Text variant="body" color="primary" :style="{ lineHeight: '1.5' }" data-testid="discover-scope">
					Allowing lets this site
					<DottedTerm term="discover" position="start" testid="discover-term-discover">discover</DottedTerm>
					Nulo. It sees no account or balance until you pass the
					<DottedTerm term="connection-check" testid="discover-term-check">connection check</DottedTerm>
					and approve a request.
				</Text>

				<Flex direction="column" gap="10" wide>
					<SectionLabel label="If you allow" />
					<ItemsContainer role="list" data-testid="discover-facts">
						<PermissionRow
							role="listitem"
							icon="extension"
							title="This site learns Nulo is installed."
							subOn="It also sees Nulo's version, as do the scripts on the page."
							data-testid="discover-fact-presence"
						/>
						<PermissionRow
							role="listitem"
							icon="app"
							title="It can then ask to connect."
							subOn="You compare emojis first. Sharing an account needs your OK."
							data-testid="discover-fact-next"
						/>
						<PermissionRow
							role="listitem"
							icon="eye-off"
							title="It sees nothing else."
							subOn="No account, address, balance or history."
							data-testid="discover-fact-hidden"
						/>
					</ItemsContainer>
				</Flex>

				<Text variant="body" color="tertiary" :style="{ lineHeight: '1.5' }" data-testid="discover-remember">{{ rememberLine }}</Text>
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
			:confirm-disabled="allowDisabled"
			@reject="reject('reject')"
			@approve="approve"
		>
			<template #below>
				<button type="button" :class="$style.every_site" :disabled="allowDisabled" data-testid="discover-every-site" @click="allowEverySite">
					Allow every site
				</button>
			</template>
		</DappApprovalFooter>

		<DappCancelledOverlay v-if="isInteractionCancelled" @dismiss="closeWindow()" />
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

.every_site {
	composes: type--label-section from global;
	align-self: center;

	padding: 4px 0;
	border: none;
	background: transparent;
	cursor: pointer;

	color: var(--nulo-secondary);
	text-decoration: underline;
	text-decoration-thickness: 1px;
	text-underline-offset: 4px;
	transition: color 0.2s var(--bezier);
}

.every_site:hover:not(:disabled) {
	color: var(--txt-primary);
}

.every_site:focus-visible {
	outline: 2px solid var(--nulo-accent);
	outline-offset: 2px;
}

/* As a disabled Button fades. */
.every_site:disabled {
	cursor: default;
	opacity: 0.3;
}
</style>
