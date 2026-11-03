<route lang="json">
{ "meta": { "isAuthRequired": true } }
</route>

<script setup>
/**
 * Received-transfer detail page (`/popup/received/:id`), the receiver-side mirror of `tx/[id].vue`.
 * It states the receiver-honest kind
 * (real sender only for pub→pub; "From private" for priv→pub; redacted for note kinds — never the
 * MAGIC/zero sentinel raw) and, for PUBLIC receipts only, the network fee the sender paid.
 *
 * The fee is fetched LAZILY (never persisted) and only for a public receipt: the record carries the
 * block hash the reorg-safe cache needs, and a sender-paid fee is a public-transfer concept.
 *
 * The fee lookup names the transaction to the node, so under privacy mode it runs only on a press of
 * "Show fee". A mode not yet read, unreadable, or lost with the config port counts as on: nothing is
 * looked up without a tap until a read says the mode is off.
 *
 * A push to another receipt's link reuses this instance, so the shown receipt is cleared before the
 * next one is read. A failed receipt read never reads as "not found": one the worker's restart dropped
 * reads again on the reconnect, and any other, with nothing yet on screen, offers Retry.
 */

/** Components */
import SubPageHeader from "@/components/ui/SubPageHeader.vue"
import DetailAddressCard from "@/popup/components/modules/tx/DetailAddressCard.vue"
import DetailHeroMeta from "@/popup/components/modules/tx/DetailHeroMeta.vue"
import TxHashRow from "@/popup/components/modules/tx/TxHashRow.vue"
import FeeAmount from "@/components/composite/FeeAmount.vue"

/** Vendor */
import { DateTime } from "luxon"

/** Services */
import { IncomingTransferServiceClient } from "@/wallet/services/incoming-transfer/client"
import { TokenServiceClient } from "@/wallet/services/token/client"
import { ConfigServiceClient } from "@/wallet/services/config/client"
import { PriceServiceClient } from "@/wallet/services/price/client"
import { NetworkServiceClient } from "@/wallet/services/network/client"

/** Composables */
import { useToast } from "@/composables/toast"
import { usePrices } from "@/composables/usePrices"
import { useConfigRead } from "@/composables/useConfigRead"
import { useReceiptFee } from "@/composables/useReceiptFee"
import { createReconnectRead } from "@/composables/reconnectRead"

/** Utils */
import { isClientDisconnectRejection, RpcDisconnectedError } from "@nulo/extension-messaging/errors"
import { DETAIL_AMOUNT_LENGTH, DETAIL_TIME_FORMAT } from "../detail-page"
import { balanceFormatted } from "@/utils/amount.js"
import { copyReceivedValue } from "./received-copy"
import { endsSelection } from "@/utils/selection"
import { trimAddress } from "@/utils/string"
import { receivedLabel, resolveFromDisplay, resolveReceivedType, tokenForReceipt } from "@/utils/received-display"
import { knownDecimals } from "@/utils/token-amount"
import { explorerDisplayName, getAccountExplorerUrl, getBlockExplorerUrl, getTransactionExplorerUrl } from "@/wallet/constants/explorers"
import { feeDisplay } from "@/utils/fee-estimation"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

/** Composables */
const { openToast } = useToast()

/** Router */
const route = useRoute()

/** Reactive state */
const received = ref(null)
/** A read of this route's receipt resolved: with no receipt shown, "not found" holds. */
const loaded = ref(false)
/** The newest receipt read failed with nothing on screen, on a port that stayed up: no reconnect
 *  follows to read again. */
const readFailed = ref(false)
const tokens = ref([])
/** The RECORD's own chainId (resolved from its networkId) — NOT the active network's. Token
 *  decimals/symbol + the explorer URL must follow the record, so a deep-linked or off-network record
 *  (or a network switch after open) can't show the wrong chain's catalogue/explorer. */
const recordChainId = ref(null)

/** `null` until a read lands, and again from a lost config port until the reconnect's read lands. */
const privacyMode = ref(null)
const tapOnly = computed(() => privacyMode.value !== false)

