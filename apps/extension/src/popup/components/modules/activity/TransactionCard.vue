<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup lang="ts">
/**
 * Settled phase of an activity card. Wraps `TransactionCardLayout` so its
 * field positions match the in-flight phase (`TransactionAwaitingCard`) —
 * title row and icon box stay put across the lifecycle; only badge + secondary-row
 * content swap from spinner+status-text to status-icon+hash.
 */
/** Vendor */
import type { GlyphName } from "@nulo/design"
import { sameFieldAddress } from "@nulo/wallet-bridge"
import type { PropType } from "vue"

/** Components */
import TransactionCardLayout from "@/components/composite/activity/TransactionCardLayout.vue"

/** Services */
import type { TokenInfo } from "@/wallet/services/token/client"
import { type Tx, TxStatus, TxExecutionResult } from "@/wallet/services/transaction/client"

/** Utils */
import { STATUS_ICON_FILL } from "@/components/composite/activity/status-icon-fill"
import { formatListAmount } from "@/utils/amount.js"
import { ROW_AMOUNT_LENGTH } from "@/utils/snack-amount"
import { txAmount } from "@/utils/tx-amount"
import { dashIfBlank } from "@/utils/string"
import { knownDecimals } from "@/utils/token-amount"
import { PriceServiceClient } from "@/wallet/services/price/client"
import { usePrices } from "@/composables/usePrices"
import { getTransactionExplorerUrl } from "@/wallet/constants/explorers"
import { getTxCategory, getTxTitle, getOriginLabel, getPrimaryCall, transferDirection } from "@/utils/tx-enrichment"

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
const type = computed(() => getTxCategory(props.tx.calls, props.tokens))
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
	if (type.value === "transfer" && amount.value?.symbol) return dashIfBlank(amount.value.symbol)
	return getTxTitle(props.tx.calls, props.tokens)
})

const isTransfer = computed(() => type.value === "transfer" && Boolean(transfer.value))
/** A transfer that lands on its sender's own account is a move between its sides. */
const direction = computed(() => {
	const t = transfer.value
	return isTransfer.value && t ? transferDirection(t.type, sameFieldAddress(t.from, t.to)) : null
})

const originLabel = computed(() => getOriginLabel(props.tx.origin))
/** The empty inline that leads the slot's chip keeps a space after it from collapsing, as a line's
 *  first space does in every other chip. */
const slotLabel = computed(() => originLabel.value?.replace(/^[\t\n\f\r ]+/, ""))
/** A dApp's call with no direction is titled by the function it called. */
const oneLineTitle = computed(() => Boolean(originLabel.value) && !isTransfer.value)
const hashSlice = computed(() => {
	if (!props.tx.hash) return null
	return `${props.tx.hash.slice(0, 4)}...${props.tx.hash.slice(-4)}`
})

const explorerUrl = computed(() => {
	if (!appStore.network?.chainId) return null

	return getTransactionExplorerUrl(appStore.network.chainId, appStore.defaultExplorer, props.tx.hash)
})

const amountStr = computed(() =>
	amount.value && !figureUnknown.value ? formatListAmount(amount.value.units, amount.value.decimals, ROW_AMOUNT_LENGTH) : null,
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
		:txTransferTypeLabel="direction?.label ?? null"
		:txStatus="txStatusAttr"
		:txHash="props.tx.hash"
		:oneLineTitle="oneLineTitle"
		:direction="direction"
	>
		<template #badge>
			<Icon :name="statusIcon" size="12" :color="STATUS_ICON_FILL[statusColor]" :class="$style.status_icon" data-testid="activity-status-icon" />
		</template>

		<template v-if="originLabel" #title-trailing>
			<span :class="$style.title_sep" data-testid="activity-title-sep">·</span>
			<!-- A transfer's symbol is never cut, so its app chip gives way, down to its floor. -->
			<span v-if="isTransfer" :class="$style.app_slot">
				<span :class="$style.app_chip" data-testid="activity-app-chip">{{ slotLabel }}</span>
			</span>
			<span v-else :class="$style.app_chip" data-testid="activity-app-chip">{{ originLabel }}</span>
		</template>

		<template #secondary>
			<span v-if="direction" :class="$style.direction" data-testid="activity-direction-chip">{{ direction.label }}</span>
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

.direction {
	composes: visually_hidden from "../../../../components/composite/activity/activity-card.module.css";
}

.app_chip {
	composes: app_chip from "../../../../components/composite/activity/activity-card.module.css";
}

/* The slot takes the room the title leaves and the chip inside hugs its name up to its cap. Its floor
 * is the chip's border, padding and one whole "…" at the chip's 11px, so the chip never draws empty. */
.app_slot {
	display: flex;
	flex: 1 1 0;
	min-width: 20px;
}

/* Below the shared cap in this row only; two classes outrank the shared chip's `flex-shrink: 0`. */
.app_slot > .app_chip {
	flex-shrink: 1;
}

/* A line's first character is clipped, never ellipsed; an empty atomic inline in its place lets the
 * floor show the "…" alone instead of a letter cut at the border. */
.app_slot > .app_chip::before {
	content: "";
	display: inline-block;
}

/* The 24px box overhangs the 14px secondary row and the 10px glyph, so the row keeps its rhythm. */
.explorer {
	margin: -5px -7px;
}
</style>
