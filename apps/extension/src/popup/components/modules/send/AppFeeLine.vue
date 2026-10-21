<script setup lang="ts">
/**
 * The fee sentence of an operation whose app pays its own fee; the default slot is the app's name. The
 * parent mounts it only while an estimate runs or has landed, so an operation the wallet never
 * estimates reads no price. "About", never "up to": the figure caps nothing. Paid from the person's
 * balance the fee may rise 10 % without asking again (`feeRiseAsks`), and an app's fee contract any amount.
 * Through the PrivateFPC the person pays from their own Private Fee Juice, so the line says so first.
 */
/** Vendor */
import type { PropType } from "vue"

/** Services */
import type { TransferFeeEstimate } from "@/wallet/services/execution/spec"
import { PriceServiceClient } from "@/wallet/services/price/client"

/** Components */
import FeeAmount from "@/components/composite/FeeAmount.vue"

/** Composables */
import { usePrices } from "@/composables/usePrices"

/** Utils */
import { feeDisplay } from "@/utils/fee-estimation"

const props = defineProps({
	feeEstimate: { type: Object as PropType<TransferFeeEstimate>, default: undefined },
	privateFeeJuice: { type: Boolean, default: false },
})

const priceService = new PriceServiceClient()
const prices = usePrices(priceService)
const usd = computed(() => prices.feeJuiceQuote.value?.usd)
const fee = computed(() => (props.feeEstimate ? feeDisplay(props.feeEstimate.maxFee, usd.value) : null))
const priority = computed(() => (props.feeEstimate?.priorityFee ? feeDisplay(props.feeEstimate.priorityFee, usd.value) : null))

onBeforeUnmount(() => {
	priceService.disconnect()
	prices.dispose()
})
</script>

<template>
	<Text variant="body" color="secondary" height="150" :data-testid="fee ? 'execute-op-app-fee' : 'execute-op-app-fee-estimating'">
		<template v-if="privateFeeJuice"><span :class="$style.line">You pay about <FeeAmount v-if="fee" :display="fee" :class="$style.figure" /><Skeleton v-else :class="$style.bar" /> from Private Fee Juice</span> method set by <slot /></template>
		<template v-else>About <FeeAmount v-if="fee" :display="fee" :class="$style.figure" /><Skeleton v-else :class="$style.bar" />; payment method set by <slot /></template><template v-if="priority">. Includes a <FeeAmount :display="priority" :class="$style.fee_figure" /> <DottedTerm term="priority-fee" testid="execute-op-priority-term">priority fee</DottedTerm> the app asked for</template><template v-if="priority || !privateFeeJuice">.</template>
	</Text>
</template>

<style module>
.figure {
	composes: fee_figure from "./fee-shared.module.css";
	color: var(--txt-primary);
}

.fee_figure {
	composes: fee_figure from "./fee-shared.module.css";
}

.bar {
	vertical-align: middle;
}

.line {
	display: block;
}
</style>
