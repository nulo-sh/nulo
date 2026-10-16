<script setup lang="ts">
/**
 * The question a dApp send asks when its fee came out above the figure the person approved. The
 * request reads as it did at approval; only the fee block differs, and only an accept of the new
 * figure lets the send go on. Every other end of this window cancels the send.
 */

/** Vendor */
import { onMounted, onUnmounted } from "vue"
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
import { formatFeeJuice, formatGasBalance } from "@/utils/fee-estimation"
import { authwitDisplayCall, grantContentsOf, undecodedAll } from "../execute/display-calls"
import { grantRefusalRow, readableGrants } from "../execute/call-surface"
import { decodeOperationArguments, followKnownTokens, resolveOperations } from "../execute/operation-display"
import { uniqueSignerAccounts, uniqueSignerNetworks } from "../execute/signers"
import type { DraftUIOperation } from "../execute/types"

/** Services */
import { type ProfileInfo, ProfileServiceClient } from "@/wallet/services/profile/client"
import { NetworkServiceClient } from "@/wallet/services/network/client"
import { AccountServiceClient } from "@/wallet/services/account/client"
import { type DecodedCall, type DecodedGrant, ExecutionServiceClient } from "@/wallet/services/execution/client"
import { type TokenInfo, TokenServiceClient } from "@/wallet/services/token/client"
import { DappInteractionServiceClient, type FeeQuestionPayload } from "@/wallet/services/dapp-interaction/client"

/** Composables */
import { useDappInteractionPayload } from "@/composables/useDappInteractionPayload"
import { useDappHostname } from "@/composables/useDappHostname"
import { useDappApprovalWindow } from "@/composables/useDappApprovalWindow"

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

const { hostname: dappHostname, isSuspicious: hostnameHasNonAscii } = useDappHostname(dapp)

const {
	start: startWindow,
	dispose: disposeWindow,
	closeWindow,
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
	},
	init: () => init(),
	reject: () => reject(),
})

const question = computed(() => payload.value?.feeQuestion)
const grantsPending = computed(() => !!operation.value && grantContentsOf(operation.value).length > 0 && !decodedGrants.value)
const grantRefusal = computed(() => grantRefusalRow(decodedGrants.value ?? []))
const was = computed(() => (question.value ? formatFeeJuice(BigInt(question.value.approved)) : ""))
const now = computed(() => (question.value ? formatFeeJuice(BigInt(question.value.fee)) : ""))
/** The app's own payment set the fee path: no speed was picked, and its claim, not the balance, pays. */
const setByApp = computed(() => question.value?.feeSettings?.paymentMethod.kind === "embedded")
const priority = computed(() => (setByApp.value ? undefined : (question.value?.feeSettings?.priorityLevel ?? "normal")))

const init = async () => {
	let accountService: AccountServiceClient | undefined
	let networkService: NetworkServiceClient | undefined
	try {
		profile.value = await profileService.getActiveProfile()
		await loadInteractionPayload()
		if (!payload.value) return
		if (profile.value?.id !== payload.value.session.profileId) {
			isWrongProfile.value = true
			throw new Error("Sign in with another profile")
		}
		accountService = new AccountServiceClient()
		networkService = new NetworkServiceClient()
		const resolved = await resolveOperations([payload.value.operation], accountService, networkService, profile.value.id)
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
		console.error("Failed to initialize the fee question", { error })
		setError("Something went wrong")
	} finally {
		accountService?.disconnect()
		networkService?.disconnect()
	}
}

/** Each listed authorization decodes on its consumer; a failed batch leaves the selectors standing. */
async function decodeAuthwits(op: DraftUIOperation | undefined): Promise<void> {
	const listed = question.value?.discoveredAuthwits ?? []
	if (!op || !listed.length) return
	let decoded: DecodedCall[]
	try {
		decoded = await executionService.decodeCallsForDisplay(op.networkId, listed.map(authwitDisplayCall))
	} catch (error) {
		console.warn("[Fee] Authorization decode failed", { error })
		decoded = undecodedAll(listed.length)
	}
	decodedAuthwits.value = new Map(listed.map((a, i) => [a.messageHash, decoded[i] ?? { kind: "undecoded", reason: "unavailable" }]))
}

/** The held request's grants, decoded from the request its question shows; a failed decode reads as
 *  unavailable, which keeps Send for off as the approval window kept Confirm. */
async function decodeGrants(op: DraftUIOperation | undefined): Promise<void> {
	const count = op ? grantContentsOf(op).length : 0
	if (!count) return
	let decoded: readonly DecodedGrant[] = []
	try {
		decoded = await executionService.decodeQuestionGrantsForDisplay(requestId.value!)
	} catch (error) {
		console.warn("[Fee] Grant decode failed", { error })
	}
	decodedGrants.value = readableGrants(decoded, count)
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

const reject = async () => {
	if (isInteractionCancelled.value || !requestId.value) return
	rejectViaInteractionService("User rejected")
	closeWindow(true)
}

const signerAccounts = computed(() => (operation.value ? uniqueSignerAccounts([operation.value]) : []))
const signerNetworks = computed(() => (operation.value ? uniqueSignerNetworks([operation.value]) : []))

const showJson = () => {
	if (!requestId.value) return
	const url = new URL(chrome.runtime.getURL("src/popup/index.html#/windows/json"))
	url.searchParams.set("requestId", requestId.value)
	chrome.windows.create({ type: "popup", url: url.toString(), height: 700, width: 900 })
}

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
				:hostname="dappHostname"
				:hostnameSuspicious="hostnameHasNonAscii"
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
				>
					<template #fee>
						<FeeRaisedCard
							:payer="question.payer"
							:was="was"
							:now="now"
							:available="available"
							:availableLoading="availableLoading"
							:hideAvailable="setByApp"
							:priority="priority"
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
			:confirm-label="`Send for ${now} FJ`"
			:confirm-loading="isLoading"
			:confirm-disabled="
				processingError?.type === 'error' || !operation || !question || grantsPending || grantRefusal !== undefined || isInteractionCancelled
			"
			@reject="reject"
			@approve="accept"
		/>

		<DappCancelledOverlay
			v-if="isWrongProfile"
			message="You are signed in to a different profile. Please switch profiles and resend your request."
			@dismiss="closeWindow()"
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
