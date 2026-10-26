<script setup>
/**
 * "Use a passkey I already have", under the button that creates a new passkey wherever one is set
 * up: it asks the device for a Nulo passkey the person already has. A link-styled button, so the
 * primary button stays the one that creates.
 */
defineProps({
	testid: { type: String, required: true },
	disabled: { type: Boolean, default: false },
})
const emit = defineEmits(["click"])
</script>

<template>
	<button type="button" :class="$style.link" :disabled="disabled" :data-testid="testid" @click="emit('click')">
		Use a passkey I already have
	</button>
</template>

<style module>
.link {
	composes: type--label-section from global;
	align-self: center;
	background: transparent;
	border: none;
	color: var(--txt-secondary);
	cursor: pointer;
	padding: 6px 12px;
	transition: color 0.15s var(--bezier);
}

.link:hover:not(:disabled) {
	color: var(--txt-primary);
}

.link:focus-visible {
	outline: 2px dotted var(--nulo-accent);
	outline-offset: 2px;
	color: var(--txt-primary);
}

.link:disabled {
	cursor: default;
	opacity: 0.5;
}
</style>
