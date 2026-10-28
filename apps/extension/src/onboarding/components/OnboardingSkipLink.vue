<script setup>
defineProps({
	testid: { type: String, required: true },
})
const emit = defineEmits(["click"])
const button = useTemplateRef("button")
defineExpose({ focus: () => button.value?.focus() })
</script>

<template>
	<button ref="button" type="button" :class="$style.skipLink" :data-testid="testid" @click="emit('click')">
		<slot />
	</button>
</template>

<style module>
.skipLink {
	composes: type--label-section from global;
	background: transparent;
	border: none;
	color: var(--txt-secondary);
	cursor: pointer;
	padding: 6px 12px;
	transition: color 0.15s var(--bezier);
}

.skipLink:hover {
	color: var(--txt-primary);
}

.skipLink:focus-visible {
	outline: 2px dotted var(--nulo-accent);
	outline-offset: 2px;
	color: var(--txt-primary);
}
</style>
