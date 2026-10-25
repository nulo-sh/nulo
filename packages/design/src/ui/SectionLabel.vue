<script setup lang="ts">
defineProps({
	label: {
		type: String,
		required: true,
	},
	count: {
		type: [String, Number],
		default: null,
	},
	/** Forwarded as the count span's data-testid, for surfaces whose e2e reads the number. */
	countTestid: {
		type: String,
		default: undefined,
	},
})
</script>

<template>
	<div :class="$style.wrapper">
		<span>{{ label }}</span>
		<span v-if="count !== null" :class="$style.count" :data-testid="countTestid">{{ count }}</span>
	</div>
</template>

<style module>
.wrapper {
	composes: type--label-section from global;
	display: flex;
	align-items: baseline;
	gap: 10px;

	color: var(--nulo-secondary);
}

.count {
	composes: type--meta from global;
	color: var(--nulo-secondary);
}
</style>
