<script setup>
/** A screen reader hears each change whole; the title is no heading, so the page's heading order
 *  stays. The page supplies the outer spacing. */
defineProps({
	title: { type: String, required: true },
	description: { type: String, default: "" },
})
</script>

<template>
	<div :class="$style.card" role="status" aria-live="polite" aria-atomic="true">
		<Spinner size="28" color="--nulo-accent" aria-hidden="true" />
		<span :class="$style.title">{{ title }}</span>
		<p v-if="description" :class="$style.description">{{ description }}</p>
	</div>
</template>

<style module>
.card {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 14px;

	padding: 32px 24px;

	border: 1px solid var(--nulo-border);
	background: var(--nulo-surface-low);

	text-align: center;
}

.title {
	composes: type--row-title from global;
	font-size: 16px;
	color: var(--txt-primary);
}

.description {
	composes: type--body from global;
	line-height: 1.5;
	color: var(--nulo-secondary);
	margin: 0;
	max-width: 280px;
}
</style>