/** Service clients */
const incomingTransferService = new IncomingTransferServiceClient()
const tokenService = new TokenServiceClient()
const configService = new ConfigServiceClient()
const priceService = new PriceServiceClient()
const networkService = new NetworkServiceClient()
const prices = usePrices(priceService)
const modeRead = useConfigRead(configService, () => configService.getValue("privacyMode"), landPrivacyMode)
const {
	state: feeState,
	feeJuice: feeJuiceRaw,
	load: loadFee,
	show: showFee,
	reset: resetFee,
	dispose: disposeFee,
} = useReceiptFee(incomingTransferService)
const receiptRead = createReconnectRead(incomingTransferService, readReceipt)

/** The mount's mode read; a landed receipt's fee waits for it. */
let modeSettled = null
/** Set once the shown receipt's fee was looked up: an Updated before then only replaces the record. */
let feeArmed = false
/** The route's events while the newest run's receipt read is in flight. The read's snapshot may
 *  predate them, so it yields to the last: an Updated replaces a found receipt, a Deleted wins. */
let eventsDuringRead = null
function onReceiptDeleted(rec) {
	if (rec.id !== route.params.id) return
	if (eventsDuringRead) eventsDuringRead.last = { deleted: true }
	if (received.value?.id === rec.id) received.value = null
}
function onReceiptUpdated(rec) {
	if (rec.id !== route.params.id) return
	if (eventsDuringRead) eventsDuringRead.last = { record: rec }
	if (received.value?.id !== rec.id) return
	received.value = rec
	if (feeArmed) void loadFee(rec, tapOnly.value)
}
incomingTransferService.onIncomingTransferDeleted.add(onReceiptDeleted)
incomingTransferService.onIncomingTransferUpdated.add(onReceiptUpdated)
configService.onUpdate.add(onConfigUpdate)
configService.onDisconnected.add(onConfigDisconnected)

/** Derived — token + amount */
const token = computed(() => (received.value ? tokenForReceipt(tokens.value, received.value) : undefined))
const tokenSymbol = computed(() => token.value?.symbol || "Token")
const formattedAmount = computed(() => {
	const inc = received.value
	const decimals = knownDecimals(token.value)
	if (!inc || decimals === null) return null
	return balanceFormatted(inc.amountRaw, decimals, DETAIL_AMOUNT_LENGTH, { compact: true }).value
})
const amountFiat = computed(() => {
	const inc = received.value
	if (!inc || !token.value) return null
	return prices.tokenFiatLabel(token.value, BigInt(inc.amountRaw || 0)) ?? null
})

/** Derived — sender / kind */
const kindLabel = computed(() => (received.value ? receivedLabel(resolveReceivedType(received.value)) : ""))
const fromDisplay = computed(() => (received.value ? resolveFromDisplay(received.value) : { kind: "redacted" }))
const fromClickable = computed(() => fromDisplay.value.kind === "address")
const isPublic = computed(() => received.value?.kind === "public-event")

/** Derived — meta / explorer */
const receivedTime = computed(() => {
	const inc = received.value
	if (!inc) return null
	if (inc.blockTimestamp) return DateTime.fromSeconds(inc.blockTimestamp).toFormat(DETAIL_TIME_FORMAT)
	if (inc.discoveredAt) return DateTime.fromMillis(inc.discoveredAt).toFormat(DETAIL_TIME_FORMAT)
	return null
})
const explorerUrl = computed(() => {
	const inc = received.value
	if (!inc) return null
	return getTransactionExplorerUrl(recordChainId.value ?? undefined, appStore.defaultExplorer, inc.txHash)
})
const explorerName = computed(() => explorerDisplayName(appStore.defaultExplorer))
/** A public receipt's hash names the block the wallet saw, whatever a re-mine did at its height;
 *  a note carries only the height. */
const blockUrl = computed(() => {
	const inc = received.value
	if (!inc?.l2BlockNumber) return null
	return getBlockExplorerUrl(recordChainId.value, appStore.defaultExplorer, isPublic.value ? inc.blockHash : inc.l2BlockNumber)
})
const fromUrl = computed(() =>
	fromClickable.value ? getAccountExplorerUrl(recordChainId.value, appStore.defaultExplorer, fromDisplay.value.address) : null,
)
const toUrl = computed(() =>
	received.value ? getAccountExplorerUrl(recordChainId.value, appStore.defaultExplorer, received.value.accountAddress) : null,
)

/** Derived — fee at today's rate (mirrors tx/[id].vue's fee valuation). */
const fee = computed(() => (feeJuiceRaw.value ? feeDisplay(feeJuiceRaw.value, prices.feeJuiceQuote.value?.usd) : null))

