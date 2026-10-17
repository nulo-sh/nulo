<script setup lang="ts">
/**
 * One fee in the grammar `feeText` writes into strings. It sets no type of its own: the class on the
 * root picks the figure's role and `usdClass` the USD's, so each screen keeps its sizes.
 */
/** Vendor */
import type { PropType } from "vue"

/** Utils */
import { type FeeDisplay, feeFigure } from "@/utils/fee-estimation"

defineProps({
	display: { type: Object as PropType<FeeDisplay>, required: true },
	usdClass: { type: String, default: undefined },
	usdTestid: { type: String, default: undefined },
})
</script>

<template>
	<span>{{ feeFigure(display) }}<span v-if="display.usd" :class="usdClass" title="At today's AZTEC price" :data-testid="usdTestid"> ({{ display.usd }})</span></span>
</template>
