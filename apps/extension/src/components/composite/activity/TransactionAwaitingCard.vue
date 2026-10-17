<script setup lang="ts">
/**
 * In-flight phase of an activity card. Wraps `TransactionCardLayout` so its
 * field positions stay byte-identical with `TransactionCard` (the settled
 * phase). The only visible difference between phases is the badge slot
 * (spinner here vs. status icon there) and the secondary-row content.
 */
import { computed, type PropType } from "vue"
import type { GlyphName } from "@nulo/design"
import type { JobStage, ProveBackend } from "@nulo/wallet-core/jobs"
import TransactionCardLayout from "./TransactionCardLayout.vue"

const props = defineProps({
	title: { type: String, default: "Creating transaction" },
	/** The stage line. Null while the card's stage is unknown: the loading skeleton draws in its place,
	 *  never a guessed stage. */
	subtitle: { type: String, default: null },
	/** Origin chip — for dApp-initiated txs, this is the dApp hostname. UI-initiated
	 *  transfers leave this null and the chip is suppressed. */
	originLabel: { type: String, default: null },
	/** Activity icon. Defaults to "zap" for the generic dApp case; UI transfers
	 *  pass the same "send" that the settled card uses. */
	icon: { type: String as PropType<GlyphName>, default: "zap" },
	amount: { type: String, default: null },
	amountSymbol: { type: String, default: null },
	/** Privacy-direction chip ("Private → Public" etc.). Suppressed when null —
	 *  e.g. dApp ops we don't synthesize a transfer type for. The parent
	 *  resolves it via `formatTransferType(op.transferType)`. */
	transferTypeLabel: { type: String, default: null },
	/** Enable the Cancel button. Renders only when `cancellable && jobId && stage !== "submitting"`. */
	cancellable: { type: Boolean, default: false },
	/** Journal id to cancel. Emitted with the `cancel` event so multi-card
	 *  render paths (RecentActivityView with N concurrent in-flight ops)
	 *  cancel the correct journal record from the correct button — the
	 *  parent can't infer which card was clicked from a payload-less emit. */
	jobId: { type: String, default: null },
	/** Current journal stage. When `"submitting"`, the Cancel button is
	 *  hidden — the FSM forbids `submitting → cancelled` and the SW would
	 *  silently drop the signal. Removing the affordance is the cleaner UX.
	 *  Typed via `JobStage` so e2e selectors that key off `data-stage` can
	 *  rely on the literal set defined in `@nulo/wallet-core/jobs`. */
	stage: { type: String as PropType<JobStage | null>, default: null },
	/** Proving backend once the prover reported it; threads to `data-backend`. */
	backend: { type: String as PropType<ProveBackend | null>, default: null },
	/** A dApp send's queued record has an approval window to show; a queued popup send has none. */
	hasApprovalWindow: { type: Boolean, default: true },
	/** A queued send whose fee came out above its cap: this line replaces the stage line, and the row
	 *  opens its review. */
	reaskLine: { type: String, default: null },
	/** The title names the function a dApp called: one line, cut at its end. */
	oneLineTitle: { type: Boolean, default: false },
})

const emit = defineEmits(["cancel", "focus", "review"])

/** `queued` is the only stage at which an approval popup can exist. */
const focusable = computed(() => props.hasApprovalWindow && Boolean(props.jobId) && props.stage === "queued")
const showCancel = computed(() => props.cancellable && Boolean(props.jobId) && props.stage !== "submitting")
</script>

<template>
	<!-- The hover title sits on an ancestor of the row's target, so it shows over the whole row. -->
	<div :class="$style.card" :title="focusable ? 'Show the approval window' : undefined">
		<TransactionCardLayout
			:title="title"
			:icon="icon"
			:amount="amount"
			:amountSymbol="amountSymbol"
			:stage="stage"
			:backend="backend"
			:opens="focusable || Boolean(reaskLine && jobId)"
			:actionCount="(focusable ? 1 : 0) + (showCancel ? 1 : 0)"
			:oneLineTitle="oneLineTitle"
			testId="tx-awaiting-card"
			@activate="reaskLine ? emit('review', jobId) : emit('focus', jobId)"
		>
			<template #badge>
				<Spinner size="10" color="--nulo-accent" />
			</template>

			<template v-if="transferTypeLabel || originLabel" #title-trailing>
				<span :class="$style.title_sep">·</span>
				<span v-if="transferTypeLabel" :class="$style.transfer_chip">{{ transferTypeLabel }}</span>
				<span v-else :class="$style.app_chip" data-testid="activity-app-chip">{{ originLabel }}</span>
			</template>

			<template #secondary>
				<span :class="$style.subtitle" role="status" aria-live="polite" aria-atomic="true" data-testid="tx-awaiting-subtitle"><template v-if="reaskLine">{{ reaskLine }}</template><template v-else-if="subtitle">{{ subtitle }}</template><Skeleton v-else :width="92" :height="9" /></span>
			</template>

			<template v-if="focusable || showCancel" #actions>
				<button
					v-if="focusable"
					type="button"
					:class="$style.action_btn"
					aria-label="Show the approval window"
					data-testid="tx-awaiting-focus"
					@click.stop="emit('focus', jobId)"
				>
					<Icon name="expand" size="14" color="secondary" />
				</button>
				<button
					v-if="showCancel"
					type="button"
					:class="$style.action_btn"
					aria-label="Cancel transaction"
					data-testid="tx-awaiting-cancel"
					@click.stop="emit('cancel', jobId)"
				>
					<Icon name="close" size="14" color="secondary" />
				</button>
			</template>
		</TransactionCardLayout>
	</div>
</template>

<style module>
.card {
	display: contents;
}

/* Subtitle takes whatever horizontal room it can after the chip; truncates
 * with ellipsis when the chip pushes back. min-width: 0 + flex: 0 1 auto
 * let it shrink below its intrinsic width inside the Flex parent. */
.subtitle {
	composes: type--caption from global;
	flex: 0 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;

	color: var(--nulo-secondary);
}

.title_sep {
	composes: title_sep from "./activity-card.module.css";
}

.transfer_chip {
	composes: chip from "./activity-card.module.css";
}

.app_chip {
	composes: app_chip from "./activity-card.module.css";
}

.action_btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 28px;
	padding: 0;
	background: transparent;
	border: 0;
	cursor: pointer;
	color: var(--nulo-secondary);
	transition: color 0.15s var(--bezier);
}
.action_btn:hover {
	color: var(--txt-primary);
}
.action_btn:focus-visible {
	outline: 2px solid var(--nulo-accent);
	outline-offset: -2px;
	border-radius: 4px;
}
</style>