/** Handlers */
const copy = async (value, label) => {
	await copyReceivedValue(value, label, openToast)
}

/** A value other than a boolean keeps the mode unknown, which counts as on. */
function landPrivacyMode(value, updatedSince) {
	if (!updatedSince("privacyMode")) privacyMode.value = typeof value === "boolean" ? value : null
}

function onConfigUpdate(prop) {
	if (prop.key === "privacyMode") privacyMode.value = typeof prop.value === "boolean" ? prop.value : null
}

/** Updates sent while the port is down are lost, so the last answer no longer holds. */
function onConfigDisconnected() {
	privacyMode.value = null
}

/** The worker dropped the port: the client reconnects, and its `onConnected` reads again. */
function portDropped(error) {
	return isClientDisconnectRejection(error) || error instanceof RpcDisconnectedError
}

/** The fee is cached per block, and a re-mine moves it. An armed row for the same block keeps its fee,
 *  its tap or its lookup in flight; one whose lookup failed looks again. */
function sameBlock(shown, next) {
	return Boolean(shown && next && shown.id === next.id && shown.blockHash === next.blockHash)
}

/** One run of the receipt read: resolves `false` when a read failed, so the next connect reads again. */
async function readReceipt(isCurrent) {
	const events = { last: null }
	eventsDuringRead = events
	readFailed.value = false
	const outcome = await incomingTransferService.getIncomingTransferById(route.params.id).then(
		(record) => ({ record: record ?? null }),
		(error) => ({ error }),
	)
	if (eventsDuringRead === events) eventsDuringRead = null
	if (!isCurrent()) return true
	if ("error" in outcome) {
		if (!received.value && !loaded.value && !portDropped(outcome.error)) readFailed.value = true
		return false
	}
	const last = events.last
	const record = last?.deleted ? null : outcome.record && (last?.record ?? outcome.record)
	const keepFee = feeArmed && feeState.value !== "none" && sameBlock(received.value, record)
	if (!keepFee) {
		feeArmed = false
		resetFee()
	}
	received.value = record
	loaded.value = true
	return record ? loadDetails(record, isCurrent, keepFee) : true
}

/** The receipt's own chain drives its token catalogue and explorer links, never the active network's.
 *  A failed network or token read keeps what the page has and resolves `false`; neither skips the fee. */
async function loadDetails(record, isCurrent, keepFee) {
	const network = await networkService.getNetwork(record.networkId).then(
		(net) => ({ chainId: net?.chainId ?? null }),
		() => null,
	)
	if (!isCurrent()) return true
	if (network) recordChainId.value = network.chainId
	// Not awaited: the lookup may wait for the incoming port to reopen, and that reopening reads again
	// only if this run has already reported its failure.
	if (!keepFee) void modeSettled.then(() => armFee(isCurrent))
	if (recordChainId.value === null) return network !== null
	// The record's profile, which the service matched to the active one, not the mutable store's.
	const list = await tokenService.getTokens(record.profileId, recordChainId.value).then(
		(t) => t,
		() => null,
	)
	if (!isCurrent()) return true
	if (list) tokens.value = list
	return network !== null && list !== null
}

function armFee(isCurrent) {
	if (!isCurrent()) return
	feeArmed = true
	if (received.value) void loadFee(received.value, tapOnly.value)
}

function retryReceipt() {
	void receiptRead.read()
}

/** Watchers */
// The default `pre` flush clears A before B renders, and leaving the route unmounts the page before
// this could read another route's id.
watch(
	() => route.params.id,
	() => {
		received.value = null
		loaded.value = false
		readFailed.value = false
		recordChainId.value = null
		tokens.value = []
		feeArmed = false
		resetFee()
		void receiptRead.read()
	},
)

/** Lifecycle */
onMounted(() => {
	// The mode read is the page's first request on `config`, so the port it opens is the mount's own.
	modeSettled = modeRead.read()
	void receiptRead.read()
})
onBeforeUnmount(() => {
	incomingTransferService.onIncomingTransferDeleted.remove(onReceiptDeleted)
	incomingTransferService.onIncomingTransferUpdated.remove(onReceiptUpdated)
	configService.onUpdate.remove(onConfigUpdate)
	configService.onDisconnected.remove(onConfigDisconnected)
	incomingTransferService.disconnect()
	receiptRead.dispose()
	disposeFee()
	tokenService.disconnect()
	configService.disconnect()
	modeRead.dispose()
	networkService.disconnect()
	prices.dispose()
	priceService.disconnect()
})
</script>

