<route lang="json">
{ "meta": { "isAuthRequired": true } }
</route>

<script setup>
/**
 * Received-transfer detail page (`/popup/received/:id`, D5). The receiver-side mirror of the
 * transaction-detail page (`tx/[id].vue`) — same layout system, reversed: an amount hero, a
 * From/To pair, an explorer link at the top, and a Details box. It states the receiver-honest kind
 * (real sender only for pub→pub; "From private" for priv→pub; redacted for note kinds — never the
 * MAGIC/zero sentinel raw) and, for PUBLIC receipts only, the network fee the sender paid.
 *
 * The fee is fetched LAZILY (never persisted) and only for a public receipt: the record carries the
 * block hash the reorg-safe cache needs, and a sender-paid fee is a public-transfer concept.
 *
 * The fee lookup names the transaction to the node, so under privacy mode it runs only on a press of
 * "Show fee". A mode not yet read, unreadable, or lost with the config port counts as on: nothing is
 * looked up without a tap until a read says the mode is off.
 */

/** Components */
import SubPageHeader from "@/components/ui/SubPageHeader.vue"
import AddressCardLink from "@/popup/components/modules/tx/AddressCardLink.vue"

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

/** Utils */
import { DETAIL_TIME_FORMAT } from "../detail-page"
import { balanceFormatted } from "@/utils/amount.js"
import { copyReceivedValue } from "./received-copy"
import { trimAddress } from "@/utils/string"
import { receivedLabel, resolveFromDisplay, resolveReceivedType, tokenForReceipt } from "@/utils/received-display"
import { knownDecimals } from "@/utils/token-amount"
import { getAccountExplorerUrl, getBlockExplorerUrl, getTransactionExplorerUrl, BLOCK_EXPLORERS } from "@/wallet/constants/explorers"
import { formatFeeJuice, feeToUsd, feeJuicePricingFromUsd } from "@/utils/fee-estimation"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

/** Composables */
const { openToast } = useToast()

/** Router */
const route = useRoute()

/** Reactive state */
const received = ref(null)
const loaded = ref(false)
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
const { state: feeState, feeJuice: feeJuiceRaw, load: loadFee, show: showFee, dispose: disposeFee } = useReceiptFee(incomingTransferService)

/** If a reorg/reconcile removes THIS receipt while the page is open, drop to the not-found state rather
 *  than keep showing an orphaned receipt. `deletedIds` tombstones the delete so one that races the initial
 *  load (fired while getIncomingTransferById is still awaiting, when `received` is still null) still wins —
 *  the post-load check in onMounted honors it. An Updated that races the load is held and wins over the
 *  record the load returns, which may predate it; a delete still wins over both. */
const deletedIds = new Set()
let heldUpdate = null
/** Set once the mode's first read settled and the mount looked the fee up: an Updated before then
 *  only replaces the record. */
