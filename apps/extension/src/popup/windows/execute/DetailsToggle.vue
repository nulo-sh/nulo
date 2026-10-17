<script setup lang="ts">
defineProps<{
	open: boolean
	label: string
	/** The id of the panel the button shows, named only while that panel is rendered. */
	controls: string
}>()
</script>

<template>
	<button type="button" :aria-expanded="open" :aria-controls="open ? controls : undefined" :class="$style.toggle">
		<Icon name="chevron" size="10" color="secondary" aria-hidden="true" :class="[$style.chevron, open && $style.chevron_open]" />
		<Text variant="label-section" color="secondary">{{ label }}</Text>
	</button>
</template>

<style module>
.toggle {
	display: inline-flex;
	align-items: center;
	align-self: flex-start;
	gap: 4px;
	padding: 2px 0;
	border: 0;
	background: none;
	cursor: pointer;
	font: inherit;
}

.chevron {
	transition: transform 120ms ease;
}

.chevron_open {
	transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
	.chevron {
		transition: none;
	}
}
</style>
