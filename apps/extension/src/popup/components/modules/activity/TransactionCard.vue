<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup lang="ts">
/**
 * Settled phase of an activity card. Wraps `TransactionCardLayout` so its
 * field positions match the in-flight phase (`TransactionAwaitingCard`) —
 * title row stays put across the lifecycle; only badge + secondary-row
 * content swap from spinner+status-text to status-icon+hash-and-chips.
 */
/** Vendor */
import type { GlyphName } from "@nulo/design"
import type { PropType } from "vue"

/** Components */
import TransactionCardLayout from "@/components/composite/activity/TransactionCardLayout.vue"

/** Services */
import type { TokenInfo } from "@/wallet/services/token/client"
import { type Tx, TxStatus, TxExecutionResult } from "@/wallet/services/transaction/client"

/** Utils */
import { STATUS_ICON_FILL } from "@/components/composite/activity/status-icon-fill"
import { balanceFormatted } from "@/utils/amount.js"
import { txAmount } from "@/utils/tx-amount"
import { knownDecimals } from "@/utils/token-amount"
import { PriceServiceClient } from "@/wallet/services/price/client"
import { usePrices } from "@/composables/usePrices"
import { getTransactionExplorerUrl } from "@/wallet/constants/explorers"
import { getTxCategory, getTxTitle, getOriginLabel, getPrimaryCall, formatTransferType } from "@/utils/tx-enrichment"

/** Store */
import { useAppStore } from "@/stores/app.store"
const appStore = useAppStore()

const props = defineProps({
	tx: { type: Object as PropType<Tx>, required: true },
	/** The profile and chain's tokens: a mint shows an amount only for a token in this list, and a
	 *  transfer none for a listed token whose decimals the wallet does not know. */
	tokens: { type: Array as PropType<TokenInfo[]>, default: () => [] },
	/** The route the row opens. */
	to: { type: String, default: undefined },
})

const call = computed(() => getPrimaryCall(props.tx.calls))
const type = computed(() => getTxCategory(props.tx.calls))
const transfer = computed(() => (call.value?.transfers ? call.value.transfers[0] : null))
const amount = computed(() => txAmount(props.tx.calls, props.tokens))
/** The record's decimals are no better than a guess while the wallet's token for the contract has
 *  none it knows; a mint's amount already requires known ones. */
const figureUnknown = computed(() => {
	const listed = props.tokens.find((t) => t.contract === call.value?.contract)
	return listed !== undefined && knownDecimals(listed) === null
})

const icon = computed<GlyphName>(() => {
	if (type.value === "transfer") return "send"
	if (type.value === "mint") return "faucet"
	return "zap"
})

const isMined = computed(() => {
	const s = props.tx.status
	return s === TxStatus.Proposed || s === TxStatus.Checkpointed || s === TxStatus.Proven || s === TxStatus.Finalized
})
const isPending = computed(() => props.tx.status === TxStatus.Pending)
const isDropped = computed(() => props.tx.status === TxStatus.Dropped)
const isReverted = computed(
	() => isMined.value && props.tx.executionResult !== undefined && props.tx.executionResult !== TxExecutionResult.Success,
)
const isSuccess = computed(() => isMined.value && !isReverted.value)

const statusIcon = computed<GlyphName>(() => {
	if (isReverted.value || isDropped.value) return "square-cross"
	if (isSuccess.value) return "square-check"
	return "square-half"
})

const statusColor = computed(() => {
	if (isReverted.value || isDropped.value) return "red"
	if (isSuccess.value) return "green"
	return "gray"
})

/**
 * User-visible status string mirroring the status-icon state machine.
 * Bound as `data-tx-status` on the card root so e2e tests synchronize on
 * the same fact the user sees (the green/red/clock icon). "confirmed"
 * here means first-mined (Proposed | Checkpointed | Proven | Finalized),
 * which matches when the green check appears — NOT on-chain finality.
 * Explicit "unknown" fallthrough because Vue omits attribute bindings
 * whose value is undefined, which would make a missing attribute
 * indistinguishable from a real state in test selectors.
 */
const txStatusAttr = computed(() => {
	if (isPending.value) return "pending"
	if (isSuccess.value) return "confirmed"
	if (isReverted.value || isDropped.value) return "failed"
	return "unknown"
})

const title = computed(() => {
	if (type.value === "transfer" && amount.value?.symbol) return amount.value.symbol
	return getTxTitle(props.tx.calls)
})

const transferTypeLabel = computed(() => {
	if (type.value === "transfer" && transfer.value) return formatTransferType(transfer.value.type)
	return null
})

const originLabel = computed(() => getOriginLabel(props.tx.origin))
/** A dApp's call with no direction is titled by the function it called. */
const oneLineTitle = computed(() => Boolean(originLabel.value) && !transferTypeLabel.value)
const hashSlice = computed(() => {
	if (!props.tx.hash) return null
	return `${props.tx.hash.slice(0, 4)}...${props.tx.hash.slice(-4)}`
})

