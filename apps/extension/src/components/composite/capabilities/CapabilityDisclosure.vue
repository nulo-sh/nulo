<script setup lang="ts">
defineProps<{
	label: string
	/** The quiet part after the label, such as a count. */
	tag: string
	testid?: string
}>()

const open = ref(false)
const panelId = useId()
</script>

<template>
	<div :class="$style.disclosure">
		<button
			type="button"
			:data-testid="testid"
			:aria-expanded="open"
			:aria-controls="open ? panelId : undefined"
			:class="$style.toggle"
			@click="open = !open"
		>
			<span>{{ label }} <span :class="$style.tag">· {{ tag }}</span></span>
			<Icon name="chevron" :size="16" data-testid="cap-disclosure-chevron" :class="$style.chevron" aria-hidden="true" />
		</button>

		<div v-if="open" :id="panelId" :class="$style.panel">
			<slot />
		</div>
	</div>
</template>

<style module>
.disclosure {
	line-height: normal;
}

.toggle {
	composes: type--label-section from global;
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;

	padding: 11px 12px;
	border: 1px solid var(--nulo-border);
	background: transparent;
	cursor: pointer;

	line-height: normal;
	text-align: left;
	color: var(--nulo-secondary);
}

.toggle:hover,
.toggle:focus-visible {
	background: var(--nulo-surface-low);
	color: var(--txt-primary);
}

.toggle:focus-visible {
	outline: 2px solid var(--nulo-accent);
	outline-offset: -2px;
}

.tag {
	composes: type--label-section from global;
	white-space: nowrap;
	color: var(--nulo-secondary);
}

/* Two classes, so the icon's own color utility never decides. */
.toggle .chevron {
	color: inherit;
	transition: transform 0.2s var(--bezier);
}

.toggle[aria-expanded="true"] .chevron {
	transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
	.toggle .chevron {
		transition: none;
	}
}

.panel {
	display: flex;
	flex-direction: column;
	gap: 10px;

	padding: 12px;
	border: 1px solid var(--nulo-border);
	border-top: none;

	color: var(--nulo-secondary);
}
</style>
