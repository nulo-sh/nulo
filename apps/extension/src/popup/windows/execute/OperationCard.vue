<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup lang="ts">
/**
 * Single operation row inside the execute window. Three rendering
 * shapes:
 *
 * - `send_transaction` + `aztec_sendTx` — header + From account +
 *   Payload list + fee settings (either the embedded "set by app"
 *   badge or a `<FeeSettingsCard>` v-modeled into the parent's
 *   `op.feeSettings`). An `aztec_sendTx` reads as its summary first;
 *   the Payload list and the authorizations' rows open under one toggle.
 * - All other read-only / register / simulate variants — header +
 *   from account (when present) + per-kind detail rows.
 *
 * A call's arguments render through `CallArguments` in the first shape
 * that applies: the wallet's transfer/mint vocabulary, the ABI decode the
 * parent fetched, or the raw fields behind a toggle.
 *
 * The parent owns the operation list + fee estimation map. The card
 * just emits `update:feeSettings` (forwarded from FeeSettingsCard) so
 * the parent can drive `op.feeSettings` and trigger the keyed fee
 * estimator.
 */
import AppFeeLine from "@/popup/components/modules/send/AppFeeLine.vue"
import FlaggedTokenBanner from "@/popup/components/modules/general/FlaggedTokenBanner.vue"
import FeeSettingsCard from "@/popup/components/modules/send/FeeSettingsCard.vue"
import { isSelfPay } from "@nulo/wallet-bridge"
import type { ProfileInfo } from "@/wallet/services/profile/client"
import type {
	DecodedCall,
	DecodedGrant,
	DiscoveredAuthwit,
	FeeSettings,
	OperationAuthwitPreview,
	TransferFeeEstimate,
} from "@/wallet/services/execution/client"
import type { DappMetadata } from "@/wallet/services/dapp-session/client"
import type { Account } from "@/wallet/services/account/client"
import type { Network } from "@/wallet/services/network/client"
import type { TokenInfo } from "@/wallet/services/token/client"
import CallArguments from "./CallArguments.vue"
import DetailsToggle from "./DetailsToggle.vue"
import OperationActionRow from "./OperationActionRow.vue"
import SendTxSummary from "./SendTxSummary.vue"
import { humanizeOperationKind, safeWire, safeWireOrDash } from "./humanize"
import { type FeePayerPick, paysFromPrivateFeeJuice } from "./fee-figure"
import type { DraftAztecSendTxOperation, DraftSendTransactionOperation, DraftUIOperation } from "./types"
import { type CallSurface, type CallerContext, type WireCall, authwitTitle, callSurface, rowTitle, tokenAt, wire } from "./call-surface"
import { trimAddress } from "@/utils/string"
import { callTitle } from "@/utils/tx-enrichment"
import { isEmbeddedFeePayment } from "./operation-validation"
import { grantContentsOf } from "./display-calls"

// `DraftUIOperation` is the shared honest type. Send-like `feeSettings` is optional during user
// editing — the card v-models it via the FeeSettingsCard emit, the parent's `requiresFeeSelection`
// gate validates before approve.
type UIOperation = DraftUIOperation

/** The send-like UI op subset (where feeSettings + fee + exec fields exist). */
type SendLikeUIOp = (DraftAztecSendTxOperation | DraftSendTransactionOperation) & {
	network: Network
	account?: Account
}

const props = defineProps<{
	op: UIOperation
	index: number
	profile?: ProfileInfo
	dapp?: DappMetadata & { logoBlobUrl?: string }
	feeEstimate?: TransferFeeEstimate
	isEstimating?: boolean
	/** The wallet-signed authorizations a `default_entrypoint` operation would
	 *  need at send, discovered without signing (no fee estimate exists for it). */
	authwitPreview?: OperationAuthwitPreview
	isPreviewing?: boolean
	/** Its estimate or preview waits behind another send. */
	isQueued?: boolean
	/** The authorizations an earlier window listed for this operation, for a window that only reads it. */
	approvedAuthwits?: readonly DiscoveredAuthwit[]
	/** Display-only ABI decodings of this operation's calls, index-aligned with
	 *  `exec.calls` (or the single `createAuthWit` intent call); `undefined`
	 *  while the wallet is still decoding. */
	decodedCalls?: readonly DecodedCall[]
	/** Display-only decodings of the discovered authorizations, by message hash. */
	decodedAuthwits?: ReadonlyMap<string, DecodedCall>
	/** Decodings of a `send_transaction`'s public grants, index-aligned with them; `undefined` while
	 *  the wallet is still decoding. */
	decodedGrants?: readonly DecodedGrant[]
	/** The wallet's registered tokens, so an amount can carry its symbol and decimals. */
	tokens?: readonly TokenInfo[]
	/**
	 * A `register_token` operation's metadata, read by the parent while
	 * `tokenMetadataLoading` holds; Confirm stays off until every token is read.
	 * `undefined` until its read lands, and after a failed one.
	 *
	 * SECURITY: the strings here are attacker-controllable (a malicious token
	 * contract can return any value for getName / getSymbol). The template
	 * always renders the contract address alongside so the user can verify.
	 */
	tokenMetadata?: { name: string; symbol: string; decimals: number }
	tokenMetadataError?: string
	tokenMetadataLoading?: boolean
	/** The signed list flags this `register_token` operation's token; Confirm waits for the tick. */
	tokenFlagged?: boolean
	tokenFlagAcknowledged?: boolean
	/** The wallet refuses this request: nothing on the card advises approving it. */
	refused?: boolean
}>()

