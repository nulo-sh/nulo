<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup>
/**
 * Close button with optional countdown progress overlay + "Disable
 * auto-close" ghost link.
 *
 * The page owns the countdown state (`useSecretCountdown` composable);
 * this composite is purely the visual treatment.
 */
/** Components */
import DisableAutoCloseLink from "@/components/composite/DisableAutoCloseLink.vue"
import Button from "@/components/ui/Button.vue"

/** Composables */
import { refuseRepeatEnter } from "@/composables/usePopupEntity"

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

const closeButton = useTemplateRef("closeButton")

/** The link leaves with the countdown; focus goes to the Close it timed, not to the page. */
function keepOpen() {
	emit("disableAutoClose")
	closeButton.value?.$el?.focus()
}
</script>

<template>
	<Flex direction="column" gap="8">
		<Button
			ref="closeButton"
			variant="cta_outline"
			data-testid="close-btn"
			@keydown.enter="refuseRepeatEnter"
			@click="emit('close')"
		>
			<span :class="$style.close_label">
				Close<span v-if="!autoCloseDisabled && countdownLabel"> · {{ countdownLabel }}</span>
			</span>
			<div
				v-if="!autoCloseDisabled"
				:class="$style.progress_bar"
				:style="{ animationDuration: `${progressDurationMs}ms` }"
			/>
		</Button>

		<DisableAutoCloseLink v-if="!autoCloseDisabled" testid="disable-auto-close-btn" @click="keepOpen" />
	</Flex>
</template>

<style module>
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
</style>