const explorerUrl = computed(() => {
	if (!appStore.network?.chainId) return null

	return getTransactionExplorerUrl(appStore.network.chainId, appStore.defaultExplorer, props.tx.hash)
})

const amountStr = computed(() =>
	amount.value && !figureUnknown.value ? balanceFormatted(amount.value.units, amount.value.decimals, 8, { compact: true }).value : null,
)
const displayAmountSymbol = computed(() => amount.value?.symbol || null)

/** Fiat under the amount for priced transfer rows, at today's rate. */
const priceService = new PriceServiceClient()
const prices = usePrices(priceService)
const amountFiat = computed(() => {
	if (type.value !== "transfer" || !amount.value || figureUnknown.value || !call.value?.contract) return null
	// The fiat follows the decimals the amount above is shown in.
	const label = prices.tokenFiatLabel(
		{ chainId: appStore.network?.chainId, contract: call.value.contract, decimals: amount.value.decimals, hasDecimals: true },
		amount.value.units,
	)
	return label ?? null
})
onBeforeUnmount(() => {
	prices.dispose()
	priceService.disconnect()
})
</script>

<template>
	<TransactionCardLayout
		:title="title"
		:icon="icon"
		:amount="amountStr"
		:amountSymbol="displayAmountSymbol"
		:amountFiat="amountFiat"
		:to="to"
		testId="tx-card"
		:txAmountDisplay="amountStr"
		:txTransferTypeLabel="transferTypeLabel"
		:txStatus="txStatusAttr"
		:txHash="props.tx.hash"
		:oneLineTitle="oneLineTitle"
	>
		<template #badge>
			<Icon :name="statusIcon" size="12" :color="STATUS_ICON_FILL[statusColor]" :class="$style.status_icon" data-testid="activity-status-icon" />
		</template>

		<template v-if="transferTypeLabel || originLabel" #title-trailing>
			<!-- Chip stays in the title row across the lifecycle so it
			     doesn't visually jump when the tx confirms. The dot is a
			     subtle visual separator so "USDC" and "Private → Public"
			     don't read as one continuous string.
			     For the settled card the two labels are INDEPENDENT (not
			     mutually exclusive like on the journal-driven awaiting /
			     terminal cards): `transferTypeLabel` is derived from the
			     call shape and `originLabel` from `tx.origin`. A
			     dApp-initiated transfer sets both — render both so the
			     dApp identity isn't silently dropped. -->
			<span :class="$style.title_sep">·</span>
			<span v-if="transferTypeLabel && originLabel" :class="$style.chips">
				<span :class="$style.chip">{{ transferTypeLabel }}</span>
				<span :class="$style.app_chip" data-testid="activity-app-chip">{{ originLabel }}</span>
			</span>
			<span v-else-if="transferTypeLabel" :class="$style.chip">{{ transferTypeLabel }}</span>
			<span v-else :class="$style.app_chip" data-testid="activity-app-chip">{{ originLabel }}</span>
		</template>

		<template #secondary>
			<span v-if="hashSlice && explorerUrl" :class="$style.hash_group">
				<span data-testid="activity-row-hash" :class="$style.hash">{{ hashSlice }}</span>
				<RowAction :href="explorerUrl" label="Open in block explorer" data-testid="activity-row-explorer" :class="$style.explorer">
					<Icon name="open" size="10" color="tertiary" />
				</RowAction>
			</span>
			<span v-else-if="hashSlice" data-testid="activity-row-hash" :class="$style.hash">{{ hashSlice }}</span>
		</template>
	</TransactionCardLayout>
</template>

<style module>
.status_icon {
	/* Inherits the absolute-positioned badge wrapper from TransactionCardLayout */
}

/* Inline group so the explorer link rides immediately after the hash slice,
 * not as a separate flex item. Gap is tighter than the secondary row's so
 * the icon visually attaches to the hash. */
.hash_group {
	display: inline-flex;
	align-items: center;
	gap: 4px;
}

.hash {
	composes: type--meta from global;
	color: var(--nulo-secondary);
}

.title_sep {
	composes: title_sep from "../../../../components/composite/activity/activity-card.module.css";
}

.chip {
	composes: type--label-section from global;
	color: var(--nulo-secondary);
	background: var(--nulo-surface-low);
	border: 1px solid var(--hairline-soft);
	padding: 1px 4px;
}

.app_chip {
	composes: app_chip from "../../../../components/composite/activity/activity-card.module.css";
}

/* The direction and the app do not fit one line beside a symbol and an amount: the app wraps under. */
.chips {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 4px 6px;
}

/* The 24px box overhangs the 14px secondary row and the 10px glyph, so the row keeps its rhythm. */
.explorer {
	margin: -5px -7px;
}
</style>
