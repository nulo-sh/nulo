<script setup lang="ts">
// Every path keeps all four cells, including a passkey wallet and an import, which skip Phrase.
defineProps<{ current: 1 | 2 | 3 | 4 }>()

const steps: Array<{ num: string; label: string }> = [
	{ num: "01", label: "Terms" },
	{ num: "02", label: "Create" },
	{ num: "03", label: "Phrase" },
	{ num: "04", label: "Ready" },
]
</script>

<template>
	<nav :class="$style.row" aria-label="Onboarding progress">
		<div
			v-for="(s, i) in steps"
			:key="s.num"
			:class="[
				$style.cell,
				i + 1 < current && $style.past,
				i + 1 === current && $style.active,
				i + 1 > current && $style.future,
			]"
			:aria-current="i + 1 === current ? 'step' : undefined"
		>
			<span :class="$style.num">{{ s.num }}</span>
			<span :class="$style.bar" />
			<span :class="$style.label">{{ s.label }}</span>
		</div>
	</nav>
</template>

<style module>
.row {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 8px;
	width: 100%;
	margin: 0 0 16px;
}

.cell {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.num {
	composes: type--meta from global;
	color: var(--txt-tertiary);
	transition: color 0.2s var(--bezier);
}

.bar {
	display: block;
	width: 100%;
	height: 2px;
	background: var(--nulo-border);
	transition: background 0.2s var(--bezier);
}

.label {
	composes: type--label-section from global;
	color: var(--txt-tertiary);
	transition: color 0.2s var(--bezier);
}

.past .num,
.past .label {
	color: var(--nulo-secondary);
}
.past .bar {
	background: var(--nulo-secondary);
}

.active .num,
.active .label {
	color: var(--txt-primary);
}
.active .bar {
	background: var(--nulo-accent);
}
</style>
