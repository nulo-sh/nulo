<script setup lang="ts">
const emit = defineEmits<{ save: [] }>()
</script>

<template>
	<div :class="$style.banner" role="status" data-testid="backup-reminder-banner">
		<Flex align="center" gap="8" :class="$style.message">
			<Icon name="warning" :size="16" color="orange" aria-hidden="true" />
			<span :class="$style.text">Your funds have no backup</span>
		</Flex>
		<button type="button" :class="$style.action" data-testid="backup-reminder-save" @click="emit('save')">Save phrase</button>
	</div>
</template>

<style module>
.banner {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 8px 12px 8px 8px;
	background: var(--nulo-surface);
	border: 1px solid var(--nulo-accent);
}

.message {
	min-width: 0;
}

.text {
	composes: type--value from global;
	color: var(--txt-primary);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.action {
	composes: type--label-section from global;
	flex: none;
	padding: 0;
	border: none;
	background: transparent;
	color: var(--nulo-accent);
	text-decoration: underline;
	text-decoration-thickness: 1px;
	text-underline-offset: 4px;
	cursor: pointer;
}

.action:focus-visible {
	outline: 2px solid var(--nulo-accent);
	outline-offset: 2px;
}

/* Below the popup's width the message wraps rather than ending in an ellipsis, and the action goes
 * under it when the two do not fit side by side. */
@media (width < 359px) {
	.banner {
		flex-wrap: wrap;
		row-gap: 4px;
	}

	.banner > .message {
		flex: 1 1 auto;
	}

	.text {
		white-space: normal;
	}

	.banner > .action {
		margin-left: auto;
	}
}
</style>