<template>
	<Flex direction="column" :class="$style.wrapper" data-testid="received-detail-page">
		<SubPageHeader title="Received" backTo="/popup/activity" />

		<Flex v-if="received" wide direction="column" gap="24" :class="$style.content">
			<Flex direction="column" align="center" gap="10">
				<DetailHeroMeta
					:time="receivedTime"
					:explorerUrl="explorerUrl"
					:explorerName="explorerName"
					:hash="received.txHash"
					@copy="copy($event, 'Tx hash')"
				/>
			</Flex>

			<Flex v-if="formattedAmount" align="center" direction="column" gap="6">
				<span :class="$style.amount_value">
					+{{ formattedAmount }}
					<span :class="$style.amount_symbol">{{ tokenSymbol }}</span>
				</span>
				<span v-if="amountFiat" title="At today's price" :class="$style.amount_fiat">{{ amountFiat }}</span>
			</Flex>

			<div :class="$style.transfer_type_chip" data-testid="tx-incoming-kind-chip">{{ kindLabel }}</div>

			<Flex wide gap="8" :class="$style.address_pair">
				<DetailAddressCard
					label="From"
					:address="fromDisplay.address"
					addressTestid="received-from-address"
					:explorerUrl="fromUrl"
					:explorerName="explorerName"
					linkTestid="received-from-explorer-link"
					data-testid="received-from-card"
					@copy="(address) => copy(address, 'From address')"
				>
					<Text v-if="fromDisplay.kind === 'private'" variant="name" color="primary" :class="$style.from_name" data-testid="from-private">Private</Text>
					<Text v-else-if="fromDisplay.kind === 'mint'" variant="name" color="primary" :class="$style.from_name" data-testid="from-mint">Mint</Text>
					<Text v-else variant="name" color="primary" :class="$style.from_name" data-testid="from-redacted">Private</Text>
				</DetailAddressCard>
				<DetailAddressCard
					label="To"
					:address="received.accountAddress"
					addressTestid="received-to-address"
					:explorerUrl="toUrl"
					:explorerName="explorerName"
					linkTestid="received-to-explorer-link"
					@copy="(address) => copy(address, 'Account address')"
				/>
			</Flex>

			<Flex wide direction="column" gap="10">
				<SectionLabel label="Details" />

				<Flex wide direction="column" gap="10" :class="$style.details_box">
					<TxHashRow
						:hash="received.txHash"
						:explorerUrl="explorerUrl"
						linkTestid="tx-explorer-link"
						copyTestid="tx-hash-copy"
						@copy="(hash) => copy(hash, 'Tx hash')"
					/>

					<Flex v-if="isPublic" wide justify="between" align="center" gap="12">
						<Flex direction="column" gap="2">
							<span :class="$style.detail_key">Network fee</span>
							<span :class="$style.detail_key_note">Paid by sender</span>
						</Flex>
						<Flex align="center" gap="6">
							<span v-if="feeState === 'loading'" :class="$style.fee_shimmer" data-testid="received-fee-loading" />
							<FeeAmount
								v-else-if="feeState === 'shown' && fee"
								:display="fee"
								:class="$style.detail_value_mono"
								:usdClass="$style.detail_value_aux"
								data-testid="received-fee-value"
							/>
							<button
								v-else-if="feeState === 'tap'"
								type="button"
								:class="$style.fee_show"
								data-testid="received-fee-show"
								@click="showFee"
							>
								Show fee
							</button>
							<span v-else :class="$style.detail_value_aux" data-testid="received-fee-none">—</span>
						</Flex>
					</Flex>

					<Flex v-if="received.l2BlockNumber" wide justify="between" align="center">
						<span :class="$style.detail_key">Block</span>
						<Flex align="center" gap="6">
							<a
								v-if="blockUrl && !isPublic"
								:href="blockUrl"
								target="_blank"
								rel="noopener noreferrer"
								data-testid="received-block-link"
								:class="[$style.detail_value_mono, $style.detail_link]"
								>#{{ received.l2BlockNumber }}</a
							>
							<span v-else :class="$style.detail_value_mono">#{{ received.l2BlockNumber }}</span>
							<a
								v-if="blockUrl && isPublic"
								:href="blockUrl"
								target="_blank"
								rel="noopener noreferrer"
								data-testid="received-block-link"
								:class="[$style.detail_value_aux, $style.detail_link]"
								>{{ trimAddress(received.blockHash, 6, 4) }}</a
							>
							<span
								v-else-if="isPublic"
								data-testid="tx-block-hash"
								@click="endsSelection($event) || copy(received.blockHash, 'Block hash')"
								:class="[$style.detail_value_aux, 'copyable']"
							>
								{{ trimAddress(received.blockHash, 6, 4) }}
							</span>
						</Flex>
					</Flex>
				</Flex>
			</Flex>
		</Flex>

		<Flex v-else-if="readFailed" wide direction="column" :class="$style.content" data-testid="received-read-failed">
			<Flex direction="column" align="center" gap="12" :class="$style.failed_banner">
				<Icon name="history" :size="32" color="secondary" />
				<span :class="$style.failed_title">Couldn't load this receipt</span>
				<span :class="$style.failed_description">Try again, or open History to find it there.</span>
				<Flex wide gap="10" :class="$style.failed_actions">
					<Button wide variant="primary" size="medium" data-testid="received-retry" @click="retryReceipt">Retry</Button>
					<Button wide variant="primary_outline" size="medium" link="/popup/activity" data-testid="received-open-history"
						>Open History</Button
					>
				</Flex>
			</Flex>
		</Flex>

		<Flex v-else-if="loaded" wide direction="column" align="center" gap="12" :class="$style.content">
			<span :class="$style.empty_headline">RECEIPT NOT FOUND</span>
			<span :class="$style.empty_sub">This receipt isn't in your current account history.</span>
		</Flex>
	</Flex>
