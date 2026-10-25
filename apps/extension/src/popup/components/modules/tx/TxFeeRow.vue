<script setup>
/**
 * Fee row inside the tx-detail "Details" box. Renders a chevron-toggle
 * header with the fee and its USD, and an optional gas-breakdown
 * grid below. Used twice in tx/[id].vue: once for "Fee paid" (after
 * the receipt lands) and once for "Estimated fee" (pre-confirmation
 * snapshot). The two callers differ only in label + estimated styling
 * + the savings line. Every figure is priced at today's quote, not the
 * one at execution.
 */
import FeeAmount from "@/components/composite/FeeAmount.vue"
import { feeDisplay } from "@/utils/fee-estimation"

const props = defineProps({
	label: { type: String, required: true },
	/** The header's fee and the breakdown's estimate, in base units. */
	fee: { type: String, required: true },
	estimated: { type: Boolean, default: false },
	gasBreakdown: { type: Object, default: null },
	estimatedFee: { type: String, default: null },
	usdPerFeeJuice: { type: Number, default: undefined },
	feeSavings: { type: String, default: null },
})

const expanded = defineModel({ type: Boolean, default: false })

const priced = (raw) => feeDisplay(raw, props.usdPerFeeJuice)
</script>

<template>
	<Flex wide direction="column" gap="8">
		<button
			type="button"
			:class="[$style.fee_row_toggle, !gasBreakdown && $style.fee_row_static]"
			:disabled="!gasBreakdown"
			@click="gasBreakdown && (expanded = !expanded)"
		>
			<Flex align="center" gap="4">
				<span :class="$style.detail_key">{{ label }}</span>
				<Icon
					v-if="gasBreakdown"
					name="chevron"
					size="10"
					color="tertiary"
					:rotate="expanded ? 270 : 90"
					:class="$style.chevron"
				/>
			</Flex>
			<FeeAmount
				:display="priced(fee)"
				:class="[$style.detail_value_mono, estimated && $style.detail_value_est]"
				:usdClass="$style.detail_value_aux"
				usdTestid="tx-fee-usd"
			/>
		</button>

		<Flex v-if="expanded && gasBreakdown" wide direction="column" gap="6" :class="$style.fee_breakdown">
			<div :class="$style.fee_grid">
				<span :class="$style.fee_grid_key">L2 gas</span>
				<FeeAmount :display="priced(gasBreakdown.l2Cost)" :class="[$style.fee_grid_num, $style.fee_grid_val]" :usdClass="$style.fee_grid_aux" />

				<span :class="$style.fee_grid_key">DA gas</span>
				<FeeAmount :display="priced(gasBreakdown.daCost)" :class="[$style.fee_grid_num, $style.fee_grid_val]" :usdClass="$style.fee_grid_aux" />
			</div>
			<Flex v-if="estimatedFee" wide justify="between" align="center" :class="$style.fee_breakdown_divider">
				<span :class="$style.fee_grid_key">Estimated</span>
				<!-- fee_grid_num carries the mono face — without it this row
				     renders in the default font and clashes with FEE PAID. -->
				<FeeAmount
					:display="priced(estimatedFee)"
					:class="[$style.fee_grid_num, $style.fee_grid_val]"
					:usdClass="$style.fee_grid_aux"
					usdTestid="tx-estimate-usd"
				/>
			</Flex>
			<Flex v-if="feeSavings" wide justify="end">
				<span :class="$style.fee_savings">{{ feeSavings }}</span>
			</Flex>
		</Flex>
	</Flex>
</template>

<style module>
.detail_key {
	composes: type--label-section from global;
	color: var(--nulo-secondary);
}

.detail_value_mono {
	composes: type--meta from global;
	color: var(--txt-primary);
}

.detail_value_est {
	color: var(--nulo-secondary);
}

.detail_value_aux {
	composes: type--fiat from global;
	font-size: 11px;
	color: var(--nulo-secondary);
}

.fee_row_toggle {
	composes: disclosure_toggle from "./tx-shared.module.css";
}

.fee_row_static {
	cursor: default;
}

.fee_breakdown {
	padding-top: 8px;
	border-top: 1px solid var(--nulo-border);
}

.fee_grid {
	display: grid;
	grid-template-columns: 1fr auto;
	gap: 4px 10px;
	align-items: center;
}

.fee_grid_key {
	composes: type--label-section from global;
	color: var(--nulo-secondary);
}

.fee_grid_num {
	composes: type--meta from global;
	text-align: right;
}

.fee_grid_aux {
	color: var(--nulo-secondary);
}

.fee_grid_val {
	color: var(--txt-primary);
}

.fee_breakdown_divider {
	padding-top: 6px;
	border-top: 1px solid var(--nulo-border);
}

.fee_savings {
	composes: type--meta from global;
	color: var(--green);
}

.chevron {
	transition: transform 0.2s ease;
}
</style>