const emit = defineEmits<{
	updateFeeSettings: [index: number, value: FeeSettings | undefined]
	/** The fee card's paying method, or null while none pays. */
	updatePayer: [index: number, payer: FeePayerPick | null]
	acknowledgeTokenFlag: [index: number, on: boolean]
}>()

// A predicate, so the template's `v-if` narrows `op` to the send-like row: it gates the whole send
// card, not only its fee settings, so it names the two kinds the card renders.
const isSendTx = (op: UIOperation): op is SendLikeUIOp => op.kind === "send_transaction" || op.kind === "aztec_sendTx"

/** The method a dApp asked for by naming the account itself as payer with no fee call: the card
 *  locks to it, so the sponsored FPC is never on offer for a transaction the app expects the
 *  account's own Fee Juice to pay. */
const requestedMethod = (op: SendLikeUIOp): "fj" | null => (op.kind === "aztec_sendTx" && isSelfPay(op.exec, op.opts?.from) ? "fj" : null)

const isNoFrom = (op: SendLikeUIOp): boolean => op.kind === "aztec_sendTx" && op.executionMode === "default_entrypoint"

/** `humanizeOperationKind` serves other surfaces, so this window's own names live here. */
const opTitle = (kind: UIOperation["kind"]): string => (kind === "aztec_createAuthWit" ? "Authorization" : humanizeOperationKind(kind))

/** The decoding for call `j`, or `unavailable` when the parent's batch came back short. */
const decodedAt = (j: number): DecodedCall | undefined =>
	props.decodedCalls ? (props.decodedCalls[j] ?? { kind: "undecoded", reason: "unavailable" }) : undefined

const sendTxCalls = (op: DraftAztecSendTxOperation): { call: WireCall; surface: CallSurface }[] => {
	const ctx: CallerContext = { accountAddress: op.accountAddress, noFrom: isNoFrom(op as SendLikeUIOp) }
	return (op.exec.calls as WireCall[]).map((call, j) => ({ call, surface: callSurface(ctx, call, decodedAt(j), isToken(call.to)) }))
}
const sendTxRows = computed(() => (props.op.kind === "aztec_sendTx" ? sendTxCalls(props.op) : []))
const appName = computed(() => safeWire(props.dapp?.name, 64) || "the app")
/** The app picked the method but the person pays, so the card claims nothing for the app and never
 *  reads the fee contract's own pool as the person's. */
const privateFeeJuice = computed(() => paysFromPrivateFeeJuice(props.op))

/** Only a contract the wallet registered as a token gets the transfer/mint vocabulary. */
const isToken = (contract: unknown): boolean => tokenAt(props.tokens, props.op.network?.chainId, contract) !== undefined

/** A grant reads from the call its signature hashes, or, undecoded, as the raw arguments it carries.
 *  No caller context: the spender makes the future call, so a transfer names only an explicit `from`. */
const grantRows = computed(() =>
	grantContentsOf(props.op).map((content, k) => {
		const grant = props.decodedGrants ? (props.decodedGrants[k] ?? { kind: "undecoded", reason: "unavailable" }) : undefined
		if (grant?.kind === "decoded") {
			return { contract: grant.call.to, surface: callSurface(undefined, grant.call, grant.decoded, isToken(grant.call.to)) }
		}
		const raw = content.kind === "call" ? { to: content.contract, args: content.args } : {}
		return { contract: raw.to, surface: callSurface(undefined, raw, grant, false, Number.POSITIVE_INFINITY) }
	}),
)

/** Per action, whether the window read its grant as a movement. Only an `add_public_authwit` takes a
 *  grant row, in `grantContentsOf`'s order. */
