<script setup>
/** Utils */
import { isServiceReady } from "@/utils/core"

defineProps({
	/** The boot check's verdict when it gave up; its banner then replaces the bar. */
	bootOutcome: { type: String, default: "" },
})
</script>

<template>
	<div v-if="!isServiceReady && !bootOutcome" :class="$style.bar" data-testid="start-pending" aria-hidden="true" />
</template>

<style module>
/* Transparent for the start grace, so a normal open never shows it. Under the barriers (10000),
   over the Terms sheet (9000). */
.bar {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	height: 2px;
	overflow: hidden;
	z-index: 9999;
	pointer-events: none;
	opacity: 0;
	animation: show 0s linear 200ms forwards;

	&::before {
		content: "";
		position: absolute;
		top: 0;
		bottom: 0;
		left: -40%;
		width: 40%;
		background: var(--nulo-accent);
		animation: sweep 1.2s ease-in-out infinite;
	}
}

@keyframes show {
	to {
		opacity: 1;
	}
}

@keyframes sweep {
	to {
		left: 100%;
	}
}

@media (prefers-reduced-motion: reduce) {
	.bar::before {
		left: 0;
		width: 100%;
		animation: none;
	}
}
</style>
