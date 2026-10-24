<script setup lang="ts">
import { type OnboardingPath, type OnboardingStep, stepCells } from "../steps"

const props = defineProps<{ current: OnboardingStep; path: OnboardingPath }>()

const cells = computed(() => stepCells(props.path))
const at = computed(() => cells.value.findIndex((cell) => cell.step === props.current))
</script>

<template>
	<nav :class="[$style.row, cells.length === 4 ? $style.four : $style.three]" aria-label="Onboarding progress">
		<div
			v-for="(s, i) in cells"
			:key="s.step"
			:class="[$style.cell, i < at && $style.past, i === at && $style.active]"
			:aria-current="i === at ? 'step' : undefined"
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
	gap: 8px;
	width: 100%;
	margin: 0 0 16px;
}

.three {
	grid-template-columns: repeat(3, 1fr);
}

.four {
	grid-template-columns: repeat(4, 1fr);
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