const actionReads = computed(() => {
	if (props.op.kind !== "send_transaction") return []
	let k = 0
	return (props.op.actions ?? []).map((action) => {
		if (action.kind !== "add_public_authwit") return false
		const kind = grantRows.value[k++]?.surface.kind
		return kind === "transfer" || kind === "mint"
	})
})

/** What an `aztec_createAuthWit` asks the wallet to sign: a call it can show, or a hash it cannot. */
type CreateAuthwitSurface =
	| { kind: "call"; caller: string; to: string; call: WireCall; args: CallSurface }
	| { kind: "hash"; consumer: string; innerHash: string }
const createAuthwitSurface = (m: unknown): CreateAuthwitSurface => {
	const intent = m as { innerHash?: unknown; consumer?: unknown; caller?: unknown; call?: WireCall }
	if (intent.call) {
		const call = intent.call
		return {
			kind: "call",
			caller: wire(intent.caller, 80),
			to: wire(call.to, 80),
			call,
			args: callSurface(undefined, call, decodedAt(0), isToken(call.to)),
		}
	}
	return { kind: "hash", consumer: wire(intent.consumer, 80), innerHash: wire(intent.innerHash, 80) }
}

/** Which surface lists what the wallet will sign for this operation: the preview for a
 *  NO_FROM operation, the fee estimate for a standard one; `send_transaction` adds none
 *  at confirm, and an embedded-fee standard operation skips discovery there too. Nothing is
 *  rendered when there is nothing to list: an absent row must not read as a claim of absence. */
type AuthwitSurface = { kind: "list"; authwits: readonly DiscoveredAuthwit[] } | { kind: "pending" } | { kind: "hidden" }
const authwitSurface = (op: UIOperation): AuthwitSurface => {
	if (op.kind !== "aztec_sendTx") return { kind: "hidden" }
	if (isNoFrom(op as SendLikeUIOp)) {
		if (props.authwitPreview) return { kind: "list", authwits: props.authwitPreview.discoveredAuthwits }
		return props.isPreviewing ? { kind: "pending" } : { kind: "hidden" }
	}
	if (isEmbeddedFeePayment(op)) return { kind: "hidden" }
	const listed = props.feeEstimate?.discoveredAuthwits ?? props.approvedAuthwits
	return listed ? { kind: "list", authwits: listed } : { kind: "hidden" }
}
const authwits = computed(() => authwitSurface(props.op))

/** A discovered authorization decodes on its consumer; the selector stands in until it does. */
const authwitDecode = (a: DiscoveredAuthwit): DecodedCall | undefined => props.decodedAuthwits?.get(a.messageHash)
// A discovered authorization is not in the request's JSON view, so its own row list is the whole disclosure.
const authwitArgs = (a: DiscoveredAuthwit): CallSurface =>
	callSurface(
		undefined,
		{ selector: a.selector, to: a.consumer, args: a.args },
		authwitDecode(a),
		isToken(a.consumer),
		Number.POSITIVE_INFINITY,
	)

const summaryAuthwits = computed(() =>
	authwits.value.kind === "list" ? authwits.value.authwits.map((authwit) => ({ authwit, surface: authwitArgs(authwit) })) : undefined,
)

const detailsOpen = ref(false)
const detailsId = useId()

/** Which discovered authorizations the person closed: once the rows are open, an authorization's
 *  values are open too, so a raw one stays within two presses of the card at rest. */
const closedAuthwits = ref(new Set<string>())
const isAuthwitOpen = (a: DiscoveredAuthwit): boolean => !closedAuthwits.value.has(a.messageHash)
const toggleAuthwit = (a: DiscoveredAuthwit): void => {
	const next = new Set(closedAuthwits.value)
	if (next.has(a.messageHash)) next.delete(a.messageHash)
	else next.add(a.messageHash)
	closedAuthwits.value = next
}

type AdviceSite = { on: "calls" } | { on: "authwit"; index: number }

/** An unreadable grant always refuses its request, so a grant never carries the advice. The fallback
 *  takes an authorization whose details are open, so closing one hands the advice to one still shown.
 *  The bridge builds one operation per window, so once per card is once per window. */
