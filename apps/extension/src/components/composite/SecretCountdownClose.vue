<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/** Components */
import Button from "@/components/ui/Button.vue"

/**
 * Close button with optional countdown progress overlay + "Disable
 * auto-close" ghost link.
 *
 * The page owns the countdown state (`useSecretCountdown` composable);
 * this composite is purely the visual treatment.
 */
defineProps({
	/** Display label like "2:00". Empty string hides the suffix. */
	countdownLabel: { type: String, default: "" },
	/** Hides the progress bar overlay + the "Disable auto-close" link. */
	autoCloseDisabled: { type: Boolean, default: false },
	/**
	 * CSS animation duration the progress bar uses to shrink to zero
	 * (`shrink` keyframe). Pages set this to match `autoCloseMs`.
	 */
	progressDurationMs: { type: Number, required: true },
})

const emit = defineEmits(["close", "disableAutoClose"])
</script>

<template>
	<Flex direction="column" gap="8">
		<Button variant="cta_outline" :class="$style.countdown_cta" data-testid="close-btn" @click="emit('close')">
			<span :class="$style.close_label">
				Close<span v-if="!autoCloseDisabled && countdownLabel"> · {{ countdownLabel }}</span>
			</span>
			<div
				v-if="!autoCloseDisabled"
				:class="$style.progress_bar"
				:style="{ animationDuration: `${progressDurationMs}ms` }"
			/>
		</Button>

		<button
			v-if="!autoCloseDisabled"
			@click="emit('disableAutoClose')"
			type="button"
			:class="$style.ghost_link"
		>
			Disable auto-close
		</button>
	</Flex>
</template>

<style module>
/* Doubled to outrank Button's base rules in any sheet order; its hover still wins over :active. */
.countdown_cta.countdown_cta {
	transition-timing-function: var(--bezier);

	&:focus-visible {
		outline-style: dotted;
	}

	&:active {
		background: var(--txt-primary);
		color: var(--app-bg);
		transition: none;
	}
}

.close_label {
	position: relative;
	z-index: 1;
	font-variant-numeric: tabular-nums;
}

@keyframes shrink {
	0% {
		transform: translateX(0);
	}

	100% {
		transform: translateX(-100%);
	}
}

.progress_bar {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	right: 0;
	z-index: 0;

	background: var(--nulo-surface-high);

	animation-name: shrink;
	animation-timing-function: linear;
	will-change: transform;
}

.ghost_link {
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
	.ghost_link {
		color: var(--txt-secondary);
	}
	.ghost_link:hover {
		color: var(--txt-primary);
	}
}
</style>
