<route lang="json">
{
	"meta": {
		"fillsWindow": true
	}
}
</route>

<script setup lang="ts">
/**
 * The question a dApp send asks when its fee came out above the figure the person approved. The
 * request reads as it did at approval; only the fee block differs, and only an accept of the new
 * figure lets the send go on. Every other end of this window cancels the send.
 */

/** Vendor */
import { onMounted, onUnmounted, shallowRef } from "vue"
import { JobCancelledError } from "@nulo/extension-messaging/errors"
import { getErrorMessage } from "@nulo/wallet-core/utils"

/** Components */
import DappIdentityBlock from "@/components/composite/DappIdentityBlock.vue"
import DappCancelledOverlay from "@/components/composite/DappCancelledOverlay.vue"
import DappApprovalFooter from "@/components/composite/DappApprovalFooter.vue"
import FeeRaisedCard from "@/popup/components/modules/send/FeeRaisedCard.vue"
import OperationCard from "../execute/OperationCard.vue"
import SignerIdentityStrip from "../execute/SignerIdentityStrip.vue"

/** Utils */
import { type FeeDisplay, feeDisplay, feeFigure, formatGasBalance } from "@/utils/fee-estimation"
import { openJsonWindow } from "@/utils/json-window"
import {
	authwitDisplayCall,
	awaitsGrantDecode,
	decodeCallsOrUnavailable,
	decodeGrantsOrUnavailable,
	grantContentsOf,
} from "../execute/display-calls"
import { grantRefusalRow } from "../execute/call-surface"
import {
	WrongProfileError,
	assertRequestProfile,
	decodeOperationArguments,
	followKnownTokens,
	requestEnd,
	resolveForProfile,
} from "../execute/operation-display"
import { uniqueSignerAccounts, uniqueSignerNetworks } from "../execute/signers"
import type { DraftUIOperation } from "../execute/types"

/** Services */
import { type ProfileInfo, ProfileServiceClient } from "@/wallet/services/profile/client"
import { type DecodedCall, type DecodedGrant, ExecutionServiceClient } from "@/wallet/services/execution/client"
import { type TokenInfo, TokenServiceClient } from "@/wallet/services/token/client"
import { PriceServiceClient } from "@/wallet/services/price/client"
import { DappInteractionServiceClient, type FeeQuestionPayload, type WindowEnd } from "@/wallet/services/dapp-interaction/client"

/** Composables */
import { useDappInteractionPayload } from "@/composables/useDappInteractionPayload"
import { useDappApprovalWindow } from "@/composables/useDappApprovalWindow"
import { useTokenFlags } from "@/composables/usePrices"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

const router = useRouter()

const profile = ref<ProfileInfo>()
const operation = ref<DraftUIOperation>()
const decodedCalls = ref<readonly DecodedCall[]>()
const decodedAuthwits = ref<Map<string, DecodedCall>>(new Map())
const knownTokens = ref<TokenInfo[]>([])
const available = ref<string | null>(null)
const availableLoading = ref(true)
const isLoading = ref(false)
const isWrongProfile = ref(false)
/** Absent while the grants decode; the card reads them as the approval window did. */
const decodedGrants = ref<readonly DecodedGrant[]>()

const executionService = new ExecutionServiceClient()
const interactionService = new DappInteractionServiceClient()
const tokenService = new TokenServiceClient()
const tokenFollow = followKnownTokens(tokenService, knownTokens)
const profileService = new ProfileServiceClient()
const priceService = new PriceServiceClient()
/** The signed list's reader for the summary's marks. `init` opens it, and `init` runs only once the
 *  window is signed in, so a window still checking its session or locked reads no price. */
const marks = shallowRef<ReturnType<typeof useTokenFlags>>()

const {
	requestId,
	payload,
	dapp,
	isCancelled: isInteractionCancelled,
	load: loadInteractionPayload,
	reject: rejectViaInteractionService,
} = useDappInteractionPayload<FeeQuestionPayload>({
	interactionService,
	getRequestId: () => router.currentRoute.value.query.requestId?.toString(),
	dappOf: (p) => p.session.dappMetadata,
})

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
		tokenService.connect()
	},
	disconnectServices: () => {
		profileService.disconnect()
		interactionService.disconnect()
		executionService.disconnect()
		tokenService.disconnect()
		priceService.disconnect()
		marks.value?.dispose()
	},
	init: () => init(),
	reject: (end) => reject(requestEnd(end, isWrongProfile.value, profile.value)),
})

