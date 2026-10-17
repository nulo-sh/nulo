<script setup lang="ts">
defineProps<{ open: boolean; label: string }>()
</script>

<template>
	<button type="button" :aria-expanded="open" :class="$style.toggle">
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
</style>