let feeArmed = false
const onReceiptDeleted = (rec) => {
	deletedIds.add(rec.id)
	if (received.value?.id === rec.id) received.value = null
}
const onReceiptUpdated = (rec) => {
	if (rec.id !== route.params.id || deletedIds.has(rec.id)) return
	if (!loaded.value) {
		heldUpdate = rec
		return
	}
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
	return balanceFormatted(inc.amountRaw, decimals, 8, { compact: true }).value
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
const explorerName = computed(() => BLOCK_EXPLORERS.find((e) => e.id === appStore.defaultExplorer)?.name ?? "explorer")
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
const fromLabelId = useId()
const toLabelId = useId()

/** Derived — fee at today's rate (mirrors tx/[id].vue's fee valuation). */
const feeJuicePricing = computed(() => feeJuicePricingFromUsd(prices.feeJuiceQuote.value?.usd))
const formattedFee = computed(() => (feeJuiceRaw.value ? formatFeeJuice(BigInt(feeJuiceRaw.value)) : null))
const formattedFeeUsd = computed(() => (feeJuiceRaw.value ? feeToUsd(BigInt(feeJuiceRaw.value), feeJuicePricing.value) : null))

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

/** Lifecycle */
onMounted(async () => {
	// The mode read is the page's first request on `config`, so the port it opens is the mount's own.
	const modeSettled = modeRead.read()
	// Resolve the record FIRST; `loaded` gates the not-found state, so flip it as soon as we know.
	received.value = (await incomingTransferService.getIncomingTransferById(route.params.id).catch(() => null)) ?? null
	if (received.value && heldUpdate) received.value = heldUpdate
	// A delete that fired WHILE this load was in flight tombstoned the id — honor it so the just-loaded
	// (now stale) record can't paint over a deletion that already happened.
	if (received.value && deletedIds.has(received.value.id)) received.value = null
	loaded.value = true
	const inc = received.value
	if (!inc) return

	// The record's own chain drives the token catalogue + explorer URL (NOT the active network).
	const net = await networkService.getNetwork(inc.networkId).catch(() => null)
	recordChainId.value = net?.chainId ?? null

	// Aux data loads INDEPENDENTLY (allSettled): a token failure must not skip the fee fetch, and
	// none of these may escape the async mounted hook as an unhandled rejection. The fee is PUBLIC-only
	// (the service also gates on kind server-side) and fails soft to the dash.
	const tasks = []
	// Use the RECORD's profileId (it was already verified == active at load), not the mutable
	// appStore.profile.id, so a concurrent profile switch can't point the token lookup at another profile.
	if (recordChainId.value !== null) {
		tasks.push(tokenService.getTokens(inc.profileId, recordChainId.value).then((t) => (tokens.value = t)))
	}
	tasks.push(
		modeSettled.then(() => {
			feeArmed = true
			if (received.value) return loadFee(received.value, tapOnly.value)
		}),
	)
	await Promise.allSettled(tasks)
})
onBeforeUnmount(() => {
	incomingTransferService.onIncomingTransferDeleted.remove(onReceiptDeleted)
	incomingTransferService.onIncomingTransferUpdated.remove(onReceiptUpdated)
	configService.onUpdate.remove(onConfigUpdate)
	configService.onDisconnected.remove(onConfigDisconnected)
	incomingTransferService.disconnect()
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
				<Flex align="center" justify="center" gap="8" :class="$style.hero_meta">
					<span v-if="receivedTime" :class="$style.tx_time">{{ receivedTime }}</span>
					<span v-if="receivedTime && received.txHash" :class="$style.meta_sep">·</span>
					<a
						v-if="explorerUrl"
						:href="explorerUrl"
						target="_blank"
						rel="noopener noreferrer"
						@click.stop
						:class="$style.hero_link"
					>
						<span>View on {{ explorerName }}</span>
						<Icon name="open" size="10" color="tertiary" />
					</a>
					<span
						v-else-if="received.txHash"
						@click="copy(received.txHash, 'Tx hash')"
						:class="[$style.hero_link, 'copyable']"
					>
						<span>Copy hash</span>
						<Icon name="copy" size="10" color="tertiary" />
					</span>
				</Flex>
			</Flex>

			<Flex v-if="formattedAmount" align="center" direction="column" gap="6">
				<span :class="$style.amount_value">
					+{{ formattedAmount }}
					<span :class="$style.amount_symbol">{{ tokenSymbol }}</span>
				</span>
				<span v-if="amountFiat" title="At today's price" :class="$style.amount_fiat">{{ amountFiat }}</span>
			</Flex>

			<div :class="$style.transfer_type_chip" data-testid="tx-incoming-kind-chip">{{ kindLabel }}</div>

			<Flex wide gap="8">
				<Flex
					wide
					direction="column"
					gap="4"
					:class="[$style.address_card, !fromClickable && $style.card_static]"
					data-testid="received-from-card"
					@click="fromClickable && copy(fromDisplay.address, 'From address')"
				>
					<AddressDisplay
						v-if="fromDisplay.kind === 'address'"
						static
						data-testid="received-from-address"
						lead
						:address="fromDisplay.address"
						:formatter="(addr) => trimAddress(addr, 6, 4)"
					/>
					<Text v-else-if="fromDisplay.kind === 'private'" variant="name" color="primary" :class="$style.from_name" data-testid="from-private">Private</Text>
					<Text v-else-if="fromDisplay.kind === 'mint'" variant="name" color="primary" :class="$style.from_name" data-testid="from-mint">Mint</Text>
					<Text v-else variant="name" color="primary" :class="$style.from_name" data-testid="from-redacted">Private</Text>
					<span :id="fromLabelId" :class="$style.address_label">From</span>
					<AddressCardLink
						v-if="fromUrl"
						:href="fromUrl"
						:label="`View on ${explorerName}`"
						:aria-describedby="fromLabelId"
						data-testid="received-from-explorer-link"
					/>
				</Flex>

				<Flex
					wide
					direction="column"
					gap="4"
					:class="$style.address_card"
					@click="copy(received.accountAddress, 'Account address')"
				>
					<AddressDisplay
						static
						data-testid="received-to-address"
						lead
						:address="received.accountAddress"
						:formatter="(addr) => trimAddress(addr, 6, 4)"
					/>
					<span :id="toLabelId" :class="$style.address_label">To</span>
					<AddressCardLink
						v-if="toUrl"
						:href="toUrl"
						:label="`View on ${explorerName}`"
						:aria-describedby="toLabelId"
						data-testid="received-to-explorer-link"
					/>
				</Flex>
			</Flex>

			<Flex wide direction="column" gap="10">
				<SectionLabel label="Details" />

				<Flex wide direction="column" gap="10" :class="$style.details_box">
					<Flex wide justify="between" align="center" gap="12">
						<span :class="$style.detail_key">Tx hash</span>
						<a
							v-if="explorerUrl"
							:href="explorerUrl"
							target="_blank"
							rel="noopener noreferrer"
							data-testid="tx-explorer-link"
							:class="[$style.detail_value_mono, $style.detail_link]"
							>{{ trimAddress(received.txHash, 6, 4) }}</a
						>
						<span
							v-else
							@click="copy(received.txHash, 'Tx hash')"
							:class="[$style.detail_value_mono, 'copyable']"
							data-testid="tx-hash-copy"
							>{{ trimAddress(received.txHash, 6, 4) }}</span
						>
					</Flex>

					<Flex v-if="isPublic" wide justify="between" align="center" gap="12">
						<Flex direction="column" gap="2">
							<span :class="$style.detail_key">Network fee</span>
							<span :class="$style.detail_key_note">Paid by sender</span>
						</Flex>
						<Flex align="center" gap="6">
							<span v-if="feeState === 'loading'" :class="$style.fee_shimmer" data-testid="received-fee-loading" />
							<template v-else-if="feeState === 'shown' && formattedFee">
								<span :class="$style.detail_value_mono" data-testid="received-fee-value">{{ formattedFee }} FJ</span>
								<span v-if="formattedFeeUsd" :class="$style.detail_value_aux" title="At today's AZTEC price">{{
									formattedFeeUsd
								}}</span>
							</template>
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
								@click="copy(received.blockHash, 'Block hash')"
								:class="[$style.detail_value_aux, 'copyable']"
							>
								{{ trimAddress(received.blockHash, 6, 4) }}
							</span>
						</Flex>
					</Flex>
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

.hero_meta {
	composes: hero_meta from "../detail-page.module.css";
}

.tx_time {
	composes: tx_time from "../detail-page.module.css";
}

.meta_sep {
	composes: meta_sep from "../detail-page.module.css";
}

.hero_link {
	composes: hero_link from "../detail-page.module.css";
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

.address_card {
	composes: address_card from "../detail-page.module.css";
}

/* Outranks shared card rules reintroduced by later-loaded detail chunks. */
.address_card.card_static {
	cursor: default;

	&:hover {
		background: transparent;
	}
}

.address_label {
	composes: caption from "../detail-page.module.css";
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
	composes: type--data from global;
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
	composes: type--data from global;
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
</style>