const question = computed(() => payload.value?.feeQuestion)
const grantsPending = computed(() => !!operation.value && awaitsGrantDecode(operation.value, !!decodedGrants.value))
const grantRefusal = computed(() => grantRefusalRow(decodedGrants.value ?? []))
/** Read from the question, so it needs no quote and names the fee before the card mounts. */
const confirmLabel = computed(() => (question.value ? `Send for ${feeFigure(feeDisplay(question.value.fee, undefined))}` : "Send for FJ"))
/** The card's own quote of the new fee: the window prices nothing, so its dollars are the card's. */
const nowFee = ref<FeeDisplay | null>(null)
const confirmDetail = computed(() => (nowFee.value?.usd ? `(${nowFee.value.usd})` : undefined))
/** The app's own payment set the fee path: no speed was picked, and its claim, not the balance, pays. */
const setByApp = computed(() => question.value?.feeSettings?.paymentMethod.kind === "embedded")
const priority = computed(() => (setByApp.value ? undefined : (question.value?.feeSettings?.priorityLevel ?? "normal")))

const init = async () => {
	marks.value = useTokenFlags(priceService)
	try {
		profile.value = await profileService.getActiveProfile()
		await loadInteractionPayload()
		if (!payload.value) return
		assertRequestProfile(profile.value, payload.value.session.profileId)
		const resolved = await resolveForProfile([payload.value.operation], profile.value.id)
		const op = resolved.operations[0]
		operation.value = op
		void decodeOperationArguments(resolved.operations, executionService, (_, decoded) => {
			decodedCalls.value = decoded
		})
		void tokenFollow.start(resolved.operations, profile.value.id)
		void readAvailable(op)
		void decodeAuthwits(op)
		void decodeGrants(op)
	} catch (error) {
		if (error instanceof WrongProfileError) isWrongProfile.value = true
		console.error("Failed to initialize the fee question", { error })
		setError("Something went wrong")
	}
}

/** Each listed authorization decodes on its consumer; a failed batch leaves the selectors standing. */
async function decodeAuthwits(op: DraftUIOperation | undefined): Promise<void> {
	const listed = question.value?.discoveredAuthwits ?? []
	if (!op || !listed.length) return
	const decoded = await decodeCallsOrUnavailable(executionService, op.networkId, listed.map(authwitDisplayCall))
	decodedAuthwits.value = new Map(listed.map((a, i) => [a.messageHash, decoded[i] ?? { kind: "undecoded", reason: "unavailable" }]))
}

/** The held request's grants, decoded from the request its question shows; a failed decode reads as
 *  unavailable, which keeps Send for off as the approval window kept Confirm. */
async function decodeGrants(op: DraftUIOperation | undefined): Promise<void> {
	const count = op ? grantContentsOf(op).length : 0
	if (!count) return
	decodedGrants.value = await decodeGrantsOrUnavailable(() => executionService.decodeQuestionGrantsForDisplay(requestId.value!), count)
}

/** The payer's balance as the readout prints it, read past the cache, which can predate a deposit
 *  made outside the wallet; a failed read shows none rather than a zero. */
async function readAvailable(op: DraftUIOperation | undefined): Promise<void> {
	const payer = question.value?.payer
	try {
		if (!op || !payer || !("accountAddress" in op) || setByApp.value) return
		const balances = await executionService.getGasBalances(op.networkId, op.accountAddress, true)
		const raw = payer.type === "private_fpc" ? balances.privateFeeJuice : balances.publicFeeJuice
		available.value = raw === null ? null : formatGasBalance(raw)
	} catch (error) {
		console.warn("[Fee] Balance read failed", { error })
	} finally {
		availableLoading.value = false
	}
}