const adviceSite = computed((): AdviceSite | undefined => {
	const op = props.op
	if (props.refused) return undefined
	if (op.kind === "aztec_createAuthWit") {
		const intent = createAuthwitSurface(op.messageHashOrIntent)
		return intent.kind === "call" && intent.args.kind === "raw" ? { on: "calls" } : undefined
	}
	if (op.kind !== "aztec_sendTx") return undefined
	if (sendTxRows.value.some((row) => row.surface.kind === "raw")) return { on: "calls" }
	const index = summaryAuthwits.value?.findLastIndex(({ authwit, surface }) => isAuthwitOpen(authwit) && surface.kind === "raw") ?? -1
	return index < 0 ? undefined : { on: "authwit", index }
})
const adviceOnAuthwit = (index: number): boolean => adviceSite.value?.on === "authwit" && adviceSite.value.index === index
</script>

<template>
	<Flex
		v-if="isSendTx(op)"
		data-testid="execute-op-item"
		:data-op-id="index"
		:data-op-kind="op.kind"
		direction="column"
		:class="$style.op_card"
	>
		<Flex :class="$style.op_body" direction="column" wide>
			<Flex wide justify="between" align="center" gap="8">
				<Text variant="row-title" color="primary" :class="$style.title_size">{{ humanizeOperationKind(op.kind) }}</Text>
			</Flex>
			<Flex
				data-testid="execute-op-from-account"
				:data-account-name="op.account!.name"
				:data-account-address="op.account!.address"
				:class="$style.prop"
			>
				<Text variant="label-section" color="secondary">From account:</Text>
				<Text variant="name" color="primary" :class="$style.name_size">
					{{ op.account!.name }}
					<Text variant="meta" color="secondary" data-testid="execute-op-account">({{ trimAddress(op.account!.address) }})</Text>
				</Text>
			</Flex>
			<!-- send_transaction has actions[]; aztec_sendTx has exec.calls[] -->
			<template v-if="op.kind === 'send_transaction'">
				<Flex :class="$style.prop">
					<Text variant="label-section" color="secondary">Payload:</Text>
					<Flex direction="column" gap="4" :class="$style.payload">
						<OperationActionRow v-for="(action, j) in op.actions" :key="`${index}:${j}`" :action="action" :read="actionReads[j]" hide-args />
					</Flex>
				</Flex>
				<Flex
					v-for="(grant, k) in grantRows"
					:key="`${index}:grant:${k}`"
					data-testid="execute-grant-args"
					direction="column"
					gap="4"
					:class="$style.group"
				>
					<Text variant="label-section" color="secondary">Arguments</Text>
					<CallArguments :surface="grant.surface" :contract="grant.contract" :chainId="op.network?.chainId" :tokens="tokens" prefix="execute-grant" json-view full />
				</Flex>
			</template>
			<template v-else-if="op.kind === 'aztec_sendTx'">
				<SendTxSummary
					:calls="sendTxRows"
					:authwits="summaryAuthwits"
					:checkingAuthwits="authwits.kind === 'pending'"
					:chainId="op.network?.chainId"
					:tokens="tokens"
					:advice="adviceSite?.on === 'calls'"
				/>
				<Flex :class="$style.group">
					<DetailsToggle
						data-testid="execute-op-details-toggle"
						:open="detailsOpen"
						:controls="detailsId"
						:label="detailsOpen ? 'Hide all details' : 'Show all details'"
						@click="detailsOpen = !detailsOpen"
					/>
				</Flex>
				<Flex v-if="detailsOpen" :id="detailsId" data-testid="execute-op-details" direction="column" wide>
					<Flex :class="$style.group"><Text variant="label-section" color="secondary">Payload</Text></Flex>
					<Flex v-for="({ call, surface }, j) in sendTxRows" :key="`${index}:${j}`" :data-call-index="j" direction="column" gap="4" :class="$style.call">
						<Flex
							data-testid="execute-op-payload-row"
							:data-call-name="call.name ?? ''"
							:data-call-to="call.to?.toString() ?? ''"
							:data-intent-kind="surface.kind"
							justify="between"
							align="center"
							:class="[$style.row, $style.call_row]"
						>
							<Text variant="meta" color="primary">{{ rowTitle(call, surface) }}</Text>
							<Text variant="caption" color="secondary">on <AddressDisplay :address="call.to" data-testid="execute-op-call-to" /></Text>
						</Flex>
						<CallArguments :surface="surface" :contract="call.to" :chainId="op.network?.chainId" :tokens="tokens" prefix="execute-op" json-view />
					</Flex>
					<Flex
						v-if="authwits.kind === 'list' && authwits.authwits.length"
						data-testid="execute-op-discovered-authwits"
						direction="column"
						gap="4"
						:class="$style.group"
					>
						<Text variant="label-section" color="secondary">Authorizations the wallet will sign (found during estimation)</Text>
						<!-- The hash in the key remounts a re-estimated row: AddressDisplay reads its address once, at mount. -->
						<Flex
							v-for="(a, k) in authwits.authwits"
							:key="`${k}:${a.messageHash}`"
							data-testid="execute-op-discovered-authwit"
							:data-message-hash="a.messageHash"
							direction="column"
							gap="2"
							:class="$style.structured_args"
						>
							<Flex justify="between" :class="$style.row">
								<Text variant="label-section" color="secondary">Consumer:</Text>
								<AddressDisplay :address="a.consumer" data-testid="execute-discovered-consumer" />
							</Flex>
							<Flex justify="between" :class="$style.row">
								<Text variant="label-section" color="secondary">Authorizes:</Text>
								<AddressDisplay :address="a.caller" data-testid="execute-discovered-caller" />
							</Flex>
							<Flex justify="between" :class="$style.row">
								<Text variant="label-section" color="secondary">Function:</Text>
								<Text variant="meta" color="primary" data-testid="execute-discovered-authwit-function">{{ authwitTitle(a.selector, a.consumer, authwitArgs(a)) }}</Text>
							</Flex>
							<DetailsToggle
								data-testid="execute-discovered-authwit-toggle"
								:open="isAuthwitOpen(a)"
								:controls="`${detailsId}-${k}`"
								:label="isAuthwitOpen(a) ? 'Hide details' : 'Show details'"
								@click="toggleAuthwit(a)"
							/>
							<Flex v-if="isAuthwitOpen(a)" :id="`${detailsId}-${k}`" data-testid="execute-discovered-authwit-details" direction="column" gap="2">
								<CallArguments :surface="authwitArgs(a)" :contract="a.consumer" :chainId="op.network?.chainId" :tokens="tokens" prefix="execute-discovered-authwit" :advice="adviceOnAuthwit(k)" />
								<Flex justify="between" :class="$style.row">
									<Text variant="label-section" color="secondary">Inner hash:</Text>
									<Text variant="meta" color="primary" :title="safeWire(a.innerHash, 80)" data-testid="execute-discovered-inner-hash">{{ trimAddress(safeWire(a.innerHash, 80), 10, 6) }}</Text>
								</Flex>
							</Flex>
						</Flex>
					</Flex>
				</Flex>
			</template>
		</Flex>

		<div :class="$style.op_divider" />

		<!-- A window that only reads the request draws its own fee block in place of the choice. -->
		<slot v-if="$slots.fee" name="fee" />
		<template v-else-if="isEmbeddedFeePayment(op)">
			<Flex
				data-testid="execute-op-fee-set-badge"
				align="start"
				gap="8"
				wide
				:aria-busy="isEstimating && !feeEstimate ? 'true' : undefined"
				:class="$style.op_fee_set"
			>
				<Icon v-if="!privateFeeJuice" name="square-check" size="14" color="green" />
				<Flex direction="column" :class="$style.fee_lines">
					<AppFeeLine v-if="feeEstimate || isEstimating" :feeEstimate="feeEstimate" :privateFeeJuice="privateFeeJuice">
						<Text variant="name" color="primary" :class="$style.name_size" data-testid="execute-op-app-name">{{ appName }}</Text>
					</AppFeeLine>
					<Text v-else variant="body" color="secondary" height="150" data-testid="execute-op-app-legend">
						Fee payment method set by
						<Text variant="name" color="primary" :class="$style.name_size" data-testid="execute-op-app-name">{{ appName }}</Text>
					</Text>
				</Flex>
			</Flex>
			<!-- Mounted with the row: a region created with its text in place may go unannounced. -->
			<div role="status" aria-live="polite" aria-atomic="true" data-testid="execute-op-app-payer-live">
				<Flex
					v-if="!privateFeeJuice && feeEstimate?.appPayerFunding?.funded === false"
					align="start"
					gap="6"
					wide
					:class="$style.op_fee_set"
					data-testid="execute-op-app-payer-short"
				>
					<Icon name="info" size="14" color="primary" aria-hidden="true" />
					<Text variant="body" color="secondary">This app's fee contract may not cover this fee right now.</Text>
				</Flex>
			</div>
			<Flex v-if="privateFeeJuice" align="start" gap="6" wide :class="$style.op_fee_set" data-testid="execute-op-private-fee-notice">
				<Icon name="info" size="14" color="secondary" aria-hidden="true" />
				<Text variant="body" color="secondary">Your Private Fee Juice must cover this fee.</Text>
			</Flex>
		</template>

		<FeeSettingsCard
			v-else
			embedded
			:lockedMethod="requestedMethod(op)"
			:profile="profile"
			:network="op.network"
			:account="op.account"
			:feeEstimate="feeEstimate"
			:isEstimating="isEstimating"
			:isQueued="isQueued"
			:offersQueue="false"
			:modelValue="op.feeSettings"
			@update:modelValue="(value: FeeSettings | undefined) => emit('updateFeeSettings', index, value)"
			@update:payer="(payer: FeePayerPick | null) => emit('updatePayer', index, payer)"
		/>
	</Flex>

	<Flex
		v-else
		data-testid="execute-op-item"
		:data-op-id="index"
		:data-op-kind="op.kind"
		:class="[$style.op_card, $style.op_card_simple]"
		direction="column"
		wide
	>
		<Flex wide justify="between">
			<Text data-testid="execute-op-title" variant="row-title" color="primary" :class="$style.title_size">{{ opTitle(op.kind) }}</Text>
		</Flex>

		<Flex v-if="op.account" :class="$style.prop">
			<Text variant="label-section" color="secondary">From account:</Text>
			<Text variant="name" color="primary" :class="$style.name_size">
				{{ op.account!.name }}
				<Text variant="meta" color="secondary" data-testid="execute-op-account">({{ trimAddress(op.account!.address) }})</Text>
			</Text>
		</Flex>

		<template v-if="op.kind === 'register_contract'">
			<Flex :class="$style.prop">
				<Text variant="label-section" color="secondary">Contract address:</Text>
				<AddressDisplay :address="op.address" data-testid="execute-register-contract-address" />
			</Flex>
		</template>
		<template v-else-if="op.kind === 'register_sender'">
			<Flex :class="$style.prop">
				<Text variant="label-section" color="secondary">Sender address:</Text>
				<AddressDisplay :address="op.address" data-testid="execute-register-sender-address" />
			</Flex>
		</template>
		<template v-else-if="op.kind === 'register_token'">
			<FlaggedTokenBanner v-if="tokenFlagged" :class="$style.flag_banner" />
			<!-- A token's contract chooses its symbol and name, so the address row stays beside them. -->
			<Flex v-if="tokenMetadataLoading || tokenMetadata" direction="column" wide role="status" :aria-busy="tokenMetadataLoading || undefined" data-testid="register-token-details">
				<Flex :class="$style.prop" data-testid="register-token-symbol-row">
					<Text variant="label-section" color="secondary">Symbol:</Text>
					<Skeleton v-if="tokenMetadataLoading" :width="40" :height="12" />
					<Text v-else-if="tokenMetadata" variant="name" color="primary" :class="$style.name_size" data-testid="register-token-symbol">
						{{ safeWireOrDash(tokenMetadata.symbol, 32) }}
					</Text>
				</Flex>
				<Flex :class="$style.prop" data-testid="register-token-name-row">
					<Text variant="label-section" color="secondary">Name:</Text>
					<Skeleton v-if="tokenMetadataLoading" :width="84" :height="12" />
					<Text v-else-if="tokenMetadata" variant="name" color="primary" :class="$style.name_size" data-testid="register-token-name">
						{{ safeWireOrDash(tokenMetadata.name, 64) }}
					</Text>
				</Flex>
				<Flex :class="$style.prop" data-testid="register-token-decimals-row">
					<Text variant="label-section" color="secondary">Decimals:</Text>
					<Skeleton v-if="tokenMetadataLoading" :width="20" :height="12" />
					<Text v-else-if="tokenMetadata" variant="name" color="primary" :class="$style.name_size" data-testid="register-token-decimals">
						{{ tokenMetadata.decimals }}
					</Text>
				</Flex>
			</Flex>
			<Flex v-else-if="tokenMetadataError" :class="$style.group" direction="column" gap="2">
				<Text variant="body" color="orange" data-testid="register-token-meta-error">
					Couldn't resolve token metadata
				</Text>
				<Text variant="body" color="tertiary">Reject this request and ask the app to add the token again.</Text>
			</Flex>

			<Flex :class="$style.prop">
				<Text variant="label-section" color="secondary">Contract address:</Text>
				<AddressDisplay :address="op.address" data-testid="register-token-address" />
			</Flex>
			<Checkbox
				v-if="tokenFlagged"
				:modelValue="tokenFlagAcknowledged === true"
				:class="$style.flag_ack"
				data-testid="register-token-flag-ack"
				@update:modelValue="(on: boolean) => emit('acknowledgeTokenFlag', index, on)"
			>
				<Text variant="body" color="secondary" height="140">I understand Nulo flagged this token as a scam</Text>
			</Checkbox>
		</template>
		<template v-else-if="op.kind === 'simulate_transaction'">
			<Flex :class="$style.prop">
				<Text variant="label-section" color="secondary">Payload:</Text>
				<Flex direction="column" gap="4" :class="$style.payload">
					<OperationActionRow v-for="(action, j) in op.actions" :key="`${index}:${j}`" :action="action" />
				</Flex>
			</Flex>
		</template>
		<template v-else-if="op.kind === 'simulate_utility'">
			<Flex :class="$style.prop">
				<Text variant="label-section" color="secondary">Contract address:</Text>
				<AddressDisplay :address="op.contract" data-testid="execute-utility-contract" />
			</Flex>
			<Flex :class="$style.prop">
				<Text variant="label-section" color="secondary">Function:</Text>
				<Text variant="meta" color="primary">{{ callTitle(safeWire(op.method, 64), wire(op.contract, 80), false) }}</Text>
			</Flex>
		</template>
		<template v-else-if="op.kind === 'aztec_getContractClassMetadata'">
			<Flex :class="$style.prop">
				<Text variant="label-section" color="secondary">Class id:</Text>
				<Text variant="meta" color="primary" data-testid="execute-op-class-id">{{ trimAddress(op.id.toString()) }}</Text>
			</Flex>
		</template>
		<template v-else-if="op.kind === 'aztec_getContractMetadata'">
			<Flex :class="$style.prop">
				<Text variant="label-section" color="secondary">Contract address:</Text>
				<AddressDisplay :address="op.address.toString()" data-testid="execute-contract-metadata-address" />
			</Flex>
		</template>
		<template v-else-if="op.kind === 'aztec_getPrivateEvents'">
			<Flex :class="$style.prop">
				<Text variant="label-section" color="secondary">Contract address:</Text>
				<AddressDisplay :address="op.eventFilter.contractAddress.toString()" data-testid="execute-private-events-contract" />
			</Flex>
		</template>
		<template v-else-if="op.kind === 'aztec_registerSender'">
			<Flex :class="$style.prop">
				<Text variant="label-section" color="secondary">Sender address:</Text>
				<AddressDisplay :address="op.address.toString()" data-testid="execute-sdk-register-sender-address" />
			</Flex>
		</template>
		<template v-else-if="op.kind === 'aztec_simulateTx' || op.kind === 'aztec_profileTx'">
			<Flex :key="op.kind" :class="$style.prop">
				<Text variant="label-section" color="secondary">Payload:</Text>
				<Flex direction="column" gap="4" :class="$style.payload">
					<Text
						v-for="(call, j) in op.exec.calls"
						:key="`${index}:${j}`"
						data-testid="execute-op-payload-row"
						:data-call-name="call.name ?? ''"
						:data-call-to="call.to?.toString() ?? ''"
						variant="body"
						color="primary"
					>
						<Text variant="meta">{{ callTitle(safeWire(call.name ?? call.selector, 64), wire(call.to, 80), false) }}</Text>
						<Text color="secondary"> on </Text>
						<AddressDisplay :address="call.to" data-testid="execute-op-call-to" />
					</Text>
				</Flex>
			</Flex>
		</template>
		<template v-else-if="op.kind === 'aztec_executeUtility'">
			<Flex :class="$style.prop">
				<Text variant="label-section" color="secondary">Contract address:</Text>
				<AddressDisplay :address="op.call.to.toString()" data-testid="execute-utility-call-to" />
			</Flex>
			<Flex :class="$style.prop">
				<Text variant="label-section" color="secondary">Function:</Text>
				<Text variant="meta" color="primary">
					{{ callTitle(safeWire(op.call.name ?? op.call.selector.toString(), 64), wire(op.call.to, 80), false) }}
				</Text>
			</Flex>
		</template>
		<template v-else-if="op.kind === 'aztec_registerContract'">
			<Flex :class="$style.prop">
				<Text variant="label-section" color="secondary">Contract address:</Text>
				<AddressDisplay :address="op.instance.address.toString()" data-testid="execute-register-contract-instance" />
			</Flex>
			<Flex v-if="op.artifact" :class="$style.prop">
				<Text variant="label-section" color="secondary">Artifact:</Text>
				<Text variant="value" color="primary">{{ safeWire(op.artifact.name, 64) || "(custom)" }}</Text>
			</Flex>
		</template>
		<template v-else-if="op.kind === 'aztec_createAuthWit'">
			<template v-for="s in [createAuthwitSurface(op.messageHashOrIntent)]" :key="op.kind">
				<Flex :class="$style.prop">
					<Text variant="label-section" color="secondary">Message type:</Text>
					<Text variant="value" color="primary">{{ s.kind === "hash" ? "Inner hash" : "Call intent" }}</Text>
				</Flex>
				<template v-if="s.kind === 'call'">
					<!-- The delegate is the party this signature lets act as the account; it is the
					     field a phishing intent hides. -->
					<Flex data-testid="execute-authwit-caller" :class="$style.prop">
						<Text variant="label-section" color="secondary">Authorizes:</Text>
						<AddressDisplay :address="s.caller" data-testid="execute-authwit-caller-address" />
					</Flex>
					<Flex :class="$style.prop">
						<Text variant="label-section" color="secondary">Target contract:</Text>
						<AddressDisplay :address="s.to" data-testid="execute-authwit-target" />
					</Flex>
					<Flex :class="$style.prop">
						<Text variant="label-section" color="secondary">Function:</Text>
						<Text variant="meta" color="primary" data-testid="execute-authwit-function">{{ rowTitle(s.call, s.args) }}</Text>
					</Flex>
					<Flex data-testid="execute-authwit-args" direction="column" gap="4" :class="$style.group">
						<Text variant="label-section" color="secondary">Arguments</Text>
						<CallArguments :surface="s.args" :contract="s.to" :chainId="op.network?.chainId" :tokens="tokens" prefix="execute-authwit" json-view :advice="adviceSite?.on === 'calls'" />
					</Flex>
				</template>
				<template v-else>
					<Flex :class="$style.prop">
						<Text variant="label-section" color="secondary">Consumer contract:</Text>
						<AddressDisplay :address="s.consumer" data-testid="execute-authwit-consumer" />
					</Flex>
					<Flex data-testid="execute-authwit-inner-hash" :class="$style.prop">
						<Text variant="label-section" color="secondary">Inner hash:</Text>
						<Text variant="meta" color="primary" :title="s.innerHash" data-testid="execute-authwit-inner-hash-value">{{ trimAddress(s.innerHash, 10, 6) }}</Text>
					</Flex>
					<Flex :class="$style.group">
						<Text variant="body" color="orange" data-testid="execute-authwit-opaque-warning">
							Opaque authorization. The wallet cannot show what this hash authorizes
						</Text>
					</Flex>
				</template>
			</template>
		</template>
	</Flex>
