<script setup>
defineProps({
	testid: { type: String, required: true },
})
const emit = defineEmits(["click"])
</script>

<template>
	<button type="button" :class="$style.link" :data-testid="testid" @click="emit('click')">Disable auto-close</button>
</template>

<style module>
.link {
	composes: type--label-section from global;
	align-self: center;

	color: var(--nulo-secondary);
	background: transparent;
	border: none;
	cursor: pointer;

	padding: 4px 0;
	text-decoration: underline;
	text-decoration-thickness: 1px;
	text-underline-offset: 4px;

	transition: color 0.2s var(--bezier);

	&:hover {
		color: var(--txt-primary);
	}
}

:global([theme="light"]) {
	.link {
		color: var(--txt-secondary);
	}
	.link:hover {
		color: var(--txt-primary);
	}
}
</style>
