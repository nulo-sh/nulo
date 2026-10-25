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
import { type FeeDisplay, feeDisplay } from "@/utils/fee-estimation"

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
		<Flex align="center" justify="between" :class="$style.card">
			<Text variant="label-section" color="primary">Fee</Text>
			<Text variant="name" color="primary" :class="$style.method_size" data-testid="fee-raised-method">{{ methodTitle }}</Text>
		</Flex>
		<FeeMethodRow
			v-if="!hideAvailable"
			:method="method"
			:isLoading="availableLoading"
			:feeJuiceBalanceFormatted="available"
			:privateFeeJuiceFormatted="available"
		/>
		<Flex direction="column" gap="4" :class="$style.detail_row" data-testid="fee-raised">
			<Text variant="value" color="primary">Fee went up</Text>
			<Text variant="meta" color="secondary" data-testid="fee-raised-was">Was <FeeAmount :display="was" /></Text>
			<Text variant="meta" color="primary" data-testid="fee-raised-now">Now <FeeAmount :display="now" /></Text>
		</Flex>
		<Flex v-if="priority" align="center" justify="between" :class="$style.detail_row" data-testid="fee-raised-priority">
			<Text variant="label-section" color="secondary">Priority</Text>
			<Text variant="value" color="primary">{{ PRIORITY_LABELS[priority] }}</Text>
		</Flex>
	</Flex>
</template>

<style module>
.card {
	padding: 12px;
}

.method_size {
	font-size: 13px;
}

.detail_row {
	composes: detail_row from "./fee-shared.module.css";
}
</style>
