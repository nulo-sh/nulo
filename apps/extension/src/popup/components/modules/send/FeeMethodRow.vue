<script setup>
/**
 * Per-method "Available" detail row shown under the method dropdown
 * in `FeeSettingsCard`. Renders one of two variants based on the
 * selected method's `type`:
 *
 * - `fj`           — single Available row reading from gas balances
 * - `private_fpc`  — Available row reading from gas balances (private),
 *                    or a "Not available" hint when no PrivateFPC is
 *                    registered
 *
 * Sponsored FPC rows render nothing extra. The Token-FPC visibility
 * (Public/Private) toggle was removed alongside the deprecated type.
 * While `pending`, no method is chosen yet and the row is drawn with a bar.
 */
defineProps({
	method: { type: Object, default: null },
	isLoading: { type: Boolean, default: false },
	pending: { type: Boolean, default: false },
	/** Null = balance unknown (read failed/timed out) — rendered as an em
	 *  dash, never as a fabricated zero. */
	feeJuiceBalanceFormatted: { type: String, default: null },
	privateFeeJuiceFormatted: { type: String, default: null },
})
</script>

<template>
	<!-- Fee Juice details -->
	<Flex v-if="pending || method?.type === 'fj'" align="center" justify="between" :class="$style.detail_row">
		<Text variant="label-section" color="secondary">Available</Text>
		<Skeleton v-if="pending || isLoading" />
		<Text v-else variant="value" color="primary">
			{{ feeJuiceBalanceFormatted ?? '—' }} FJ
		</Text>
	</Flex>

	<!-- Private Fee Juice (PrivateFPC) details -->
	<Flex v-else-if="method?.type === 'private_fpc'" align="center" justify="between" :class="$style.detail_row">
		<Text variant="label-section" color="secondary">Available</Text>
		<Skeleton v-if="isLoading" />
		<template v-else-if="method.fpc">
			<Text variant="value" color="primary">
				{{ privateFeeJuiceFormatted ?? '—' }} FJ
			</Text>
		</template>
		<template v-else>
			<Text variant="value" color="secondary">Not available</Text>
		</template>
	</Flex>
</template>

<style module>
.detail_row {
	composes: detail_row from "./fee-shared.module.css";
}

</style>
