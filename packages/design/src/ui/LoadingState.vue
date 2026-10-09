<script setup lang="ts">
/** Components */
import Spinner from "./Spinner.vue"

defineProps({
	label: { type: String, required: true },
	sub: { type: String, default: "" },
})
</script>

<template>
	<div :class="$style.wrapper" data-testid="loading-state">
		<Spinner size="20" color="--txt-primary" />
		<span :class="$style.label">{{ label }}</span>
		<span v-if="sub" :class="$style.sub">{{ sub }}</span>
	</div>
</template>

<style module>
.wrapper {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 10px;

	padding: 32px 16px;
	border: 1px dashed var(--nulo-border);

	text-align: center;
}

.label {
	composes: type--title-page from global;
	color: var(--nulo-secondary);
}

.sub {
	composes: type--body from global;
	line-height: 1.4;
	color: var(--nulo-outline);
}
</style>
