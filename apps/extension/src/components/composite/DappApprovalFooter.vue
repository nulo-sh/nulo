<!-- Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->
<script setup lang="ts">
/**
 * The shared footer for the three dApp approval windows (execute /
 * discover / capabilities) — the error-tooltip banner + Reject/Confirm button
 * pair they rendered with byte-identical markup and `.footer` CSS. Only the
 * test-ids, labels, the optional `wide` tooltip, and the Confirm `:disabled`
 * expression differed between windows, so those are props the parent supplies;
 * the Reject `:disabled` (`isLoading || !requestId`) was identical and is passed
 * as `rejectDisabled`. Test-ids are forwarded verbatim (e2e depends on them).
 */

/** Composables */
import { vSnackFooter } from "@/composables/snackInset"
import { refuseRepeatEnter } from "@/composables/usePopupEntity"

defineProps({
	/** The window's processing error ({ title, tooltip?, type }) or undefined. */
	processingError: { type: Object, default: undefined },
	/** discover/capabilities render the tooltip `wide`; execute does not. */
	wideTooltip: { type: Boolean, default: false },
	rejectTestid: { type: String, required: true },
	rejectLabel: { type: String, required: true },
	rejectDisabled: { type: Boolean, default: false },
	confirmTestid: { type: String, required: true },
	confirmLabel: { type: String, required: true },
	/** A smaller second line under the label, read with it as one name: `Send for ~X FJ ($Y)`. */
	confirmDetail: { type: String, default: undefined },
	confirmLoading: { type: Boolean, default: false },
	confirmDisabled: { type: Boolean, default: false },
	/** A request the wallet refused offers only Reject, full width. */
	confirmHidden: { type: Boolean, default: false },
})

const emit = defineEmits(["reject", "approve"])

defineSlots<{
	/** Under the two buttons, inside the strip. */
	below?: () => unknown
}>()
</script>

<template>
	<Flex v-snack-footer direction="column" gap="10" :class="$style.footer" data-testid="dapp-approval-footer">
		<Tooltip v-if="processingError" side="top" position="start" :wide="wideTooltip" :disabled="!processingError.tooltip">
			<Flex align="center" wide gap="6">
				<Icon name="info" size="14" :color="processingError.type === 'warning' ? 'orange' : 'red'" />
				<Text data-testid="error-text" role="alert" variant="body" color="secondary">{{ processingError.title }}</Text>
			</Flex>

			<template #content>
				<Text variant="body" color="secondary">{{ processingError.tooltip }}</Text>
			</template>
		</Tooltip>

		<Flex align="center" justify="between" gap="12">
			<Button :data-testid="rejectTestid" @click="emit('reject')" wide variant="primary_outline" size="medium" :disabled="rejectDisabled">
				{{ rejectLabel }}
			</Button>

			<Button
				v-if="!confirmHidden"
				:data-testid="confirmTestid"
				@click="emit('approve')"
				@keydown.enter="refuseRepeatEnter"
				wide
				variant="primary"
				size="medium"
				:loading="confirmLoading"
				:disabled="confirmDisabled"
			>
				<Text color="inverse" align="center" :class="confirmDetail ? $style.two_line : undefined">{{ confirmLabel }}<template v-if="confirmDetail">{{ " " }}<span class="type--caption" :class="$style.detail" data-testid="dapp-approval-confirm-detail">{{ confirmDetail }}</span></template></Text>
			</Button>
		</Flex>

		<slot name="below" />
	</Flex>
</template>

<style module>
.footer {
	flex-shrink: 0;

	padding: 16px;
	border-top: 1px solid var(--nulo-border);
	background: var(--nulo-surface);
}

/* At the label's line-height of 1 the two lines and their gap take 28 px; the inset makes 40, the
 * medium button's minimum, so the button grows only when the detail wraps, its text off the edges. */
.two_line {
	padding-block: 6px;
}

/* The button clips a line it cannot fit, so the detail wraps instead, inside a figure if it must. */
.detail {
	display: block;
	margin-top: 4px;
	white-space: normal;
	overflow-wrap: anywhere;
}
</style>
