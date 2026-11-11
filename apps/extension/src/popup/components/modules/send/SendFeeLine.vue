<script setup lang="ts">
/**
 * Send's fee in one line pinned over the button, with Change to the full card. It says what the card
 * would say in the form, in the card's words: the cost and who pays it, the estimate's state, the queue,
 * and the card's notices on the line under it.
 */
import { computed } from "vue"
import { QUEUED_FEE_COPY } from "@/components/composite/send/publish-facts"
import type { FeeDisplay } from "@/utils/fee-estimation"
import { FEE_LINE_METHOD, type FeeLinePayer, feeLineFigure, feeLineWords } from "./fee-line-words"

const props = withDefaults(
	defineProps<{
		/** Null until the card names who pays. */
		payer: FeeLinePayer | null
		/** A hand-added sponsor's name, already safe to show. */
		payerName?: string | null
		display: FeeDisplay | null
		estimating?: boolean
		slow?: boolean
		failed?: boolean
		/** The card is still reading what can pay, with an amount typed. */
		pending?: boolean
		queued?: boolean
		queuedCap?: { about: FeeDisplay; cap: FeeDisplay } | null
		queuedSponsored?: boolean
		notices?: string[]
	}>(),
	{
		payerName: null,
		estimating: false,
		slow: false,
		failed: false,
		pending: false,
		queued: false,
		queuedCap: null,
		queuedSponsored: false,
		notices: () => [],
	},
)
const emit = defineEmits<{ change: []; retry: [] }>()

type Line = { kind: "words"; value: string; note: string | null } | { kind: "bar" } | { kind: "slow" } | { kind: "failed" }

const capSentence = (cap: FeeDisplay) =>
	`Goes out after your earlier send, for at most ${cap.usd ? `${cap.usd} (${cap.amount} FJ)` : `${cap.amount} FJ`}.`

/** A queued estimate's line, or null when nothing is queued. */
function queuedLine(): Line | null {
	if (!props.queued) return null
	const cap = props.queuedCap
	if (cap) {
		const method = props.payer === "fj" || props.payer === "private_fpc" ? `, ${FEE_LINE_METHOD[props.payer]}` : ""
		return { kind: "words", value: `${feeLineFigure(cap.about)}${method}`, note: capSentence(cap.cap) }
	}
	if (props.queuedSponsored) return { kind: "words", ...feeLineWords("sponsor", null, { queued: true }) }
	return { kind: "words", value: QUEUED_FEE_COPY, note: null }
}

/** The estimate's own states first, as the card's cost row orders them. */
const line = computed<Line>(() => {
	if (props.estimating && !props.display) return queuedLine() ?? { kind: props.slow ? "slow" : "bar" }
	if (props.pending && !props.display) return { kind: "bar" }
	if (props.failed && !props.display) return { kind: "failed" }
	if (!props.payer) return { kind: "words", value: "—", note: null }
	return { kind: "words", ...feeLineWords(props.payer, props.display, { name: props.payerName ?? undefined }) }
})
const notes = computed(() => {
	const own = line.value.kind === "words" && line.value.note ? [line.value.note] : []
	return [...own, ...props.notices]
})
</script>

<template>
	<div :class="$style.wrap" data-testid="send-fee-line" :data-payer="payer ?? 'none'">
		<div :class="$style.line">
			<span :class="$style.key">Fee</span>
			<span :class="$style.value" data-testid="send-fee-line-value">
				<span v-if="line.kind === 'words'">{{ line.value }}</span>
				<Skeleton v-else-if="line.kind === 'bar'" :width="96" :height="10" />
				<template v-else-if="line.kind === 'slow'">
					<span :class="$style.muted">Taking longer than usual.</span>
					<button type="button" :class="$style.link" data-testid="send-fee-line-retry" @click="emit('retry')">Try again</button>
				</template>
				<template v-else>
					<span class="color--txt-danger">Couldn't estimate fee.</span>
					<button type="button" :class="$style.link" data-testid="send-fee-line-retry" @click="emit('retry')">Try again</button>
				</template>
			</span>
			<button type="button" :class="[$style.link, $style.change]" data-testid="send-fee-change" @click="emit('change')">Change</button>
		</div>
		<div role="status" aria-live="polite" aria-atomic="true" :class="$style.notes" data-testid="send-fee-line-note">
			<p v-for="note in notes" :key="note" :class="$style.note">{{ note }}</p>
		</div>
	</div>
</template>

<style module>
.wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.line {
	composes: type--body from global;
	display: flex;
	align-items: baseline;
	gap: 8px;
	color: var(--txt-primary);
}

.key {
	composes: type--label-section from global;
	flex: none;
	min-width: 32px;
	color: var(--nulo-secondary);
}

.value {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 6px;
}

.muted {
	color: var(--txt-secondary);
}

.link {
	composes: type--label-section from global;
	flex: none;
	background: none;
	color: var(--nulo-accent);
	cursor: pointer;

	&:hover {
		text-decoration: underline;
	}

	&:focus-visible {
		outline: 2px solid var(--nulo-accent);
		outline-offset: 2px;
	}
}

.change {
	align-self: baseline;
}

.notes {
	display: flex;
	flex-direction: column;
	padding-left: 40px;

	&:empty {
		display: none;
	}
}

.note {
	composes: type--body from global;
	margin: 0;
	color: var(--txt-secondary);
}
</style>