</template>

<style module>
.wrapper {
	composes: wrapper from "../detail-page.module.css";
}

.content {
	composes: content from "../detail-page.module.css";
}

.amount_value {
	composes: amount_value from "../detail-page.module.css";
}

.amount_symbol {
	composes: amount_symbol from "../detail-page.module.css";
}

.amount_fiat {
	composes: amount_fiat from "../detail-page.module.css";
}

.transfer_type_chip {
	composes: type_chip from "../detail-page.module.css";
}

.address_pair {
	composes: address_pair from "../detail-page.module.css";
}

.from_name {
	font-size: 13px;
}

.details_box {
	composes: details_box from "../detail-page.module.css";
}

.detail_key {
	composes: detail_key from "../detail-page.module.css";
}

.detail_key_note {
	composes: type--meta from global;
	color: var(--nulo-secondary);
}

.detail_value_mono {
	composes: type--meta from global;
	color: var(--txt-primary);
}

.detail_value_aux {
	composes: type--meta from global;
	color: var(--nulo-secondary);
}

.detail_link {
	composes: detail_link from "../detail-page.module.css";
}

.fee_show {
	composes: type--meta from global;
	padding: 0;
	border: 0;
	background: none;
	color: var(--txt-primary);
	cursor: pointer;
	transition: color 0.2s var(--bezier);

	&:hover {
		color: var(--nulo-accent);
	}

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: 2px;
	}
}

.fee_shimmer {
	width: 64px;
	height: 12px;

	background: linear-gradient(
		90deg,
		var(--nulo-surface-low) 25%,
		var(--nulo-surface-high) 50%,
		var(--nulo-surface-low) 75%
	);
	background-size: 200% 100%;

	animation: fee_shimmer_slide 1.4s var(--bezier) infinite;
}

@keyframes fee_shimmer_slide {
	0% {
		background-position: 200% 0;
	}
	100% {
		background-position: -200% 0;
	}
}

@media (prefers-reduced-motion: reduce) {
	.fee_shimmer {
		animation: none;
	}
}

:global(.noanimations) .fee_shimmer {
	animation: none;
}

.empty_headline {
	composes: empty_headline from "../detail-page.module.css";
}

.empty_sub {
	composes: empty_sub from "../detail-page.module.css";
}

.failed_banner {
	composes: banner from "../empty-state.module.css";
}

.failed_title {
	composes: title from "../empty-state.module.css";
	color: var(--txt-danger);
}

.failed_description {
	composes: description from "../empty-state.module.css";
}

.failed_actions {
	margin-top: 8px;
}
</style>