const accept = async () => {
	if (isInteractionCancelled.value || isLoading.value || !requestId.value || !operation.value) return
	if (grantsPending.value || grantRefusal.value) return
	try {
		isLoading.value = true
		await interactionService.resolveInteraction(requestId.value, { accepted: true })
		closeWindow(true)
	} catch (error) {
		if (error instanceof JobCancelledError) isInteractionCancelled.value = true
		else setError("Processing error.", getErrorMessage(error))
	} finally {
		isLoading.value = false
	}
}

const reject = async (end: WindowEnd) => {
	if (isInteractionCancelled.value || !requestId.value) return
	await endAndClose(() => rejectViaInteractionService("User rejected", end))
}

const signerAccounts = computed(() => (operation.value ? uniqueSignerAccounts([operation.value]) : []))
const signerNetworks = computed(() => (operation.value ? uniqueSignerNetworks([operation.value]) : []))

const showJson = () => {
	if (requestId.value) openJsonWindow(requestId.value)
}

// The notice's OK ends another profile's request as the lock or switch that made it, with the same
// wait as Reject, so the window's close cannot reach the request first.
const dismissWrongProfile = () =>
	requestId.value && !isInteractionCancelled.value ? reject(requestEnd("close", true, profile.value)) : closeWindow()

profileService.onActiveProfileChanged.add(onActiveProfileChanged)

onMounted(startWindow)

onUnmounted(() => {
	tokenFollow.dispose()
	disposeWindow()
})
</script>

<template>
	<Flex v-if="appStore.isLogined" direction="column" :class="$style.wrapper">
		<SignerIdentityStrip :signerAccounts="signerAccounts" :signerNetworks="signerNetworks" :status="stripStatus" />

		<Flex direction="column" :class="$style.scroll_area">
			<DappIdentityBlock
				:dapp="dapp ?? undefined"
				hostnameTestId="fee-hostname"
				actionLabel="wants to execute the following"
			/>

			<Flex v-if="operation && question" direction="column" gap="10" wide :class="$style.sections">
				<Flex wide justify="between" align="center">
					<SectionLabel label="Requested operations" :count="1" />
					<Icon
						data-testid="fee-show-json-btn"
						@click="showJson"
						name="expand"
						size="16"
						color="tertiary"
						:class="$style.fullscreen_icon"
					/>
				</Flex>

				<OperationCard
					:op="operation"
					:index="0"
					:profile="profile"
					:dapp="dapp ?? undefined"
					:decodedCalls="decodedCalls"
					:approvedAuthwits="question.discoveredAuthwits"
					:decodedAuthwits="decodedAuthwits"
					:decodedGrants="decodedGrants"
					:tokens="knownTokens"
					:marks="marks"
				>
					<template #fee>
						<FeeRaisedCard
							:payer="question.payer"
							:approved="question.approved"
							:fee="question.fee"
							:available="available"
							:availableLoading="availableLoading"
							:hideAvailable="setByApp"
							:priority="priority"
							v-model:now="nowFee"
						/>
					</template>
				</OperationCard>
			</Flex>
		</Flex>

		<DappApprovalFooter
			:processing-error="grantRefusal ?? processingError"
			reject-testid="fee-reject-btn"
			reject-label="Reject"
			:reject-disabled="isLoading || !requestId"
			confirm-testid="fee-confirm-btn"
			:confirm-label="confirmLabel"
			:confirm-detail="confirmDetail"
			:confirm-loading="isLoading"
			:confirm-disabled="
				processingError?.type === 'error' || !operation || !question || grantsPending || grantRefusal !== undefined || isInteractionCancelled
			"
			@reject="reject('reject')"
			@approve="accept"
		/>

		<DappCancelledOverlay
			v-if="isWrongProfile"
			message="You are signed in to a different profile. Please switch profiles and resend your request."
			@dismiss="dismissWrongProfile"
		/>
		<DappCancelledOverlay
			v-else-if="isInteractionCancelled"
			message="The operation request was cancelled"
			@dismiss="closeWindow()"
		/>
	</Flex>
</template>

<style module>
.wrapper {
	composes: approval_wrapper from "../window-shell.module.css";
}

.scroll_area {
	composes: scroll_area from "../window-shell.module.css";
}

.sections {
	padding: 16px;
}

.fullscreen_icon {
	cursor: pointer;
	padding: 4px;

	&:hover {
		background: var(--nulo-surface-high);
	}
}
</style>
