<script setup lang="ts">
/**
 * The fee block of a send held because its fee came out above the figure the person approved:
 * read-only, it names the payer, what it holds, the approved and the new figure, and the speed. It
 * owns the window's quote, so a window still checking its session reads no price.
 */
/** Vendor */
import type { QueuedFeePayer } from "@nulo/wallet-core/jobs"

/** Services */
import type { PriorityLevel } from "@/wallet/services/execution/client"
import { PriceServiceClient } from "@/wallet/services/price/client"

/** Components */
import FeeAmount from "@/components/composite/FeeAmount.vue"
import FeeMethodRow from "./FeeMethodRow.vue"

/** Composables */
import { usePrices } from "@/composables/usePrices"

/** Utils */
import { type FeeDisplay, feeDisplay, feeFigure, feeText } from "@/utils/fee-estimation"

const props = defineProps<{
	payer: QueuedFeePayer
	/** The approved and the new fee, in base units. */
	approved: string
	fee: string
	/** The payer's balance as the readout prints it; null when its read failed. */
	available: string | null
	availableLoading: boolean
	/** The app's own claim pays, not a balance the person holds. */
	hideAvailable?: boolean
	/** The speed the wallet chose; absent when the app set the fee path. */
	priority?: PriorityLevel
}>()
/** One-way child→parent: the new fee as the card prices it, so the window's Confirm repeats this
 *  quote rather than reading one of its own. */
const nowOut = defineModel<FeeDisplay | null>("now", { default: null })
const PRIORITY_LABELS: Record<PriorityLevel, string> = { normal: "Normal", fast: "Fast", urgent: "Urgent" }

const method = computed(() => ({
	type: props.payer.type,
	fpc: props.payer.fpcId ? { id: props.payer.fpcId } : null,
}))
const methodTitle = computed(() => (props.payer.type === "private_fpc" ? "Private Fee Juice" : "Public Fee Juice"))

const priceService = new PriceServiceClient()
const prices = usePrices(priceService)
const was = computed(() => feeDisplay(props.approved, prices.feeJuiceQuote.value?.usd))
const now = computed(() => feeDisplay(props.fee, prices.feeJuiceQuote.value?.usd))
/** A strikethrough is not announced, so the drawn row is hidden and spoken as this sentence. */
const spoken = computed(() => `Fee went up. Was ${feeFigure(was.value)}. Now ${feeText(now.value)}.`)

watch(
	now,
	(d) => {
		nowOut.value = d
	},
	{ immediate: true },
)

onBeforeUnmount(() => {
	priceService.disconnect()
	prices.dispose()
})
</script>

<template>
	<Flex direction="column" data-testid="fee-raised-card">
		<Flex justify="between" gap="12" :class="$style.card" data-testid="fee-raised">
			<span :class="$style.label" aria-hidden="true">
				<span :class="$style.dot" />
				<Text variant="label-section" color="primary">Fee</Text>
			</span>
			<Flex direction="column" align="end" gap="4" :class="$style.figures">
				<span :class="$style.pair" aria-hidden="true">
					<FeeAmount :display="now" class="type--meta color--primary" :usdClass="$style.fee_usd" data-testid="fee-raised-now" />
					<s class="type--meta color--secondary" data-testid="fee-raised-was">was {{ feeFigure(was) }}</s>
				</span>
				<span :class="$style.visually_hidden">{{ spoken }}</span>
				<Text variant="meta" color="secondary" data-testid="fee-raised-method">{{ methodTitle }}</Text>
			</Flex>
		</Flex>
		<FeeMethodRow
			v-if="!hideAvailable"
			:method="method"
			:isLoading="availableLoading"
			:feeJuiceBalanceFormatted="available"
			:privateFeeJuiceFormatted="available"
		/>
		<Flex v-if="priority" align="center" justify="between" :class="$style.detail_row" data-testid="fee-raised-priority">
			<Text variant="label-section" color="secondary">Priority</Text>
			<Text variant="value" color="primary">{{ PRIORITY_LABELS[priority] }}</Text>
		</Flex>
	</Flex>
</template>

<style module>
/* Baseline, so the label sits on the first figure's line whatever the two roles' sizes; the label
 * is inline content, so its baseline is its text's, not the dot's edge. */
.card {
	align-items: baseline;
	padding: 12px;
}

.label {
	flex: none;
}

.dot {
	display: inline-block;
	vertical-align: middle;
	margin-right: 6px;
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--yellow);
}

.figures {
	min-width: 0;
	text-align: end;
}

/* The struck figure drops under the new one rather than either being cut; `anywhere` lets a figure
 * longer than the line break inside itself too. */
.pair {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	align-items: baseline;
	gap: 4px 8px;
	overflow-wrap: anywhere;
}

.fee_usd {
	composes: type--fiat from global;
	font-size: 11px;
	color: var(--nulo-secondary);
}

.visually_hidden {
	composes: visually_hidden from "./fee-shared.module.css";
}

.detail_row {
	composes: detail_row from "./fee-shared.module.css";
}
</style>