</template>

<style module>
.op_card {
	width: 100%;

	border: 1px solid var(--nulo-border);
	background: transparent;
	overflow: hidden;
}

.op_card_simple {
	padding: 12px;
}

.op_body {
	padding: 12px;
}

.op_divider {
	height: 1px;
	background: var(--nulo-border);
}

.op_fee_set {
	padding: 12px;
	background: var(--nulo-surface-low);
}

.flag_banner {
	margin-top: 12px;
}

.flag_ack {
	margin-top: 16px;
}

/* Sets the first line's text on the icon's centre: 1.5 leading puts 3 px over it. An app's name may
 * be 64 characters with no break in them. */
.fee_lines {
	min-width: 0;
	margin-top: -2px;
	overflow-wrap: anywhere;
}

/* Full width, with no value column of its own: a warning sits here, never in a `.prop`. */
.group {
	width: 100%;
	padding-top: 12px;
}

.call {
	width: 100%;
	padding-top: 8px;
}

.call + .call {
	margin-top: 8px;
	border-top: 1px solid var(--nulo-border);
}

.row {
	width: 100%;
	gap: 12px;

	> :last-child {
		min-width: 0;
		overflow-wrap: anywhere;
		text-align: right;
	}
}

/* A dApp names the call and its contract; a long unbroken name must break inside the card, not push the address out. */
.call_row > * {
	min-width: 0;
	overflow-wrap: anywhere;
}

.payload {
	min-width: 0;
	overflow-wrap: anywhere;
}

.structured_args {
	width: 100%;
}

.title_size {
	font-size: 14px;
}

.name_size {
	font-size: 12px;
}

.prop {
	width: 100%;
	justify-content: space-between;
	padding-top: 12px;

	/* A dApp names the function and the artifact a row shows; a long unbroken name breaks inside the card. */
	> :last-child {
		min-width: 0;
		overflow-wrap: anywhere;
		text-align: right;
	}
}

/* Below the popup's width a value goes under its name, at the right, when the two do not fit side by
 * side: a name breaks only inside a word wider than the card, and a shortened address stays whole. */
@media (width < 359px) {
	.row,
	.prop {
		flex-wrap: wrap;
		column-gap: 12px;
		row-gap: 2px;
	}

	.row > :last-child,
	.prop > :last-child {
		margin-left: auto;
	}

	.call_row > :first-child {
		overflow-wrap: break-word;
	}
}
</style>
