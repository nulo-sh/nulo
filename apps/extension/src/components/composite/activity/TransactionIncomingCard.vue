<script setup>
/**
 * Received card for the activity feed: one `IncomingTransferService` record, whether a decrypted
 * note or a public receipt from a trusted fungible-token contract.
 *
 * Wraps `TransactionCardLayout` so field positions stay byte-identical with the outgoing
 * `TransactionCard`, the in-flight `TransactionAwaitingCard` and the `TransactionTerminalCard`.
 * The badge is a green `square-check`, the icon box draws the receipt's sides and its inbound way,
 * and the amount carries a "+" so the feed scans without reading direction. The title is the token,
 * so the amount carries no symbol of its own.
 */

import { STATUS_ICON_FILL } from "./status-icon-fill"
import TransactionCardLayout from "./TransactionCardLayout.vue"

import { formatListAmount } from "@/utils/amount.js"
import { ROW_AMOUNT_LENGTH } from "@/utils/snack-amount"
import { isValidDecimals } from "@/utils/token-amount"
import { dashIfBlank } from "@/utils/string"

const props = defineProps({
	/** Token symbol: the title, dashed when blank, and the amount's unit, as given. */
	tokenSymbol: { type: String, default: "Token" },
	/** Raw u128 amount (stringified decimal) from the note's `value` field. */
	amountRaw: { type: String, required: true },
	/** Token decimals — formats the displayed amount. */
	tokenDecimals: { type: Number, default: 0 },
	/** `≈ $x.xx` for the received amount — null when unpriced. */
	amountFiat: { type: String, default: null },
	/** Transaction hash that delivered the note (for hash-slice rendering). */
	txHash: { type: String, default: null },
	/** The receipt's sides, inbound, with its receiver-honest kind label ("Received privately",
	 *  "Public → Public", "Private → Public", "Mint (public)") as its words. */
	direction: { type: Object, default: null },
	/** The route the row opens. */
	to: { type: String, default: undefined },
	/** The receipt is arriving now: the row slides in and glows. */
	arriving: { type: Boolean, default: false },
})

/** `decimals` comes from a contract-fed storage row; an invalid one leaves the amount column out. */
const formattedAmount = computed(() => {
	if (!props.amountRaw || !isValidDecimals(props.tokenDecimals)) return null
	return formatListAmount(props.amountRaw, props.tokenDecimals, ROW_AMOUNT_LENGTH)
})

const hashSlice = computed(() => {
	if (!props.txHash) return null
	return `${props.txHash.slice(0, 4)}...${props.txHash.slice(-4)}`
})
</script>

<template>
	<TransactionCardLayout
		:title="dashIfBlank(tokenSymbol)"
		icon="receive"
		:amount="formattedAmount ? `+${formattedAmount}` : null"
		:amountSymbol="tokenSymbol"
		:titleNamesToken="true"
		:amountFiat="amountFiat"
		:to="to"
		:arriving="arriving"
		:direction="direction"
		testId="tx-incoming-card"
	>
		<template #badge>
			<Icon name="square-check" size="12" :color="STATUS_ICON_FILL.green" data-testid="activity-status-icon" />
		</template>

		<template #secondary>
			<span v-if="direction" :class="$style.direction" data-testid="tx-incoming-kind-chip">{{ direction.label }}</span>
			<span v-if="hashSlice" data-testid="activity-incoming-hash" :class="$style.hash">{{ hashSlice }}</span>
		</template>
	</TransactionCardLayout>
</template>

<style module>
.direction {
	composes: visually_hidden from "./activity-card.module.css";
}

.hash {
	composes: type--meta from global;
	color: var(--nulo-secondary);
}
</style>
