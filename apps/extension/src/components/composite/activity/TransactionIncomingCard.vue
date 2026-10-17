<script setup>
/**
 * Received card for the activity feed: one `IncomingTransferService` record, whether a decrypted
 * note or a public receipt from a trusted fungible-token contract.
 *
 * Wraps `TransactionCardLayout` so field positions stay byte-identical with the outgoing
 * `TransactionCard`, the in-flight `TransactionAwaitingCard` and the `TransactionTerminalCard`.
 * The badge is a green `square-check`, the title row carries the receipt's kind chip, and the
 * amount carries a "+" so the feed scans without reading direction.
 */

import { STATUS_ICON_FILL } from "./status-icon-fill"
import TransactionCardLayout from "./TransactionCardLayout.vue"

import { balanceFormatted } from "@/utils/amount.js"
import { isValidDecimals } from "@/utils/token-amount"

const props = defineProps({
	/** Token symbol — the card's title row. */
	tokenSymbol: { type: String, default: "Token" },
	/** Raw u128 amount (stringified decimal) from the note's `value` field. */
	amountRaw: { type: String, required: true },
	/** Token decimals — formats the displayed amount. */
	tokenDecimals: { type: Number, default: 0 },
	/** `≈ $x.xx` for the received amount — null when unpriced. */
	amountFiat: { type: String, default: null },
	/** Transaction hash that delivered the note (for hash-slice rendering). */
	txHash: { type: String, default: null },
	/** Receiver-honest kind label ("Received privately" / "Public → Public" /
	 *  "Private → Public" / "Minted"), derived from the resolved type. */
	receivedLabel: { type: String, default: "Received" },
	/** The route the row opens. */
	to: { type: String, default: undefined },
	/** The receipt is arriving now: the row slides in and glows. */
	arriving: { type: Boolean, default: false },
})

/** `decimals` comes from a contract-fed storage row; an invalid one leaves the amount column out. */
const formattedAmount = computed(() => {
	if (!props.amountRaw || !isValidDecimals(props.tokenDecimals)) return null
	return balanceFormatted(props.amountRaw, props.tokenDecimals, 8, { compact: true }).value
})

const hashSlice = computed(() => {
	if (!props.txHash) return null
	return `${props.txHash.slice(0, 4)}...${props.txHash.slice(-4)}`
})
</script>

<template>
	<TransactionCardLayout
		:title="tokenSymbol"
		icon="receive"
		:amount="formattedAmount ? `+${formattedAmount}` : null"
		:amountSymbol="tokenSymbol"
		:amountFiat="amountFiat"
		:to="to"
		:arriving="arriving"
		testId="tx-incoming-card"
	>
		<template #badge>
			<Icon name="square-check" size="12" :color="STATUS_ICON_FILL.green" data-testid="activity-status-icon" />
		</template>

		<template #title-trailing>
			<span :class="$style.title_sep">·</span>
			<span :class="$style.chip" data-testid="tx-incoming-kind-chip">{{ receivedLabel }}</span>
		</template>

		<template #secondary>
			<span v-if="hashSlice" data-testid="activity-incoming-hash" :class="$style.hash">{{ hashSlice }}</span>
		</template>
	</TransactionCardLayout>
</template>

<style module>
.title_sep {
	composes: title_sep from "./activity-card.module.css";
}

.chip {
	composes: type--label-section from global;
	flex-shrink: 0;
	white-space: nowrap;

	color: var(--green, var(--nulo-accent));
	background: var(--nulo-surface-low);
	border: 1px solid var(--hairline-soft);
	padding: 1px 4px;
}

.hash {
	composes: type--meta from global;
	color: var(--nulo-secondary);
}
</style>
